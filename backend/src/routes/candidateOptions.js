import { Router } from "express";
import { z } from "zod";
import { authenticate, allow } from "../middleware/auth.js";
import { CandidateOption } from "../models/candidateOption.js";
import { AuditLog } from "../models/index.js";
import { ensureCandidateOptions, keyOf } from "../services/candidateOptions.js";
import { locationSuggestions } from "../services/candidateLocations.js";
import { env } from "../config/env.js";
export const candidateOptions = Router();
candidateOptions.use((req, res, next) =>
  req.path.split("/")[1] === "candidate-options" ? next() : next("router"),
);
candidateOptions.use(
  authenticate,
  allow(
    "Super Admin",
    "Admin",
    "HR Manager",
    "Recruiter",
    "Team Leader",
    "Account Manager",
  ),
);
candidateOptions.get("/candidate-options", async (req, res) => {
  await ensureCandidateOptions();
  const items = await CandidateOption.find({
    kind: { $in: ["source", "qualification"] },
  })
    .sort({ name: 1 })
    .lean();
  res.json({
    sources: items.filter((i) => i.kind === "source"),
    qualifications: items.filter((i) => i.kind === "qualification"),
    googleLocationsConfigured: Boolean(env.GOOGLE_PLACES_API_KEY),
    skillsProvider: "local",
  });
});
candidateOptions.post("/candidate-options", async (req, res) => {
  const data = z
    .object({
      kind: z.enum(["source", "qualification", "skill"]),
      name: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[^\x00-\x1f\x7f<>]+$/),
    })
    .strict()
    .parse(req.body);
  const result = await CandidateOption.db.transaction(async (session) => {
    const [item] = await CandidateOption.create(
      [
        {
          ...data,
          name: data.name.replace(/\s+/g, " "),
          nameKey: keyOf(data.name),
          createdBy: req.user._id,
        },
      ],
      { session },
    );
    await AuditLog.create(
      [
        {
          actor: req.user._id,
          action: "candidate_options.created",
          resource: data.kind,
          resourceId: String(item._id),
        },
      ],
      { session },
    );
    return item;
  });
  res.status(201).json(result);
});
const query = z.object({ q: z.string().trim().min(2).max(80) });
candidateOptions.get("/candidate-options/skills", async (req, res) => {
  const { q } = query.parse(req.query);
  await ensureCandidateOptions();
  // Escape all regex metacharacters; do not execute user-supplied expressions.
  const escaped = Array.from(q)
    .map((c) => ("\\^$.*+?()[]{}|".includes(c) ? "\\" + c : c))
    .join("");
  const items = await CandidateOption.find({
    kind: "skill",
    name: { $regex: escaped, $options: "i" },
  })
    .select("name")
    .sort({ name: 1 })
    .limit(15)
    .lean();
  res.json({ items, provider: "local" });
});
candidateOptions.get("/candidate-options/locations", async (req, res) => {
  const { q } = query.parse(req.query);
  res.set("Cache-Control", "no-store");
  try {
    res.json(await locationSuggestions(q, env.GOOGLE_PLACES_API_KEY));
  } catch {
    res
      .status(503)
      .json({
        message:
          "Google location search is unavailable. Try again or enter the city manually.",
      });
  }
});
