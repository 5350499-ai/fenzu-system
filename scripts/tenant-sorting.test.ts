import assert from "node:assert/strict";
import { sortTenantsByRoomAndStatus } from "../lib/tenant-sorting";

const rooms = [501, 502, 503, 504].map((number) => ({ id: String(number), roomNumber: String(number), name: `${number} 房间` }));
const tenant = (id: string, roomId: string, status = "在租", actualMoveOutDate?: string) => ({ id, roomId, status, name: id, monthlyRent: 300, actualMoveOutDate });

assert.deepEqual(sortTenantsByRoomAndStatus([tenant("502", "502"), tenant("504", "504"), tenant("501", "501"), tenant("503", "503")], rooms).map((item) => item.roomId), ["501", "502", "503", "504"]);
assert.deepEqual(sortTenantsByRoomAndStatus([tenant("active-502", "502", "欠租"), tenant("active-501", "501"), tenant("old-501", "501", "已退租", "2026-07-29"), tenant("active-503", "503")], rooms).map((item) => item.id), ["active-501", "active-502", "active-503", "old-501"]);
assert.deepEqual(sortTenantsByRoomAndStatus([tenant("old-late", "501", "已退租", "2026-07-30"), tenant("old-early", "501", "已退租", "2026-07-20")], rooms).map((item) => item.id), ["old-late", "old-early"]);
assert.deepEqual(sortTenantsByRoomAndStatus([tenant("none", "", "在租"), tenant("active", "501")], rooms).map((item) => item.id), ["active", "none"]);

console.log("tenant sorting tests passed");
