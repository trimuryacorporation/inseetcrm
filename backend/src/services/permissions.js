import mongoose from "mongoose";
import { definitions } from "../models/operations.js";
const admins = ["Super Admin", "Admin"];
const hr = [...admins, "HR Manager", "Team Leader"];
const recruiting = [...hr, "Recruiter", "Account Manager"];
const sales = [...admins, "Sales Manager", "BDE", "Account Manager"];
const staff = [...new Set([...recruiting, ...sales, "Finance Manager"])];
export const actions = ["view", "create", "edit", "delete"];
export const modules = {
  dashboard: "Overview",
  clients: "Clients",
  jobs: "Jobs",
  candidates: "Candidates",
  applications: "ATS Pipeline",
  interviews: "Interviews",
  employees: "Employees",
  attendance: "Attendance",
  assignments: "Assignments",
  ...Object.fromEntries(
    Object.entries(definitions).map(([k, d]) => [k, d.title]),
  ),
  finance: "Finance",
  reports: "Reports",
  communication: "Communication",
  documents: "Documents",
};
const schema = new mongoose.Schema(
  {
    targetType: { type: String, enum: ["user", "department"], required: true },
    target: { type: mongoose.Schema.Types.ObjectId, required: true },
    rules: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
schema.index({ targetType: 1, target: 1 }, { unique: true });
export const AccessPolicy = mongoose.model("AccessPolicy", schema);
export function rolePermissions(role) {
  return Object.fromEntries(
    Object.keys(modules).map((key) => {
      let read = staff,
        write = staff;
      if (definitions[key]) {
        read = definitions[key].read;
        write = definitions[key].write;
      } else if (["candidates", "applications", "interviews"].includes(key))
        read = write = recruiting;
      else if (key === "clients") {
        read = staff.filter((r) => r !== "Finance Manager");
        write = read.filter((r) => r !== "Recruiter");
      } else if (key === "jobs")
        read = write = staff.filter((r) => r !== "Finance Manager");
      else if (key === "employees") {
        read = hr;
        write = [...admins, "HR Manager"];
      } else if (key === "assignments") {
        read = [...hr, "Account Manager"];
        write = hr;
      } else if (key === "finance")
        read = write = [...admins, "Finance Manager"];
      else if (key === "reports")
        read = write = [
          ...hr,
          "Sales Manager",
          "Finance Manager",
          "Account Manager",
        ];
      return [
        key,
        Object.fromEntries(
          actions.map((action) => [
            action,
            (action === "view" ? read : write).includes(role),
          ]),
        ),
      ];
    }),
  );
}
export function mergePermissions(role, department = {}, user = {}) {
  const result = rolePermissions(role);
  for (const key of Object.keys(modules))
    for (const action of actions) {
      if (typeof department[key]?.[action] === "boolean")
        result[key][action] = department[key][action];
      if (typeof user[key]?.[action] === "boolean")
        result[key][action] = user[key][action];
      if (role === "Super Admin") result[key][action] = true;
      if (["Vendor", "Client"].includes(role)) result[key][action] = false;
    }
  return result;
}
export async function policiesFor(user) {
  const Department = mongoose.model("Department");
  const dept = user.department
    ? await Department.findOne({
        nameKey: user.department.trim().replace(/\s+/g, " ").toLowerCase(),
        deletedAt: null,
      }).select("_id")
    : null;
  const policies = await AccessPolicy.find({
    $or: [
      { targetType: "user", target: user._id },
      ...(dept ? [{ targetType: "department", target: dept._id }] : []),
    ],
  }).lean();
  return {
    department:
      policies.find((p) => p.targetType === "department")?.rules || {},
    user: policies.find((p) => p.targetType === "user")?.rules || {},
  };
}
export async function hydratePermissions(user) {
  const p = await policiesFor(user);
  user.permissions = mergePermissions(user.role, p.department, p.user);
  return user;
}
export function can(user, module, action = "view") {
  return (
    user.role === "Super Admin" || user.permissions?.[module]?.[action] === true
  );
}
export function requestPermission(req) {
  const parts = req.originalUrl
    .split("?")[0]
    .split("/")
    .filter(Boolean)
    .slice(1);
  let key = parts[0];
  let strictRole = false;
  if (key === "users") {
    key = "employees";
    strictRole = true;
  }
  if (key === "auth" && parts[1] === "invitations") {
    key = "employees";
    strictRole = true;
  }
  if (key === "assignments") {
    key =
      parts[1] === "jobs"
        ? "jobs"
        : parts[1] === "clients"
          ? "employees"
          : "assignments";
    strictRole = true;
  }
  if (key === "team-memberships") {
    key = "teams";
    strictRole = true;
  }
  if (key === "leaves" && parts.includes("approval")) strictRole = true;
  if (key === "data") key = parts[1];
  if (["invoices", "payments"].includes(key)) key = "finance";
  if (key === "candidate-options") key = "candidates";
  if (key === "client-options") key = "clients";
  if (!modules[key]) return null;
  let action = ["GET", "HEAD", "OPTIONS"].includes(req.method)
    ? "view"
    : req.method === "DELETE"
      ? "delete"
      : req.method === "POST"
        ? "create"
        : "edit";
  if (
    key === "employees" &&
    req.body?.active === false &&
    Object.keys(req.body).length === 1
  )
    action = "delete";
  if (parts.includes("feedback") && req.method === "POST") action = "edit";
  if (parts.includes("check-out")) action = "edit";
  return { module: key, action, strictRole };
}
