import assert from "node:assert/strict";
import test from "node:test";
import { checkOrderingRequest } from "../functions/request-security.mjs";

const production = { SQUARE_ENVIRONMENT: "production", ORDERING_ALLOWED_ORIGINS: "https://deccanflame.com,https://www.deccanflame.com", ORDERING_APP_ID: "restaurant-app" };
function request(overrides = {}, headers = {}) {
  const values = { origin: "https://deccanflame.com", "content-type": "application/json", "x-firebase-appcheck": "valid-token", ...headers };
  return { path: "/api/square/checkout/", method: "POST", rawBody: Buffer.from("{}"), get: name => values[name.toLowerCase()], ...overrides };
}
const verified = async () => ({ appId: "restaurant-app" });
test("production accepts only verified tokens for the configured Firebase app", async () => {
  assert.equal((await checkOrderingRequest(request(), production, verified)).checkout, true);
  for (const verify of [async () => { throw new Error("Expired or forged token"); }, async () => ({ appId: "different-app" })]) {
    assert.equal((await checkOrderingRequest(request(), production, verify)).status, 403);
  }
});
test("production requires App Check even when the origin is forged to match", async () => {
  for (const token of [undefined, "", "x".repeat(8193)]) {
    let called = false;
    const result = await checkOrderingRequest(request({}, { "x-firebase-appcheck": token }), production, async () => { called = true; });
    assert.equal(result.status, 403); assert.equal(called, false);
  }
});
test("production fails closed without an app ID or with HTTP origins", async () => {
  assert.equal((await checkOrderingRequest(request(), { ...production, ORDERING_APP_ID: "" }, verified)).status, 503);
  assert.equal((await checkOrderingRequest(request({}, { origin: "http://localhost:3000" }), { ...production, ORDERING_ALLOWED_ORIGINS: "http://localhost:3000" }, verified)).status, 503);
});
test("cross-origin, oversized, non-JSON and wrong-method requests are rejected before verification", async () => {
  let called = false; const verify = async () => { called = true; return verified(); };
  for (const origin of [undefined, "null", "https://deccanflame.com.evil.example", "https://evil.example"]) {
    assert.equal((await checkOrderingRequest(request({}, { origin }), production, verify)).status, 403);
  }
  assert.equal((await checkOrderingRequest(request({ rawBody: Buffer.alloc(16001) }), production, verify)).status, 413);
  assert.equal((await checkOrderingRequest(request({}, { "content-type": "text/plain" }), production, verify)).status, 415);
  assert.equal((await checkOrderingRequest(request({ method: "GET" }), production, verify)).status, 405);
  assert.equal((await checkOrderingRequest(request({ path: "/admin" }), production, verify)).status, 404);
  assert.equal(called, false);
});
test("public menu remains readable and Sandbox remains locally testable", async () => {
  assert.equal((await checkOrderingRequest(request({ method: "GET", path: "/api/square/menu/" }), production, verified)).checkout, false);
  assert.equal((await checkOrderingRequest(request({}, { "x-firebase-appcheck": undefined }), { ...production, SQUARE_ENVIRONMENT: "sandbox" }, verified)).checkout, true);
});
