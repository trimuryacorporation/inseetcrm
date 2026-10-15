import mongoose from "mongoose";
export const Bootstrap = mongoose.model(
  "Bootstrap",
  new mongoose.Schema(
    { _id: { type: String }, completedAt: Date },
    { versionKey: false },
  ),
);
