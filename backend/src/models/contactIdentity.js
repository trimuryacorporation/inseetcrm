import mongoose from "mongoose";
export const ContactIdentity = mongoose.model(
  "ContactIdentity",
  new mongoose.Schema(
    {
      _id: { type: String, required: true },
      ownerCollection: { type: String, required: true },
      ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    },
    { timestamps: true },
  ),
);
