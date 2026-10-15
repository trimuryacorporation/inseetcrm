import { employees } from "./routes/employees.js";
import { validation } from "./routes/validation.js";
import { candidateOptions } from "./routes/candidateOptions.js";
import { clientOptions } from "./routes/clientOptions.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { auth } from "./routes/auth.js";
import { portals } from "./routes/portals.js";
import { dataRoutes } from "./routes/data.js";
import { advanced } from "./routes/advanced.js";
import { operations } from "./routes/operations.js";
import { recruitment } from "./routes/recruitment.js";
import { resources } from "./routes/resources.js";
export const app = express();
app.set("trust proxy", env.NODE_ENV === "production" ? 1 : false);
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(
  pinoHttp({
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
    autoLogging: env.NODE_ENV !== "test",
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 200,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.get(["/", "/api"], (req, res) =>
  res.json({
    service: "inseet-api",
    message:
      "INSEET backend API is running. Open the frontend URL to use the CRM.",
    frontend: env.FRONTEND_URL,
    health: "/api/health",
    api: "/api",
  }),
);
app.get("/api/health", (req, res) =>
  res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({
    service: "inseet-api",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "unavailable",
  }),
);
app.use("/api/auth", auth);
app.use("/api/employees", employees);
app.use("/api/validation", validation);
app.use("/api", recruitment);
app.use("/api", operations);
app.use("/api", advanced);
app.use("/api", dataRoutes);
app.use("/api", portals);
app.use("/api", clientOptions);
app.use("/api", candidateOptions);
app.use("/api", resources);
app.use((req, res) => res.status(404).json({ message: "Endpoint not found" }));
app.use((err, req, res, next) => {
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({ message: err.issues.map((v) => v.message).join(". ") });
  if (err.code === 11000)
    return res.status(409).json({
      message: err.keyPattern?.loginId
        ? "Login ID is already registered. Deactivated accounts retain their login IDs."
        : err.keyPattern?.email
          ? "Email address is already registered. Archived records remain registered until permanently deleted from MongoDB."
          : err.keyPattern?.phone
            ? "Phone number is already registered. Archived records remain registered until permanently deleted from MongoDB."
            : "This record already exists",
    });
  if (err.code?.startsWith("CSV_"))
    return res.status(400).json({ message: "Invalid CSV format" });
  if (err.code === "LIMIT_FILE_SIZE")
    return res.status(413).json({ message: "Files must be 10 MB or smaller" });
  if (err.name === "MulterError")
    return res.status(400).json({ message: "Invalid upload request" });
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ message: "Invalid JSON" });
  if (err.name === "CastError")
    return res.status(400).json({ message: "Invalid record identifier" });
  if (err.status) return res.status(err.status).json({ message: err.message });
  req.log.error({ err }, "Request failed");
  res.status(500).json({ message: "Something went wrong. Please try again." });
});
