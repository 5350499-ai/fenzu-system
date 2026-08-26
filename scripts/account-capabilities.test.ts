import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { FREE_SINGLE_LIMITS, getAccountCapabilities, getLegacyAccountCapabilities, resolveLegacyProductTier } from "../lib/account-capabilities.ts";

test("canonical product tiers expose the current policy matrix", () => {
  const free = getAccountCapabilities("FREE");
  const premium = getAccountCapabilities("PREMIUM");
  const internal = getAccountCapabilities("INTERNAL_FULL");

  assert.deepEqual(FREE_SINGLE_LIMITS, { maxProperties: 5, maxRoomsPerProperty: 10 });
  assert.equal(free.canUsePartnership, false);
  assert.equal(free.canUseCloudBackup, false);
  assert.equal(free.canUseCloudHistory, false);
  assert.equal(free.canUseAttachments, false);
  assert.equal(free.canUseLocalBackup, true);
  assert.equal(free.canUseLocalRestore, true);
  assert.equal(free.maxProperties, 5);
  assert.equal(free.maxRoomsPerProperty, 10);

  assert.equal(premium.canUsePartnership, true);
  assert.equal(premium.canUseCloudBackup, true);
  assert.equal(premium.canUseCloudHistory, true);
  assert.equal(premium.canUseAttachments, false);
  assert.equal(premium.maxProperties, null);
  assert.equal(premium.maxRoomsPerProperty, null);

  assert.equal(internal.canUsePartnership, true);
  assert.equal(internal.canUseCloudBackup, true);
  assert.equal(internal.canUseAttachments, true);
  assert.equal(internal.canUseDiagnostics, true);
  assert.equal(internal.canUsePremiumThemes, true);
});

test("managed is a legacy Internal Full compatibility path, never Premium", () => {
  assert.equal(resolveLegacyProductTier({ accountType: "custom", accountPlan: "free_single" }), "FREE");
  assert.equal(resolveLegacyProductTier({ accountType: "custom", accountPlan: "managed" }), "INTERNAL_FULL");
  assert.equal(resolveLegacyProductTier({ accountType: "owner", accountPlan: "managed" }), "INTERNAL_FULL");
  assert.equal(getLegacyAccountCapabilities({ accountType: "custom", accountPlan: "managed" }).tier, "INTERNAL_FULL");
});
