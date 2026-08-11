import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { sortTenantsByRoomAndStatus } from "../lib/tenant-sorting.ts";

const rooms = [{ id: "room-1", roomNumber: "1" }];
const tenants = [
  { id: "old", roomId: "room-1", name: "旧", status: "在租", createdAt: "2026-08-01T09:00:00.000Z" },
  { id: "new", roomId: "room-1", name: "新", status: "在租", createdAt: "2026-08-10T09:00:00.000Z" },
  { id: "archived", roomId: "room-1", name: "归档", status: "已归档", createdAt: "2026-08-05T09:00:00.000Z" }
];

test("tenant time sort uses immutable createdAt in both directions", () => {
  assert.deepEqual(sortTenantsByRoomAndStatus(tenants, rooms, { mode: "time", direction: "asc" }).map((tenant) => tenant.id), ["old", "archived", "new"]);
  assert.deepEqual(sortTenantsByRoomAndStatus(tenants, rooms, { mode: "time", direction: "desc" }).map((tenant) => tenant.id), ["new", "archived", "old"]);
});
