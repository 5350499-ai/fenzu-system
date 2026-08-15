import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error test runner imports the TypeScript module directly.
import { isTenantPermanentDeleteEnabled, tenantPermanentDeleteDisabledMessage, TENANT_PERMANENT_DELETE_DISABLED } from "../lib/tenant-delete.ts";
// @ts-expect-error test runner imports the TypeScript module directly.
import { emptyTenantBusinessDataSummary, isTenantDeleteConfirmed, tenantDeleteBusinessDataMessage, tenantDeletePermissionMessage, tenantHasBusinessData, TENANT_DELETE_CONFIRMATION } from "../lib/tenant-delete.ts";
// @ts-expect-error test runner imports the TypeScript module directly.
import { archiveModeForTenantDeepLink, filterTenantsByArchiveMode } from "../lib/tenant-archive.ts";

assert.equal(isTenantDeleteConfirmed(TENANT_DELETE_CONFIRMATION), true);
assert.equal(isTenantDeleteConfirmed(" DELETE "), true);
assert.equal(isTenantDeleteConfirmed("确认"), false);
assert.match(tenantDeletePermissionMessage(true), /\u6c38\u4e45\u5220\u9664\u79df\u5ba2/);
assert.equal(tenantDeletePermissionMessage(false), "当前账号没有永久删除租客的权限。");

const empty = emptyTenantBusinessDataSummary();
assert.equal(tenantHasBusinessData(empty), false);
assert.equal(tenantHasBusinessData({ ...empty, contracts: 1 }), true);
assert.equal(tenantHasBusinessData({ ...empty, rentPayments: 1 }), true);
assert.equal(tenantHasBusinessData({ ...empty, deposits: 1 }), true);
assert.equal(tenantHasBusinessData({ ...empty, contractFiles: 1 }), true);
assert.match(tenantDeleteBusinessDataMessage("在租"), /业务数据/);
assert.match(tenantDeleteBusinessDataMessage("已退租"), /历史业务数据/);
const tenantRows = [{ id: "current", status: "在租" }, { id: "moved-out", status: "已退租" }, { id: "archived", status: "已归档" }];
assert.deepEqual(filterTenantsByArchiveMode(tenantRows, false).map((tenant) => tenant.id), ["current", "moved-out"]);
assert.deepEqual(filterTenantsByArchiveMode(tenantRows, true).map((tenant) => tenant.id), ["archived"]);
assert.equal(archiveModeForTenantDeepLink(tenantRows, "archived"), true);
assert.equal(archiveModeForTenantDeepLink(tenantRows, "current"), false);

assert.equal(isTenantPermanentDeleteEnabled(), false);
assert.equal(TENANT_PERMANENT_DELETE_DISABLED, "TENANT_PERMANENT_DELETE_DISABLED");
assert.match(tenantDeletePermissionMessage(true), /\u6c38\u4e45\u5220\u9664\u79df\u5ba2/);
assert.match(tenantPermanentDeleteDisabledMessage(), /\u9000\u79df\u548c\u5f52\u6863/);
const businessDataRoute = readFileSync("app/api/business-data/route.ts", "utf8");
assert.match(businessDataRoute, /TENANT_PERMANENT_DELETE_DISABLED/);
assert.match(businessDataRoute, /tenantPermanentDeleteDisabledMessage/);

console.log("tenant delete confirmation and history protection tests passed");
