import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { Document, Activity } from "../models/supporting.js";
import { Candidate } from "../models/recruitment.js";
import { AuditLog } from "../models/index.js";
import { Models } from "../models/operations.js";
import { authenticate, allow, scope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
import { putFile, removeFile, downloadUrl } from "../services/storage.js";
import { env } from "../config/env.js";
import nodemailer from "nodemailer";
export const advanced = Router();
advanced.use((req, res, next) =>
  ["documents", "communication"].includes(req.path.split("/")[1])
    ? next()
    : next("router"),
);
advanced.use(authenticate);
const staff = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
  "Finance Manager",
];
advanced.use(allow(...staff));
const id = z.string().regex(/^[a-f0-9]{24}$/i);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 },
  fileFilter(req, file, cb) {
    const types = {
      "application/pdf": ".pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        ".docx",
      "image/png": ".png",
      "image/jpeg": ".jpg",
    };
    const ext = types[file.mimetype];
    cb(
      ext &&
        (file.originalname.toLowerCase().endsWith(ext) ||
          (file.mimetype === "image/jpeg" &&
            file.originalname.toLowerCase().endsWith(".jpeg")))
        ? null
        : fail(400, "Only PDF, DOCX, PNG and JPEG files are supported"),
      !!ext,
    );
  },
});
advanced.get("/documents", async (req, res) =>
  res.json(
    await Document.find({ deletedAt: null, ...scope(req.user) })
      .select("-key")
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);
advanced.post("/documents", upload.single("file"), async (req, res) => {
  const category = z
    .enum([
      "Resume",
      "Client Agreement",
      "Vendor Agreement",
      "Offer Letter",
      "Joining Document",
      "Invoice",
      "Company Document",
    ])
    .parse(req.body.category);
  if (!req.file) throw fail(400, "Choose a file");
  const b = req.file.buffer,
    mime = req.file.mimetype;
  const valid =
    mime === "application/pdf"
      ? b.subarray(0, 5).toString() === "%PDF-"
      : mime === "image/png"
        ? b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : mime === "image/jpeg"
          ? b[0] === 255 && b[1] === 216 && b[2] === 255
          : b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4;
  if (!valid) throw fail(400, "File content does not match its type");
  const key = "private/" + req.user._id + "/" + crypto.randomUUID();
  await putFile(key, req.file);
  let item;
  try {
    item = await Document.create({
      name: req.file.originalname.slice(0, 200),
      key,
      mime,
      size: req.file.size,
      category,
      owner: req.user._id,
    });
  } catch (e) {
    await removeFile(key);
    throw e;
  }
  await AuditLog.create({
    actor: req.user._id,
    action: "documents.uploaded",
    resourceId: String(item._id),
  });
  res.status(201).json({ id: item._id, name: item.name });
});
advanced.get("/documents/:id/download", async (req, res) => {
  id.parse(req.params.id);
  const doc = await Document.findOne({
    _id: req.params.id,
    deletedAt: null,
    ...scope(req.user),
  });
  if (!doc) throw fail(404, "Document not found");
  res.json({ url: await downloadUrl(doc), expiresIn: 60 });
});
advanced.delete("/documents/:id", async (req, res) => {
  id.parse(req.params.id);
  const doc = await Document.findOne({
    _id: req.params.id,
    deletedAt: null,
    ...scope(req.user),
  });
  if (!doc) throw fail(404, "Document not found");
  await removeFile(doc.key);
  doc.deletedAt = new Date();
  await doc.save();
  await AuditLog.create({
    actor: req.user._id,
    action: "documents.deleted",
    resourceId: req.params.id,
  });
  res.status(204).end();
});
advanced.get("/communication/history", async (req, res) =>
  res.json(
    await Activity.find({ actor: req.user._id })
      .populate("candidate", "fullName")
      .sort({ createdAt: -1 })
      .limit(100),
  ),
);
advanced.post("/communication/email", async (req, res) => {
  const data = z
    .object({ candidate: id, template: id })
    .strict()
    .parse(req.body);
  if (!env.SMTP_HOST) throw fail(503, "Email delivery has not been configured");
  const [candidate, template] = await Promise.all([
    Candidate.findOne({
      _id: data.candidate,
      deletedAt: null,
      consent: true,
      ...scope(req.user),
    }),
    Models["email-templates"].findOne({
      _id: data.template,
      deletedAt: null,
    }),
  ]);
  if (!candidate?.email || !template)
    throw fail(
      400,
      "Choose an accessible, consented candidate with email and an accessible template",
    );
  const activity = await Activity.create({
    actor: req.user._id,
    candidate: candidate._id,
    type: "Email",
    subject: template.subject,
    body: template.body,
    status: "Pending",
  });
  try {
    await nodemailer
      .createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT || 587),
        secure: Number(env.SMTP_PORT) === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      })
      .sendMail({
        from: env.MAIL_FROM,
        to: candidate.email,
        subject: template.subject,
        text: template.body.replaceAll("{{name}}", candidate.fullName),
      });
    activity.status = "Sent";
    await activity.save();
    await AuditLog.create({
      actor: req.user._id,
      action: "communication.email_sent",
      resourceId: String(activity._id),
    });
    res.status(201).json({ message: "Email sent" });
  } catch (e) {
    activity.status = "Failed";
    await activity.save();
    throw fail(502, "Email delivery failed. Check your email configuration");
  }
});
