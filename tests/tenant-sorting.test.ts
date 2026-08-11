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

test("tenant room sort uses natural room labels in both directions and keeps empty assignments last", () => {
  const roomFixtures = [
    { id: "room-1", roomNumber: "1" },
    { id: "room-2", roomNumber: "2" },
    { id: "room-10", roomNumber: "10" },
    { id: "room-a2", roomNumber: "A2" },
    { id: "room-a10", roomNumber: "A10" }
  ];
  const tenantFixtures = [
    { id: "ten", roomId: "room-10", name: "十", status: "在租" },
    { id: "empty", roomId: "", name: "空", status: "在租" },
    { id: "two", roomId: "room-2", name: "二", status: "在租" },
    { id: "one", roomId: "room-1", name: "一", status: "在租" },
    { id: "a10", roomId: "room-a10", name: "A十", status: "在租" },
    { id: "a2", roomId: "room-a2", name: "A二", status: "在租" }
  ];
  assert.deepEqual(sortTenantsByRoomAndStatus(tenantFixtures, roomFixtures, { mode: "room", direction: "asc" }).map((tenant) => tenant.id), ["one", "two", "ten", "a2", "a10", "empty"]);
  assert.deepEqual(sortTenantsByRoomAndStatus(tenantFixtures, roomFixtures, { mode: "room", direction: "desc" }).map((tenant) => tenant.id), ["a10", "a2", "ten", "two", "one", "empty"]);
});

test("tenant expiry, rent and property sorts retain their own comparison inputs", () => {
  const fixtures = [
    { id: "a", roomId: "room-1", name: "甲", status: "在租", monthlyRent: 300, createdAt: "2026-08-01" },
    { id: "b", roomId: "room-2", name: "乙", status: "在租", monthlyRent: 100, createdAt: "2026-08-02" },
    { id: "c", roomId: "room-10", name: "丙", status: "在租", monthlyRent: 200, createdAt: "2026-08-03" }
  ];
  const roomFixtures = [{ id: "room-1", roomNumber: "1" }, { id: "room-2", roomNumber: "2" }, { id: "room-10", roomNumber: "10" }];
  assert.deepEqual(sortTenantsByRoomAndStatus(fixtures, roomFixtures, { mode: "rent", direction: "asc" }).map((tenant) => tenant.id), ["b", "c", "a"]);
  assert.deepEqual(sortTenantsByRoomAndStatus(fixtures, roomFixtures, { mode: "expiry", direction: "asc", getExpiry: (tenant) => ({ a: "2026-10-01", b: "2026-08-01", c: "2026-09-01" })[tenant.id] || "" }).map((tenant) => tenant.id), ["b", "c", "a"]);
  assert.deepEqual(sortTenantsByRoomAndStatus(fixtures, roomFixtures, { mode: "property", direction: "asc", getProperty: (tenant) => ({ a: "Z", b: "A", c: "M" })[tenant.id] || "" }).map((tenant) => tenant.id), ["b", "c", "a"]);
});
