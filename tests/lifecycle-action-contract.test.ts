import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const contract = readFileSync("ACTION_TREE_CONTRACT.md", "utf8");
const checkIn = readFileSync("app/check-in/page.tsx", "utf8") + readFileSync("app/api/check-in/route.ts", "utf8");
const moveRoom = readFileSync("lib/tenant-room-move.ts", "utf8") + readFileSync("app/api/tenants/move-room/route.ts", "utf8");
const tenants = readFileSync("app/tenants/page.tsx", "utf8");
const property = readFileSync("app/properties/[id]/page.tsx", "utf8");
const rooms = readFileSync("app/rooms/page.tsx", "utf8");

test("lifecycle registry and decisions are explicit", () => {
  for (const id of [
    "ACTION.CHECK_IN.CREATE",
    "ACTION.MOVE_ROOM.UPDATE",
    "ACTION.ROOM.SET_VACANT",
    "ACTION.PROPERTY.ARCHIVE",
    "ACTION.TENANT.ARCHIVE",
    "ACTION.TENANT.MOVE_OUT",
    "ACTION.TENANT.DELETE",
  ]) assert.match(contract, new RegExp(`\\x60${id.replaceAll(".", "\\.")}\\x60`), id);
  assert.match(contract, /CHECK_IN_NO_CHANGE_REQUIRED|NO_CHANGE_REQUIRED/);
  assert.match(contract, /MOVE_TO_3_3B/);
  assert.match(contract, /MOVE_OUT_RECOMMENDATION_B/);
});

test("check-in keeps one atomic core owner and its client safety contract", () => {
  assert.match(checkIn, /create_atomic_check_in/);
  assert.match(checkIn, /clientRequestId/);
  assert.match(checkIn, /submitLockRef/);
  assert.match(checkIn, /saving/);
  assert.match(checkIn, /contactSaveWarning/);
  assert.match(contract, /ACTION\.CHECK_IN\.CREATE[\s\S]*ATOMIC core/);
});

test("move-room remains one server transaction boundary", () => {
  assert.match(moveRoom, /update_tenant_current_assignment/);
  assert.match(moveRoom, /requireModulePermission/);
  assert.match(contract, /ACTION\.MOVE_ROOM\.UPDATE[\s\S]*ATOMIC/);
});

test("archive and restore remain reversible lifecycle actions", () => {
  assert.match(tenants, /async function archiveTenant/);
  assert.match(tenants, /async function restoreTenant/);
  assert.match(tenants, /disabled=\{saving\}/);
  assert.match(property, /async function archiveProperty/);
  assert.match(property, /async function restoreProperty/);
  assert.match(property, /propertyLifecycleLockRef/);
  assert.match(property, /disabled=\{propertyLifecycleSaving \|\| propertySaving\}/);
  assert.match(contract, /RESTORE_CONFIRMATION_NOT_REQUIRED|NO_CONFIRM_REQUIRED \/ REVERSIBLE/);
});

test("room vacancy preserves its existing explicit multi-record boundary", () => {
  assert.match(rooms, /async function setVacant/);
  assert.match(rooms, /saveBusinessData\(roomKey/);
  assert.match(rooms, /saveBusinessData\(tenantKey/);
  assert.match(rooms, /saveBusinessData\(contractKey/);
  assert.match(rooms, /disabled=\{saving\}/);
  assert.match(contract, /ACTION\.ROOM\.SET_VACANT[\s\S]*NON_ATOMIC/);
});

test("Move Out remains a deferred high-risk non-atomic root", () => {
  assert.match(tenants, /buildTenantMoveOutPlan/);
  assert.match(tenants, /moveOutSubmissionGuardRef/);
  assert.match(tenants, /persistAll\(plan/);
  assert.match(contract, /ACTION\.TENANT\.MOVE_OUT[\s\S]*NON_ATOMIC/);
  assert.match(contract, /UI_STATE_DIVERGENCE_RISK/);
  assert.match(contract, /No client request id or server Move Out\s+idempotency key is proven/);
  assert.match(contract, /3\.3b/);
});

test("permanent delete remains outside reversible lifecycle semantics", () => {
  assert.match(tenants, /isTenantDeleteConfirmed/);
  assert.match(property, /删除后不可恢复/);
  assert.match(rooms, /删除后不可恢复/);
  assert.match(contract, /Permanent delete: `TYPED_CONFIRM` or `CONSEQUENCE_CONFIRM`/);
});

test("lifecycle changes do not reopen frozen financial or responsive contracts", () => {
  assert.match(contract, /Tenant List three-row\/five-slot contract/);
  assert.doesNotMatch(property, /window\.innerWidth|screen\.width|devicePixelRatio|transform:\s*scale|zoom/);
  assert.doesNotMatch(tenants, /window\.innerWidth|screen\.width|devicePixelRatio|transform:\s*scale|zoom/);
});
