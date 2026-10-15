import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { User, AuditLog } from "../models/index.js";
import { authenticate, allow } from "../middleware/auth.js";
import {
  AccessPolicy,
  actions,
  modules,
  policiesFor,
  mergePermissions,
} from "../services/permissions.js";
import { fail } from "../utils/security.js";
import { ensureStaffDepartments } from "../services/departments.js";
export const accessControl = Router();
accessControl.use(authenticate, allow("Super Admin"));
const params = z.object({
  type: z.enum(["user", "department"]),
  id: z.string().regex(/^[a-f0-9]{24}$/i),
});
const actionSchema = z
  .object(Object.fromEntries(actions.map((a) => [a, z.boolean().optional()])))
  .strict();
const rulesSchema = z
  .object(
    Object.fromEntries(
      Object.keys(modules).map((k) => [k, actionSchema.optional()]),
    ),
  )
  .strict();
async function target(type, id) {
  const Model = type === "user" ? User : mongoose.model("Department");
  const record = await Model.findOne({
    _id: id,
    ...(type === "department" ? { deletedAt: null } : {}),
  });
  if (!record) throw fail(404, "User or department not found");
  if (type === "user" && record.role === "Super Admin")
    throw fail(400, "Super Admin always retains full access");
  if (type === "user" && ["Client", "Vendor"].includes(record.role))
    throw fail(400, "Portal accounts retain their isolated portal access");
  return record;
}
accessControl.get("/targets", async (req, res) => {
  await ensureStaffDepartments(req.user._id);
  const [users, departments] = await Promise.all([
    User.find({ role: { $nin: ["Super Admin", "Client", "Vendor"] } })
      .select("name email department role active")
      .sort({ name: 1 })
      .lean(),
    mongoose
      .model("Department")
      .find({ deletedAt: null })
      .select("name")
      .sort({ name: 1 })
      .lean(),
  ]);
  res.json({ users, departments, modules, actions });
});
accessControl.get("/:type/:id", async (req, res) => {
  const { type, id } = params.parse(req.params);
  const record = await target(type, id);
  const policy = await AccessPolicy.findOne({
    targetType: type,
    target: id,
  }).lean();
  let inherited = {};
  if (type === "user") {
    const p = await policiesFor(record);
    inherited = mergePermissions(record.role, p.department, {});
  }
  res.json({
    rules: policy?.rules || {},
    inherited,
    updatedAt: policy?.updatedAt || null,
  });
});
accessControl.put("/:type/:id", async (req, res) => {
  const { type, id } = params.parse(req.params);
  const { rules } = z.object({ rules: rulesSchema }).strict().parse(req.body);
  const record = await target(type, id);
  await mongoose.connection.transaction(async (session) => {
    const before = await AccessPolicy.findOne({ targetType: type, target: id })
      .session(session)
      .lean();
    await AccessPolicy.findOneAndUpdate(
      { targetType: type, target: id },
      { $set: { rules, updatedBy: req.user._id } },
      { upsert: true, session, runValidators: true },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "access.permissions.update",
          resource: type,
          resourceId: id,
          changes: { before: before?.rules || {}, after: rules },
        },
      ],
      { session },
    );
  });
  res.json({
    message:
      "Permissions saved. Active sessions use the new permissions immediately.",
  });
});
