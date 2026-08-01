import assert from "node:assert/strict";
import test from "node:test";
import { sortTenantsByRoomAndStatus } from "../lib/tenant-sorting";

const rooms = [
  { id: "r501", propertyId: "p", name: "501 0.9米床", roomNumber: "501", monthlyRent: 0, depositAmount: 0, status: "已租" },
  { id: "r502", propertyId: "p", name: "502 0.9米床", roomNumber: "502", monthlyRent: 0, depositAmount: 0, status: "已租" },
  { id: "r503", propertyId: "p", name: "503 1.2米床 空调 阳台", roomNumber: "503", monthlyRent: 0, depositAmount: 0, status: "已租" },
  { id: "r504", propertyId: "p", name: "504 1.5米大床", roomNumber: "504", monthlyRent: 0, depositAmount: 0, status: "已租" }
];

function tenant(id: string, roomId: string, status = "在租", actualMoveOutDate?: string, updatedAt?: string) {
  return { id, propertyId: "p", roomId, name: id, phone: "", wechat: "", source: "其他", monthlyRent: 0, depositAmount: 0, status, actualMoveOutDate, updatedAt };
}

test("sorts active tenants by numeric room number and keeps unassigned last", () => {
  const rows = sortTenantsByRoomAndStatus([tenant("503", "r503"), tenant("none", ""), tenant("501", "r501"), tenant("504", "r504"), tenant("502", "r502")], rooms);
  assert.deepEqual(rows.map((row) => row.id), ["501", "502", "503", "504", "none"]);
});

test("puts moved-out tenants last and sorts them by move-out date then updated date", () => {
  const rows = sortTenantsByRoomAndStatus([
    tenant("old", "r501", "已退租", "2026-01-01", "2026-07-20"),
    tenant("active", "r504", "在租"),
    tenant("recent", "r501", "已退租", "2026-07-20", "2026-07-20"),
    tenant("undated-new", "r502", "已退租", undefined, "2026-07-25"),
    tenant("undated-old", "r503", "已退租", undefined, "2026-07-01")
  ], rooms);
  assert.deepEqual(rows.map((row) => row.id), ["active", "recent", "old", "undated-new", "undated-old"]);
});

test("sorting is stable for identical records", () => {
  const rows = sortTenantsByRoomAndStatus([tenant("a", "r501"), tenant("b", "r501")], rooms);
  assert.deepEqual(rows.map((row) => row.id), ["a", "b"]);
});
