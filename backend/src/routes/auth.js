import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import mongoose from "mongoose";
import { Bootstrap } from "../models/bootstrap.js";
import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { User, Session, roles, AuditLog } from "../models/index.js";
import { env } from "../config/env.js";
import { access, token, hash, safeUser, fail } from "../utils/security.js";
import { authenticate, allow } from "../middleware/auth.js";
import { sendLink } from "../services/mail.js";
export const auth = Router();
const password = z
  .string()
  .min(12)
  .max(72)
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");
const credentials = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(72),
});
const cookie = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/auth",
};
const origin = (req, res, next) =>
  req.headers.origin === new URL(env.FRONTEND_URL).origin
    ? next()
    : next(fail(403, "Untrusted origin"));
auth.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
async function issue(user, res) {
  const raw = token();
  const session = await Session.create({
    user: user._id,
    authVersion: user.authVersion,
    tokenHash: hash(raw),
    expiresAt: new Date(Date.now() + 7 * 86400000),
  });
  res.cookie("inseet_refresh", raw, { ...cookie, maxAge: 7 * 86400000 });
  return { user: safeUser(user), accessToken: access(user, session) };
}
auth.post("/setup", async (req, res) => {
  const data = z
    .object({
      key: z.string(),
      name: z.string().min(2).max(100),
      email: z.string().email(),
      password,
    })
    .parse(req.body);
  if (hash(data.key) !== hash(env.SETUP_KEY))
    throw fail(403, "Invalid setup key");
  const user = await mongoose.connection.transaction(async (session) => {
    if (await User.exists({ active: true }).session(session))
      throw fail(409, "Setup is already complete");
    await Bootstrap.create([{ _id: "workspace", completedAt: new Date() }], {
      session,
    });
    const [admin] = await identityCreate(
      User,
      [
        {
          name: data.name,
          email: data.email,
          password: await bcrypt.hash(data.password, 12),
          role: "Super Admin",
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: admin._id,
          action: "workspace.created",
          resourceId: String(admin._id),
        },
      ],
      { session },
    );
    return admin;
  });
  res.status(201).json(await issue(user, res));
});
auth.post("/login", async (req, res) => {
  const d = credentials.parse(req.body);
  const user = await User.findOne({ email: d.email, active: true }).select(
    "+password",
  );
  if (!user?.password || !(await bcrypt.compare(d.password, user.password)))
    throw fail(401, "Invalid email or password");
  res.json(await issue(user, res));
});
auth.post("/refresh", origin, async (req, res) => {
  if (!req.cookies.inseet_refresh) throw fail(401, "Please sign in");
  const session = await Session.findOneAndUpdate(
    {
      tokenHash: hash(req.cookies.inseet_refresh),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date() } },
  );
  if (!session) throw fail(401, "Session expired");
  const user = await User.findOne({ _id: session.user, active: true });
  if (!user || session.authVersion !== user.authVersion)
    throw fail(401, "Session expired");
  res.json(await issue(user, res));
});
auth.post("/logout", origin, async (req, res) => {
  if (req.cookies.inseet_refresh)
    await Session.updateOne(
      { tokenHash: hash(req.cookies.inseet_refresh) },
      { $set: { revokedAt: new Date() } },
    );
  res.clearCookie("inseet_refresh", cookie).json({ message: "Signed out" });
});
auth.get("/me", authenticate, (req, res) => res.json(safeUser(req.user)));
auth.patch("/profile", authenticate, async (req, res) => {
  const d = z
    .object({ name: z.string().min(2).max(100) })
    .strict()
    .parse(req.body);
  req.user.name = d.name;
  await req.user.save();
  res.json(safeUser(req.user));
});
auth.post("/change-password", authenticate, async (req, res) => {
  const d = z.object({ currentPassword: z.string(), password }).parse(req.body);
  const user = await User.findById(req.user._id).select("+password");
  if (!(await bcrypt.compare(d.currentPassword, user.password)))
    throw fail(400, "Current password is incorrect");
  user.password = await bcrypt.hash(d.password, 12);
  user.authVersion += 1;
  await user.save();
  await Session.deleteMany({ user: user._id });
  res.json({ message: "Password updated. Sign in again." });
});
auth.post("/forgot-password", async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  if (!env.SMTP_HOST) throw fail(503, "Email delivery has not been configured");
  const user = await User.findOne({ email: email.toLowerCase(), active: true });
  if (user) {
    const raw = token();
    user.resetHash = hash(raw);
    user.resetExpires = new Date(Date.now() + 1800000);
    await user.save();
    await sendLink(
      email,
      "Reset your password",
      env.FRONTEND_URL + "/reset-password?token=" + raw,
    );
  }
  res.json({ message: "If an account exists, a reset link has been sent." });
});
auth.post("/reset-password", async (req, res) => {
  const d = z.object({ token: z.string().min(30), password }).parse(req.body);
  const user = await identityUpdate(
    User,
    { resetHash: hash(d.token), resetExpires: { $gt: new Date() } },
    {
      $set: { password: await bcrypt.hash(d.password, 12) },
      $inc: { authVersion: 1 },
      $unset: { resetHash: 1, resetExpires: 1 },
    },
    { returnDocument: "after" },
  );
  if (!user) throw fail(400, "Invalid or expired link");
  await Session.deleteMany({ user: user._id });
  res.json({ message: "Password reset. You can now sign in." });
});
auth.post(
  "/invitations",
  authenticate,
  allow("Super Admin", "Admin"),
  async (req, res) => {
    const d = z
      .object({
        name: z.string().min(2),
        email: z.string().email(),
        role: z.enum(roles),
      })
      .parse(req.body);
    if (d.role === "Super Admin" && req.user.role !== "Super Admin")
      throw fail(403, "Only a Super Admin can invite this role");
    if (!env.SMTP_HOST)
      throw fail(503, "Configure email before inviting users");
    const raw = token();
    const user = await identityCreate(User, {
      ...d,
      active: false,
      inviteHash: hash(raw),
      inviteExpires: new Date(Date.now() + 86400000),
    });
    await sendLink(
      d.email,
      "Accept your INSEET invitation",
      env.FRONTEND_URL + "/accept-invitation?token=" + raw,
    );
    await AuditLog.create({
      actor: req.user._id,
      action: "user.invited",
      resourceId: String(user._id),
    });
    res.status(201).json({ message: "Invitation sent" });
  },
);
auth.post("/accept-invitation", async (req, res) => {
  const d = z.object({ token: z.string(), password }).parse(req.body);
  const user = await identityUpdate(
    User,
    { inviteHash: hash(d.token), inviteExpires: { $gt: new Date() } },
    {
      $set: { password: await bcrypt.hash(d.password, 12), active: true },
      $unset: { inviteHash: 1, inviteExpires: 1 },
    },
    { returnDocument: "after" },
  );
  if (!user) throw fail(400, "Invalid or expired invitation");
  res.json(await issue(user, res));
});

auth.get("/sessions", authenticate, async (req, res) =>
  res.json(
    await Session.find({
      user: req.user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
      .select("createdAt expiresAt")
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);
auth.delete("/sessions/:id", authenticate, async (req, res) => {
  z.string()
    .regex(/^[a-f0-9]{24}$/i)
    .parse(req.params.id);
  const result = await Session.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { revokedAt: new Date() } },
  );
  if (!result) throw fail(404, "Session not found");
  res.status(204).end();
});
