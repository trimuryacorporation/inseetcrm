import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcrypt";
import { MongoMemoryReplSet } from "mongodb-memory-server";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/access-test";
process.env.JWT_ACCESS_SECRET =
  "permissions-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:5173";
let mongo,
  app,
  User,
  Models,
  AccessPolicy,
  mergePermissions,
  admin,
  staff,
  peer,
  outsider,
  headers,
  staffHeaders,
  access;
before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  ({ User } = await import("../src/models/index.js"));
  ({ Models } = await import("../src/models/operations.js"));
  ({ AccessPolicy, mergePermissions } =
    await import("../src/services/permissions.js"));
  ({ access } = await import("../src/utils/security.js"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  admin = await User.create({
    name: "Super",
    email: "super@access.test",
    role: "Super Admin",
  });
  staff = await User.create({
    name: "Recruiter",
    email: "recruiter@access.test",
    password: await bcrypt.hash("recruiterpassword", 4),
    role: "Recruiter",
    department: "Recruitment",
  });
  peer = await User.create({
    name: "Peer",
    email: "peer@access.test",
    role: "Recruiter",
    department: "Recruitment",
  });
  outsider = await User.create({
    name: "Sales",
    email: "sales@access.test",
    role: "BDE",
    department: "Sales",
  });
  headers = { Authorization: "Bearer " + access(admin) };
  staffHeaders = { Authorization: "Bearer " + access(staff) };
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const put = (type, id, rules) =>
  request(app)
    .put("/api/access-control/" + type + "/" + id)
    .set(headers)
    .send({ rules });
test("Super Admin controls department and individual permissions without expanding record scopes", async (t) => {
  await t.test("only Super Admin can inspect or change policies", async () => {
    assert.equal(
      (await request(app).get("/api/access-control/targets")).status,
      401,
    );
    assert.equal(
      (await request(app).get("/api/access-control/targets").set(staffHeaders))
        .status,
      403,
    );
    const result = await request(app)
      .get("/api/access-control/targets")
      .set(headers);
    assert.equal(result.status, 200);
    assert.ok(result.body.departments.some((d) => d.name === "Recruitment"));
    const regularAdmin = await User.create({
      name: "Admin",
      email: "admin@access.test",
      role: "Admin",
    });
    assert.equal(
      (
        await request(app)
          .get("/api/access-control/targets")
          .set("Authorization", "Bearer " + access(regularAdmin))
      ).status,
      403,
    );
  });
  await t.test(
    "department block affects existing tokens and peers, user override wins",
    async () => {
      const dept = await Models.departments.findOne({ name: "Recruitment" });
      assert.equal(
        (
          await put("department", dept._id, {
            candidates: { create: false, delete: false },
          })
        ).status,
        200,
      );
      const body = {
        fullName: "Permission Candidate",
        phone: "9876000111",
        consent: true,
      };
      assert.equal(
        (
          await request(app)
            .post("/api/candidates")
            .set(staffHeaders)
            .send(body)
        ).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/candidates")
            .set("Authorization", "Bearer " + access(peer))
            .send(body)
        ).status,
        403,
      );
      assert.equal(
        (await put("user", staff._id, { candidates: { create: true } })).status,
        200,
      );
      const created = await request(app)
        .post("/api/candidates")
        .set(staffHeaders)
        .send(body);
      assert.equal(created.status, 201);
      const id = created.body._id;
      assert.equal(
        (
          await request(app)
            .delete("/api/candidates/" + id)
            .set(staffHeaders)
        ).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .patch("/api/candidates/" + id)
            .set(staffHeaders)
            .send({ notes: "Allowed edit" })
        ).status,
        200,
      );
      const me = await request(app).get("/api/auth/me").set(staffHeaders);
      assert.equal(me.body.permissions.candidates.create, true);
      assert.equal(me.body.permissions.candidates.delete, false);
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: staff.email, password: "recruiterpassword" });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.permissions.candidates.delete, false);
    },
  );
  await t.test(
    "view denial also blocks writes, export and suggestions, even with explicit create grant",
    async () => {
      await put("user", staff._id, {
        candidates: { view: false, create: true },
      });
      for (const url of [
        "/api/candidates",
        "/api/data/candidates/export",
        "/api/candidate-options",
      ])
        assert.equal(
          (await request(app).get(url).set(staffHeaders)).status,
          403,
          url,
        );
      assert.equal(
        (await request(app).post("/api/candidates").set(staffHeaders).send({}))
          .status,
        403,
      );
      assert.equal(
        (await request(app).get("/api/candidates").set(headers)).status,
        200,
      );
    },
  );
  await t.test(
    "explicit grants work outside role defaults while owner queries remain intact",
    async () => {
      await put("user", outsider._id, {
        candidates: { view: true, create: true, edit: true },
      });
      const h = { Authorization: "Bearer " + access(outsider) };
      const list = await request(app).get("/api/candidates").set(h);
      assert.equal(list.status, 200);
      assert.equal(list.body.total, 0);
      const other = await (
        await import("../src/models/recruitment.js")
      ).Candidate.findOne({ owner: staff._id });
      assert.equal(
        (
          await request(app)
            .patch("/api/candidates/" + other._id)
            .set(h)
            .send({ notes: "Forbidden" })
        ).status,
        404,
      );
      assert.equal(
        (
          await request(app).post("/api/candidates").set(h).send({
            fullName: "Own candidate",
            phone: "9876000222",
            consent: true,
          })
        ).status,
        201,
      );
    },
  );
  await t.test(
    "strict validation, protected super account, portal isolation, audit and reset",
    async () => {
      assert.equal(
        (await put("user", staff._id, { candidates: { publish: true } }))
          .status,
        400,
      );
      assert.equal(
        (await put("user", staff._id, { unknown: { view: true } })).status,
        400,
      );
      assert.equal(
        (await put("user", admin._id, { candidates: { view: false } })).status,
        400,
      );
      const vendor = await User.create({
        name: "Vendor",
        email: "vendor@access.test",
        role: "Vendor",
      });
      assert.equal(
        (await put("user", vendor._id, { candidates: { view: true } })).status,
        400,
      );
      assert.equal(
        mergePermissions("Vendor", { candidates: { view: true } }, {})
          .candidates.view,
        false,
      );
      await put("user", staff._id, {});
      const me = await request(app).get("/api/auth/me").set(staffHeaders);
      assert.equal(me.body.permissions.candidates.view, true);
      assert.equal(me.body.permissions.candidates.create, false);
      const audit = await mongoose
        .model("AuditLog")
        .findOne({ action: "access.permissions.update" });
      assert.ok(audit.changes.after);
    },
  );
});

