import { test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { seedPrivilegedUsers } from "../src/services/seed.js";
import { User, AuditLog, roles } from "../src/models/index.js";
import { Role } from "../src/models/supporting.js";
import { Bootstrap } from "../src/models/bootstrap.js";
test("privileged seeding is hashed, transactional and safe to repeat", async () => {
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
    const accounts = [
      {
        name: "Super Admin",
        email: "superadmin@example.test",
        role: "Super Admin",
        password: "OnlyForSeedTests123!",
      },
      {
        name: "Admin",
        email: "admin@example.test",
        role: "Admin",
        password: "OnlyForAdminTests456!",
      },
    ];
    const first = await seedPrivilegedUsers(accounts);
    assert.ok(first.every((r) => r.status === "created"));
    const original = await User.findOne({ email: accounts[0].email }).select(
      "+password",
    );
    assert.ok(await bcrypt.compare(accounts[0].password, original.password));
    assert.notEqual(original.password, accounts[0].password);
    assert.equal(await Role.countDocuments(), roles.length);
    assert.equal(await Bootstrap.countDocuments(), 1);
    const second = await seedPrivilegedUsers(
      accounts.map((a) => ({ ...a, password: "ChangedInputMustNotReset123!" })),
    );
    assert.ok(second.every((r) => r.status === "unchanged"));
    assert.equal(
      (await User.findById(original._id).select("+password")).password,
      original.password,
    );
    assert.equal(await User.countDocuments(), 2);
    assert.equal(await AuditLog.countDocuments({ action: "users.seeded" }), 2);
    await assert.rejects(
      seedPrivilegedUsers([
        { ...accounts[0], role: "Admin" },
        { ...accounts[1], role: "Super Admin" },
      ]),
      /will not overwrite/,
    );
    assert.equal((await User.findById(original._id)).role, "Super Admin");
  } finally {
    await mongoose.disconnect();
    await mongo?.stop();
  }
});
