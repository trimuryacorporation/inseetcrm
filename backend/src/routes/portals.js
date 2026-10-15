import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { User, Client, Job, AuditLog } from "../models/index.js";
import { Application } from "../models/recruitment.js";
import { VendorSubmission, TeamMembership } from "../models/supporting.js";
import { Models } from "../models/operations.js";
import { authenticate, allow, scope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
export const portals = Router();
portals.use((req, res, next) =>
  ["portal", "assignments", "team-memberships"].includes(req.path.split("/")[1])
    ? next()
    : next("router"),
);
portals.use(authenticate);
const id = z.string().regex(/^[a-f0-9]{24}$/i);
portals.get("/portal", allow("Vendor", "Client"), async (req, res) => {
  if (req.user.role === "Vendor") {
    const [jobs, submissions] = await Promise.all([
      Job.find({
        assignedVendors: req.user._id,
        deletedAt: null,
        status: "Open",
      }).select("title location openings salary deadline"),
      VendorSubmission.find({ vendor: req.user._id })
        .populate("job", "title")
        .sort({ createdAt: -1 })
        .limit(100),
    ]);
    res.json({ jobs, submissions });
  } else {
    if (!req.user.clientRef)
      throw fail(403, "Ask your administrator to link your client account");
    const jobs = await Job.find({
      client: req.user.clientRef,
      deletedAt: null,
    }).select("title location openings status");
    const applications = await Application.find({
      job: { $in: jobs.map((j) => j._id) },
      stage: {
        $in: [
          "Submitted to Client",
          "Interview Scheduled",
          "Interview Completed",
          "Selected",
          "Offer Released",
          "Offer Accepted",
          "Joined",
        ],
      },
    })
      .populate("candidate", "fullName qualification experience skills")
      .populate("job", "title")
      .select("candidate job stage updatedAt")
      .limit(200);
    res.json({ jobs, applications });
  }
});
portals.post("/portal/submissions", allow("Vendor"), async (req, res) => {
  const data = z
    .object({
      job: id,
      candidateName: z.string().min(2).max(150),
      phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/),
      email: z.union([z.string().email(), z.literal("")]).optional(),
      consent: z.literal(true),
      notes: z.string().max(3000).optional(),
    })
    .strict()
    .parse(req.body);
  if (
    !(await Job.exists({
      _id: data.job,
      assignedVendors: req.user._id,
      deletedAt: null,
      status: "Open",
    }))
  )
    throw fail(403, "This job is not assigned to you");
  data.phone = data.phone.replace(/[ ()-]/g, "");
  const item = await identityCreate(VendorSubmission, {
    ...data,
    vendor: req.user._id,
  });
  await AuditLog.create({
    actor: req.user._id,
    action: "vendor.candidate_submitted",
    resourceId: String(item._id),
  });
  res.status(201).json(item);
});
portals.get(
  "/assignments",
  allow("Super Admin", "Admin", "HR Manager", "Team Leader", "Account Manager"),
  async (req, res) => {
    const [jobs, users, clients, teams] = await Promise.all([
      Job.find({ deletedAt: null, ...scope(req.user) }).select(
        "title assignedRecruiters assignedVendors",
      ),
      User.find({ active: true }).select("name role clientRef"),
      Client.find({ deletedAt: null, ...scope(req.user) }).select(
        "companyName",
      ),
      Models.teams.find({ deletedAt: null, ...scope(req.user) }).select("name"),
    ]);
    res.json({ jobs, users, clients, teams });
  },
);
portals.patch(
  "/assignments/jobs/:id",
  allow("Super Admin", "Admin", "HR Manager", "Team Leader"),
  async (req, res) => {
    id.parse(req.params.id);
    const data = z
      .object({
        assignedRecruiters: z.array(id).max(100),
        assignedVendors: z.array(id).max(100),
      })
      .strict()
      .parse(req.body);
    for (const [field, roles] of [
      [
        "assignedRecruiters",
        ["Recruiter", "Team Leader", "HR Manager", "Admin", "Super Admin"],
      ],
      ["assignedVendors", ["Vendor"]],
    ]) {
      const count = await User.countDocuments({
        _id: { $in: data[field] },
        active: true,
        role: { $in: roles },
      });
      if (count !== new Set(data[field]).size)
        throw fail(400, "Invalid assignment");
    }
    const item = await Job.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null, ...scope(req.user) },
      { $set: data },
      { returnDocument: "after" },
    );
    if (!item) throw fail(404, "Job not found");
    await AuditLog.create({
      actor: req.user._id,
      action: "jobs.assigned",
      resourceId: req.params.id,
    });
    res.json(item);
  },
);
portals.patch(
  "/assignments/clients/:id",
  allow("Super Admin", "Admin"),
  async (req, res) => {
    id.parse(req.params.id);
    const { client } = z.object({ client: id }).strict().parse(req.body);
    if (!(await Client.exists({ _id: client, deletedAt: null })))
      throw fail(404, "Client not found");
    const user = await identityUpdate(
      User,
      { _id: req.params.id, role: "Client" },
      { $set: { clientRef: client } },
      { returnDocument: "after" },
    );
    if (!user) throw fail(404, "Client user not found");
    await AuditLog.create({
      actor: req.user._id,
      action: "users.client_linked",
      resourceId: req.params.id,
    });
    res.json({ message: "Client account linked" });
  },
);
portals.get(
  "/team-memberships",
  allow("Super Admin", "Admin", "HR Manager", "Team Leader"),
  async (req, res) =>
    res.json(
      await TeamMembership.find()
        .populate("team", "name")
        .populate("user", "name role")
        .limit(200),
    ),
);
portals.post(
  "/team-memberships",
  allow("Super Admin", "Admin", "HR Manager", "Team Leader"),
  async (req, res) => {
    const data = z
      .object({ team: id, user: id, leader: z.boolean().default(false) })
      .strict()
      .parse(req.body);
    if (
      !(await Models.teams.exists({
        _id: data.team,
        deletedAt: null,
        ...scope(req.user),
      })) ||
      !(await User.exists({
        _id: data.user,
        active: true,
        role: { $nin: ["Vendor", "Client"] },
      }))
    )
      throw fail(400, "Select an accessible team and staff member");
    res.status(201).json(await TeamMembership.create(data));
  },
);
portals.delete(
  "/team-memberships/:id",
  allow("Super Admin", "Admin", "HR Manager"),
  async (req, res) => {
    id.parse(req.params.id);
    if (!(await TeamMembership.findByIdAndDelete(req.params.id)))
      throw fail(404, "Membership not found");
    res.status(204).end();
  },
);
