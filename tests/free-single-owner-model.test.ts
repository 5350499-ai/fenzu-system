import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const partnerRoute = readFileSync("app/api/partners/route.ts", "utf8");
const partnerIdRoute = readFileSync("app/api/partners/[id]/route.ts", "utf8");
const appLayout = readFileSync("components/app-layout.tsx", "utf8");
const accountMe = readFileSync("app/api/accounts/me/route.ts", "utf8");
const accountManagement = readFileSync("lib/server/account-management.ts", "utf8");
const freeSingleMember = readFileSync("lib/server/free-single-member.ts", "utf8");
const partnersPage = readFileSync("app/partners/page.tsx", "utf8");
const checkInPage = readFileSync("app/check-in/page.tsx", "utf8");
const rentPaymentsPage = readFileSync("app/rent-payments/page.tsx", "utf8");
const expensesPage = readFileSync("app/expenses/page.tsx", "utf8");
const depositsPage = readFileSync("app/deposits/page.tsx", "utf8");
const tenantsPage = readFileSync("app/tenants/page.tsx", "utf8");
const accountAuth = readFileSync("lib/server/account-auth.ts", "utf8");
const settlementApi = readFileSync("app/api/partner-settlements/route.ts", "utf8");
const settlementDetailApi = readFileSync("app/api/partner-settlements/[id]/route.ts", "utf8");

test("free single has a persisted self-only owner directory with 100 percent attribution", () => {
  assert.match(freeSingleMember, /linked_account_id[\s\S]*context\.userId/);
  assert.match(freeSingleMember, /percentage: 100/);
  assert.match(partnerRoute, /const self = freeSingle \? await ensureFreeSingleMember\(context\) : null/);
  assert.match(partnerRoute, /eq\("id", self!\.id\)[\s\S]*eq\("linked_account_id", context\.userId\)/);
  assert.match(partnerRoute, /role: "Owner"/);
  assert.match(partnerRoute, /partner_id", self!\.id/);
});

test("free single can enter its self member surface without partnership settlement capability", () => {
  assert.match(appLayout, /pathname\.startsWith\("\/partners"\)\) return "settings"/);
  assert.match(partnersPage, /Owner · Active · 当前唯一成员/);
  assert.match(partnersPage, /股权 100% · 利润 100% · 支出 100% · 收入\/租金归属 100%/);
  assert.match(accountMe, /isFreeSingleRestrictedSensitivePermission\(key\) \? false/);
  assert.match(accountManagement, /"partnership_settlement"/);
  assert.match(accountManagement, /canViewPartnershipSettlement: false/);
});

test("free single self edit is allowlisted and multi-member operations remain denied", () => {
  assert.match(partnerIdRoute, /partner\.linked_account_id !== context\.userId/);
  assert.match(partnerIdRoute, /keys\.length !== 1 \|\| keys\[0\] !== "displayName"/);
  assert.match(partnerIdRoute, /free_single_self_member_only/);
  assert.match(partnerRoute, /free_single_member_limit/);
  assert.match(partnerIdRoute, /ordinary_beta_partner_disabled/);
});

test("ordinary business loaders cannot be blocked by a partner directory failure", () => {
  for (const page of [checkInPage, depositsPage, tenantsPage]) {
    assert.match(page, /getPartners\(\)\.catch\(\(\) => null\)/);
    assert.match(page, /buildAttributionOptions\(partnerData, access\.isFreeSingle\)/);
  }
  for (const page of [rentPaymentsPage, expensesPage]) {
    assert.match(page, /usePartnerDirectoryState\(access\.userId, access\.isFreeSingle\)/);
    assert.doesNotMatch(page, /getPartners\(\)\.catch\(\(\) => null\)/);
  }
  assert.match(checkInPage, /const loadedProperties = await loadBusinessData[\s\S]*const partnerData = await getPartners\(\)\.catch/);
});

test("free-single settlement confirmation uses the canonical server authorization boundary", () => {
  assert.match(accountAuth, /function isSettlementConfirmationActor/);
  assert.match(accountAuth, /isFreeSingleWorkspaceOwner\(context\)/);
  assert.match(settlementApi, /requireSettlementConfirmationAccess\(context\)/);
  assert.match(settlementApi, /requirePropertyAccess\(context, propertyId\)/);
  assert.doesNotMatch(settlementApi, /requireActiveAccount\(request, true\)/);
});

test("settlement history detail keeps free-single parity and property scope", () => {
  assert.match(settlementDetailApi, /requireSettlementHistoryAccess\(context\)/);
  assert.match(settlementDetailApi, /requirePropertyAccess\(context, batch\.property_id\)/);
  assert.match(settlementDetailApi, /eq\("workspace_owner_id", context\.profile\.workspace_owner_id\)/);
});
