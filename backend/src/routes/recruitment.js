import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import { notify } from "../services/realtime.js";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import {
  Candidate,
  Application,
  ApplicationStageHistory,
  Interview,
  InterviewFeedback,
  stages,
} from "../models/recruitment.js";
import { Job, AuditLog } from "../models/index.js";
import { authenticate, allow, scope, jobScope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
export const recruitment = Router();
recruitment.use((req, res, next) =>
  ["candidates", "applications", "interviews"].includes(req.path.split("/")[1])
    ? next()
    : next("router"),
);
recruitment.use(
  authenticate,
  allow(
    "Super Admin",
    "Admin",
    "HR Manager",
    "Recruiter",
    "Team Leader",
    "Account Manager",
  ),
);
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const text = z.string().trim().max(500).optional();
const digits = z
  .string()
  .trim()
  .regex(/^\d{0,12}$/, "Enter numbers only (up to 12 digits)")
  .optional();
const schema = z
  .object({
    fullName: z.string().trim().min(2).max(150),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{7,20}$/),
    email: z
      .union([
        z
          .string()
          .email()
          .transform((v) => v.toLowerCase()),
        z.literal(""),
      ])
      .optional(),
    currentCity: text,
    preferredLocation: text,
    qualification: text,
    experience: text,
    skills: z.array(z.string().max(80)).max(50).optional(),
    currentSalary: digits,
    expectedSalary: digits,
    noticePeriod: z
      .string()
      .trim()
      .regex(/^\d{0,4}$/, "Notice period must be a whole number of days")
      .optional(),
    source: text,
    notes: z.string().max(5000).optional(),
    consent: z.literal(true),
  })
  .strict();
const escape = (s) =>
  Array.from(s)
    .map((c) => ("\\^$.*+?()[]{}|".includes(c) ? "\\" + c : c))
    .join("");
