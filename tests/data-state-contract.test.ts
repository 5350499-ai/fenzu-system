import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync("DATA_STATE_TREE_CONTRACT.md", "utf8");
const businessData = readFileSync("lib/business-data.ts", "utf8");
const rentPeriodState = readFileSync("lib/rent-period-state.ts", "utf8");
const debtCase = readFileSync("lib/debt-case.ts", "utf8");
const reminderEngine = readFileSync("lib/reminder-engine.ts", "utf8");
const cacheManager = readFileSync("lib/cache/cache-manager.ts", "utf8");
const restoreRoute = readFileSync("app/api/data-restore/route.ts", "utf8");

test("data state contract has a canonical registry and final status", () => {
  for (const marker of [
    "## Source-of-truth registry",
    "DATA.PROPERTY",
    "DATA.RENT_PAYMENT",
    "DATA.RENT_PERIOD_STATE",
    "DATA.DEBT_CASE",
    "DATA.REMINDER",
    "DATA.SETTLEMENT_SNAPSHOT",
    "DATA.ACCOUNT_PERMISSION",
    "## Cache and refresh contract",
    "## Snapshot and restore contract",
    "DATA_STATE_4X_COMPLETE_WITH_DEFERRED_RISKS",
  ]) assert.match(contract, new RegExp(marker.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")), marker);
});

test("canonical derivation owners remain shared", () => {
  assert.match(rentPeriodState, /export function inspectTenantRentState/);
  assert.match(debtCase, /inspectTenantRentState/);
  assert.match(reminderEngine, /buildEffectiveReminders/);
  assert.match(contract, /Pages must not replace either selector/);
  assert.match(contract, /Current facts must never overwrite historical/);
});

test("cache and restore boundaries remain explicit", () => {
  assert.match(businessData, /CACHE_INVALIDATION/);
  assert.match(businessData, /export async function refreshBusinessData/);
  assert.match(cacheManager, /GLOBAL_CACHE_VERSION/);
  assert.match(cacheManager, /clearAll\(\)/);
  assert.match(restoreRoute, /settlementPartnerSnapshots/);
  assert.match(restoreRoute, /settlementSegmentSnapshots/);
  assert.match(restoreRoute, /settlementTransferSnapshots/);
  assert.match(contract, /DATA\.CACHE\.UNSCOPED_DIFF_BASELINE/);
});

test("data state governance preserves frozen action and responsive roots", () => {
  assert.match(contract, /No financial formula, lifecycle rule, schema, RPC/);
  assert.match(contract, /AccountAccess snapshots only\s+control visibility/);
  assert.match(contract, /property\s+filters use the shared property-scope contract/i);
});
