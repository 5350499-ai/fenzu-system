import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { compareOperationsRooms, roomNumberForSort } from "../lib/room-status-sort.ts";

const room = (name: string, roomNumber = "") => ({ room: { name, roomNumber }, statusLabel: "已出租" });

test("sorts vacant rooms first and room numbers numerically", () => {
  const items = [
    { ...room("504 1.5米床", "504"), statusLabel: "已出租" },
    { ...room("503 1.2米床", "503"), statusLabel: "空置" },
    { ...room("501 0.9米床", "501"), statusLabel: "已出租" },
    { ...room("502 0.9米床", "502"), statusLabel: "已出租" }
  ].sort(compareOperationsRooms);
  assert.deepEqual(items.map((item) => item.room.roomNumber), ["503", "501", "502", "504"]);
});

test("uses numeric ordering and falls back to the name when room number is missing", () => {
  const items = [room("11 房间"), room("9 房间"), room("10 房间")].sort(compareOperationsRooms);
  assert.deepEqual(items.map((item) => item.room.name), ["9 房间", "10 房间", "11 房间"]);
  assert.equal(roomNumberForSort({ name: "503 1.2米床", roomNumber: "" }), 503);
});

test("each property can be sorted independently without cross-property mixing", () => {
  const propertyOne = [room("10 房间"), { ...room("9 房间"), statusLabel: "空置" }].sort(compareOperationsRooms);
  const propertyTwo = [{ ...room("2 房间"), statusLabel: "空置" }, room("1 房间")].sort(compareOperationsRooms);
  assert.deepEqual(propertyOne.map((item) => item.room.name), ["9 房间", "10 房间"]);
  assert.deepEqual(propertyTwo.map((item) => item.room.name), ["2 房间", "1 房间"]);
});
