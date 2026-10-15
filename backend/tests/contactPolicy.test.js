import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { User, Client } from "../src/models/index.js";
import { Candidate } from "../src/models/recruitment.js";
import { Models } from "../src/models/operations.js";
import {
  identityCreate,
  identityUpdate,
} from "../src/services/contactIdentity.js";
import { normalizePhone } from "../src/validators/contact.js";
import { reconcileContactIdentities } from "../src/services/contactMigration.js";
test("global contact uniqueness, archival retention and physical-delete reuse", async (t) => {
  let mongo;
  try {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all(
      Object.values(mongoose.models).map((model) => model.init()),
    );
    const owner = new mongoose.Types.ObjectId();
    let client;
    await t.test(
      "email and Indian phone formats normalize consistently",
      async () => {
        assert.equal(normalizePhone("98765 43210"), "+919876543210");
        assert.equal(normalizePhone("09876543210"), "+919876543210");
        assert.equal(normalizePhone("+91 (98765) 43210"), "+919876543210");
        client = await identityCreate(Client, {
          companyName: "Original",
          email: " CONTACT@Example.test ",
          phone: "98765 43210",
          owner,
        });
        assert.equal(client.email, "contact@example.test");
        assert.equal(client.phone, "+919876543210");
      },
    );
    await t.test(
      "duplicate email OR phone is blocked within and across modules",
      async () => {
        await assert.rejects(
          identityCreate(Client, {
            companyName: "Duplicate",
            email: "CONTACT@example.test",
            owner,
          }),
          (e) => e.status === 409,
        );
        await assert.rejects(
          identityCreate(Candidate, {
            fullName: "Duplicate email",
            email: "contact@example.test",
            phone: "9876543001",
            consent: true,
            owner,
          }),
          (e) => e.status === 409,
        );
        await assert.rejects(
          identityCreate(Models.vendors, {
            companyName: "Duplicate phone",
            contactPerson: "Person",
            email: "different@example.test",
            phone: "+91 98765 43210",
            status: "Active",
            owner,
          }),
          (e) => e.status === 409,
        );
      },
    );
    await t.test("archiving keeps email and phone reserved", async () => {
      await Client.updateOne(
        { _id: client._id },
        { $set: { deletedAt: new Date() } },
      );
      await assert.rejects(
        identityCreate(Client, {
          companyName: "Archived duplicate",
          phone: "09876543210",
          owner,
        }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        identityCreate(User, {
          name: "Duplicate User",
          email: "contact@example.test",
          role: "Recruiter",
        }),
        (e) => e.status === 409,
      );
    });
    await t.test(
      "unchanged self-edit is allowed and conflicting edits roll back",
      async () => {
        const other = await identityCreate(Client, {
          companyName: "Other",
          email: "other@example.test",
          phone: "9876543002",
          owner,
        });
        await identityUpdate(
          Client,
          { _id: client._id },
          { $set: { email: "CONTACT@EXAMPLE.TEST", companyName: "Renamed" } },
          { returnDocument: "after", runValidators: true },
        );
        assert.equal(
          (await Client.findById(client._id)).companyName,
          "Renamed",
        );
        await assert.rejects(
          identityUpdate(
            Client,
            { _id: other._id },
            { $set: { phone: "9876543210" } },
            { returnDocument: "after" },
          ),
          (e) => e.status === 409,
        );
        assert.equal((await Client.findById(other._id)).phone, "+919876543002");
      },
    );
    await t.test("empty optional contacts do not collide", async () => {
      await identityCreate(Client, {
        companyName: "No contact one",
        email: "",
        phone: "",
        owner,
      });
      await identityCreate(Client, { companyName: "No contact two", owner });
    });
    await t.test(
      "parallel requests cannot register the same contact twice",
      async () => {
        const create = (i) =>
          identityCreate(Client, {
            companyName: "Concurrent " + i,
            email: "race@example.test",
            phone: "9876543003",
            owner,
          });
        const results = await Promise.allSettled([create(1), create(2)]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(
          await Client.countDocuments({ email: "race@example.test" }),
          1,
        );
      },
    );
    await t.test("failed validation does not leave a reservation", async () => {
      await assert.rejects(
        identityCreate(Client, { email: "rollback@example.test", owner }),
      );
      await identityCreate(Client, {
        companyName: "Valid retry",
        email: "rollback@example.test",
        owner,
      });
    });
    await t.test(
      "only physical MongoDB deletion releases archived contacts",
      async () => {
        await Client.collection.deleteOne({ _id: client._id });
        const reused = await identityCreate(Candidate, {
          fullName: "Reused after physical deletion",
          email: "contact@example.test",
          phone: "9876543210",
          consent: true,
          owner,
        });
        assert.equal(reused.email, "contact@example.test");
      },
    );
    await t.test(
      "backfill normalizes and reserves legacy records without deleting them",
      async () => {
        const id = new mongoose.Types.ObjectId();
        await Client.collection.insertOne({
          _id: id,
          companyName: "Legacy",
          email: "LEGACY@EXAMPLE.TEST",
          phone: "9876543004",
          owner,
        });
        await reconcileContactIdentities({ force: true });
        assert.equal((await Client.findById(id)).phone, "+919876543004");
        await assert.rejects(
          identityCreate(Candidate, {
            fullName: "Legacy duplicate",
            email: "legacy@example.test",
            phone: "9876543005",
            consent: true,
            owner,
          }),
          (e) => e.status === 409,
        );
      },
    );
  } finally {
    await mongoose.disconnect();
    await mongo?.stop();
  }
});
