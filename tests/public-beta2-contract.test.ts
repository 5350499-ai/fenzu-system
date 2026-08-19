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
const restoreMigration = readFileSync("supabase/migrations/20260815140000_account_recovery_points.sql", "utf8");
const checkInOccupancyMigration = readFileSync("supabase/migrations/20260815120000_check_in_occupancy_guard.sql", "utf8");
const moveRoomOccupancyMigration = readFileSync("supabase/migrations/20260815130000_move_room_occupancy_guard.sql", "utf8");
const moveRoomRoute = readFileSync("app/api/tenants/move-room/route.ts", "utf8");
const partnersPage = readFileSync("app/partners/page.tsx", "utf8");

test("ordinary Beta capability root closes Partner and Settlement", () => {
  assert.match(freeSingle, /partnership_settlement/);
  assert.doesNotMatch(accountMe, /base\.moduleKey === "partnership_settlement"\) return \{ \{\.\.\.base, canView: true/);
  assert.doesNotMatch(accountAuth, /moduleKey === "partnership_settlement"\) return/);
  assert.doesNotMatch(accountAuth, /can_view_partnership_settlement"\) return/);
});
test("ordinary Beta keeps a self-only member directory while multi-member management remains denied", () => {
  assert.match(partnersRoute, /const self = freeSingle \? await ensureFreeSingleMember\(context\) : null/);
  assert.match(partnersRoute, /linked_account_id", context\.userId/);
  assert.match(partnersRoute, /free_single_member_limit/);
  assert.match(readFileSync("lib/server/free-single-member.ts", "utf8"), /ensureFreeSingleMember/);
  assert.match(partnerIdRoute, /free_single_self_member_only/);
  assert.match(partnerIdRoute, /ordinary_beta_partner_disabled/);
});
test("ordinary Beta member management does not expose subscription or upgrade CTA", () => {
  assert.doesNotMatch(partnersPage, /订阅功能|升级后/);
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

test("BeforeRestore records an account-scoped server recovery point", () => {
  assert.match(restoreRoute, /recordRecoveryPoint/);
  assert.match(restoreRoute, /source: "before_restore"/);
  assert.match(restoreMigration, /account_recovery_points/);
  assert.match(restoreMigration, /enable row level security/);
  assert.match(restoreMigration, /revoke all on table public\.account_recovery_points from anon, authenticated/);
});

test("ordinary Beta Restore UI requires a preview and exposes explicit restore copy", () => {
  assert.match(dataCenter, /access\.isFreeSingle \?/);
  assert.match(dataCenter, /恢复会覆盖当前业务数据/);
  assert.match(dataCenter, /系统会先自动生成恢复前备份/);
  assert.match(dataCenter, /canRealRestore=\{true\}/);
});

test("ordinary Beta Restore validates the source and preserves server-owned attribution", () => {
  assert.match(restoreRoute, /const sourceIntegrity = await dryRunRestore\(uploadedPayload\)/);
  assert.match(restoreRoute, /currentRestrictedData\.partners/);
  assert.match(restoreRoute, /currentRestrictedData\.settlementSnapshots/);
});

test("lifecycle HTTP conflicts remain server-enforced", () => {
  assert.match(checkInOccupancyMigration, /v_room\.status/);
  assert.match(checkInOccupancyMigration, /'occupied'/);
  assert.match(checkInOccupancyMigration, /'current'/);
  assert.match(moveRoomOccupancyMigration, /message = 'room unavailable'/);
  assert.match(moveRoomRoute, /"room_unavailable"/);
});
