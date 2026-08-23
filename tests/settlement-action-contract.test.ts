import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit source extension.
import { findPreExistingSettlementConflict } from "../lib/settlement-batch-state.ts";

const page = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const api = readFileSync("app/api/partner-settlements/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260804120000_partner_settlement_snapshots.sql", "utf8");
const reversal = readFileSync("app/partner-settlements/[id]/page.tsx", "utf8") + readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");
const reversalRoute = readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");
const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");
const batchState = readFileSync("lib/settlement-batch-state.ts", "utf8");

test("Settlement is one user batch over independent property transactions", () => {
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /for \(let index = 0; index < selectedPropertyIds\.length/);
  assert.match(page, /fetch\("\/api\/partner-settlements"/);
  assert.match(api, /rpc\("confirm_partner_settlement"/);
  assert.match(contract, /ONE_USER_BATCH_ACTION/);
  assert.match(contract, /MULTIPLE_INDEPENDENT_PROPERTY_TRANSACTIONS/);
});

test("Settlement has one client pending guard and explicit result states", () => {
  assert.match(page, /if \(busy \|\| !settlement/);
  assert.match(page, /setBusy\(true\); setMessage\("结算处理中…"\)/);
  assert.match(page, /busy \? <button className="btn primary" disabled type="button">结算处理中…/);
  assert.match(page, /status: "NOT_ATTEMPTED"/);
  assert.match(page, /status: "SUCCESS"/);
  assert.match(page, /status: "FAILED"/);
  assert.match(page, /BATCH_FULL_SUCCESS/);
  assert.match(page, /BATCH_PARTIAL_SUCCESS/);
  assert.match(page, /BATCH_FULL_FAILURE/);
});

test("a later property failure cannot erase an earlier confirmed property", () => {
  assert.match(page, /setBatches\(\(current\) =>[\s\S]*createdBatch/);
  assert.match(page, /请仅处理标记为失败或未执行的房源，不要重复提交已成功房源/);
  assert.match(page, /result\.status === "NOT_ATTEMPTED"/);
});

test("multi-property confirmation freezes pre-batch overlap state", () => {
  assert.match(page, /const preBatchBatches = batches/);
  assert.match(page, /findPreExistingSettlementConflict\(preBatchBatches, propertyId, activeRange\)/);
  assert.match(page, /selectedPropertyIds\.length === 1/);
  assert.match(batchState, /batch\.status === "confirmed"/);
  assert.match(batchState, /batch\.property_id === propertyId/);
  assert.match(batchState, /batch\.period_start <= range\.endDate/);
  assert.match(batchState, /batch\.period_end >= range\.startDate/);
});

test("five-property batch does not turn its own successes into historical conflicts", () => {
  const range = { startDate: "2026-05-23", endDate: "2026-08-22" };
  const properties = ["p1", "p2", "p3", "p4", "p5"];
  const preBatch = [] as Array<{ property_id: string; period_start: string; period_end: string; status: string }>;
  assert.deepEqual(properties.map((propertyId) => findPreExistingSettlementConflict(preBatch, propertyId, range)), [null, null, null, null, null]);
  const afterFirstSuccess = [{ property_id: "p1", period_start: range.startDate, period_end: range.endDate, status: "confirmed" }];
  assert.equal(findPreExistingSettlementConflict(preBatch, "p2", range), null);
  assert.equal(findPreExistingSettlementConflict(preBatch, "p5", range), null);
  assert.equal(findPreExistingSettlementConflict(afterFirstSuccess, "p1", range)?.property_id, "p1");
});

test("server property-period conflict protection and missing batch idempotency stay explicit", () => {
  assert.match(migration, /partner_settlement_batches_confirmed_period_excl/);
  assert.match(migration, /exclude using gist/);
  assert.match(contract, /SETTLEMENT_BATCH_SERVER_IDEMPOTENCY_PENDING/);
  assert.match(contract, /no batch idempotency key/);
});

test("Settlement Reversal remains its existing single RPC contract", () => {
  assert.match(reversal, /reverse_partner_settlement/);
  assert.match(reversal, /reason/);
  assert.match(reversal, /access\.isOwner \|\| access\.isFreeSingle/);
  assert.match(reversalRoute, /requireSettlementReversalAccess\(context\)/);
  assert.match(reversalRoute, /requirePropertyAccess\(context, batch\.property_id\)/);
  assert.match(reversalRoute, /eq\("workspace_owner_id", context\.profile\.workspace_owner_id\)/);
  assert.doesNotMatch(reversalRoute, /requireActiveAccount\(request, true\)/);
  assert.doesNotMatch(reversalRoute, /delete\(/i);
});

test("Settlement calculation and responsive frozen contracts remain outside this root", () => {
  assert.match(page, /buildSettlement/);
  assert.doesNotMatch(page, /window\.innerWidth|screen\.width|devicePixelRatio|transform:\s*scale|zoom/);
  assert.match(readFileSync("RESPONSIVE_CONTRACT.md", "utf8"), /Tenant List/);
});
