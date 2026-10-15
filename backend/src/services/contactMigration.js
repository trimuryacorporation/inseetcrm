import mongoose from "mongoose";
import { hasContacts, reserveContact } from "./contactIdentity.js";
import { contactFields, normalizeContact } from "../validators/contact.js";
const Migration =
  mongoose.models.ContactPolicyMigration ||
  mongoose.model(
    "ContactPolicyMigration",
    new mongoose.Schema(
      { _id: String, completedAt: Date, records: Number },
      { versionKey: false },
    ),
  );
export async function reconcileContactIdentities({ force = false } = {}) {
  if (!force && (await Migration.exists({ _id: "global-contact-v1" })))
    return { alreadyApplied: true };
  const Models = Object.values(mongoose.models).filter(hasContacts),
    prepared = [],
    seen = new Map();
  for (const Model of Models) {
    const projection = { _id: 1 };
    for (const field of contactFields)
      if (Model.schema.path(field)) projection[field] = 1;
    for await (const record of Model.collection.find({}, { projection })) {
      const values = {};
      for (const field of contactFields) {
        if (!Model.schema.path(field)) continue;
        const value = normalizeContact(field, record[field]);
        values[field] = value;
        if (!value) continue;
        const key = field + ":" + value,
          owner = Model.collection.name + ":" + record._id;
        if (seen.has(key) && seen.get(key) !== owner)
          throw new Error(
            "Existing duplicate " +
              field +
              " prevents identity migration. No records were changed. Resolve the conflicting records in MongoDB before retrying.",
          );
        seen.set(key, owner);
      }
      prepared.push({ Model, record, values });
    }
  }
  await mongoose.connection.transaction(async (session) => {
    for (const { Model, record, values } of prepared) {
      const set = {},
        unset = {};
      for (const [field, value] of Object.entries(values)) {
        if (value === undefined) {
          if (record[field] !== undefined) unset[field] = 1;
        } else {
          set[field] = value;
          await reserveContact(Model, record._id, field, value, session);
        }
      }
      const update = {};
      if (Object.keys(set).length) update.$set = set;
      if (Object.keys(unset).length) update.$unset = unset;
      if (Object.keys(update).length)
        await Model.collection.updateOne({ _id: record._id }, update, {
          session,
        });
    }
    await Migration.updateOne(
      { _id: "global-contact-v1" },
      { $set: { completedAt: new Date(), records: prepared.length } },
      { upsert: true, session },
    );
  });
  return {
    alreadyApplied: false,
    records: prepared.length,
    identities: seen.size,
  };
}
export async function ensureContactIndexes() {
  for (const Model of Object.values(mongoose.models))
    await Model.createIndexes();
  const candidate = mongoose.models.Candidate;
  if (candidate) {
    const indexes = await candidate.collection.indexes();
    for (const name of ["phone_1", "email_1"]) {
      const old = indexes.find((index) => index.name === name);
      if (old?.partialFilterExpression?.deletedAt === null)
        await candidate.collection.dropIndex(name);
    }
  }
}
