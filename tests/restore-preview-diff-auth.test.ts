import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { BACKUP_RESTORE_ENTITY_REGISTRY, CORE_RESTORE_ENTITY_REGISTRY } from "../lib/backup-restore-entities.ts";
// @ts-expect-error Node's strip-types test runner requires the explicit extension.
import { buildRestorePreviewDiffRows, summarizeRestorePreviewDiff } from "../lib/restore-preview-diff.ts";

const page = fs.readFileSync(new URL("../app/data-center/page.tsx", import.meta.url), "utf8");
const summaryRoute = fs.readFileSync(new URL("../app/api/data-restore/current-summary/route.ts", import.meta.url), "utf8");
const accountAuth = fs.readFileSync(new URL("../lib/server/account-auth.ts", import.meta.url), "utf8");
const accountsRoute = fs.readFileSync(new URL("../app/api/accounts/route.ts", import.meta.url), "utf8");
const migration = fs.readFileSync(new URL("../supabase/migrations/20260825080000_restore_free_single_owner_permission.sql", import.meta.url), "utf8");

test("canonical registry covers the 18-table restore boundary and preview-only entities", () => {
  assert.equal(CORE_RESTORE_ENTITY_REGISTRY.length, 18);
  assert.ok(BACKUP_RESTORE_ENTITY_REGISTRY.some((entity) => entity.key === "checkInRequests" && entity.displayLabelZh === "入住请求记录"));
  assert.ok(BACKUP_RESTORE_ENTITY_REGISTRY.some((entity) => entity.key === "tenantCreateRequests" && entity.displayLabelZh === "租客创建请求记录"));
  assert.ok(BACKUP_RESTORE_ENTITY_REGISTRY.some((entity) => entity.key === "auditLogs" && !entity.consistencyGateIncluded));
  assert.ok(BACKUP_RESTORE_ENTITY_REGISTRY.some((entity) => entity.key === "accounts" && !entity.restoreIncluded));
});

test("restore preview distinguishes real differences, audit rows and unavailable current data", () => {
  const rows = buildRestorePreviewDiffRows(
    { partners: [{ id: "p" }], checkInRequests: [{ id: "r1" }], tenantCreateRequests: [{ id: "t" }], auditLogs: [{ id: "a" }] },
    { partners: [{ id: "p" }], checkInRequests: [{ id: "r1" }, { id: "r2" }], tenantCreateRequests: [{ id: "t" }] }
  );
  assert.deepEqual(rows.map((row) => [row.key, row.status, row.label]), [
    ["partners", "MATCH", "合伙人"],
    ["checkInRequests", "DIFFERENT", "入住请求记录"],
    ["tenantCreateRequests", "MATCH", "租客创建请求记录"],
    ["auditLogs", "AUDIT_ONLY", "操作日志（仅审计，不参与一致性校验）"]
  ]);
  assert.deepEqual(summarizeRestorePreviewDiff(rows), { differenceCount: 1, unavailableCount: 0, allMatch: false });
  const unavailable = buildRestorePreviewDiffRows({ checkInRequests: [{ id: "r" }] }, {});
  assert.equal(unavailable[0].status, "UNAVAILABLE");
  assert.equal(summarizeRestorePreviewDiff(unavailable).differenceCount, 0);
});

test("preview current count loader reads the protected summary endpoint", () => {
  assert.match(page, /api\/data-restore\/current-summary/);
  assert.match(page, /checkInRequests/);
  assert.match(page, /tenantCreateRequests/);
  assert.match(page, /current data is unavailable|当前数据不可用|当前数据读取不完整/);
  assert.match(summaryRoute, /requireActiveAccount/);
  assert.match(summaryRoute, /requireRestorePreviewReadAccess/);
  assert.match(summaryRoute, /check_in_requests/);
  assert.match(summaryRoute, /tenant_create_requests/);
  assert.match(summaryRoute, /user_profiles/);
  assert.match(summaryRoute, /accountProjectionCount/);
  assert.match(accountAuth, /requireRestorePreviewReadAccess/);
  assert.match(accountAuth, /account_type === "owner" \|\| isFreeSingleAccount/);
  assert.match(accountsRoute, /requireActiveAccount\(request, true\)/);
  assert.doesNotMatch(page, /forRestorePreview \|\| access\.isOwner \? fetch\("\/api\/accounts"/);
  assert.match(page, /Promise\.allSettled/);
});

test("free-single workspace owner permission is restored without weakening workspace binding", () => {
  assert.match(migration, /account_type = 'owner'/);
  assert.match(migration, /account_type = 'custom' and account_plan = 'free_single' and auth_user_id = workspace_owner_id/);
  assert.match(migration, /source workspace does not match target workspace/);
  assert.match(migration, /delete from public\.check_in_requests/);
  assert.match(migration, /delete from public\.tenant_create_requests/);
  assert.match(migration, /restore_workspace_backup_impl/);
});
