import { contactPolicy } from "../validators/contact.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
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
const admins = ["Super Admin", "Admin"];
const hr = [...admins, "HR Manager", "Team Leader"];
const sales = [...admins, "Sales Manager", "BDE", "Account Manager"];
const finance = [...admins, "Finance Manager"];
const f = (key, label, type = "text", required = false, options) => ({
  key,
  label,
  type,
  required,
  ...(options ? { options } : {}),
});
export const definitions = {
  teams: {
    name: "Team",
    title: "People & teams",
    description: "Bring your recruiters together around shared goals.",
    read: hr,
    write: hr,
    fields: [
      f("name", "Team name", "text", true),
      f("department", "Department"),
      f("description", "Description", "textarea"),
    ],
  },
  tasks: {
    name: "Task",
    title: "Tasks & calendar",
    description: "Small actions. Meaningful progress.",
    read: staff,
    write: staff,
    fields: [
      f("title", "Task title", "text", true),
      f("dueAt", "Deadline", "date", true),
      f("priority", "Priority", "select", true, ["Normal", "High", "Urgent"]),
      f("status", "Status", "select", true, ["To Do", "In Progress", "Done"]),
      f("notes", "Notes", "textarea"),
    ],
  },
  leads: {
    name: "Lead",
    title: "Sales CRM",
    description: "Turn new conversations into lasting client relationships.",
    read: sales,
    write: sales,
    fields: [
      f("companyName", "Company name", "text", true),
      f("contactPerson", "Contact person"),
      f("email", "Email", "email"),
      f("phone", "Phone"),
      f("industry", "Industry"),
      f("city", "City"),
      f("stage", "Sales stage", "select", true, [
        "New",
        "Contacted",
        "Qualified",
        "Meeting Scheduled",
        "Proposal Sent",
        "Negotiation",
        "Won",
        "Lost",
      ]),
      f("followUpAt", "Next follow-up", "date"),
      f("expectedRevenuePaise", "Forecast revenue (paise)", "number"),
      f("notes", "Notes", "textarea"),
    ],
  },
  deals: {
    name: "Deal",
    title: "Deals",
    description: "Track opportunities through to signed agreements.",
    read: sales,
    write: sales,
    fields: [
      f("title", "Deal name", "text", true),
      f("companyName", "Company"),
      f("valuePaise", "Deal value (paise)", "number", true),
      f("probability", "Probability (%)", "number"),
      f("closeDate", "Expected close date", "date"),
      f("stage", "Stage", "select", true, [
        "New",
        "Qualified",
        "Proposal Sent",
        "Negotiation",
        "Won",
        "Lost",
      ]),
      f("notes", "Notes", "textarea"),
    ],
  },
  vendors: {
    name: "Vendor",
    title: "Vendors",
    description: "Build a trusted network of recruitment partners.",
    read: [...admins, "HR Manager", "Account Manager"],
    write: [...admins, "HR Manager", "Account Manager"],
    fields: [
      f("companyName", "Agency name", "text", true),
      f("contactPerson", "Contact person", "text", true),
      f("email", "Email", "email", true),
      f("phone", "Phone"),
      f("city", "City"),
      f("gstin", "GSTIN"),
      f("commissionBasisPoints", "Commission (basis points)", "number"),
      f("status", "Status", "select", true, ["Active", "Inactive"]),
      f("notes", "Notes", "textarea"),
    ],
  },
  placements: {
    name: "Placement",
    title: "Placements",
    description: "Make every first day a great beginning.",
    read: [...hr, "Recruiter", "Account Manager"],
    write: [...hr, "Recruiter", "Account Manager"],
    fields: [
      f("candidateName", "Candidate name", "text", true),
      f("companyName", "Client company", "text", true),
      f("jobTitle", "Job title", "text", true),
      f("joiningDate", "Joining date", "date", true),
      f("status", "Joining status", "select", true, [
        "Upcoming",
        "Joined",
        "No-Show",
        "Dropout",
        "Replacement",
      ]),
      f("feePaise", "Placement fee (paise)", "number"),
      f("notes", "Notes", "textarea"),
    ],
  },
  leaves: {
    name: "Leave",
    title: "Leave requests",
    description: "Plan time away and keep your team in sync.",
    read: staff,
    write: staff,
    fields: [
      f("type", "Leave type", "select", true, [
        "Casual",
        "Sick",
        "Annual",
        "Unpaid",
      ]),
      f("startDate", "Start date", "date", true),
      f("endDate", "End date", "date", true),
      f("reason", "Reason", "textarea", true),
    ],
  },
  expenses: {
    name: "Expense",
    title: "Expenses",
    description: "Track business expenses with a clear audit trail.",
    read: finance,
    write: finance,
    fields: [
      f("title", "Expense", "text", true),
      f("amountPaise", "Amount (paise)", "number", true),
      f("category", "Category", "select", true, [
        "Office",
        "Travel",
        "Software",
        "Recruitment",
        "Other",
      ]),
      f("incurredAt", "Date", "date", true),
      f("notes", "Notes", "textarea"),
    ],
  },
  incentives: {
    name: "Incentive",
    title: "Recruiter incentives",
    description: "Recognize contributions and track incentive payments.",
    read: finance,
    write: finance,
    fields: [
      f("employeeName", "Employee name", "text", true),
      f("amountPaise", "Incentive (paise)", "number", true),
      f("period", "Period", "text", true),
      f("status", "Status", "select", true, ["Pending", "Approved", "Paid"]),
      f("notes", "Notes", "textarea"),
    ],
  },
  branches: {
    name: "Branch",
    title: "Branches",
    description: "Manage your office locations.",
    read: hr,
    write: admins,
    fields: [
      f("name", "Branch name", "text", true),
      f("city", "City", "text", true),
      f("address", "Address", "textarea"),
      f("phone", "Phone"),
    ],
  },
  offers: {
    name: "Offer",
    title: "Offer management",
    description: "Keep offers and candidate decisions organized.",
    read: [...hr, "Recruiter"],
    write: [...hr, "Recruiter"],
    fields: [
      f("candidateName", "Candidate name", "text", true),
      f("companyName", "Client company", "text", true),
      f("jobTitle", "Job title", "text", true),
      f("ctcPaise", "Annual CTC (paise)", "number", true),
      f("joiningDate", "Joining date", "date"),
      f("status", "Status", "select", true, [
        "Draft",
        "Released",
        "Accepted",
        "Declined",
        "Withdrawn",
      ]),
      f("notes", "Notes", "textarea"),
    ],
  },
  "email-templates": {
    name: "EmailTemplate",
    title: "Communication",
    description: "Create approved email templates for your team.",
    read: staff,
    write: hr,
    fields: [
      f("name", "Template name", "text", true),
      f("subject", "Subject", "text", true),
      f("body", "Message body", "textarea", true),
    ],
  },
};
export const Models = {};
for (const [key, def] of Object.entries(definitions)) {
  const fields = {
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  };
  for (const field of def.fields) {
    fields[field.key] = {
      type:
        field.type === "number"
          ? Number
          : field.type === "date"
            ? Date
            : String,
      required: field.required,
      ...(field.options ? { enum: field.options } : {}),
      ...(field.type === "number" ? { min: 0 } : {}),
      ...(["text", "email", "textarea"].includes(field.type)
        ? { trim: true, maxLength: field.type === "textarea" ? 10000 : 500 }
        : {}),
    };
  }
  if (key === "leaves") {
    fields.approvalStatus = {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    };
    fields.approvedBy = { type: Schema.Types.ObjectId, ref: "User" };
  }
  const schema = new Schema(fields, { timestamps: true });
  schema.plugin(contactPolicy);
  schema.index({ owner: 1, createdAt: -1 });
  Models[key] = mongoose.model(def.name, schema);
}
export const Attendance = mongoose.model(
  "Attendance",
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: "User", required: true },
      day: { type: String, required: true },
      checkIn: { type: Date, required: true },
      checkOut: Date,
      minutes: { type: Number, default: 0 },
    },
    { timestamps: true },
  ).index({ user: 1, day: 1 }, { unique: true }),
);
export const Invoice = mongoose.model(
  "Invoice",
  new Schema(
    {
      number: { type: String, required: true, unique: true },
      companyName: { type: String, required: true },
      gstin: String,
      description: { type: String, required: true },
      subtotalPaise: { type: Number, required: true, min: 0 },
      gstBasisPoints: { type: Number, required: true, min: 0, max: 10000 },
      taxPaise: { type: Number, required: true },
      totalPaise: { type: Number, required: true },
      paidPaise: { type: Number, default: 0, min: 0 },
      dueAt: { type: Date, required: true },
      status: {
        type: String,
        enum: ["Unpaid", "Partially Paid", "Paid"],
        default: "Unpaid",
      },
      owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
  ),
);
export const Payment = mongoose.model(
  "Payment",
  new Schema(
    {
      invoice: { type: Schema.Types.ObjectId, ref: "Invoice", required: true },
      amountPaise: { type: Number, required: true, min: 1 },
      reference: { type: String, required: true, unique: true },
      paidAt: { type: Date, required: true },
      owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    },
    { timestamps: true },
  ),
);
