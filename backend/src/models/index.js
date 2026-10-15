import { contactPolicy } from "../validators/contact.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const base = { timestamps: true };
export const roles = [
  "Super Admin",
  "Admin",
  "HR Manager",
  "Recruiter",
  "Team Leader",
  "Sales Manager",
  "BDE",
  "Account Manager",
  "Finance Manager",
  "Vendor",
  "Client",
];
const user = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    loginId: { type: String, trim: true, lowercase: true },
    department: String,
    team: { type: Schema.Types.ObjectId, ref: "Team" },
    phone: { type: String },
    password: { type: String, select: false },
    role: { type: String, enum: roles, default: "Recruiter" },
    active: { type: Boolean, default: true },
    clientRef: { type: Schema.Types.ObjectId, ref: "Client" },
    authVersion: { type: Number, default: 0 },
    resetHash: String,
    resetExpires: Date,
    inviteHash: String,
    inviteExpires: Date,
  },
  base,
);
user.index(
  { loginId: 1 },
  { unique: true, partialFilterExpression: { loginId: { $type: "string" } } },
);
user.plugin(contactPolicy);
export const User = mongoose.model("User", user);
export const Session = mongoose.model(
  "Session",
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: "User", required: true },
      authVersion: { type: Number, required: true, default: 0 },
      tokenHash: { type: String, unique: true, required: true },
      expiresAt: { type: Date, required: true },
      revokedAt: Date,
    },
    base,
  ).index({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
);
export const AuditLog = mongoose.model(
  "AuditLog",
  new Schema(
    {
      actor: { type: Schema.Types.ObjectId, ref: "User" },
      action: String,
      resource: String,
      resourceId: String,
    },
    base,
  ),
);
const client = new Schema(
  {
    companyName: { type: String, required: true, trim: true },
    industry: String,
    website: String,
    gstin: String,
    contactPerson: String,
    phone: String,
    email: String,
    address: String,
    city: String,
    state: String,
    paymentTerms: String,
    placementFee: Number,
    feeType: { type: String, enum: ["percentage", "fixed"] },
    fixedFeePaise: {
      type: Number,
      min: 0,
      validate: {
        validator: (value) => value == null || Number.isSafeInteger(value),
        message: "Fixed fee must be integer paise",
      },
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "Prospect"],
      default: "Active",
    },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  base,
);
client.plugin(contactPolicy);
client.index({ companyName: "text", email: "text" });
export const Client = mongoose.model("Client", client);
const job = new Schema(
  {
    title: { type: String, required: true },
    client: { type: Schema.Types.ObjectId, ref: "Client", required: true },
    location: String,
    department: String,
    openings: { type: Number, min: 1, default: 1 },
    salary: String,
    experience: String,
    skills: [String],
    description: String,
    priority: {
      type: String,
      enum: ["Normal", "High", "Urgent"],
      default: "Normal",
    },
    status: {
      type: String,
      enum: ["Open", "On Hold", "Closed"],
      default: "Open",
    },
    deadline: Date,
    assignedVendors: [{ type: Schema.Types.ObjectId, ref: "User" }],
    assignedRecruiters: [{ type: Schema.Types.ObjectId, ref: "User" }],
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deletedAt: { type: Date, default: null },
  },
  base,
);
job.index({ title: "text", location: "text" });
export const Job = mongoose.model("Job", job);
export const Notification = mongoose.model(
  "Notification",
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: "User", required: true },
      title: String,
      readAt: Date,
    },
    base,
  ),
);
