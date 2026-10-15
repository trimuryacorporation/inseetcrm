import { validateDepartment } from "../services/departments.js";
import { validateClientSelections } from "../services/clientOptions.js";
import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import { Candidate, Interview } from "../models/recruitment.js";
import { Models, Invoice } from "../models/operations.js";
import { notify } from "../services/realtime.js";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Client, Job, User, AuditLog, Notification } from "../models/index.js";
import { authenticate, allow, scope, jobScope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
export const resources = Router();
resources.use(authenticate);
const staff = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
];
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const text = z.string().trim().max(300).optional();
const clientSchema = z
  .object({
    companyName: z.string().trim().min(2).max(200),
    industry: text,
    website: z.union([z.string().url(), z.literal("")]).optional(),
    gstin: text,
    contactPerson: text,
    phone: text,
    email: z.union([z.string().email(), z.literal("")]).optional(),
    address: text,
    city: text,
    state: text,
    paymentTerms: text,
    placementFee: z.coerce.number().min(0).max(1000).optional(),
    feeType: z.enum(["percentage", "fixed"]).optional(),
    fixedFeePaise: z
      .number()
      .int()
      .min(0)
      .max(1000000000000)
      .nullable()
      .optional(),
    status: z.enum(["Active", "Inactive", "Prospect"]).optional(),
  })
  .strict();
const jobSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    client: id,
    location: text,
    department: text,
    openings: z.coerce.number().int().min(1).max(100000),
    salary: text,
    experience: text,
    skills: z.array(z.string().max(100)).max(50).optional(),
    description: z.string().max(20000).optional(),
    priority: z.enum(["Normal", "High", "Urgent"]).optional(),
    status: z.enum(["Open", "On Hold", "Closed"]).optional(),
    deadline: z.string().datetime().optional(),
    assignedRecruiters: z.array(id).max(100).optional(),
  })
  .strict();
const escaped = (s) =>
  Array.from(s)
    .map((c) => ("\\^$.*+?()[]{}|".includes(c) ? "\\" + c : c))
    .join("");
