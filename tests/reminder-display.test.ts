import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { buildReminderDisplayModel } from "../lib/reminder-display.ts";
import type { ReminderItem } from "../lib/reminder-engine.ts";

const context = {
  properties: [{ id: "property-1", name: "一号房源" }],
  rooms: [{ id: "room-1", propertyId: "property-1", roomNumber: "02", name: "02" }],
  tenants: [{ id: "tenant-1", name: "Test", status: "在租" }]
} as any;

test("today-due rent reminders retain identity, lifecycle, coverage, status and amount", () => {
  const item = {
    id: "rent_collection:payment-1",
    type: "rent_collection",
    category: "收租提醒",
    title: "Test今日到期",
    description: "Test · 覆盖至：2026-08-10",
    tone: "danger",
    priority: 1,
    href: "/tenants?tenantId=tenant-1",
    navigationTarget: { kind: "tenant", href: "/tenants?tenantId=tenant-1", tenantId: "tenant-1", paymentId: "payment-1" },
    tenantId: "tenant-1",
    roomId: "room-1",
    propertyId: "property-1",
    paymentId: "payment-1",
    dueDate: "2026-08-10",
    daysRemaining: 0,
    amount: 500,
    availableActions: [],
    surfaces: ["dashboard", "reminder_center"]
  } as ReminderItem;

  const display = buildReminderDisplayModel(item, context);
  assert.equal(display.tenantName, "Test");
  assert.equal(display.contextLine, "一号房源 | 02");
  assert.equal(display.lifecycleLabel, "在租");
  assert.equal(display.secondaryLine, "覆盖至 2026-08-10 | 今日到期 | €500.00");
});

test("non-rent reminder display keeps its category and description without rent assumptions", () => {
  const item = {
    id: "vacant-room:room-1",
    type: "vacant_room",
    category: "空置房间",
    title: "空置房间",
    description: "一号房源",
    tone: "yellow",
    priority: 1,
    href: "/rooms",
    navigationTarget: { kind: "room", href: "/rooms", roomId: "room-1", propertyId: "property-1" },
    roomId: "room-1",
    propertyId: "property-1",
    availableActions: [],
    surfaces: ["dashboard", "reminder_center"]
  } as ReminderItem;

  const display = buildReminderDisplayModel(item, context);
  assert.equal(display.categoryLabel, "空置房间");
  assert.equal(display.secondaryLine, "一号房源");
});

test("vacant room reminder uses room identity once and property as the second line", () => {
  const item = {
    id: "vacant-room:room-1",
    type: "vacant_room",
    category: "空置房间",
    title: "旧标题不参与身份拼接",
    description: "旧描述不参与身份拼接",
    tone: "yellow",
    priority: 1,
    href: "/rooms?roomId=room-1",
    navigationTarget: { kind: "room", href: "/rooms?roomId=room-1", roomId: "room-1", propertyId: "property-1" },
    roomId: "room-1",
    propertyId: "property-1",
    availableActions: [],
    surfaces: ["dashboard", "reminder_center"]
  } as ReminderItem;

  const display = buildReminderDisplayModel(item, {
    properties: [{ id: "property-1", name: "3号房子测试用", address: "", city: "" }],
    rooms: [{ id: "room-1", propertyId: "property-1", roomNumber: "0303", name: "0303测试房间", monthlyRent: 0, depositAmount: 0, status: "空置" }],
    tenants: []
  });
  assert.deepEqual(display.vacantRoom, { roomName: "0303测试房间", propertyName: "3号房子测试用", statusLabel: "空置" });
  assert.equal(display.tenantName, "0303测试房间");
  assert.equal(display.secondaryLine, "3号房子测试用");
});

test("vacant room display never swaps room and property ids", () => {
  const display = buildReminderDisplayModel({
    id: "vacant-room:room-1", type: "vacant_room", category: "空置房间", title: "", description: "", tone: "yellow", priority: 1,
    href: "/rooms", navigationTarget: { kind: "room", href: "/rooms", roomId: "room-1", propertyId: "property-1" }, roomId: "room-1", propertyId: "property-1", availableActions: [], surfaces: ["dashboard", "reminder_center"]
  } as ReminderItem, {
    properties: [{ id: "property-1", name: "正确房源", address: "", city: "" }],
    rooms: [{ id: "room-1", propertyId: "property-1", name: "正确房间", roomNumber: "01", monthlyRent: 0, depositAmount: 0, status: "空置" }],
    tenants: []
  });
  assert.equal(display.vacantRoom?.roomName, "正确房间");
  assert.equal(display.vacantRoom?.propertyName, "正确房源");
});
