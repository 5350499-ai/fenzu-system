import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const api = readFileSync("app/api/partner-settlements/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260804120000_partner_settlement_snapshots.sql", "utf8");
const reversal = readFileSync("app/partner-settlements/[id]/page.tsx", "utf8") + readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");
const reversalRoute = readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");
const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");

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
