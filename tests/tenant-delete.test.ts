import assert from "node:assert/strict";
// @ts-expect-error test runner imports the TypeScript module directly.
import { isTenantDeleteConfirmed, tenantDeletePermissionMessage, TENANT_DELETE_CONFIRMATION } from "../lib/tenant-delete.ts";

assert.equal(isTenantDeleteConfirmed(TENANT_DELETE_CONFIRMATION), true);
assert.equal(isTenantDeleteConfirmed(" DELETE "), true);
assert.equal(isTenantDeleteConfirmed("确认"), false);
assert.equal(tenantDeletePermissionMessage(true), "");
assert.equal(tenantDeletePermissionMessage(false), "当前账号没有永久删除租客的权限。");

console.log("tenant delete confirmation tests passed");
