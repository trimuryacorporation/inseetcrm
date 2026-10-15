import {
  ensureStaffDepartments,
  prepareDepartment,
  validateDepartment,
  guardDepartmentChange,
} from "../services/departments.js";
import {
  placementClientScope,
  resolvePlacementLinks,
} from "../services/placementLinks.js";
import { normalizeGstin } from "../validators/gstin.js";
import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import { Router } from "express";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { z } from "zod";
import {
  definitions,
  Models,
  Attendance,
  Invoice,
  Payment,
} from "../models/operations.js";
import { User, AuditLog, Client, Job } from "../models/index.js";
import { Candidate, Application, Interview } from "../models/recruitment.js";
import { authenticate, allow, scope, jobScope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
export const operations = Router();
const managed = [
  ...Object.keys(definitions),
  "workspace",
  "attendance",
  "invoices",
  "payments",
  "reports",
];
operations.use((req, res, next) =>
  managed.includes(req.path.split("/")[1]) ? next() : next("router"),
);
operations.use(authenticate);
const admins = ["Super Admin", "Admin"],
  finance = [...admins, "Finance Manager"],
  hr = [...admins, "HR Manager", "Team Leader"];
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const money = z.number().int().min(0).max(1000000000000);
const escape = (s) =>
  Array.from(s)
    .map((c) => ("\\^$.*+?()[]{}|".includes(c) ? "\\" + c : c))
    .join("");
operations.get("/workspace/modules", (req, res) =>
  res.json(
    Object.fromEntries(
      Object.entries(definitions)
        .filter(([, d]) => d.read.includes(req.user.role))
        .map(([key, d]) => [
          key,
          {
            title: d.title,
            description: d.description,
            fields: d.fields,
            canWrite: d.write.includes(req.user.role),
          },
        ]),
    ),
  ),
);
operations.get(
  "/placements/options",
  allow(...definitions.placements.read),
  async (req, res) => {
    const { kind, q, client } = z
      .object({
        kind: z.enum(["candidates", "clients", "jobs"]),
        q: z.string().trim().max(100).default(""),
        client: id.optional(),
      })
      .parse(req.query);
    const Model =
      kind === "candidates" ? Candidate : kind === "clients" ? Client : Job;
    const filter = {
      deletedAt: null,
      ...(kind === "candidates"
        ? scope(req.user)
        : kind === "clients"
          ? await placementClientScope(req.user)
          : jobScope(req.user)),
    };
    if (kind === "jobs") {
      if (!client) return res.json({ items: [] });
      filter.client = client;
    }
    const field =
      kind === "candidates"
        ? "fullName"
        : kind === "clients"
          ? "companyName"
          : "title";
    if (q) filter[field] = { $regex: escape(q), $options: "i" };
    const records = await Model.find(filter)
      .select(
        field +
          " " +
          (kind === "jobs"
            ? "location client"
            : kind === "candidates"
              ? "currentCity"
              : "city"),
      )
      .sort({ [field]: 1, _id: 1 })
      .limit(25)
      .lean();
    res.json({
      items: records.map((r) => ({
        _id: r._id,
        name: r[field],
        detail:
          kind === "jobs"
            ? r.location
            : kind === "candidates"
              ? r.currentCity
              : r.city,
        client: r.client,
      })),
    });
  },
);

for (const [key, def] of Object.entries(definitions)) {
  const Model = Models[key],
    shape = {};
  for (const f of def.fields) {
    let v = f.options
      ? z.enum(f.options)
      : f.type === "number"
        ? money
        : f.type === "date"
          ? z.string().date()
          : f.type === "email"
            ? z.union([z.string().email(), z.literal("")])
            : z
                .string()
                .trim()
                .max(f.type === "textarea" ? 10000 : 500);
    if (f.required && ["text", "textarea", "email"].includes(f.type))
      v = v.refine((s) => s.length > 0, "This field is required");
    if (!f.required) v = v.optional();
    if (f.key === "gstin") v = z.string().transform(normalizeGstin).optional();
    if (f.key === "commissionBasisPoints")
      v = z.number().int().min(0).max(10000).optional();
    shape[f.key] = v;
  }
  if (key === "placements") {
    for (const ref of ["candidate", "client", "job"])
      shape[ref] = id.optional();
    for (const name of ["candidateName", "companyName", "jobTitle"])
      shape[name] = z.string().trim().max(500).optional();
  }
  const schema = z.object(shape).strict();
  operations.get("/" + key, allow(...def.read), async (req, res) => {
    if (key === "departments") await ensureStaffDepartments(req.user._id);
    const { q, page, limit } = z
      .object({
        q: z.string().max(100).default(""),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const filter = {
      deletedAt: null,
      ...(["email-templates", "departments"].includes(key)
        ? {}
        : scope(req.user)),
    };
    if (q)
      filter.$or = def.fields
        .filter((f) => ["text", "email", "textarea", "select"].includes(f.type))
        .map((f) => ({ [f.key]: { $regex: escape(q), $options: "i" } }));
    const [items, total] = await Promise.all([
      Model.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Model.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  });
  operations.post("/" + key, allow(...def.write), async (req, res) => {
    let data = schema.parse(req.body);
    if (key === "leaves" && data.endDate < data.startDate)
      throw fail(400, "End date must be on or after start date");
    const result = await mongoose.connection.transaction(async (session) => {
      if (key === "departments") data = prepareDepartment(data);
      if (key === "teams" && data.department !== undefined)
        data.department = await validateDepartment(
          data.department,
          undefined,
          session,
        );
      if (key === "placements")
        data = await resolvePlacementLinks(data, req.user, session);
      const [item] = await identityCreate(
        Model,
        [{ ...data, owner: req.user._id }],
        {
          session,
        },
      );
      await AuditLog.create(
        [
          {
            actor: req.user._id,
            action: key + ".created",
            resource: key,
            resourceId: String(item._id),
          },
        ],
        { session },
      );
      return item;
    });
    res.status(201).json(result);
  });
  operations.patch(
    "/" + key + "/:id",
    allow(...def.write),
    async (req, res) => {
      id.parse(req.params.id);
      let data = schema.partial().parse(req.body);
      const item = await mongoose.connection.transaction(async (session) => {
        const current = await Model.findOne({
          _id: req.params.id,
          deletedAt: null,
          ...(key === "departments" ? {} : scope(req.user)),
        }).session(session);
        if (!current) throw fail(404, "Record not found");
        if (key === "departments") {
          data = prepareDepartment(data);
          if (data.name !== undefined)
            await guardDepartmentChange(current, data.name, session);
        }
        if (key === "teams" && data.department !== undefined)
          data.department = await validateDepartment(
            data.department,
            current.department,
            session,
          );
        if (key === "leaves") {
          if (current.approvalStatus !== "Pending")
            throw fail(
              409,
              "Approved or rejected leave requests cannot be edited",
            );
          if (
            (data.endDate || current.endDate.toISOString().slice(0, 10)) <
            (data.startDate || current.startDate.toISOString().slice(0, 10))
          )
            throw fail(400, "End date must be on or after start date");
        }
        if (key === "placements")
          data = await resolvePlacementLinks(data, req.user, session, current);
        const updated = await identityUpdate(
          Model,
          { _id: current._id },
          { $set: data },
          { session, runValidators: true, returnDocument: "after" },
        );
        await AuditLog.create(
          [
            {
              actor: req.user._id,
              action: key + ".updated",
              resourceId: String(current._id),
            },
          ],
          { session },
        );
        return updated;
      });
      res.json(item);
    },
  );
  operations.delete(
    "/" + key + "/:id",
    allow(...def.write),
    async (req, res) => {
      id.parse(req.params.id);
      await mongoose.connection.transaction(async (session) => {
        if (
          key === "teams" &&
          (await User.exists({ team: req.params.id }).session(session))
        )
          throw fail(
            409,
            "Reassign employee accounts before archiving this team.",
          );
        if (key === "departments") {
          const current = await Model.findOne({
            _id: req.params.id,
            deletedAt: null,
          }).session(session);
          if (!current) throw fail(404, "Record not found");
          await guardDepartmentChange(current, undefined, session);
        }
        const item = await identityUpdate(
          Model,
          {
            _id: req.params.id,
            deletedAt: null,
            ...(key === "departments" ? {} : scope(req.user)),
          },
          { $set: { deletedAt: new Date() } },
          { returnDocument: "after", session },
        );
        if (!item) throw fail(404, "Record not found");
        await AuditLog.create(
          [
            {
              actor: req.user._id,
              action: key + ".deleted",
              resourceId: String(item._id),
            },
          ],
          { session },
        );
      });
      res.status(204).end();
    },
  );
}
operations.patch("/leaves/:id/approval", allow(...hr), async (req, res) => {
  id.parse(req.params.id);
  const { status } = z
    .object({ status: z.enum(["Approved", "Rejected"]) })
    .strict()
    .parse(req.body);
  const result = await mongoose.connection.transaction(async (session) => {
    const item = await Models.leaves.findOneAndUpdate(
      {
        _id: req.params.id,
        deletedAt: null,
        approvalStatus: "Pending",
        owner: { $ne: req.user._id },
      },
      { $set: { approvalStatus: status, approvedBy: req.user._id } },
      { returnDocument: "after", session },
    );
    if (!item)
      throw fail(
        409,
        "Request unavailable, already decided, or self-approval prohibited",
      );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "leaves." + status.toLowerCase(),
          resourceId: req.params.id,
        },
      ],
      { session },
    );
    return item;
  });
  res.json(result);
});
operations.get(
  "/attendance",
  allow(
    ...hr,
    "Recruiter",
    "Sales Manager",
    "BDE",
    "Account Manager",
    "Finance Manager",
  ),
  async (req, res) => {
    const filter = hr.includes(req.user.role) ? {} : { user: req.user._id };
    res.json(
      await Attendance.find(filter)
        .populate("user", "name")
        .sort({ checkIn: -1 })
        .limit(100),
    );
  },
);
operations.post(
  "/attendance/check-in",
  allow(
    ...hr,
    "Recruiter",
    "Sales Manager",
    "BDE",
    "Account Manager",
    "Finance Manager",
  ),
  async (req, res) => {
    const now = new Date(),
      day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now);
    res
      .status(201)
      .json(await Attendance.create({ user: req.user._id, day, checkIn: now }));
  },
);
operations.post("/attendance/check-out", async (req, res) => {
  const now = new Date();
  const item = await Attendance.findOneAndUpdate(
    {
      user: req.user._id,
      checkOut: null,
      day: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
      }).format(now),
    },
    [
      {
        $set: {
          checkOut: now,
          minutes: {
            $floor: { $divide: [{ $subtract: [now, "$checkIn"] }, 60000] },
          },
        },
      },
    ],
    { returnDocument: "after", updatePipeline: true },
  );
  if (!item) throw fail(409, "No open check-in for today");
  res.json(item);
});
operations.get("/invoices", allow(...finance), async (req, res) =>
  res.json(await Invoice.find().sort({ createdAt: -1 }).limit(100)),
);
operations.post("/invoices", allow(...finance), async (req, res) => {
  const data = z
    .object({
      companyName: z.string().min(2).max(200),
      gstin: z.string().transform(normalizeGstin).optional(),
      description: z.string().min(2).max(3000),
      subtotalPaise: money,
      gstBasisPoints: z.number().int().min(0).max(10000),
      dueAt: z.string().date(),
    })
    .strict()
    .parse(req.body);
  const taxPaise = Number(
    (BigInt(data.subtotalPaise) * BigInt(data.gstBasisPoints) + 5000n) / 10000n,
  );
  const item = await mongoose.connection.transaction(async (session) => {
    const [invoice] = await Invoice.create(
      [
        {
          ...data,
          number:
            "INS-" +
            new Date().getFullYear() +
            "-" +
            crypto.randomBytes(6).toString("hex").toUpperCase(),
          taxPaise,
          totalPaise: data.subtotalPaise + taxPaise,
          owner: req.user._id,
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "invoices.created",
          resourceId: String(invoice._id),
        },
      ],
      { session },
    );
    return invoice;
  });
  res.status(201).json(item);
});
operations.get("/payments", allow(...finance), async (req, res) =>
  res.json(
    await Payment.find()
      .populate("invoice", "number companyName")
      .sort({ paidAt: -1 })
      .limit(100),
  ),
);
operations.post("/payments", allow(...finance), async (req, res) => {
  const data = z
    .object({
      invoice: id,
      amountPaise: money.refine((v) => v > 0),
      reference: z.string().trim().min(2).max(150),
      paidAt: z.string().date(),
    })
    .strict()
    .parse(req.body);
  const result = await mongoose.connection.transaction(async (session) => {
    const invoice = await Invoice.findById(data.invoice).session(session);
    if (!invoice) throw fail(404, "Invoice not found");
    if (invoice.paidPaise + data.amountPaise > invoice.totalPaise)
      throw fail(400, "Payment exceeds invoice outstanding balance");
    const [payment] = await Payment.create([{ ...data, owner: req.user._id }], {
      session,
    });
    invoice.paidPaise += data.amountPaise;
    invoice.status =
      invoice.paidPaise === invoice.totalPaise ? "Paid" : "Partially Paid";
    await invoice.save({ session });
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "payments.recorded",
          resourceId: String(payment._id),
        },
      ],
      { session },
    );
    return payment;
  });
  res.status(201).json(result);
});
operations.get(
  "/reports",
  allow(...hr, "Sales Manager", "Finance Manager", "Account Manager"),
  async (req, res) => {
    const data = z
      .object({ from: z.string().date(), to: z.string().date() })
      .parse(req.query);
    if (data.from > data.to) throw fail(400, "Invalid date range");
    const filter = {
      ...scope(req.user),
      createdAt: {
        $gte: new Date(data.from),
        $lt: new Date(new Date(data.to).getTime() + 86400000),
      },
    };
    const models = {
      Candidates: Candidate,
      Applications: Application,
      Interviews: Interview,
      Tasks: Models.tasks,
    };
    const records = [];
    for (const [name, Model] of Object.entries(models)) {
      records.push({ name, count: await Model.countDocuments(filter) });
    }
    if (finance.includes(req.user.role)) {
      const invoices = await Invoice.aggregate([
        { $match: { createdAt: filter.createdAt } },
        {
          $group: {
            _id: null,
            invoicedPaise: { $sum: "$totalPaise" },
            collectedPaise: { $sum: "$paidPaise" },
          },
        },
      ]);
      res.json({
        records,
        finance: invoices[0] || { invoicedPaise: 0, collectedPaise: 0 },
      });
    } else res.json({ records });
  },
);
