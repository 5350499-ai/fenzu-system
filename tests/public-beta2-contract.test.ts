import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const freeSingle = readFileSync("lib/free-single.ts", "utf8");
const accountAuth = readFileSync("lib/server/account-auth.ts", "utf8");
const accountMe = readFileSync("app/api/accounts/me/route.ts", "utf8");
const restoreRoute = readFileSync("app/api/data-restore/route.ts", "utf8");
const backupRoute = readFileSync("app/api/data-backup/route.ts", "utf8");
const partnersRoute = readFileSync("app/api/partners/route.ts", "utf8");
const partnerIdRoute = readFileSync("app/api/partners/[id]/route.ts", "utf8");
const dataCenter = readFileSync("app/data-center/page.tsx", "utf8");

test("ordinary Beta capability root closes Partner and Settlement", () => {
  assert.match(freeSingle, /partnership_settlement/);
  assert.doesNotMatch(accountMe, /base\.moduleKey === "partnership_settlement"\) return \{ \{\.\.\.base, canView: true/);
  assert.doesNotMatch(accountAuth, /moduleKey === "partnership_settlement"\) return/);
  assert.doesNotMatch(accountAuth, /can_view_partnership_settlement"\) return/);
});
test("ordinary Beta partner writes are denied while self attribution read remains explicit", () => {
  assert.match(partnersRoute, /Free-single accounts still need the self member/);
  assert.match(partnerIdRoute, /ordinary_beta_partner_disabled/);
});

test("ordinary Beta Restore is server-authenticated, workspace-scoped and business-only", () => {
  assert.match(restoreRoute, /requireActiveAccount\(request\)/);
  assert.match(restoreRoute, /isFreeSingleAccount\(context\)/);
  assert.match(restoreRoute, /sanitizeFreeSingleExportData/);
  assert.match(restoreRoute, /context\.profile\.workspace_owner_id/);
  assert.match(restoreRoute, /restore_workspace_backup/);
  assert.doesNotMatch(restoreRoute, /requireManagedAccount\(context, "云端恢复"\)/);
});

test("ordinary Beta users can export an official JSON backup", () => {
  assert.match(backupRoute, /requireActiveAccount\(request\)/);
  assert.match(backupRoute, /can_export_data/);
  assert.doesNotMatch(backupRoute, /requireManagedAccount/);
});

test("ordinary Beta Restore UI requires a preview and exposes explicit restore copy", () => {
  assert.match(dataCenter, /access\.isFreeSingle \?/);
  assert.match(dataCenter, /恢复会覆盖当前业务数据/);
  assert.match(dataCenter, /系统会先自动生成恢复前备份/);
  assert.match(dataCenter, /canRealRestore=\{true\}/);
});
