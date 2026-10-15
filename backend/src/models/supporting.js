import { contactPolicy } from "../validators/contact.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const opts = { timestamps: true };
export const Permission = mongoose.model(
  "Permission",
  new Schema(
    {
      key: { type: String, required: true, unique: true },
      description: String,
    },
    opts,
  ).plugin(contactPolicy),
);
export const Role = mongoose.model(
  "Role",
  new Schema(
    {
      name: { type: String, required: true, unique: true },
      permissions: [ref("Permission")],
      system: { type: Boolean, default: true },
    },
    opts,
  ).plugin(contactPolicy),
);
export const TeamMembership = mongoose.model(
  "TeamMembership",
  new Schema(
    {
      team: { ...ref("Team"), required: true },
      user: { ...ref("User"), required: true },
      leader: { type: Boolean, default: false },
    },
    opts,
  )
    .plugin(contactPolicy)
    .index({ team: 1, user: 1 }, { unique: true }),
);
export const ClientContact = mongoose.model(
  "ClientContact",
  new Schema(
    {
      client: { ...ref("Client"), required: true },
      name: { type: String, required: true },
      email: String,
      phone: String,
      title: String,
      deletedAt: Date,
    },
    opts,
  ).plugin(contactPolicy),
);
export const VendorSubmission = mongoose.model(
  "VendorSubmission",
  new Schema(
    {
      vendor: { ...ref("User"), required: true },
      job: { ...ref("Job"), required: true },
      candidateName: { type: String, required: true },
      phone: { type: String, required: true },
      email: String,
      consent: { type: Boolean, required: true },
      status: {
        type: String,
        enum: ["Submitted", "Reviewed", "Accepted", "Rejected"],
        default: "Submitted",
      },
      notes: String,
    },
    opts,
  )
    .plugin(contactPolicy)
    .index({ vendor: 1, job: 1, phone: 1 }, { unique: true }),
);
export const Document = mongoose.model(
  "Document",
  new Schema(
    {
      name: { type: String, required: true },
      key: { type: String, required: true, unique: true },
      mime: { type: String, required: true },
      size: { type: Number, required: true },
      category: {
        type: String,
        enum: [
          "Resume",
          "Client Agreement",
          "Vendor Agreement",
          "Offer Letter",
          "Joining Document",
          "Invoice",
          "Company Document",
        ],
        required: true,
      },
      owner: { ...ref("User"), required: true },
      deletedAt: { type: Date, default: null },
    },
    opts,
  )
    .plugin(contactPolicy)
    .index({ owner: 1, createdAt: -1 }),
);
export const Activity = mongoose.model(
  "Activity",
  new Schema(
    {
      actor: { ...ref("User"), required: true },
      candidate: ref("Candidate"),
      lead: ref("Lead"),
      type: {
        type: String,
        enum: ["Email", "Call", "Meeting", "Note"],
        required: true,
      },
      subject: String,
      body: String,
      status: {
        type: String,
        enum: ["Pending", "Sent", "Failed", "Recorded"],
        default: "Recorded",
      },
    },
    opts,
  ).plugin(contactPolicy),
);
