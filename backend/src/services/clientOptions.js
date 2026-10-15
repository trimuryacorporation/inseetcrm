import mongoose from "mongoose";
import { State, City } from "country-state-city";
import { ClientOption } from "../models/clientOption.js";
import { Client } from "../models/index.js";
import { fail } from "../utils/security.js";
import { validateGstin } from "../validators/gstin.js";
export const optionKey = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
export const defaultPaymentModels = [
  {
    name: "Model 1 – Monthly Salary-Based",
    feeType: "percentage",
    basis: "monthlySalary",
  },
  {
    name: "Model 2 – Annual CTC-Based",
    feeType: "percentage",
    basis: "annualCTC",
  },
  {
    name: "Model 3 – Fixed Fee Per Joining",
    feeType: "fixed",
    basis: "joining",
  },
];
let pending, seedDatabase;
const defaultIndustries = [
  "Technology",
  "IT & ITES",
  "Banking & Financial Services",
  "Manufacturing",
  "Healthcare",
  "Retail & E-commerce",
  "Logistics & Supply Chain",
  "Hospitality",
  "Construction & Real Estate",
  "Education",
  "Telecommunications",
  "Automotive",
  "Recruitment & Staffing",
  "Other",
];
export async function ensureClientOptions() {
  if (seedDatabase !== mongoose.connection.db) {
    pending = null;
    seedDatabase = mongoose.connection.db;
  }
  if (pending) return pending;
  pending = (async () => {
    const marks = mongoose.connection.collection("systemseeds");
    if (await marks.findOne({ _id: "client-options-india-v1" })) return;
    await ClientOption.init();
    const records = [];
    const add = (kind, name, extra = {}) =>
      records.push({
        kind,
        name: name.trim(),
        nameKey: optionKey(name),
        parentKey: "",
        system: true,
        ...extra,
      });
    for (const name of defaultIndustries) add("industry", name);
    for (const model of defaultPaymentModels)
      add("paymentModel", model.name, model);
    for (const state of State.getStatesOfCountry("IN")) {
      add("state", state.name, { code: state.isoCode });
      for (const city of City.getCitiesOfState("IN", state.isoCode))
        add("city", city.name, { parentKey: optionKey(state.name) });
    }
    for await (const legacy of Client.collection.find(
      {},
      { projection: { industry: 1, state: 1, city: 1, paymentTerms: 1 } },
    )) {
      if (legacy.industry) add("industry", legacy.industry, { system: false });
      if (legacy.state) {
        add("state", legacy.state, { system: false });
        if (legacy.city)
          add("city", legacy.city, {
            parentKey: optionKey(legacy.state),
            system: false,
          });
      }
      if (legacy.paymentTerms)
        add("paymentModel", legacy.paymentTerms, {
          feeType: "percentage",
          basis: "custom",
          system: false,
        });
    }
    const recordMap = new Map();
    for (const record of records) {
      const key = record.kind + "|" + record.parentKey + "|" + record.nameKey;
      if (!recordMap.has(key)) recordMap.set(key, record);
    }
    const unique = [...recordMap.values()];
    for (let i = 0; i < unique.length; i += 500) {
      try {
        await ClientOption.bulkWrite(
          unique.slice(i, i + 500).map((record) => ({
            updateOne: {
              filter: {
                kind: record.kind,
                parentKey: record.parentKey,
                nameKey: record.nameKey,
              },
              update: { $setOnInsert: record },
              upsert: true,
            },
          })),
          { ordered: false },
        );
      } catch (e) {
        if (
          !e.writeErrors?.length ||
          !e.writeErrors.every((error) => error.code === 11000)
        )
          throw e;
      }
    }
    await marks.updateOne(
      { _id: "client-options-india-v1" },
      { $set: { completedAt: new Date(), records: unique.length } },
      { upsert: true },
    );
  })().catch((e) => {
    pending = null;
    throw e;
  });
  return pending;
}
export async function findClientOption(kind, name, parent = "") {
  return ClientOption.findOne({
    kind,
    nameKey: optionKey(name),
    parentKey: optionKey(parent),
  });
}
export async function validateClientSelections(data, current = {}) {
  await ensureClientOptions();
  const combined = {
      ...(current.toObject ? current.toObject() : current),
      ...data,
    },
    result = { ...data };
  for (const [field, kind] of [
    ["industry", "industry"],
    ["state", "state"],
    ["paymentTerms", "paymentModel"],
  ]) {
    if (!combined[field]) continue;
    const option = await findClientOption(kind, combined[field]);
    if (!option)
      throw fail(
        400,
        "Select a saved " +
          (field === "paymentTerms" ? "payment model" : field) +
          " or add it first.",
      );
    combined[field] = option.name;
    if (Object.hasOwn(data, field)) result[field] = option.name;
    if (field === "paymentTerms") combined.paymentModel = option;
  }
  if (combined.city) {
    if (!combined.state)
      throw fail(400, "Select a state before selecting a city.");
    const city = await findClientOption("city", combined.city, combined.state);
    if (!city)
      throw fail(
        400,
        "The selected city does not belong to the selected state.",
      );
    if (Object.hasOwn(data, "city")) result.city = city.name;
  }
  if (Object.hasOwn(data, "gstin") && data.gstin) {
    const check = validateGstin(data.gstin);
    if (!check.valid) throw fail(400, check.message);
    result.gstin = check.gstin;
  }
  if (combined.paymentModel) {
    const fixed = combined.paymentModel.feeType === "fixed";
    result.feeType = fixed ? "fixed" : "percentage";
    if (fixed) {
      if (combined.fixedFeePaise == null)
        throw fail(400, "Enter the fixed fee per joining.");
      result.fixedFeePaise = combined.fixedFeePaise;
      result.placementFee = null;
    } else {
      result.fixedFeePaise = null;
    }
  }
  if (
    !combined.paymentModel &&
    Object.hasOwn(data, "paymentTerms") &&
    !data.paymentTerms
  ) {
    result.feeType = "percentage";
    result.fixedFeePaise = null;
  }
  return result;
}
