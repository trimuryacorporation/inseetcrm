import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["source", "qualification", "skill"],
      required: true,
    },
    name: { type: String, trim: true, required: true, maxLength: 80 },
    nameKey: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
schema.index({ kind: 1, nameKey: 1 }, { unique: true });
export const CandidateOption = mongoose.model("CandidateOption", schema);
