import {
  hydratePermissions,
  requestPermission,
  can,
} from "../services/permissions.js";
import jwt from "jsonwebtoken";
import { User, Session } from "../models/index.js";
import { env } from "../config/env.js";
import { fail } from "../utils/security.js";
export async function authenticate(req, res, next) {
  try {
    const value = req.headers.authorization?.split(" ");
    if (value?.[0] !== "Bearer") throw fail(401, "Authentication required");
    const payload = jwt.verify(value[1], env.JWT_ACCESS_SECRET, {
      issuer: "inseet",
      audience: "inseet-web",
      algorithms: ["HS256"],
    });
    if (
      payload.sid &&
      !(await Session.exists({
        _id: payload.sid,
        user: payload.sub,
        revokedAt: null,
        expiresAt: { $gt: new Date() },
      }))
    )
      throw fail(401, "Session expired");
    req.user = await User.findOne({ _id: payload.sub, active: true });
    if (!req.user || req.user.authVersion !== payload.version)
      throw fail(401, "Session expired");
    await hydratePermissions(req.user);
    const permission = requestPermission(req);
    if (
      permission &&
      (!can(req.user, permission.module, "view") ||
        !can(req.user, permission.module, permission.action))
    )
      throw fail(403, "You do not have permission for this action");
    next();
  } catch (e) {
    next(e.status ? e : fail(401, "Session expired"));
  }
}
export const allow =
  (...roles) =>
  (req, res, next) =>
    (
      requestPermission(req)
        ? can(
            req.user,
            requestPermission(req).module,
            requestPermission(req).action,
          ) &&
          (!requestPermission(req).strictRole || roles.includes(req.user.role))
        : roles.includes(req.user.role)
    )
      ? next()
      : next(fail(403, "You do not have permission for this action"));
export const scope = (user) =>
  ["Super Admin", "Admin", "HR Manager", "Team Leader"].includes(user.role)
    ? {}
    : { owner: user._id };

export const jobScope = (user) =>
  user.role === "Recruiter"
    ? { $or: [{ owner: user._id }, { assignedRecruiters: user._id }] }
    : scope(user);
