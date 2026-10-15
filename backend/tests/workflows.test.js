import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/test";
process.env.JWT_ACCESS_SECRET =
  "test-secret-only-never-use-in-production-12345";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SETUP_KEY = "test-setup-only-key-1234567890";
let app, mongo, adminToken, adminCookie, clientId, jobId;
const origin = "http://localhost:5173";
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const auth = () => ({ Authorization: "Bearer " + adminToken });
test("INSEET integration workflows", async (t) => {
  await t.test("health and protected routes", async () => {
    assert.equal((await request(app).get("/api/health")).status, 200);
    assert.equal((await request(app).get("/api/clients")).status, 401);
  });
  await t.test("bootstrap, uniqueness, login, safe serialization", async () => {
    const data = {
      key: process.env.SETUP_KEY,
      name: "Workspace Admin",
      email: "admin@inseet.test",
      password: "SecurePassword123!",
    };
    const r = await request(app).post("/api/auth/setup").send(data);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    adminToken = r.body.accessToken;
    adminCookie = r.headers["set-cookie"][0].split(";")[0];
    assert.equal(r.body.user.role, "Super Admin");
    assert.equal(r.body.user.password, undefined);
    assert.equal(
      (await request(app).post("/api/auth/setup").send(data)).status,
      409,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/auth/login")
          .send({ email: data.email, password: "wrong" })
      ).status,
      401,
    );
  });
  await t.test("refresh rotation and CSRF origin checks", async () => {
    assert.equal(
      (await request(app).post("/api/auth/refresh").set("Cookie", adminCookie))
        .status,
      403,
    );
    const r = await request(app)
      .post("/api/auth/refresh")
      .set("Origin", origin)
      .set("Cookie", adminCookie);
    assert.equal(r.status, 200);
    assert.equal(
      (
        await request(app)
          .post("/api/auth/refresh")
          .set("Origin", origin)
          .set("Cookie", adminCookie)
      ).status,
      401,
    );
    adminCookie = r.headers["set-cookie"][0].split(";")[0];
    adminToken = r.body.accessToken;
    assert.equal(
      (await request(app).get("/api/auth/me").set(auth())).body.email,
      "admin@inseet.test",
    );
  });
  await t.test("validation and client CRUD", async () => {
    assert.equal(
      (
        await request(app)
          .post("/api/clients")
          .set(auth())
          .send({ companyName: "X", owner: "hack" })
      ).status,
      400,
    );
    const r = await request(app).post("/api/clients").set(auth()).send({
      companyName: "Acme [India]",
      city: "Pune",
      state: "Maharashtra",
      email: "hr@acme.test",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    clientId = r.body._id;
    const search = await request(app)
      .get("/api/clients")
      .query({ q: "[India]" })
      .set(auth());
    assert.equal(search.status, 200);
    assert.equal(search.body.total, 1);
    assert.equal(
      (
        await request(app)
          .patch("/api/clients/" + clientId)
          .set(auth())
          .send({ industry: "Technology" })
      ).status,
      200,
    );
    assert.equal(
      (await request(app).get("/api/clients?limit=100000")).status,
      401,
    );
  });
  await t.test("jobs, client relationship and archive protection", async () => {
    const r = await request(app).post("/api/jobs").set(auth()).send({
      title: "Recruitment Specialist",
      client: clientId,
      openings: 8,
      location: "Pune",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    jobId = r.body._id;
    const stats = await request(app).get("/api/dashboard").set(auth());
    assert.equal(stats.body.vacancies, 8);
    assert.equal(stats.body.openJobs, 1);
    assert.equal(
      (
        await request(app)
          .delete("/api/clients/" + clientId)
          .set(auth())
      ).status,
      409,
    );
  });
  await t.test("roles and record ownership enforced in API", async () => {
    const { User } = await import("../src/models/index.js");
    const { access } = await import("../src/utils/security.js");
    const vendor = await User.create({
      name: "Vendor",
      email: "vendor@inseet.test",
      role: "Vendor",
    });
    const recruiter = await User.create({
      name: "Recruiter",
      email: "recruiter@inseet.test",
      role: "Recruiter",
    });
    const vend = { Authorization: "Bearer " + access(vendor) },
      rec = { Authorization: "Bearer " + access(recruiter) };
    assert.equal(
      (await request(app).get("/api/clients").set(vend)).status,
      403,
    );
    assert.equal((await request(app).get("/api/jobs").set(rec)).body.total, 0);
    assert.equal(
      (
        await request(app)
          .patch("/api/jobs/" + jobId)
          .set(rec)
          .send({ title: "Unauthorized" })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(app)
          .post("/api/clients")
          .set(rec)
          .send({ companyName: "Unauthorized" })
      ).status,
      403,
    );
    assert.equal((await request(app).get("/api/users").set(rec)).status, 403);
  });
  await t.test("profile and audit history", async () => {
    assert.equal(
      (
        await request(app)
          .patch("/api/auth/profile")
          .set(auth())
          .send({ name: "Admin Updated" })
      ).body.name,
      "Admin Updated",
    );
    assert.equal(
      (
        await request(app)
          .patch("/api/auth/profile")
          .set(auth())
          .send({ name: "Admin", role: "Super Admin" })
      ).status,
      400,
    );
    const r = await request(app).get("/api/audit-logs").set(auth());
    assert.ok(r.body.some((a) => a.action === "clients.created"));
  });
  await t.test(
    "candidate consent, deduplication, transactional stages and interview feedback",
    async () => {
      const body = {
        fullName: "Priya Sharma",
        phone: "+91 98765 43210",
        email: "priya@example.test",
        currentCity: "Pune",
        skills: ["Sales"],
        consent: true,
      };
      assert.equal(
        (
          await request(app)
            .post("/api/candidates")
            .set(auth())
            .send({ ...body, consent: false })
        ).status,
        400,
      );
      const c = await request(app)
        .post("/api/candidates")
        .set(auth())
        .send(body);
      assert.equal(c.status, 201, JSON.stringify(c.body));
      assert.equal(
        (await request(app).post("/api/candidates").set(auth()).send(body))
          .status,
        409,
      );
      const a = await request(app)
        .post("/api/applications")
        .set(auth())
        .send({ candidate: c.body._id, job: jobId });
      assert.equal(a.status, 201, JSON.stringify(a.body));
      assert.equal(
        (
          await request(app)
            .post("/api/applications")
            .set(auth())
            .send({ candidate: c.body._id, job: jobId })
        ).status,
        409,
      );
      const change = await request(app)
        .patch("/api/applications/" + a.body._id + "/stage")
        .set(auth())
        .send({ stage: "Screening", version: 0 });
      assert.equal(change.status, 200, JSON.stringify(change.body));
      assert.equal(change.body.version, 1);
      assert.equal(
        (
          await request(app)
            .patch("/api/applications/" + a.body._id + "/stage")
            .set(auth())
            .send({ stage: "Joined", version: 0 })
        ).status,
        409,
      );
      const history = await request(app)
        .get("/api/applications/" + a.body._id + "/history")
        .set(auth());
      assert.equal(history.body.length, 2);
      const i = await request(app)
        .post("/api/interviews")
        .set(auth())
        .send({
          application: a.body._id,
          scheduledAt: new Date(Date.now() + 86400000).toISOString(),
          duration: 30,
          type: "Video",
          interviewer: "Hiring manager",
        });
      assert.equal(i.status, 201, JSON.stringify(i.body));
      assert.equal(
        (
          await request(app)
            .post("/api/interviews/" + i.body._id + "/feedback")
            .set(auth())
            .send({ rating: 4, recommendation: "Proceed", notes: "Strong fit" })
        ).status,
        201,
      );
      assert.equal(
        (
          await request(app)
            .delete("/api/candidates/" + c.body._id)
            .set(auth())
        ).status,
        409,
      );
    },
  );
  await t.test("vendor and client portal record isolation", async () => {
    const { User } = await import("../src/models/index.js");
    const { access } = await import("../src/utils/security.js");
    const vendor = await User.create({
        name: "Partner One",
        email: "partner1@inseet.test",
        role: "Vendor",
      }),
      other = await User.create({
        name: "Partner Two",
        email: "partner2@inseet.test",
        role: "Vendor",
      });
    const va = { Authorization: "Bearer " + access(vendor) },
      vb = { Authorization: "Bearer " + access(other) };
    assert.equal(
      (
        await request(app)
          .patch("/api/assignments/jobs/" + jobId)
          .set(auth())
          .send({
            assignedRecruiters: [],
            assignedVendors: [String(vendor._id)],
          })
      ).status,
      200,
    );
    assert.equal(
      (await request(app).get("/api/portal").set(va)).body.jobs.length,
      1,
    );
    assert.equal(
      (await request(app).get("/api/portal").set(vb)).body.jobs.length,
      0,
    );
    const payload = {
      job: jobId,
      candidateName: "Vendor Talent",
      phone: "9988776655",
      consent: true,
    };
    assert.equal(
      (await request(app).post("/api/portal/submissions").set(vb).send(payload))
        .status,
      403,
    );
    assert.equal(
      (await request(app).post("/api/portal/submissions").set(va).send(payload))
        .status,
      201,
    );
    assert.equal(
      (await request(app).get("/api/portal").set(vb)).body.submissions.length,
      0,
    );
    const client = await User.create({
        name: "Client User",
        email: "client@inseet.test",
        role: "Client",
        clientRef: clientId,
      }),
      unlinked = await User.create({
        name: "Unlinked Client",
        email: "unlinked@inseet.test",
        role: "Client",
      });
    assert.equal(
      (
        await request(app)
          .get("/api/portal")
          .set({ Authorization: "Bearer " + access(client) })
      ).body.jobs.length,
      1,
    );
    assert.equal(
      (
        await request(app)
          .get("/api/portal")
          .set({ Authorization: "Bearer " + access(unlinked) })
      ).status,
      403,
    );
    assert.equal(
      (
        await request(app)
          .get("/api/candidates")
          .set({ Authorization: "Bearer " + access(client) })
      ).status,
      403,
    );
  });
  await t.test(
    "operational edits reject cross-module registered contacts",
    async () => {
      const lead = await request(app).post("/api/leads").set(auth()).send({
        companyName: "Unique sales contact",
        email: "sales-unique@example.test",
        stage: "New",
      });
      assert.equal(lead.status, 201, JSON.stringify(lead.body));
      const blocked = await request(app)
        .patch("/api/leads/" + lead.body._id)
        .set(auth())
        .send({ email: "ADMIN@INSEET.TEST" });
      assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
      const listed = await request(app).get("/api/leads").set(auth());
      assert.equal(
        listed.body.items.find((v) => v._id === lead.body._id).email,
        "sales-unique@example.test",
      );
    },
  );
  await t.test("soft deletion", async () => {
    assert.equal(
      (
        await request(app)
          .delete("/api/jobs/" + jobId)
          .set(auth())
      ).status,
      204,
    );
    assert.equal(
      (
        await request(app)
          .delete("/api/clients/" + clientId)
          .set(auth())
      ).status,
      204,
    );
    assert.equal(
      (await request(app).get("/api/clients").set(auth())).body.total,
      0,
    );
  });
  await t.test("operational CRUD, approvals and attendance", async () => {
    const task = await request(app).post("/api/tasks").set(auth()).send({
      title: "Follow up with hiring manager",
      dueAt: "2026-11-01",
      priority: "High",
      status: "To Do",
    });
    assert.equal(task.status, 201, JSON.stringify(task.body));
    assert.equal(
      (
        await request(app)
          .patch("/api/tasks/" + task.body._id)
          .set(auth())
          .send({ status: "Done" })
      ).status,
      200,
    );
    const leave = await request(app).post("/api/leaves").set(auth()).send({
      type: "Annual",
      startDate: "2026-11-01",
      endDate: "2026-11-02",
      reason: "Personal",
    });
    assert.equal(leave.status, 201, JSON.stringify(leave.body));
    assert.equal(
      (
        await request(app)
          .patch("/api/leaves/" + leave.body._id + "/approval")
          .set(auth())
          .send({ status: "Approved" })
      ).status,
      409,
    );
    assert.equal(
      (await request(app).post("/api/attendance/check-in").set(auth())).status,
      201,
    );
    assert.equal(
      (await request(app).post("/api/attendance/check-in").set(auth())).status,
      409,
    );
    assert.equal(
      (await request(app).post("/api/attendance/check-out").set(auth())).status,
      200,
    );
    assert.equal(
      (await request(app).post("/api/attendance/check-out").set(auth())).status,
      409,
    );
  });
  await t.test(
    "precise invoice totals and transactional payment guards",
    async () => {
      const invoice = await request(app)
        .post("/api/invoices")
        .set(auth())
        .send({
          companyName: "Acme Ltd",
          description: "Recruitment service",
          subtotalPaise: 10001,
          gstBasisPoints: 1800,
          dueAt: "2026-11-01",
        });
      assert.equal(invoice.status, 201, JSON.stringify(invoice.body));
      assert.equal(invoice.body.taxPaise, 1800);
      assert.equal(invoice.body.totalPaise, 11801);
      const payment = {
        invoice: invoice.body._id,
        amountPaise: 8000,
        reference: "BANK-001",
        paidAt: "2026-10-14",
      };
      assert.equal(
        (await request(app).post("/api/payments").set(auth()).send(payment))
          .status,
        201,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/payments")
            .set(auth())
            .send({ ...payment, amountPaise: 1000 })
        ).status,
        409,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/payments")
            .set(auth())
            .send({ ...payment, reference: "BANK-002" })
        ).status,
        400,
      );
      assert.equal(
        (await request(app).get("/api/invoices").set(auth())).body[0].paidPaise,
        8000,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/payments")
            .set(auth())
            .send({ ...payment, reference: "BANK-003", amountPaise: 3801 })
        ).status,
        201,
      );
      assert.equal(
        (await request(app).get("/api/invoices").set(auth())).body[0].status,
        "Paid",
      );
    },
  );
  await t.test(
    "CSV import, duplicate handling and real spreadsheet export",
    async () => {
      const csv =
        "fullName,phone,email,consent,skills\nAsha Rao,9876543000,asha@example.test,true,Recruitment\nAsha Rao,9876543000,asha@example.test,true,Recruitment\nNo Consent,9876543001,no@example.test,false,Sales";
      const imported = await request(app)
        .post("/api/data/candidates/import")
        .set(auth())
        .attach("file", Buffer.from(csv), {
          filename: "candidates.csv",
          contentType: "text/csv",
        });
      assert.equal(imported.status, 200, JSON.stringify(imported.body));
      assert.equal(imported.body.imported, 1);
      assert.equal(imported.body.failed, 2);
      const exported = await request(app)
        .get("/api/data/candidates/export?format=xlsx")
        .set(auth())
        .buffer(true)
        .parse((res, callback) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      assert.equal(exported.status, 200);
      assert.match(exported.headers["content-type"], /spreadsheetml/);
      assert.equal(exported.body.subarray(0, 2).toString(), "PK");
    },
  );
  await t.test(
    "external integrations report configuration requirements honestly",
    async () => {
      const upload = await request(app)
        .post("/api/documents")
        .set(auth())
        .field("category", "Resume")
        .attach("file", Buffer.from("%PDF-1.7 test"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });
      assert.equal(upload.status, 503);
      assert.equal(
        (
          await request(app)
            .post("/api/auth/forgot-password")
            .send({ email: "admin@inseet.test" })
        ).status,
        503,
      );
      const invalid = await request(app)
        .post("/api/documents")
        .set(auth())
        .field("category", "Resume")
        .attach("file", Buffer.from("<script>evil</script>"), {
          filename: "resume.pdf",
          contentType: "application/pdf",
        });
      assert.equal(invalid.status, 400);
    },
  );
  await t.test(
    "revoking a device session invalidates its access and refresh tokens",
    async () => {
      const login = await request(app)
        .post("/api/auth/login")
        .send({ email: "admin@inseet.test", password: "SecurePassword123!" });
      assert.equal(login.status, 200);
      const claims = JSON.parse(
        Buffer.from(
          login.body.accessToken.split(".")[1],
          "base64url",
        ).toString(),
      );
      const sessions = await request(app).get("/api/auth/sessions").set(auth());
      assert.ok(sessions.body.some((s) => s._id === claims.sid));
      assert.equal(
        (
          await request(app)
            .delete("/api/auth/sessions/" + claims.sid)
            .set(auth())
        ).status,
        204,
      );
      assert.equal(
        (
          await request(app)
            .get("/api/auth/me")
            .set({ Authorization: "Bearer " + login.body.accessToken })
        ).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/refresh")
            .set("Origin", origin)
            .set("Cookie", login.headers["set-cookie"][0].split(";")[0])
        ).status,
        401,
      );
    },
  );
  await t.test(
    "password change invalidates existing tokens and sessions",
    async () => {
      assert.equal(
        (
          await request(app)
            .post("/api/auth/change-password")
            .set(auth())
            .send({
              currentPassword: "wrong",
              password: "NewSecurePassword123!",
            })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/change-password")
            .set(auth())
            .send({
              currentPassword: "SecurePassword123!",
              password: "NewSecurePassword123!",
            })
        ).status,
        200,
      );
      assert.equal(
        (await request(app).get("/api/auth/me").set(auth())).status,
        401,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/auth/refresh")
            .set("Origin", origin)
            .set("Cookie", adminCookie)
        ).status,
        401,
      );
    },
  );
});
