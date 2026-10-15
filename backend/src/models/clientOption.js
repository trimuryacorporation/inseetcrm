import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["industry", "paymentModel", "state", "city"],
      required: true,
    },
    name: { type: String, required: true, trim: true, maxLength: 120 },
    nameKey: { type: String, required: true },
    parentKey: { type: String, default: "" },
    code: String,
    feeType: { type: String, enum: ["percentage", "fixed"] },
    basis: {
      type: String,
      enum: ["monthlySalary", "annualCTC", "joining", "custom"],
    },
    system: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
schema.index({ kind: 1, parentKey: 1, nameKey: 1 }, { unique: true });
export const ClientOption = mongoose.model("ClientOption", schema);
