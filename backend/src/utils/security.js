import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
export const hash = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
export const token = () => crypto.randomBytes(48).toString("hex");
export const access = (user, session) =>
  jwt.sign(
    {
      sub: String(user._id),
      version: user.authVersion,
      ...(session ? { sid: String(session._id) } : {}),
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: "15m", issuer: "inseet", audience: "inseet-web" },
  );
export const safeUser = (u) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  loginId: u.loginId,
  department: u.department,
  team: u.team,
});
export const fail = (status, message) =>
  Object.assign(new Error(message), { status });
