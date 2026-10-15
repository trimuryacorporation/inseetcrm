import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { resolveApiBaseUrl } from "../../frontend/src/utils/apiBaseUrl.js";
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/service-test";
process.env.JWT_ACCESS_SECRET = "service-test-secret-never-use-in-production";
process.env.FRONTEND_URL = "https://inseet.example.test";
process.env.SETUP_KEY = "service-test-setup-key-only";
const { app } = await import("../src/app.js");
test("backend entry routes describe the API and leave protection and health intact", async () => {
  for (const route of ["/", "/api"]) {
    const r = await request(app).get(route);
    assert.equal(r.status, 200);
    assert.equal(r.body.service, "inseet-api");
    assert.equal(r.body.health, "/api/health");
    assert.equal(r.body.frontend, process.env.FRONTEND_URL);
    assert.equal(r.body.MONGODB_URI, undefined);
  }
  assert.equal((await request(app).get("/api/health")).status, 503);
  assert.equal((await request(app).get("/api/clients")).status, 401);
  assert.equal((await request(app).get("/unknown-page")).status, 404);
});
test("API origin URLs gain the required prefix without duplicating it", () => {
  assert.equal(resolveApiBaseUrl(undefined), "/api");
  assert.equal(resolveApiBaseUrl("/api/"), "/api");
  assert.equal(
    resolveApiBaseUrl("https://inseetcrm.onrender.com"),
    "https://inseetcrm.onrender.com/api",
  );
  assert.equal(
    resolveApiBaseUrl(" https://inseetcrm.onrender.com/ "),
    "https://inseetcrm.onrender.com/api",
  );
  assert.equal(
    resolveApiBaseUrl("https://inseetcrm.onrender.com/api/"),
    "https://inseetcrm.onrender.com/api",
  );
  assert.equal(
    resolveApiBaseUrl("https://example.test/v1/api"),
    "https://example.test/v1/api",
  );
});