const pageSchema = z.object({
  q: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
recruitment.get("/candidates", async (req, res) => {
  const { q, page, limit } = pageSchema.parse(req.query);
  const filter = { ...scope(req.user), deletedAt: null };
  if (q)
    filter.$or = ["fullName", "phone", "email", "currentCity", "skills"].map(
      (k) => ({ [k]: { $regex: escape(q), $options: "i" } }),
    );
  const [items, total] = await Promise.all([
    Candidate.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Candidate.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});
recruitment.post("/candidates", async (req, res) => {
  const data = schema.parse(req.body);
  data.phone = data.phone.replace(/[ ()-]/g, "");
  const item = await identityCreate(Candidate, {
    ...data,
    consentAt: new Date(),
    owner: req.user._id,
  });
  await AuditLog.create({
    actor: req.user._id,
    action: "candidates.created",
    resourceId: String(item._id),
  });
  res.status(201).json(item);
});
recruitment.patch("/candidates/:id", async (req, res) => {
  id.parse(req.params.id);
  const data = schema.partial().parse(req.body);
  if (data.phone) data.phone = data.phone.replace(/[ ()-]/g, "");
  const item = await identityUpdate(
    Candidate,
    { _id: req.params.id, deletedAt: null, ...scope(req.user) },
    { $set: data },
    { returnDocument: "after", runValidators: true },
  );
  if (!item) throw fail(404, "Candidate not found");
  await AuditLog.create({
    actor: req.user._id,
    action: "candidates.updated",
    resourceId: String(item._id),
  });
  res.json(item);
});
recruitment.delete("/candidates/:id", async (req, res) => {
  id.parse(req.params.id);
  if (await Application.exists({ candidate: req.params.id }))
    throw fail(
      409,
      "Candidates with applications must be retained for application history",
    );
  const item = await identityUpdate(
    Candidate,
    { _id: req.params.id, deletedAt: null, ...scope(req.user) },
    { $set: { deletedAt: new Date() } },
  );
  if (!item) throw fail(404, "Candidate not found");
  await AuditLog.create({
    actor: req.user._id,
    action: "candidates.deleted",
    resourceId: req.params.id,
  });
  res.status(204).end();
});
recruitment.get("/applications", async (req, res) => {
  const filter = scope(req.user);
  if (req.query.job) filter.job = id.parse(req.query.job);
  const items = await Application.find(filter)
    .populate("candidate", "fullName phone currentCity")
    .populate("job", "title")
    .sort({ updatedAt: -1 })
    .limit(500);
  res.json({ items, stages });
});
recruitment.post("/applications", async (req, res) => {
  const data = z.object({ candidate: id, job: id }).strict().parse(req.body);
  const [candidate, job] = await Promise.all([
    Candidate.findOne({
      _id: data.candidate,
      deletedAt: null,
      ...scope(req.user),
    }),
    Job.findOne({
      _id: data.job,
      deletedAt: null,
      status: "Open",
      ...jobScope(req.user),
    }),
  ]);
  if (!candidate || !job)
    throw fail(400, "Select an accessible candidate and open job");
  const item = await mongoose.connection.transaction(async (session) => {
    const [application] = await Application.create(
      [{ ...data, owner: req.user._id }],
      { session },
    );
    await ApplicationStageHistory.create(
      [
        {
          application: application._id,
          to: stages[0],
          changedBy: req.user._id,
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "applications.created",
          resourceId: String(application._id),
        },
      ],
      { session },
    );
    return application;
  });
  res.status(201).json(item);
});
recruitment.patch("/applications/:id/stage", async (req, res) => {
  id.parse(req.params.id);
  const data = z
    .object({
      stage: z.enum(stages),
      version: z.number().int().min(0),
      note: z.string().max(1000).optional(),
    })
    .strict()
    .parse(req.body);
  const item = await mongoose.connection.transaction(async (session) => {
    const current = await Application.findOne({
      _id: req.params.id,
      ...scope(req.user),
    }).session(session);
    if (!current) throw fail(404, "Application not found");
    if (current.version !== data.version)
      throw fail(409, "This application changed. Refresh and try again.");
    if (current.stage === data.stage) return current;
    const from = current.stage;
    current.stage = data.stage;
    current.version += 1;
    await current.save({ session });
    await ApplicationStageHistory.create(
      [
        {
          application: current._id,
          from,
          to: data.stage,
          changedBy: req.user._id,
          note: data.note,
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "applications.stage_changed",
          resourceId: String(current._id),
        },
      ],
      { session },
    );
    return current;
  });
  await notify(req.user._id, "Application moved to " + data.stage);
  res.json(item);
});
recruitment.get("/applications/:id/history", async (req, res) => {
  id.parse(req.params.id);
  if (!(await Application.exists({ _id: req.params.id, ...scope(req.user) })))
    throw fail(404, "Application not found");
  res.json(
    await ApplicationStageHistory.find({ application: req.params.id })
      .populate("changedBy", "name")
      .sort({ createdAt: -1 }),
  );
});
recruitment.get("/interviews", async (req, res) => {
  const { page, limit } = pageSchema.parse(req.query);
  const filter = { ...scope(req.user), deletedAt: null };
  const [items, total] = await Promise.all([
    Interview.find(filter)
      .populate("candidate", "fullName phone")
      .populate("job", "title")
      .sort({ scheduledAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Interview.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});
const interviewSchema = z
  .object({
    application: id,
    scheduledAt: z.string().datetime(),
    duration: z.coerce.number().int().min(5).max(480),
    type: z.enum(["Walk-in", "Phone", "Video", "HR", "Technical", "Final"]),
    location: text,
    interviewer: text,
    notes: z.string().max(5000).optional(),
  })
  .strict();
recruitment.post("/interviews", async (req, res) => {
  const data = interviewSchema.parse(req.body);
  if (new Date(data.scheduledAt) < new Date())
    throw fail(400, "Schedule an interview in the future");
  const application = await Application.findOne({
    _id: data.application,
    ...scope(req.user),
  });
  if (!application) throw fail(404, "Application not found");
  const item = await Interview.create({
    ...data,
    candidate: application.candidate,
    job: application.job,
    owner: req.user._id,
  });
  await AuditLog.create({
    actor: req.user._id,
    action: "interviews.scheduled",
    resourceId: String(item._id),
  });
  res.status(201).json(item);
});
recruitment.patch("/interviews/:id", async (req, res) => {
  id.parse(req.params.id);
  const data = interviewSchema
    .omit({ application: true })
    .partial()
    .extend({
      status: z
        .enum(["Scheduled", "Rescheduled", "Completed", "Cancelled"])
        .optional(),
    })
    .strict()
    .parse(req.body);
  const item = await Interview.findOneAndUpdate(
    { _id: req.params.id, deletedAt: null, ...scope(req.user) },
    { $set: data },
    { returnDocument: "after", runValidators: true },
  );
  if (!item) throw fail(404, "Interview not found");
  await AuditLog.create({
    actor: req.user._id,
    action: "interviews.updated",
    resourceId: String(item._id),
  });
  res.json(item);
});
recruitment.post("/interviews/:id/feedback", async (req, res) => {
  id.parse(req.params.id);
  const data = z
    .object({
      rating: z.number().int().min(1).max(5),
      recommendation: z.enum(["Proceed", "Hold", "Reject"]),
      notes: z.string().min(1).max(5000),
    })
    .strict()
    .parse(req.body);
  if (
    !(await Interview.exists({
      _id: req.params.id,
      deletedAt: null,
      ...scope(req.user),
    }))
  )
    throw fail(404, "Interview not found");
  res.status(201).json(
    await InterviewFeedback.create({
      ...data,
      interview: req.params.id,
      author: req.user._id,
    }),
  );
});
recruitment.get("/interviews/:id/feedback", async (req, res) => {
  id.parse(req.params.id);
  if (
    !(await Interview.exists({
      _id: req.params.id,
      deletedAt: null,
      ...scope(req.user),
    }))
  )
    throw fail(404, "Interview not found");
  res.json(
    await InterviewFeedback.find({ interview: req.params.id })
      .populate("author", "name")
      .sort({ createdAt: -1 }),
  );
});

export { schema as candidateSchema };
