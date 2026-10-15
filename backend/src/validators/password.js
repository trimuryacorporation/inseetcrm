import { z } from "zod";
import { passwordError } from "../../../shared/passwordPolicy.mjs";
export const passwordSchema = z.string().superRefine((value, ctx) => {
  const message = passwordError(value);
  if (message) ctx.addIssue({ code: "custom", message });
});
