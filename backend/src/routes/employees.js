import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { z } from "zod";
import { User, AuditLog } from "../models/index.js";
import { Models } from "../models/operations.js";
import { authenticate, allow } from "../middleware/auth.js";
import { safeUser, fail } from "../utils/security.js";
import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import {
  ensureStaffDepartments,
  validateDepartment,
} from "../services/departments.js";
export const employees = Router();
const managers = ["Super Admin", "Admin", "HR Manager"];
const staffRoles = [
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
  "Finance Manager",
];
const labels = {
  "HR Manager": "HR",
  "Team Leader": "Manager",
  "Sales Manager": "Sales Manager",
};
const roleOptions = (user) =>
  user.role === "Super Admin"
    ? ["Super Admin", "Admin", ...staffRoles]
    : user.role === "Admin"
      ? ["Admin", ...staffRoles]
      : user.role === "HR Manager"
        ? ["Recruiter", "Team Leader", "BDE", "Account Manager"]
        : [];
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const secret = z
  .string()
  .min(12)
  .max(72)
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password must be no more than 72 UTF-8 bytes",
  );
const schema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .transform((v) => v.toLowerCase()),
    loginId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9][a-z0-9._-]{2,49}$/,
        "Login ID must be 3-50 letters, digits, dots, underscores or hyphens; do not use @.",
      ),
    phone: z.string().trim().max(30).optional(),
    department: z.string().trim().min(1).max(120),
    role: z.enum(["Super Admin", "Admin", ...staffRoles]),
    team: z.union([id, z.literal(""), z.null()]).optional(),
    password: secret,
    active: z.boolean().optional(),
  })
  .strict();
const dto = (u) => ({
  ...safeUser(u),
  _id: u._id,
  phone: u.phone,
  active: u.active,
  createdAt: u.createdAt,
});
const escaped = (s) =>
  Array.from(s)
    .map((c) => ("\\^$.*+?()[]{}|".includes(c) ? "\\" + c : c))
    .join("");
employees.use(authenticate, allow(...managers, "Team Leader"));
async function readerScope(user) {
  if (managers.includes(user.role)) return {};
  const ids = await Models.teams
    .find({ owner: user._id, deletedAt: null })
    .distinct("_id");
  return { $or: [{ _id: user._id }, { team: { $in: ids } }] };
}
employees.get("/options", async (req, res) => {
  await ensureStaffDepartments(req.user._id);
  const teams = await Models.teams
    .find({
      deletedAt: null,
      ...(managers.includes(req.user.role) ? {} : { owner: req.user._id }),
    })
    .select("name department")
    .sort({ name: 1 })
    .limit(100)
    .lean();
  res.json({
    canManage: managers.includes(req.user.role),
    roles: roleOptions(req.user).map((value) => ({
      value,
      label: labels[value] || value,
    })),
    teams,
  });
});
employees.get("/", async (req, res) => {
  const { q, page, limit } = z
    .object({
      q: z.string().trim().max(100).default(""),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .parse(req.query);
  const filter = {
    role: { $in: ["Super Admin", "Admin", ...staffRoles] },
    ...(await readerScope(req.user)),
  };
  if (q)
    filter.$and = [
      {
        $or: ["name", "email", "loginId", "department"].map((k) => ({
          [k]: { $regex: escaped(q), $options: "i" },
        })),
      },
    ];
  const [rows, total] = await Promise.all([
    User.find(filter)
      .select("name email loginId phone department team role active createdAt")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({
    items: rows.map(dto),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});
async function linked(data, current, session) {
  if (data.department !== undefined)
    data.department = await validateDepartment(
      data.department,
      current?.department,
      session,
    );
  if (data.team !== undefined) data.team = data.team || null;
  const teamId = data.team === undefined ? current?.team : data.team;
  const teamChanged =
    !current ||
    (data.team !== undefined &&
      String(data.team || "") !== String(current.team || "")) ||
    (data.department !== undefined && data.department !== current.department);
  if (teamId && teamChanged) {
    const team = await Models.teams
      .findOne({ _id: teamId, deletedAt: null })
      .session(session);
    if (!team) throw fail(400, "Choose an active team.");
    if (
      team.department &&
      team.department !== (data.department || current?.department)
    )
      throw fail(400, "Selected team belongs to a different department.");
  }
  return data;
}
employees.post("/", allow(...managers), async (req, res) => {
  let data = schema.parse(req.body);
  if (!roleOptions(req.user).includes(data.role))
    throw fail(403, "You cannot assign this role.");
  data.password = await bcrypt.hash(data.password, 12);
  const user = await mongoose.connection.transaction(async (session) => {
    data = await linked(data, null, session);
    const [created] = await identityCreate(User, [data], { session });
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "employees.created",
          resource: "users",
          resourceId: String(created._id),
        },
      ],
      { session },
    );
    return created;
  });
  res.status(201).json(dto(user));
});
employees.patch("/:id", allow(...managers), async (req, res) => {
  id.parse(req.params.id);
  let data = schema.partial().parse(req.body);
  if (req.params.id === String(req.user._id))
    throw fail(400, "Use My profile or Security to update your own account.");
  if (data.password) data.password = await bcrypt.hash(data.password, 12);
  const result = await mongoose.connection.transaction(async (session) => {
    const current = await User.findById(req.params.id).session(session);
    if (!current) throw fail(404, "Employee not found");
    if (
      !roleOptions(req.user).includes(current.role) ||
      (data.role && !roleOptions(req.user).includes(data.role))
    )
      throw fail(403, "You cannot manage this role.");
    data = await linked(data, current, session);
    const invalidate = [
      "role",
      "department",
      "team",
      "active",
      "password",
      "loginId",
      "email",
    ].some(
      (k) => data[k] !== undefined && String(data[k]) !== String(current[k]),
    );
    const update = {
      $set: data,
      ...(invalidate ? { $inc: { authVersion: 1 } } : {}),
    };
    const updated = await identityUpdate(User, { _id: current._id }, update, {
      session,
      runValidators: true,
      returnDocument: "after",
    });
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "employees.updated",
          resource: "users",
          resourceId: String(current._id),
        },
      ],
      { session },
    );
    return updated;
  });
  res.json(dto(result));
});
