import mongoose from "mongoose";
import { ContactIdentity } from "../models/contactIdentity.js";
import { contactFields, normalizeContact } from "../validators/contact.js";
const duplicate = (field) =>
  Object.assign(
    new Error(
      (field === "email" ? "Email address" : "Phone number") +
        " is already registered in the CRM. Archived records remain registered until permanently deleted from MongoDB.",
    ),
    { status: 409 },
  );
export const hasContacts = (Model) =>
  contactFields.some((field) => Model.schema.path(field));
export async function reserveContact(Model, recordId, field, value, session) {
  if (!value) return;
  const key = field + ":" + value;
  const existing = await ContactIdentity.findById(key).session(session);
  if (existing) {
    if (
      existing.ownerCollection === Model.collection.name &&
      String(existing.ownerId) === String(recordId)
    )
      return;
    const owner = await Model.db
      .collection(existing.ownerCollection)
      .findOne({ _id: existing.ownerId }, { session, projection: { _id: 1 } });
    if (owner) throw duplicate(field);
    await ContactIdentity.deleteOne(
      {
        _id: key,
        ownerId: existing.ownerId,
        ownerCollection: existing.ownerCollection,
      },
      { session },
    );
  }
  await ContactIdentity.create(
    [{ _id: key, ownerCollection: Model.collection.name, ownerId: recordId }],
    { session },
  );
}
async function transaction(Model, options, work) {
  try {
    return options?.session?.inTransaction()
      ? await work(options.session)
      : await Model.db.transaction(work);
  } catch (error) {
    if (error.code === 11000 && error.keyPattern?._id)
      throw Object.assign(
        new Error(
          "Email or phone is already registered in the CRM. Archived records cannot be reused until permanently deleted from MongoDB.",
        ),
        { status: 409 },
      );
    throw error;
  }
}
export async function identityCreate(Model, input, options = {}) {
  if (!hasContacts(Model)) {
    if (Array.isArray(input)) return Model.create(input, options);
    if (options.session) return (await Model.create([input], options))[0];
    return Model.create(input);
  }
  const isArray = Array.isArray(input),
    records = (isArray ? input : [input]).map((value) => ({
      ...value,
      _id: value._id || new mongoose.Types.ObjectId(),
    }));
  return transaction(Model, options, async (session) => {
    const result = [];
    for (const record of records) {
      for (const field of contactFields) {
        if (!Model.schema.path(field)) continue;
        const normalized = normalizeContact(field, record[field]);
        if (normalized === undefined) delete record[field];
        else record[field] = normalized;
        await reserveContact(Model, record._id, field, normalized, session);
      }
      const [created] = await Model.create([record], { ...options, session });
      result.push(created);
    }
    return isArray ? result : result[0];
  });
}
export async function identityUpdate(Model, filter, update, options = {}) {
  if (!hasContacts(Model))
    return Model.findOneAndUpdate(filter, update, options);
  const changes = update.$set || update;
  const touched = contactFields.filter(
    (field) =>
      Model.schema.path(field) &&
      (Object.hasOwn(changes, field) ||
        Object.hasOwn(update.$unset || {}, field)),
  );
  if (!touched.length) return Model.findOneAndUpdate(filter, update, options);
  return transaction(Model, options, async (session) => {
    const current = await Model.findOne(filter).session(session);
    if (!current) return null;
    const nextUpdate = {
      ...update,
      $set: { ...(update.$set || {}) },
      $unset: { ...(update.$unset || {}) },
    };
    if (!update.$set) {
      for (const [key, value] of Object.entries(update))
        if (!key.startsWith("$")) {
          nextUpdate.$set[key] = value;
          delete nextUpdate[key];
        }
    }
    for (const field of touched) {
      const value = Object.hasOwn(update.$unset || {}, field)
        ? undefined
        : normalizeContact(field, changes[field]);
      if (value === undefined) {
        delete nextUpdate.$set[field];
        nextUpdate.$unset[field] = 1;
      } else {
        nextUpdate.$set[field] = value;
        delete nextUpdate.$unset[field];
        await reserveContact(Model, current._id, field, value, session);
      }
    }
    if (!Object.keys(nextUpdate.$unset).length) delete nextUpdate.$unset;
    const result = await Model.findOneAndUpdate(filter, nextUpdate, {
      ...options,
      session,
    });
    for (const field of touched) {
      const old = normalizeContact(field, current[field]),
        next = nextUpdate.$set[field];
      if (old && old !== next)
        await ContactIdentity.deleteOne(
          {
            _id: field + ":" + old,
            ownerCollection: Model.collection.name,
            ownerId: current._id,
          },
          { session },
        );
    }
    return result;
  });
}
