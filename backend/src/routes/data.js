import { identityCreate, identityUpdate } from "../services/contactIdentity.js";
import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import multer from "multer";
import { Router } from "express";
import { z } from "zod";
import { Candidate } from "../models/recruitment.js";
import { Client, Job, AuditLog } from "../models/index.js";
import { definitions, Models } from "../models/operations.js";
import { authenticate, allow, scope } from "../middleware/auth.js";
import { fail } from "../utils/security.js";
import { candidateSchema } from "./recruitment.js";
export const dataRoutes = Router();
dataRoutes.use((req, res, next) =>
  req.path.startsWith("/data/") ? next() : next("router"),
);
dataRoutes.use(authenticate);
const recruiting = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Account Manager",
];
const staff = [...recruiting, "Sales Manager", "BDE"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 0 },
});
function checkZip(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw fail(400, "Invalid XLSX archive");
  let count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16),
    total = 0;
  if (count > 2000) throw fail(400, "Workbook is too complex");
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw fail(400, "Invalid XLSX archive");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 20 * 1024 * 1024)
      throw fail(400, "Expanded workbook exceeds 20 MB");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
dataRoutes.post(
  "/data/candidates/import",
  allow(...recruiting),
  upload.single("file"),
  async (req, res) => {
    if (!req.file) throw fail(400, "Choose a CSV or XLSX file");
    let rows;
    if (req.file.originalname.toLowerCase().endsWith(".csv"))
      rows = parse(req.file.buffer, {
        columns: true,
        bom: true,
        skip_empty_lines: true,
        trim: true,
        max_record_size: 10000,
      });
    else if (req.file.originalname.toLowerCase().endsWith(".xlsx")) {
      checkZip(req.file.buffer);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(req.file.buffer);
      const sheet = book.worksheets[0];
      if (!sheet || sheet.rowCount > 501 || sheet.columnCount > 30)
        throw fail(400, "Use a workbook with at most 500 rows and 30 columns");
      const headers = sheet.getRow(1).values.slice(1).map(String);
      rows = [];
      sheet.eachRow((row, index) => {
        if (index > 1)
          rows.push(
            Object.fromEntries(
              headers.map((key, i) => [
                key,
                String(row.getCell(i + 1).text || ""),
              ]),
            ),
          );
      });
    } else throw fail(400, "Use CSV or XLSX");
    if (rows.length > 500)
      throw fail(400, "Import at most 500 candidates at a time");
    const results = [];
    let imported = 0;
    for (const [index, row] of rows.entries()) {
      try {
        const value = {
          ...row,
          consent: row.consent === "true" || row.consent === true,
          skills:
            typeof row.skills === "string"
              ? row.skills
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean)
              : [],
        };
        for (const key of Object.keys(value))
          if (value[key] === "" && key !== "phone" && key !== "fullName")
            delete value[key];
        const candidate = candidateSchema.parse(value);
        candidate.phone = candidate.phone.replace(/[ ()-]/g, "");
        await identityCreate(Candidate, {
          ...candidate,
          owner: req.user._id,
          consentAt: new Date(),
        });
        imported++;
        results.push({ row: index + 2, status: "Imported" });
      } catch (e) {
        results.push({
          row: index + 2,
          status:
            e.code === 11000 || e.status === 409 ? "Duplicate" : "Invalid",
          message:
            e instanceof z.ZodError
              ? e.issues
                  .map((v) => v.path.join(".") + ": " + v.message)
                  .join("; ")
              : e.code === 11000 || e.status === 409
                ? "Phone or email already exists"
                : "Could not import record",
        });
      }
    }
    await AuditLog.create({
      actor: req.user._id,
      action: "candidates.imported",
      resource: "candidates",
      resourceId: String(imported),
    });
    res.json({ imported, failed: rows.length - imported, results });
  },
);
dataRoutes.get("/data/:resource/export", async (req, res) => {
  const resource = req.params.resource;
  let Model, fields, read;
  if (resource === "candidates") {
    Model = Candidate;
    fields = [
      "fullName",
      "phone",
      "email",
      "currentCity",
      "qualification",
      "experience",
      "skills",
      "source",
    ];
    read = recruiting;
  } else if (resource === "clients") {
    Model = Client;
    fields = [
      "companyName",
      "contactPerson",
      "email",
      "phone",
      "industry",
      "state",
      "city",
      "gstin",
      "paymentTerms",
      "feeType",
      "placementFee",
      "fixedFeePaise",
      "status",
    ];
    read = staff;
  } else if (resource === "jobs") {
    Model = Job;
    fields = [
      "title",
      "location",
      "department",
      "openings",
      "salary",
      "status",
      "priority",
    ];
    read = staff;
  } else if (definitions[resource]) {
    Model = Models[resource];
    fields = definitions[resource].fields.map((f) => f.key);
    read = definitions[resource].read;
  } else throw fail(404, "Export resource not found");
  if (!read.includes(req.user.role)) throw fail(403, "Export not allowed");
  const format = z
    .enum(["csv", "xlsx"])
    .default("xlsx")
    .parse(req.query.format);
  const rows = await Model.find({ deletedAt: null, ...scope(req.user) })
    .sort({ createdAt: -1 })
    .limit(10000)
    .lean();
  const placementMoney = (k) =>
    resource === "placements" && ["joiningSalaryPaise", "feePaise"].includes(k);
  const exportHeader = (k) =>
    placementMoney(k)
      ? k.replace("Paise", "INR")
      : k === "commissionBasisPoints"
        ? "commissionPercent"
        : k;
  const book = new ExcelJS.Workbook(),
    sheet = book.addWorksheet("INSEET");
  sheet.columns = fields.map((k) => ({
    header: exportHeader(k),
    key: k,
    width: 25,
  }));
  for (const row of rows)
    sheet.addRow(
      Object.fromEntries(
        fields.map((k) => [
          k,
          (k === "commissionBasisPoints" || placementMoney(k)) && row[k] != null
            ? row[k] / 100
            : Array.isArray(row[k])
              ? row[k].join(", ")
              : row[k] instanceof Date
                ? row[k].toISOString().slice(0, 10)
                : (row[k] ?? ""),
        ]),
      ),
    );
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  res.set(
    "Content-Disposition",
    'attachment; filename="inseet-' + resource + "." + format + '"',
  );
  res.type(
    format === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "text/csv",
  );
  if (format === "xlsx") res.send(Buffer.from(await book.xlsx.writeBuffer()));
  else {
    const cell = (v) =>
      '"' +
      String(v ?? "")
        .replace(/^[\s]*[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    res.send(
      "\ufeff" +
        [
          fields.map(exportHeader).join(","),
          ...rows.map((row) =>
            fields
              .map((k) =>
                cell(
                  (k === "commissionBasisPoints" || placementMoney(k)) &&
                    row[k] != null
                    ? row[k] / 100
                    : Array.isArray(row[k])
                      ? row[k].join(", ")
                      : row[k],
                ),
              )
              .join(","),
          ),
        ].join("\r\n"),
    );
  }
});
