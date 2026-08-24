import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const handoff = await import(pathToFileURL(resolve("lib/login-access-handoff.ts")).href);
const { armLoginAccessHandoff, clearLoginAccessHandoff, consumeLoginAccessHandoff, getLoginAccessHandoffTelemetry, LOGIN_ACCESS_HANDOFF_TTL_MS } = handoff;

test("login handoff is one-shot and bound to the exact in-memory access token", async () => {
  clearLoginAccessHandoff();
  armLoginAccessHandoff("token-a", "login-11111111-1111-1111-1111-111111111111", Promise.resolve({ authenticated: true }));
  assert.deepEqual(await consumeLoginAccessHandoff("token-a"), { authenticated: true });
  assert.equal(consumeLoginAccessHandoff("token-a"), null);
  const telemetry = getLoginAccessHandoffTelemetry("login-11111111-1111-1111-1111-111111111111");
  assert.equal(telemetry?.handoffUsed, true);
  assert.equal(telemetry?.immediateAccountRequestCount, 1);
});

test("token mismatch clears the pending handoff and cannot cross accounts", () => {
  clearLoginAccessHandoff();
  armLoginAccessHandoff("token-a", "login-22222222-2222-2222-2222-222222222222", Promise.resolve({ authenticated: true }));
  assert.equal(consumeLoginAccessHandoff("token-b"), null);
  assert.equal(consumeLoginAccessHandoff("token-a"), null);
});

test("expired or cleared handoffs fall back without exposing an old account result", () => {
  const originalNow = Date.now;
  try {
    Date.now = () => 1_000;
    armLoginAccessHandoff("token-a", "login-33333333-3333-3333-3333-333333333333", Promise.resolve({ authenticated: true }));
    Date.now = () => 1_000 + LOGIN_ACCESS_HANDOFF_TTL_MS + 1;
    assert.equal(consumeLoginAccessHandoff("token-a"), null);
    armLoginAccessHandoff("token-b", "login-44444444-4444-4444-4444-444444444444", Promise.resolve({ authenticated: true }));
    clearLoginAccessHandoff();
    assert.equal(consumeLoginAccessHandoff("token-b"), null);
  } finally {
    Date.now = originalNow;
  }
});
