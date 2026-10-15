import { Router } from "express";
import { z } from "zod";
import { authenticate, allow } from "../middleware/auth.js";
import { validateGstin } from "../validators/gstin.js";
import { locationSuggestions } from "../services/candidateLocations.js";
import { env } from "../config/env.js";
export const validation = Router();
validation.use(
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
    "Finance Manager",
  ),
);
validation.post("/gstin", (req, res) => {
  const { gstin } = z
    .object({ gstin: z.string().trim().min(1).max(30) })
    .strict()
    .parse(req.body);
  res.json(validateGstin(gstin));
});
validation.get("/locations", async (req, res) => {
  const { q } = z
    .object({ q: z.string().trim().min(2).max(80) })
    .parse(req.query);
  res.set("Cache-Control", "no-store");
  try {
    res.json(await locationSuggestions(q, env.GOOGLE_PLACES_API_KEY));
  } catch {
    res
      .status(503)
      .json({
        message:
          "Location search is unavailable. Try again or enter the city manually.",
      });
  }
});
