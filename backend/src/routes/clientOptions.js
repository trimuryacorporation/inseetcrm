import { can } from "../services/permissions.js";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, allow } from "../middleware/auth.js";
import { ClientOption } from "../models/clientOption.js";
import { AuditLog } from "../models/index.js";
import {
  ensureClientOptions,
  findClientOption,
  optionKey,
} from "../services/clientOptions.js";
import { validateGstin } from "../validators/gstin.js";
import { fail } from "../utils/security.js";
export const clientOptions = Router();
clientOptions.use((req, res, next) =>
  req.path.split("/")[1] === "client-options" ? next() : next("router"),
);
clientOptions.use(
  authenticate,
  allow(
    "Super Admin",
    "Admin",
    "HR Manager",
    "Recruiter",
    "Team Leader",
    "Sales Manager",
    "BDE",
    "Account Manager",
  ),
);
const writers = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
];
clientOptions.get("/client-options", async (req, res) => {
  await ensureClientOptions();
  const options = await ClientOption.find({
    kind: { $in: ["industry", "paymentModel", "state"] },
  })
    .select("kind name code feeType basis system")
    .sort({ system: -1, name: 1 })
    .lean();
  res.json({
    industries: options.filter((o) => o.kind === "industry"),
    paymentModels: options.filter((o) => o.kind === "paymentModel"),
    states: options.filter((o) => o.kind === "state"),
    canManage: can(req.user, "clients", "create"),
  });
});
clientOptions.get("/client-options/cities", async (req, res) => {
  const { state } = z
    .object({ state: z.string().trim().min(1).max(120) })
    .parse(req.query);
  await ensureClientOptions();
  const parent = await findClientOption("state", state);
  if (!parent) throw fail(404, "State not found");
  const items = await ClientOption.find({
    kind: "city",
    parentKey: parent.nameKey,
  })
    .select("name system")
    .sort({ name: 1 });
  res.json({ state: parent.name, items, total: items.length });
});
clientOptions.post("/client-options", allow(...writers), async (req, res) => {
  const data = z
    .object({
      kind: z.enum(["industry", "paymentModel", "state", "city"]),
      name: z
        .string()
        .trim()
        .min(2)
        .max(120)
        .regex(/^[^\x00-\x1f\x7f<>]+$/, "Use a readable option name"),
      state: z.string().trim().max(120).optional(),
      feeType: z.enum(["percentage", "fixed"]).optional(),
    })
    .strict()
    .parse(req.body);
  await ensureClientOptions();
  let parentKey = "";
  if (data.kind === "city") {
    if (!data.state) throw fail(400, "Select a state before adding a city");
    const state = await findClientOption("state", data.state);
    if (!state) throw fail(404, "State not found");
    parentKey = state.nameKey;
  }
  if (data.kind === "paymentModel" && !data.feeType)
    throw fail(400, "Choose percentage or fixed fee for the new payment model");
  const result = await mongoose.connection.transaction(async (session) => {
    const [option] = await ClientOption.create(
      [
        {
          kind: data.kind,
          name: data.name.replace(/\s+/g, " "),
          nameKey: optionKey(data.name),
          parentKey,
          system: false,
          createdBy: req.user._id,
          ...(data.kind === "paymentModel"
            ? { feeType: data.feeType, basis: "custom" }
            : {}),
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "client_options.created",
          resource: data.kind,
          resourceId: String(option._id),
        },
      ],
      { session },
    );
    return option;
  });
  res.status(201).json(result);
});
clientOptions.post("/client-options/gstin/validate", (req, res) => {
  const { gstin } = z
    .object({ gstin: z.string().trim().min(1).max(30) })
    .strict()
    .parse(req.body);
  res.json(validateGstin(gstin));
});
