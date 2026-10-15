import { contactPolicy } from "../validators/contact.js";
import mongoose from "mongoose";
const { Schema } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });
const base = { timestamps: true };
export const stages = [
  "New Candidate",
  "Contacted",
  "Interested",
  "Screening",
  "Shortlisted",
  "Submitted to Client",
  "Interview Scheduled",
  "Interview Completed",
  "Selected",
  "Offer Released",
  "Offer Accepted",
  "Joined",
  "Rejected",
  "On Hold",
  "Dropout",
  "Replacement",
];
const candidate = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    currentCity: String,
    preferredLocation: String,
    qualification: String,
    experience: String,
    skills: [String],
    currentSalary: String,
    expectedSalary: String,
    noticePeriod: String,
    source: String,
    notes: String,
    consent: { type: Boolean, required: true },
    consentAt: Date,
    owner: { ...ref("User"), required: true },
    deletedAt: { type: Date, default: null },
  },
  base,
);
candidate.plugin(contactPolicy);
candidate.index({ fullName: "text", currentCity: "text", skills: "text" });
export const Candidate = mongoose.model("Candidate", candidate);
const application = new Schema(
  {
    candidate: { ...ref("Candidate"), required: true },
    job: { ...ref("Job"), required: true },
    stage: { type: String, enum: stages, default: stages[0] },
    owner: { ...ref("User"), required: true },
    version: { type: Number, default: 0 },
  },
  base,
);
application.index({ candidate: 1, job: 1 }, { unique: true });
export const Application = mongoose.model("Application", application);
export const ApplicationStageHistory = mongoose.model(
  "ApplicationStageHistory",
  new Schema(
    {
      application: { ...ref("Application"), required: true },
      from: String,
      to: { type: String, enum: stages, required: true },
      changedBy: { ...ref("User"), required: true },
      note: String,
    },
    base,
  ),
);
export const Interview = mongoose.model(
  "Interview",
  new Schema(
    {
      application: { ...ref("Application"), required: true },
      candidate: { ...ref("Candidate"), required: true },
      job: { ...ref("Job"), required: true },
      scheduledAt: { type: Date, required: true },
      duration: { type: Number, default: 30, min: 5 },
      type: {
        type: String,
        enum: ["Walk-in", "Phone", "Video", "HR", "Technical", "Final"],
        required: true,
      },
      location: String,
      interviewer: String,
      status: {
        type: String,
        enum: ["Scheduled", "Rescheduled", "Completed", "Cancelled"],
        default: "Scheduled",
      },
      notes: String,
      owner: { ...ref("User"), required: true },
      deletedAt: { type: Date, default: null },
    },
    base,
  ).index({ owner: 1, scheduledAt: 1 }),
);
export const InterviewFeedback = mongoose.model(
  "InterviewFeedback",
  new Schema(
    {
      interview: { ...ref("Interview"), required: true },
      author: { ...ref("User"), required: true },
      rating: { type: Number, min: 1, max: 5, required: true },
      recommendation: {
        type: String,
        enum: ["Proceed", "Hold", "Reject"],
        required: true,
      },
      notes: { type: String, required: true },
    },
    base,
  ),
);
