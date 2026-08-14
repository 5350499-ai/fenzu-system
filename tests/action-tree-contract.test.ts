import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");
const checkIn = readFileSync("app/check-in/page.tsx", "utf8") + readFileSync("app/api/check-in/route.ts", "utf8");
const moveOut = readFileSync("app/tenants/page.tsx", "utf8");
const settlement = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const propertyDetail = readFileSync("app/properties/[id]/page.tsx", "utf8");
const tenants = readFileSync("app/tenants/page.tsx", "utf8");

const requiredIds = [
  "ACTION.CHECK_IN.CREATE",
  "ACTION.TENANT.MOVE_OUT",
  "ACTION.DEBT.WAIVE",
  "ACTION.RENT_PAYMENT.SAVE",
  "ACTION.DEPOSIT.SAVE",
  "ACTION.EXPENSE.SAVE",
  "ACTION.SETTLEMENT.CONFIRM",
  "ACTION.SETTLEMENT.REVERSE",
  "ACTION.DATA.RESTORE",
  "ACTION.ADMIN_ATTACHMENT_CLEANUP.RUN",
  "ACTION.GOOGLE_ATTACHMENT_MIGRATION.RUN",
  "ACTION.ACCOUNT.SECURITY",
  "ACTION.TENANT.DELETE",
];

test("Action Tree registry exists and contains unique stable high-risk IDs", () => {
  assert.match(contract, /^# Action Tree Ownership Contract/m);
  const registrySection = contract.split("## Lifecycle Action Root")[0];
  for (const id of requiredIds) {
    const registryRows = registrySection.split("\n").filter((line) => line.startsWith(`| \`${id}\` |`));
    assert.equal(registryRows.length, 1, id);
  }
  assert.match(contract, /PARTIAL_SUCCESS_RISK/);
  assert.match(contract, /PROPERTY_NOTES/);
  assert.match(contract, /DEBT_WAIVER/);
});

test("registry defines the required ownership and safety vocabulary", () => {
  for (const value of [
    "ENTRY", "UI_ORCHESTRATION", "ACTION_ROOT", "DOMAIN_SERVICE", "API_OR_RPC", "PERSISTENCE",
    "DERIVED_STATE_CACHE", "USER_FEEDBACK", "UI_PENDING_GUARD", "CLIENT_REQUEST_ID",
    "SERVER_IDEMPOTENCY", "DATABASE_CONSTRAINT", "PREVIEW_AND_CONFIRM", "REASON_REQUIRED",
    "LOCAL_STATE", "CACHE_INVALIDATION", "REFETCH", "LEGACY_COMPAT", "MIGRATION_PENDING",
  ]) assert.match(contract, new RegExp(value.replaceAll("_", "\\_")), value);
});

test("known atomicity and risk claims match the current implementation", () => {
  assert.match(checkIn, /clientRequestId/);
  assert.match(checkIn, /create_atomic_check_in/);
  assert.match(moveOut, /buildTenantMoveOutPlan/);
  assert.match(moveOut, /persistAll/);
  assert.match(settlement, /selectedPropertyIds\.length/);
  assert.match(settlement, /api\/partner-settlements/);
  assert.match(contract, /ACTION\.CHECK_IN\.CREATE[\s\S]*CLIENT_REQUEST_ID[\s\S]*STABLE/);
  assert.match(contract, /ACTION\.TENANT\.MOVE_OUT[\s\S]*PARTIAL_SUCCESS_RISK/);
  assert.match(contract, /ACTION\.SETTLEMENT\.CONFIRM[\s\S]*PARTIAL_SUCCESS_RISK/);
});

test("known deferred gaps remain registered instead of being silently normalized", () => {
  assert.match(propertyDetail, /savePropertyNotes/);
  assert.match(propertyDetail, /catch\(console\.error\)/);
  assert.match(tenants, /async function waiveDebtCase/);
  assert.match(contract, /USER_VISIBLE_ERROR_GAP/);
  assert.match(contract, /CLIENT_PENDING_GAP = RESOLVED/);
});

test("pages and components do not directly perform business-table mutations", () => {
  const source = [
    readFileSync("app/tenants/page.tsx", "utf8"),
    readFileSync("app/rent-payments/page.tsx", "utf8"),
    readFileSync("app/expenses/page.tsx", "utf8"),
    readFileSync("app/deposits/page.tsx", "utf8"),
    readFileSync("app/rooms/page.tsx", "utf8"),
    readFileSync("app/properties/page.tsx", "utf8"),
  ].join("\n");
  assert.doesNotMatch(source, /\.from\(["'](?:properties|rooms|tenants|contracts|rent_payments|expenses|deposits)["']\)\s*\.\s*(?:insert|update|delete|upsert)\(/);
});
