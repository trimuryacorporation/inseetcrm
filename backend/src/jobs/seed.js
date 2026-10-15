import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { env } from "../config/env.js";
import { seedPrivilegedUsers } from "../services/seed.js";
const credentialPath = fileURLToPath(
  new URL("../../.env.seed", import.meta.url),
);
if (!fs.existsSync(credentialPath)) {
  const password = () => crypto.randomBytes(24).toString("base64url") + "A9!";
  const content = [
    "# Local privileged-account credentials. Do not commit or share this file.",
    "# Rerunning the seed never resets an existing password.",
    "SEED_SUPERADMIN_EMAIL=superadmin@inseet.in",
    "SEED_SUPERADMIN_PASSWORD=" + password(),
    "SEED_ADMIN_EMAIL=admin@inseet.in",
    "SEED_ADMIN_PASSWORD=" + password(),
    "",
  ].join("\n");
  fs.writeFileSync(credentialPath, content, { flag: "wx", mode: 0o600 });
}
const credentials = dotenv.parse(fs.readFileSync(credentialPath));
try {
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
  const results = await seedPrivilegedUsers([
    {
      name: "INSEET Super Admin",
      email: credentials.SEED_SUPERADMIN_EMAIL,
      password: credentials.SEED_SUPERADMIN_PASSWORD,
      role: "Super Admin",
    },
    {
      name: "INSEET Admin",
      email: credentials.SEED_ADMIN_EMAIL,
      password: credentials.SEED_ADMIN_PASSWORD,
      role: "Admin",
    },
  ]);
  console.log(
    JSON.stringify(
      {
        database: mongoose.connection.name,
        accounts: results,
        credentialsFile: "backend/.env.seed",
        passwordsPrinted: false,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      seedFailed: true,
      errorType: error.name,
      message:
        error.name === "MongoServerError"
          ? "MongoDB rejected the seed operation"
          : error.name === "ZodError"
            ? "Invalid seed account configuration"
            : error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
