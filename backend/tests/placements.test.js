import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { rupeesToPaise } from "../../frontend/src/utils/money.js";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/placements-test";
process.env.JWT_ACCESS_SECRET =
  "placements-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SETUP_KEY = "placements-test-setup-key-only";
let mongo,
  app,
  headers,
  recruiterHeaders,
  admin,
  recruiter,
  Client,
  Job,
  Candidate,
  Models,
  client,
  otherClient,
  candidate,
  job,
  foreignCandidate,
  foreignJob,
  ownCandidate,
  assignedJob;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  const models = await import("../src/models/index.js");
  ({ Client, Job } = models);
  ({ Candidate } = await import("../src/models/recruitment.js"));
  ({ Models } = await import("../src/models/operations.js"));
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  admin = await models.User.create({
    name: "Placement Admin",
    email: "placement-admin@example.test",
    role: "Admin",
  });
  recruiter = await models.User.create({
    name: "Recruiter",
    email: "placement-recruiter@example.test",
    role: "Recruiter",
  });
  const { access } = await import("../src/utils/security.js");
  headers = { Authorization: "Bearer " + access(admin) };
  recruiterHeaders = { Authorization: "Bearer " + access(recruiter) };
  client = await Client.create({
    companyName: "Placement Company",
    owner: admin._id,
  });
  otherClient = await Client.create({
    companyName: "Other Company",
    owner: admin._id,
  });
  candidate = await Candidate.create({
    fullName: "Same Candidate",
    phone: "+919876012341",
    owner: admin._id,
    consent: true,
  });
  foreignCandidate = candidate;
  ownCandidate = await Candidate.create({
    fullName: "Same Candidate",
    phone: "+919876012342",
    owner: recruiter._id,
    consent: true,
  });
  job = await Job.create({
    title: "Sales Executive",
    client: client._id,
    owner: admin._id,
    openings: 2,
  });
  foreignJob = job;
  assignedJob = await Job.create({
    title: "Assigned Executive",
    client: client._id,
    owner: admin._id,
    assignedRecruiters: [recruiter._id],
    openings: 2,
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const payload = () => ({
  candidate: String(candidate._id),
  client: String(client._id),
  job: String(job._id),
  joiningDate: "2026-12-15",
  status: "Joined",
  joiningSalaryPaise: rupeesToPaise("25000.29"),
  salaryPeriod: "Monthly",
  feePaise: rupeesToPaise("5000.50"),
});
test("placement records, searchable selections and exact INR amounts", async (t) => {
  let created;
  await t.test(
    "search loads names from MongoDB and filters jobs by client",
    async () => {
      assert.equal(
        (await request(app).get("/api/placements/options?kind=candidates"))
          .status,
        401,
      );
      const candidates = await request(app)
        .get("/api/placements/options?kind=candidates&q=Same")
        .set(headers);
      assert.equal(candidates.status, 200);
      assert.equal(candidates.body.items.length, 2);
      assert.notEqual(
        candidates.body.items[0]._id,
        candidates.body.items[1]._id,
      );
      const clients = await request(app)
        .get("/api/placements/options?kind=clients&q=Placement")
        .set(headers);
      assert.equal(clients.body.items[0].name, "Placement Company");
      const jobs = await request(app)
        .get("/api/placements/options?kind=jobs&client=" + otherClient._id)
        .set(headers);
      assert.equal(jobs.body.items.length, 0);
      const matching = await request(app)
        .get(
          "/api/placements/options?kind=jobs&client=" + client._id + "&q=Sales",
        )
        .set(headers);
      assert.equal(matching.body.items[0].name, "Sales Executive");
    },
  );
  await t.test(
    "saves references and canonical backend names, with precise salary and fee",
    async () => {
      assert.equal(rupeesToPaise("0.29"), 29);
      for (const invalid of ["-1", "1e4", "12.345", "abc"])
        assert.throws(() => rupeesToPaise(invalid));
      const result = await request(app)
        .post("/api/placements")
        .set(headers)
        .send({
          ...payload(),
          candidateName: "Forged Name",
          companyName: "Forged Company",
          jobTitle: "Forged Job",
        });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      created = result.body;
      assert.equal(created.candidateName, candidate.fullName);
      assert.equal(created.companyName, client.companyName);
      assert.equal(created.jobTitle, job.title);
      assert.equal(created.joiningSalaryPaise, 2500029);
      assert.equal(created.feePaise, 500050);
      assert.equal(created.candidate, String(candidate._id));
    },
  );
  await t.test(
    "rejects missing, nonexistent and mismatched selections and invalid amounts",
    async () => {
      const body = payload();
      delete body.job;
      assert.equal(
        (await request(app).post("/api/placements").set(headers).send(body))
          .status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(headers)
            .send({ ...payload(), client: String(otherClient._id) })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(headers)
            .send({
              ...payload(),
              candidate: String(new mongoose.Types.ObjectId()),
            })
        ).status,
        400,
      );
      for (const field of ["joiningSalaryPaise", "feePaise"])
        for (const invalid of [-1, 0.5, 1000000000001])
          assert.equal(
            (
              await request(app)
                .patch("/api/placements/" + created._id)
                .set(headers)
                .send({ [field]: invalid })
            ).status,
            400,
          );
    },
  );
  await t.test(
    "salary and fee update and export as INR, with references retained",
    async () => {
      const edited = await request(app)
        .patch("/api/placements/" + created._id)
        .set(headers)
        .send({
          joiningSalaryPaise: rupeesToPaise("27000.25"),
          feePaise: rupeesToPaise("6000.75"),
        });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.candidate, created.candidate);
      const csv = await request(app)
        .get("/api/data/placements/export?format=csv")
        .set(headers);
      assert.equal(csv.status, 200);
      assert.match(csv.text, /joiningSalaryINR/);
      assert.match(csv.text, /feeINR/);
      assert.match(csv.text, /27000.25/);
      assert.match(csv.text, /6000.75/);
      const list = await request(app).get("/api/placements").set(headers);
      assert.equal(list.body.items[0].salaryPeriod, "Monthly");
    },
  );
  await t.test(
    "recruiters see owned candidates, assigned jobs and related client names only",
    async () => {
      const options = await request(app)
        .get("/api/placements/options?kind=candidates")
        .set(recruiterHeaders);
      assert.equal(options.body.items.length, 1);
      assert.equal(options.body.items[0]._id, String(ownCandidate._id));
      const clients = await request(app)
        .get("/api/placements/options?kind=clients")
        .set(recruiterHeaders);
      assert.equal(clients.body.items.length, 1);
      assert.equal(clients.body.items[0]._id, String(client._id));
      const body = {
        ...payload(),
        candidate: String(ownCandidate._id),
        job: String(assignedJob._id),
      };
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(recruiterHeaders)
            .send(body)
        ).status,
        201,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(recruiterHeaders)
            .send({ ...body, candidate: String(foreignCandidate._id) })
        ).status,
        400,
      );
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(recruiterHeaders)
            .send({ ...body, job: String(foreignJob._id) })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "archived records are excluded and historical text records remain editable",
    async () => {
      await Candidate.updateOne(
        { _id: candidate._id },
        { $set: { deletedAt: new Date() } },
      );
      const list = await request(app)
        .get("/api/placements/options?kind=candidates")
        .set(headers);
      assert.ok(!list.body.items.some((i) => i._id === String(candidate._id)));
      assert.equal(
        (
          await request(app)
            .post("/api/placements")
            .set(headers)
            .send(payload())
        ).status,
        400,
      );
      const old = await Models.placements.collection.insertOne({
        candidateName: "Historical Candidate",
        companyName: "Historical Client",
        jobTitle: "Historical Job",
        joiningDate: new Date("2025-01-01"),
        status: "Joined",
        owner: admin._id,
        deletedAt: null,
      });
      const updated = await request(app)
        .patch("/api/placements/" + old.insertedId)
        .set(headers)
        .send({ notes: "Retained history" });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.candidateName, "Historical Candidate");
    },
  );
});
