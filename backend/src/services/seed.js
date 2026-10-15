import { passwordSchema } from "../validators/password.js";
import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { z } from "zod";
import { User, AuditLog, roles } from "../models/index.js";
import { Role } from "../models/supporting.js";
import { Bootstrap } from "../models/bootstrap.js";
const accountSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .email()
      .transform((v) => v.toLowerCase()),
    role: z.enum(["Super Admin", "Admin"]),
    password: passwordSchema,
  })
  .strict();
export async function seedPrivilegedUsers(input) {
  const accounts = z.array(accountSchema).length(2).parse(input);
  if (
    new Set(accounts.map((a) => a.email)).size !== 2 ||
    new Set(accounts.map((a) => a.role)).size !== 2
  )
    throw new Error("Provide one distinct account for each privileged role");
  const prepared = await Promise.all(
    accounts.map(async (a) => ({
      ...a,
      password: await bcrypt.hash(a.password, 12),
    })),
  );
  return mongoose.connection.transaction(async (session) => {
    for (const name of roles)
      await Role.updateOne(
        { name },
        { $setOnInsert: { name, system: true, permissions: [] } },
        { upsert: true, session },
      );
    const results = [];
    for (const account of prepared) {
      const existing = await User.findOne({ email: account.email })
        .select("+password")
        .session(session);
      if (existing) {
        if (
          existing.role !== account.role ||
          !existing.active ||
          !existing.password
        )
          throw new Error(
            "Existing account " +
              account.email +
              " has different access or is inactive; seed will not overwrite it",
          );
        results.push({
          email: existing.email,
          role: existing.role,
          status: "unchanged",
        });
        continue;
      }
      const [created] = await identityCreate(
        User,
        [{ ...account, active: true }],
        {
          session,
        },
      );
      await AuditLog.create(
        [
          {
            actor: created._id,
            action: "users.seeded",
            resource: "users",
            resourceId: String(created._id),
          },
        ],
        { session },
      );
      results.push({
        email: created.email,
        role: created.role,
        status: "created",
      });
    }
    await Bootstrap.updateOne(
      { _id: "workspace" },
      { $setOnInsert: { completedAt: new Date() } },
      { upsert: true, session },
    );
    return results;
  });
}