test("alternate endpoints enforce denied permissions and preserve privileged role gates", async () => {
  const regularAdmin = await User.findOne({ email: "admin@access.test" });
  const h = { Authorization: "Bearer " + access(regularAdmin) };
  assert.equal(
    (
      await put("user", regularAdmin._id, {
        employees: { view: false },
        jobs: { edit: false },
        teams: { view: false },
      })
    ).status,
    200,
  );
  for (const url of ["/api/users", "/api/employees", "/api/team-memberships"])
    assert.equal((await request(app).get(url).set(h)).status, 403, url);
  assert.equal(
    (await request(app).post("/api/auth/invitations").set(h).send({})).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/assignments/jobs/" + staff._id)
        .set(h)
        .send({})
    ).status,
    403,
  );
  await put("user", outsider._id, {
    employees: { view: true, edit: true, create: true },
  });
  const externalHeaders = { Authorization: "Bearer " + access(outsider) };
  assert.equal(
    (
      await request(app)
        .patch("/api/users/" + regularAdmin._id)
        .set(externalHeaders)
        .send({ role: "Admin", active: true })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/invitations")
        .set(externalHeaders)
        .send({})
    ).status,
    403,
  );
  await put("user", staff._id, {
    attendance: { view: true, create: false, edit: false },
    finance: { view: false },
    jobs: { view: false },
    candidates: { view: false },
  });
  assert.equal(
    (await request(app).post("/api/attendance/check-in").set(staffHeaders))
      .status,
    403,
  );
  assert.equal(
    (await request(app).post("/api/attendance/check-out").set(staffHeaders))
      .status,
    403,
  );
  assert.equal(
    (await request(app).get("/api/invoices").set(staffHeaders)).status,
    403,
  );
  const dashboard = await request(app).get("/api/dashboard").set(staffHeaders);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.totalCandidates, 0);
  assert.deepEqual(dashboard.body.recentJobs, []);
});

test("deactivation requires delete permission and approval retains HR role boundary", async () => {
  await put("user", admin._id, {});
  const regularAdmin = await User.findOne({ email: "admin@access.test" });
  await put("user", regularAdmin._id, {
    employees: { view: true, edit: true, delete: false },
  });
  const h = { Authorization: "Bearer " + access(regularAdmin) };
  assert.equal(
    (
      await request(app)
        .patch("/api/employees/" + peer._id)
        .set(h)
        .send({ active: false })
    ).status,
    403,
  );
  await put("user", regularAdmin._id, {
    employees: { view: true, edit: false, delete: true },
  });
  assert.equal(
    (
      await request(app)
        .patch("/api/employees/" + peer._id)
        .set(h)
        .send({ active: false })
    ).status,
    200,
  );
  await put("user", staff._id, { leaves: { view: true, edit: true } });
  const leave = await Models.leaves.create({
    owner: peer._id,
    type: "Casual",
    startDate: "2026-10-16",
    endDate: "2026-10-16",
    reason: "Leave",
  });
  assert.equal(
    (
      await request(app)
        .patch("/api/leaves/" + leave._id + "/approval")
        .set(staffHeaders)
        .send({ status: "Approved" })
    ).status,
    403,
  );
});
