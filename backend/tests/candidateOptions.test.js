import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { locationSuggestions } from "../src/services/candidateLocations.js";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/candidate-options-test";
process.env.JWT_ACCESS_SECRET =
  "candidate-options-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.SETUP_KEY = "candidate-options-test-setup-key";
let mongo, app, headers;
before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60000 }],
  });
  await mongoose.connect(mongo.getUri());
  app = (await import("../src/app.js")).app;
  const { User } = await import("../src/models/index.js");
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  const user = await User.create({
    name: "Candidate Admin",
    email: "candidate-admin@example.test",
    role: "Admin",
  });
  const { access } = await import("../src/utils/security.js");
  headers = { Authorization: "Bearer " + access(user) };
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("candidate options and numeric fields", async (t) => {
  await t.test(
    "requires authentication and seeds source/qualification options",
    async () => {
      assert.equal(
        (await request(app).get("/api/candidate-options")).status,
        401,
      );
      const r = await request(app).get("/api/candidate-options").set(headers);
      assert.equal(r.status, 200);
      assert.ok(r.body.sources.length >= 10);
      assert.ok(r.body.qualifications.length >= 10);
    },
  );
  await t.test(
    "custom source and qualification persist and block duplicates",
    async () => {
      for (const kind of ["source", "qualification"]) {
        const name = "Custom " + kind;
        assert.equal(
          (
            await request(app)
              .post("/api/candidate-options")
              .set(headers)
              .send({ kind, name })
          ).status,
          201,
        );
        assert.equal(
          (
            await request(app)
              .post("/api/candidate-options")
              .set(headers)
              .send({ kind, name: name.toUpperCase() })
          ).status,
          409,
        );
      }
      const r = await request(app).get("/api/candidate-options").set(headers);
      assert.ok(r.body.sources.some((i) => i.name === "Custom source"));
      assert.ok(
        r.body.qualifications.some((i) => i.name === "Custom qualification"),
      );
    },
  );
  await t.test(
    "skills search supports multiple selections, custom skills and literal regex",
    async () => {
      assert.equal(
        (
          await request(app)
            .post("/api/candidate-options")
            .set(headers)
            .send({ kind: "skill", name: "C++" })
        ).status,
        201,
      );
      const r = await request(app)
        .get("/api/candidate-options/skills?q=C%2B%2B")
        .set(headers);
      assert.equal(r.status, 200);
      assert.equal(r.body.items[0].name, "C++");
    },
  );
  await t.test(
    "numeric values persist, letters and negative values fail on create and edit",
    async () => {
      const body = {
        fullName: "Numeric Candidate",
        phone: "9876012345",
        consent: true,
        currentSalary: "25000",
        expectedSalary: "30000",
        noticePeriod: "30",
        skills: ["React", "Sales"],
      };
      const created = await request(app)
        .post("/api/candidates")
        .set(headers)
        .send(body);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.deepEqual(created.body.skills, ["React", "Sales"]);
      for (const field of ["currentSalary", "expectedSalary", "noticePeriod"]) {
        for (const value of ["-1", "1e3", "abc", "3.5"]) {
          const r = await request(app)
            .patch("/api/candidates/" + created.body._id)
            .set(headers)
            .send({ [field]: value });
          assert.equal(r.status, 400);
        }
      }
      const r = await request(app).get("/api/candidates").set(headers);
      assert.equal(r.body.items[0].noticePeriod, "30");
    },
  );
});
test("local city search and Google provider request", async () => {
  const local = await locationSuggestions("Pune", "");
  assert.equal(local.provider, "local");
  assert.ok(local.items.some((i) => i.name.startsWith("Pune,")));
  let payload;
  const google = await locationSuggestions(
    "London",
    "test-key",
    async (url, options) => {
      assert.equal(url, "https://places.googleapis.com/v1/places:autocomplete");
      payload = JSON.parse(options.body);
      assert.equal(options.headers["X-Goog-Api-Key"], "test-key");
      return {
        ok: true,
        json: async () => ({
          suggestions: [
            {
              placePrediction: {
                placeId: "city123",
                text: { text: "London, UK" },
              },
            },
          ],
        }),
      };
    },
  );
  assert.deepEqual(payload.includedPrimaryTypes, ["(cities)"]);
  assert.equal(google.provider, "google");
  assert.equal(google.items[0].name, "London, UK");
  await assert.rejects(() =>
    locationSuggestions("Pune", "test", async () => ({ ok: false })),
  );
});
