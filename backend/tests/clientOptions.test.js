import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/client-options-test";
process.env.JWT_ACCESS_SECRET =
  "client-options-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SETUP_KEY = "client-options-setup-key-for-test-only";
let mongo, app, headers, models, User, access;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  ({ User } = await import("../src/models/index.js"));
  ({ access } = await import("../src/utils/security.js"));
  models = (await import("../src/models/clientOption.js")).ClientOption;
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
  const admin = await User.create({
    name: "Options Admin",
    email: "options-admin@example.test",
    role: "Admin",
  });
  headers = { Authorization: "Bearer " + access(admin) };
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("client masters, dependent cities, payment models and GSTIN validation", async (t) => {
  let monthly, annual, fixed;
  await t.test(
    "lists seed all India states and the three requested payment models",
    async () => {
      assert.equal((await request(app).get("/api/client-options")).status, 401);
      const response = await request(app)
        .get("/api/client-options")
        .set(headers);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.states.length, 36);
      assert.equal(response.body.paymentModels.length, 3);
      [monthly, annual, fixed] = response.body.paymentModels;
      assert.match(monthly.name, /Monthly Salary/);
      assert.match(annual.name, /Annual CTC/);
      assert.equal(fixed.feeType, "fixed");
      const cities = await request(app)
        .get("/api/client-options/cities?state=Maharashtra")
        .set(headers);
      assert.equal(cities.status, 200);
      assert.ok(cities.body.items.some((c) => c.name === "Pune"));
      assert.ok(cities.body.total > 100);
    },
  );
  await t.test(
    "industries and custom payment models persist and reject case duplicates",
    async () => {
      const industry = await request(app)
        .post("/api/client-options")
        .set(headers)
        .send({ kind: "industry", name: "Renewable Energy" });
      assert.equal(industry.status, 201, JSON.stringify(industry.body));
      assert.equal(
        (
          await request(app)
            .post("/api/client-options")
            .set(headers)
            .send({ kind: "industry", name: "renewable energy" })
        ).status,
        409,
      );
      const payment = await request(app)
        .post("/api/client-options")
        .set(headers)
        .send({
          kind: "paymentModel",
          name: "Custom Flat Joining Fee",
          feeType: "fixed",
        });
      assert.equal(payment.status, 201);
      assert.equal(payment.body.basis, "custom");
      const lists = await request(app).get("/api/client-options").set(headers);
      assert.ok(
        lists.body.industries.some((i) => i.name === "Renewable Energy"),
      );
      assert.ok(
        lists.body.paymentModels.some(
          (m) => m.name === "Custom Flat Joining Fee",
        ),
      );
    },
  );
  await t.test("custom cities are scoped to their selected state", async () => {
    assert.equal(
      (
        await request(app)
          .post("/api/client-options")
          .set(headers)
          .send({ kind: "state", name: "Custom Region" })
      ).status,
      201,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/client-options")
          .set(headers)
          .send({ kind: "city", name: "Custom City", state: "Custom Region" })
      ).status,
      201,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/client-options")
          .set(headers)
          .send({ kind: "city", name: "custom city", state: "custom region" })
      ).status,
      409,
    );
    const cities = await request(app)
      .get("/api/client-options/cities")
      .query({ state: "Custom Region" })
      .set(headers);
    assert.deepEqual(
      cities.body.items.map((c) => c.name),
      ["Custom City"],
    );
    assert.equal(
      (
        await request(app)
          .post("/api/client-options")
          .set(headers)
          .send({ kind: "city", name: "No State" })
      ).status,
      400,
    );
  });
  await t.test(
    "GSTIN format and checksum never claim official registration verification",
    async () => {
      const valid = await request(app)
        .post("/api/client-options/gstin/validate")
        .set(headers)
        .send({ gstin: "27aapfu0939f1zv" });
      assert.equal(valid.status, 200);
      assert.equal(valid.body.valid, true);
      assert.equal(valid.body.registrationVerified, false);
      assert.equal(valid.body.gstin, "27AAPFU0939F1ZV");
      const invalid = await request(app)
        .post("/api/client-options/gstin/validate")
        .set(headers)
        .send({ gstin: "27AAPFU0939F1ZA" });
      assert.equal(invalid.body.valid, false);
      assert.equal(invalid.body.checks.format, true);
      assert.equal(invalid.body.checks.checksum, false);
      assert.equal(
        (
          await request(app)
            .post("/api/clients")
            .set(headers)
            .send({ companyName: "Invalid GSTIN", gstin: "27AAPFU0939F1ZA" })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "client save validates state/city relationship and persists the chosen options",
    async () => {
      assert.equal(
        (
          await request(app).post("/api/clients").set(headers).send({
            companyName: "Wrong city",
            state: "Maharashtra",
            city: "Kolkata",
          })
        ).status,
        400,
      );
      const response = await request(app)
        .post("/api/clients")
        .set(headers)
        .send({
          companyName: "Stateful Client",
          state: "Custom Region",
          city: "Custom City",
          industry: "Renewable Energy",
          paymentTerms: annual.name,
          placementFee: 8.33,
          gstin: "27AAPFU0939F1ZV",
        });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      assert.equal(response.body.city, "Custom City");
      assert.equal(response.body.feeType, "percentage");
      assert.equal(response.body.placementFee, 8.33);
      assert.equal(
        (
          await request(app)
            .patch("/api/clients/" + response.body._id)
            .set(headers)
            .send({ state: "Maharashtra" })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "fixed joining fees use integer paise and server-owned model fee type",
    async () => {
      const created = await request(app)
        .post("/api/clients")
        .set(headers)
        .send({
          companyName: "Fixed Fee Client",
          paymentTerms: fixed.name,
          feeType: "percentage",
          fixedFeePaise: 500050,
        });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.feeType, "fixed");
      assert.equal(created.body.fixedFeePaise, 500050);
      assert.equal(created.body.placementFee, null);
      assert.equal(
        (
          await request(app).post("/api/clients").set(headers).send({
            companyName: "Missing Fixed Fee",
            paymentTerms: fixed.name,
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app).post("/api/clients").set(headers).send({
            companyName: "Fractional paise",
            paymentTerms: fixed.name,
            fixedFeePaise: 123.45,
          })
        ).status,
        400,
      );
      const switched = await request(app)
        .patch("/api/clients/" + created.body._id)
        .set(headers)
        .send({ paymentTerms: monthly.name, placementFee: 50 });
      assert.equal(switched.status, 200);
      assert.equal(switched.body.feeType, "percentage");
      assert.equal(switched.body.fixedFeePaise, null);
    },
  );
  await t.test(
    "recruiters can read choices but cannot create master data",
    async () => {
      const recruiter = await User.create({
        name: "Recruiter",
        email: "options-recruiter@example.test",
        role: "Recruiter",
      });
      const auth = { Authorization: "Bearer " + access(recruiter) };
      assert.equal(
        (await request(app).get("/api/client-options").set(auth)).status,
        200,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/client-options")
            .set(auth)
            .send({ kind: "industry", name: "Forbidden" })
        ).status,
        403,
      );
    },
  );
});

test("shared GST validation, vendor percentage and city search", async () => {
  const { percentToBasisPoints } =
    await import("../../frontend/src/utils/percentage.js");
  assert.equal(percentToBasisPoints("2.50"), 250);
  assert.equal(percentToBasisPoints("0.29"), 29);
  assert.equal(percentToBasisPoints("100"), 10000);
  for (const invalid of ["-1", "100.01", "2.555", "1e2", "abc"])
    assert.throws(() => percentToBasisPoints(invalid));
  assert.equal(
    (
      await request(app)
        .post("/api/validation/gstin")
        .send({ gstin: "27AAPFU0939F1ZV" })
    ).status,
    401,
  );
  const gst = await request(app)
    .post("/api/validation/gstin")
    .set(headers)
    .send({ gstin: "27AAPFU0939F1ZV" });
  assert.equal(gst.status, 200);
  assert.equal(gst.body.valid, true);
  assert.equal(gst.body.registrationVerified, false);
  const city = await request(app)
    .get("/api/validation/locations?q=Pune")
    .set(headers);
  assert.equal(city.status, 200);
  assert.ok(city.body.items.some((i) => i.name.startsWith("Pune,")));
  const body = {
    companyName: "Percentage Agency",
    contactPerson: "Vendor Contact",
    email: "vendor-percent@example.test",
    city: "Pune",
    gstin: "27aapfu0939f1zv",
    commissionBasisPoints: percentToBasisPoints("2.50"),
    status: "Active",
  };
  assert.equal(
    (
      await request(app)
        .post("/api/vendors")
        .set(headers)
        .send({ ...body, gstin: "INVALID" })
    ).status,
    400,
  );
  const created = await request(app)
    .post("/api/vendors")
    .set(headers)
    .send(body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.gstin, "27AAPFU0939F1ZV");
  assert.equal(created.body.commissionBasisPoints, 250);
  for (const invalid of [10001, -1, 2.5])
    assert.equal(
      (
        await request(app)
          .patch("/api/vendors/" + created.body._id)
          .set(headers)
          .send({ commissionBasisPoints: invalid })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(app)
        .patch("/api/vendors/" + created.body._id)
        .set(headers)
        .send({ gstin: "27AAPFU0939F1ZA" })
    ).status,
    400,
  );
  const edited = await request(app)
    .patch("/api/vendors/" + created.body._id)
    .set(headers)
    .send({ commissionBasisPoints: percentToBasisPoints("3.25"), gstin: "" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.commissionBasisPoints, 325);
  assert.equal(edited.body.gstin, "");
  const exported = await request(app)
    .get("/api/data/vendors/export?format=csv")
    .set(headers);
  assert.equal(exported.status, 200);
  assert.match(exported.text, /commissionPercent/);
  assert.match(exported.text, /3.25/);
  const invoice = {
    companyName: "GST Client",
    description: "Recruitment fee",
    subtotalPaise: 10000,
    gstBasisPoints: 1800,
    dueAt: "2026-12-31",
    gstin: "INVALID",
  };
  assert.equal(
    (await request(app).post("/api/invoices").set(headers).send(invoice))
      .status,
    400,
  );
  const financeUser = await User.create({
    name: "Finance GST",
    email: "finance-gst@example.test",
    role: "Finance Manager",
  });
  const financeHeaders = { Authorization: "Bearer " + access(financeUser) };
  assert.equal(
    (
      await request(app)
        .post("/api/validation/gstin")
        .set(financeHeaders)
        .send({ gstin: body.gstin })
    ).status,
    200,
  );
});

test("shared departments persist, validate team selections and protect assignments", async () => {
  const user = await User.findOne({ email: "options-admin@example.test" });
  assert.equal((await request(app).get("/api/departments")).status, 401);
  const created = await request(app)
    .post("/api/departments")
    .set(headers)
    .send({
      name: "  Talent   Operations ",
      description: "Recruitment department",
    });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.name, "Talent Operations");
  assert.equal(
    (
      await request(app)
        .post("/api/departments")
        .set(headers)
        .send({ name: "talent operations" })
    ).status,
    409,
  );
  const manager = await User.create({
    name: "Department HR",
    email: "department-hr@example.test",
    role: "HR Manager",
  });
  const managerHeaders = { Authorization: "Bearer " + access(manager) };
  const list = await request(app)
    .get("/api/departments?q=Talent")
    .set(managerHeaders);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((i) => i._id === created.body._id));
  assert.equal(
    (
      await request(app)
        .patch("/api/departments/" + created.body._id)
        .set(managerHeaders)
        .send({ description: "Updated shared department" })
    ).status,
    200,
  );
  const recruiter = await User.create({
    name: "Department Recruiter",
    email: "department-recruiter@example.test",
    role: "Recruiter",
  });
  const recruiterHeaders = { Authorization: "Bearer " + access(recruiter) };
  assert.equal(
    (await request(app).get("/api/departments").set(recruiterHeaders)).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/departments")
        .set(recruiterHeaders)
        .send({ name: "Blocked Department" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/teams")
        .set(headers)
        .send({ name: "Invalid Team", department: "Missing Department" })
    ).status,
    400,
  );
  const team = await request(app)
    .post("/api/teams")
    .set(headers)
    .send({ name: "Recruitment Team", department: "talent operations" });
  assert.equal(team.status, 201, JSON.stringify(team.body));
  assert.equal(team.body.department, "Talent Operations");
  assert.equal(
    (
      await request(app)
        .delete("/api/departments/" + created.body._id)
        .set(headers)
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/departments/" + created.body._id)
        .set(headers)
        .send({ name: "Renamed Department" })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .delete("/api/teams/" + team.body._id)
        .set(headers)
    ).status,
    204,
  );
  const client = await mongoose.models.Client.create({
    companyName: "Department Test Client",
    owner: user._id,
  });
  const job = await mongoose.models.Job.create({
    title: "Department Test Job",
    client: client._id,
    owner: user._id,
    department: "Talent Operations",
  });
  assert.equal(
    (
      await request(app)
        .delete("/api/departments/" + created.body._id)
        .set(headers)
    ).status,
    409,
  );
  const invalidJob = await request(app)
    .patch("/api/jobs/" + job._id)
    .set(headers)
    .send({ department: "Missing Department" });
  assert.equal(invalidJob.status, 400);
  await mongoose.models.Job.updateOne(
    { _id: job._id },
    { $set: { deletedAt: new Date() } },
  );
  assert.equal(
    (
      await request(app)
        .delete("/api/departments/" + created.body._id)
        .set(managerHeaders)
    ).status,
    204,
  );
  const remaining = await request(app)
    .get("/api/departments?q=Talent")
    .set(headers);
  assert.ok(!remaining.body.items.some((i) => i._id === created.body._id));
  assert.equal(
    (
      await request(app)
        .post("/api/teams")
        .set(headers)
        .send({ name: "Archived Team", department: "Talent Operations" })
    ).status,
    400,
  );
});