for (const [name, Model, schema, fields] of [
  ["clients", Client, clientSchema, ["companyName", "industry", "city"]],
  ["jobs", Job, jobSchema, ["title", "location", "department"]],
]) {
  const read = allow(...staff);
  const write = allow(
    ...staff.filter((v) => (name === "clients" ? v !== "Recruiter" : true)),
  );
  resources.get("/" + name, read, async (req, res) => {
    const { page, limit, q, status } = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        q: z.string().max(100).default(""),
        status: z.string().max(30).optional(),
      })
      .parse(req.query);
    const filter = {
      deletedAt: null,
      ...(name === "jobs" ? jobScope(req.user) : scope(req.user)),
    };
    if (q)
      filter.$and = [
        {
          $or: fields.map((f) => ({
            [f]: { $regex: escaped(q), $options: "i" },
          })),
        },
      ];
    if (status) filter.status = status;
    let query = Model.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    if (name === "jobs") query = query.populate("client", "companyName");
    const [items, total] = await Promise.all([
      query,
      Model.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  });
  resources.post("/" + name, write, async (req, res) => {
    const data = schema.parse(req.body);
    if (name === "clients")
      Object.assign(data, await validateClientSelections(data));
    if (
      name === "jobs" &&
      !(await Client.exists({
        _id: data.client,
        deletedAt: null,
        ...scope(req.user),
      }))
    )
      throw fail(400, "Choose an accessible client");
    if (data.assignedRecruiters) {
      const count = await User.countDocuments({
        _id: { $in: data.assignedRecruiters },
        active: true,
        role: { $in: staff },
      });
      if (count !== new Set(data.assignedRecruiters).size)
        throw fail(400, "Invalid recruiter assignment");
    }
    if (name === "jobs" && data.department !== undefined)
      data.department = await validateDepartment(data.department);
    const item = await identityCreate(Model, { ...data, owner: req.user._id });
    await AuditLog.create({
      actor: req.user._id,
      action: name + ".created",
      resource: name,
      resourceId: String(item._id),
    });
    await notify(
      req.user._id,
      name === "jobs"
        ? "New job requirement created"
        : "New client relationship created",
    );
    res.status(201).json(item);
  });
  resources.patch("/" + name + "/:id", write, async (req, res) => {
    id.parse(req.params.id);
    const data = schema.partial().parse(req.body);
    if (name === "clients") {
      const current = await Client.findOne({
        _id: req.params.id,
        deletedAt: null,
        ...scope(req.user),
      });
      if (!current) throw fail(404, "Record not found");
      Object.assign(data, await validateClientSelections(data, current));
    }
    if (
      data.client &&
      !(await Client.exists({
        _id: data.client,
        deletedAt: null,
        ...scope(req.user),
      }))
    )
      throw fail(400, "Choose an accessible client");
    if (name === "jobs" && data.department !== undefined) {
      const current = await Job.findOne({
        _id: req.params.id,
        deletedAt: null,
        ...jobScope(req.user),
      });
      if (!current) throw fail(404, "Record not found");
      data.department = await validateDepartment(
        data.department,
        current.department,
      );
    }
    const item = await identityUpdate(
      Model,
      { _id: req.params.id, deletedAt: null, ...scope(req.user) },
      { $set: data },
      { returnDocument: "after", runValidators: true },
    );
    if (!item) throw fail(404, "Record not found");
    await AuditLog.create({
      actor: req.user._id,
      action: name + ".updated",
      resourceId: String(item._id),
    });
    res.json(item);
  });
  resources.delete("/" + name + "/:id", write, async (req, res) => {
    id.parse(req.params.id);
    if (
      name === "clients" &&
      (await Job.exists({ client: req.params.id, deletedAt: null }))
    )
      throw fail(409, "Archive the client jobs before deleting this client");
    const item = await identityUpdate(
      Model,
      { _id: req.params.id, deletedAt: null, ...scope(req.user) },
      { $set: { deletedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!item) throw fail(404, "Record not found");
    await AuditLog.create({
      actor: req.user._id,
      action: name + ".deleted",
      resourceId: String(item._id),
    });
    res.status(204).end();
  });
}
resources.get(
  "/dashboard",
  allow(...staff, "Finance Manager"),
  async (req, res) => {
    const filter = { deletedAt: null, ...scope(req.user) };
    const [
      clients,
      activeClients,
      jobs,
      openJobs,
      vacancies,
      recentJobs,
      activities,
      monthly,
    ] = await Promise.all([
      Client.countDocuments(filter),
      Client.countDocuments({ ...filter, status: "Active" }),
      Job.countDocuments(filter),
      Job.countDocuments({ ...filter, status: "Open" }),
      Job.aggregate([
        { $match: { ...filter, status: "Open" } },
        { $group: { _id: null, total: { $sum: "$openings" } } },
      ]),
      Job.find(filter)
        .populate("client", "companyName")
        .sort({ createdAt: -1 })
        .limit(5),
      AuditLog.find(
        ["Super Admin", "Admin"].includes(req.user.role)
          ? {}
          : { actor: req.user._id },
      )
        .populate("actor", "name")
        .sort({ createdAt: -1 })
        .limit(6),
      Job.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            jobs: { $sum: 1 },
            openings: { $sum: "$openings" },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 12 },
      ]),
    ]);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86400000);
    const [totalCandidates, interviewsToday, joinedCandidates] =
      await Promise.all([
        Candidate.countDocuments({ deletedAt: null, ...scope(req.user) }),
        Interview.countDocuments({
          deletedAt: null,
          ...scope(req.user),
          scheduledAt: { $gte: start, $lt: end },
        }),
        Models.placements.countDocuments({
          deletedAt: null,
          ...scope(req.user),
          status: "Joined",
        }),
      ]);
    res.json({
      totalCandidates,
      interviewsToday,
      joinedCandidates,
      clients,
      activeClients,
      jobs,
      openJobs,
      vacancies: vacancies[0]?.total || 0,
      recentJobs,
      activities,
      monthly,
    });
  },
);
resources.get(
  "/users",
  allow("Super Admin", "Admin", "HR Manager"),
  async (req, res) => {
    res.json(
      await User.find({ email: { $ne: "__setup_lock__" } })
        .select("name email role active createdAt")
        .sort({ createdAt: -1 })
        .limit(100),
    );
  },
);
resources.get("/notifications", async (req, res) =>
  res.json(
    await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30),
  ),
);
resources.patch("/notifications/:id/read", async (req, res) => {
  id.parse(req.params.id);
  const result = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!result) throw fail(404, "Notification not found");
  res.json(result);
});
resources.get("/audit-logs", allow("Super Admin", "Admin"), async (req, res) =>
  res.json(
    await AuditLog.find()
      .populate("actor", "name")
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);

resources.patch(
  "/users/:id",
  allow("Super Admin", "Admin"),
  async (req, res) => {
    id.parse(req.params.id);
    const data = z
      .object({
        role: z.enum([
          "Super Admin",
          "Admin",
          "HR Manager",
          "Recruiter",
          "Team Leader",
          "Sales Manager",
          "BDE",
          "Account Manager",
          "Finance Manager",
          "Vendor",
          "Client",
        ]),
        active: z.boolean(),
      })
      .strict()
      .parse(req.body);
    if (String(req.user._id) === req.params.id)
      throw fail(400, "You cannot change your own access");
    const target = await User.findById(req.params.id);
    if (!target) throw fail(404, "User not found");
    if (
      (target.role === "Super Admin" || data.role === "Super Admin") &&
      req.user.role !== "Super Admin"
    )
      throw fail(403, "Only a Super Admin can manage this role");
    await mongoose.connection.transaction(async (session) => {
      target.role = data.role;
      target.active = data.active;
      target.authVersion += 1;
      await target.save({ session });
      await AuditLog.create(
        [
          {
            actor: req.user._id,
            action: "users.access_updated",
            resourceId: req.params.id,
          },
        ],
        { session },
      );
    });
    res.json({
      id: target._id,
      name: target.name,
      email: target.email,
      role: target.role,
      active: target.active,
    });
  },
);
