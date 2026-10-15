import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcrypt";
import { MongoMemoryReplSet } from "mongodb-memory-server";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/employees-test";
process.env.JWT_ACCESS_SECRET = "employees-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SETUP_KEY = "employees-test-setup-key-only";
let mongo, app, User, Models, headers, admin, access, created, login;
const password = "TeamPassword123!";
const body = (suffix = "one") => ({
  name: "Employee " + suffix,
  email: "employee-" + suffix + "@example.test",
  loginId: "employee." + suffix,
  password,
  department: "Recruitment",
  role: "Recruiter",
  phone: suffix === "one" ? "9876012351" : undefined,
});
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  ({ User } = await import("../src/models/index.js"));
  ({ Models } = await import("../src/models/operations.js"));
  ({ access } = await import("../src/utils/security.js"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  admin = await User.create({
    name: "Employee Super Admin",
    email: "employee-super@example.test",
    role: "Super Admin",
  });
  headers = { Authorization: "Bearer " + access(admin) };
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("employee creation, sign-in and department-based role assignment", async (t) => {
  await t.test(
    "shared defaults and role choices are available and protected",
    async () => {
      assert.equal((await request(app).get("/api/employees")).status, 401);
      const options = await request(app)
        .get("/api/employees/options")
        .set(headers);
      assert.equal(options.status, 200);
      assert.ok(
        options.body.roles.some(
          (r) => r.label === "Manager" && r.value === "Team Leader",
        ),
      );
      const depts = await request(app).get("/api/departments").set(headers);
      for (const name of [
        "HR",
        "Recruitment",
        "BDE",
        "Management",
        "Sales",
        "Finance",
      ])
        assert.ok(depts.body.items.some((d) => d.name === name));
    },
  );
  await t.test(
    "creates real credentials with bcrypt, without exposing secrets",
    async () => {
      const response = await request(app)
        .post("/api/employees")
        .set(headers)
        .send(body());
      assert.equal(response.status, 201, JSON.stringify(response.body));
      created = response.body;
      assert.equal(created.loginId, "employee.one");
      assert.equal(created.department, "Recruitment");
      assert.equal(created.password, undefined);
      const stored = await User.findById(created._id).select("+password");
      assert.ok(await bcrypt.compare(password, stored.password));
      assert.notEqual(stored.password, password);
      const list = await request(app)
        .get("/api/employees?q=employee.one")
        .set(headers);
      assert.equal(list.body.items[0]._id, created._id);
      assert.equal(list.body.items[0].password, undefined);
    },
  );
  await t.test(
    "login ID and email both sign in and role restrictions apply",
    async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "EMPLOYEE.ONE", password });
      assert.equal(response.status, 200);
      login = response;
      assert.equal(response.body.user.department, "Recruitment");
      const recruiterHeaders = {
        Authorization: "Bearer " + response.body.accessToken,
      };
      assert.equal(
        (await request(app).get("/api/candidates").set(recruiterHeaders))
          .status,
        200,
      );
      assert.equal(
        (await request(app).get("/api/leads").set(recruiterHeaders)).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(recruiterHeaders)
            .send(body("forbidden"))
        ).status,
        403,
      );
      const email = await request(app)
        .post("/api/auth/login")
        .send({ email: body().email, password });
      assert.equal(email.status, 200);
      assert.equal(email.body.user.password, undefined);
    },
  );
  await t.test(
    "duplicates, invalid departments, weak passwords and mismatched teams fail",
    async () => {
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("duplicate"), loginId: "EMPLOYEE.ONE" })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("duplicate"), email: body().email })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("duplicate"), phone: "9876012351" })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("bad"), department: "Unknown" })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("bad"), password: "weak" })
        ).status,
        400,
      );
      const team = await Models.teams.create({
        name: "Sales Group",
        department: "Sales",
        owner: admin._id,
      });
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("badteam"), team: String(team._id) })
        ).status,
        400,
      );
      const teamResponse = await request(app)
        .post("/api/employees")
        .set(headers)
        .send({
          ...body("sales"),
          department: "Sales",
          role: "Sales Manager",
          team: String(team._id),
        });
      assert.equal(teamResponse.status, 201);
      assert.equal(
        (
          await request(app)
            .delete("/api/teams/" + team._id)
            .set(headers)
        ).status,
        409,
      );
    },
  );
  await t.test(
    "HR cannot promote admins; BDE can use sales but not recruitment",
    async () => {
      const hr = await User.create({
        name: "HR Accounts",
        email: "hr-employee@example.test",
        role: "HR Manager",
      });
      const hrHeaders = { Authorization: "Bearer " + access(hr) };
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(hrHeaders)
            .send({
              ...body("blockedadmin"),
              department: "Administration",
              role: "Admin",
            })
        ).status,
        403,
      );
      const bde = await request(app)
        .post("/api/employees")
        .set(hrHeaders)
        .send({ ...body("bde"), department: "BDE", role: "BDE" });
      assert.equal(bde.status, 201);
      const signIn = await request(app)
        .post("/api/auth/login")
        .send({ email: "employee.bde", password });
      const h = { Authorization: "Bearer " + signIn.body.accessToken };
      assert.equal((await request(app).get("/api/leads").set(h)).status, 200);
      assert.equal(
        (await request(app).get("/api/candidates").set(h)).status,
        403,
      );
      assert.equal(
        (
          await request(app)
            .patch("/api/employees/" + admin._id)
            .set(hrHeaders)
            .send({ active: false })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "deactivation revokes sessions and keeps IDs reserved; reactivation works",
    async () => {
      const changed = await request(app)
        .patch("/api/employees/" + created._id)
        .set(headers)
        .send({ active: false });
      assert.equal(changed.status, 200);
      assert.equal(
        (
          await request(app)
            .get("/api/candidates")
            .set({ Authorization: "Bearer " + login.body.accessToken })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "employee.one", password })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/employees")
            .set(headers)
            .send({ ...body("reuse"), loginId: "employee.one" })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .patch("/api/employees/" + created._id)
            .set(headers)
            .send({ active: true })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "employee.one", password })
        ).status,
        200,
      );
    },
  );
  await t.test(
    "password and role edits invalidate old sessions and preserve password on ordinary edits",
    async () => {
      const before = await request(app)
        .post("/api/auth/login")
        .send({ email: "employee.one", password });
      const edited = await request(app)
        .patch("/api/employees/" + created._id)
        .set(headers)
        .send({
          department: "BDE",
          role: "BDE",
          password: "UpdatedPassword456!",
        });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.password, undefined);
      assert.equal(
        (
          await request(app)
            .get("/api/candidates")
            .set({ Authorization: "Bearer " + before.body.accessToken })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "employee.one", password })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "employee.one", password: "UpdatedPassword456!" })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(app)
            .patch("/api/employees/" + created._id)
            .set(headers)
            .send({ name: "Updated Employee" })
        ).status,
        200,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/login")
            .send({ email: "employee.one", password: "UpdatedPassword456!" })
        ).status,
        200,
      );
      const depts = await request(app)
        .get("/api/departments?q=BDE")
        .set(headers);
      assert.equal(
        (
          await request(app)
            .delete(
              "/api/departments/" +
                depts.body.items.find((d) => d.name === "BDE")._id,
            )
            .set(headers)
        ).status,
        409,
      );
    },
  );
});
