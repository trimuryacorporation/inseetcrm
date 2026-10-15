import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { fail } from "../utils/security.js";
export async function sendLink(email, subject, url) {
  if (!env.SMTP_HOST) throw fail(503, "Email delivery has not been configured");
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: Number(env.SMTP_PORT) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transport.sendMail({
    from: env.MAIL_FROM,
    to: email,
    subject,
    text:
      subject +
      " for INSEET. Open this link: " +
      url +
      " . If unexpected, ignore this message.",
  });
}
