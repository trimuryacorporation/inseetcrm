import dns from "node:dns/promises";
import { isIP } from "node:net";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  quiet: true,
});
import { z } from "zod";
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().default(4000),
    GOOGLE_PLACES_API_KEY: z.string().default(""),
    MONGODB_URI: z.string().min(1),
    MONGODB_DB_NAME: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .default("inseetcrm"),
    MONGODB_DNS_SERVERS: z.string().default(""),
    JWT_ACCESS_SECRET: z.string().min(32),
    FRONTEND_URL: z.string().url(),
    SETUP_KEY: z.string().min(24),
  })
  .passthrough()
  .parse(process.env);

// Optional process-local override for networks whose DNS blocks Atlas SRV queries.
if (env.MONGODB_DNS_SERVERS) {
  const servers = env.MONGODB_DNS_SERVERS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!servers.length || servers.some((server) => !isIP(server))) {
    throw new Error(
      "MONGODB_DNS_SERVERS must contain comma-separated DNS IP addresses",
    );
  }
  dns.setServers(servers);
}
