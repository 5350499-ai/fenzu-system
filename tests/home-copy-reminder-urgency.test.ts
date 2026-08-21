import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { buildReminderDisplayModel } from "../lib/reminder-display.ts";
import type { ReminderItem } from "../lib/reminder-engine.ts";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const rowSource = readFileSync(new URL("../components/reminder-row.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

const context = {
  properties: [{ id: "property-1", name: "一号房源" }],
  rooms: [{ id: "room-1", propertyId: "property-1", roomNumber: "01", name: "01" }],
  tenants: [{ id: "tenant-1", name: "测试租客", status: "在租" }]
} as any;

function rent(daysRemaining: number): ReminderItem {
  return {
    id: `rent:${daysRemaining}`, type: "rent_collection", category: "收租提醒", title: "测试租客即将到期",
    description: "测试租客 · 覆盖至：2026-08-29", tone: daysRemaining <= 3 ? "yellow" : "green", priority: 1,
    href: "/tenants", navigationTarget: { kind: "tenant", href: "/tenants", tenantId: "tenant-1" },
    tenantId: "tenant-1", roomId: "room-1", propertyId: "property-1", paymentId: "payment-1",
    dueDate: "2026-08-29", daysRemaining, amount: 460, availableActions: [], surfaces: ["dashboard", "reminder_center"]
  };
}

test("HOME_SUBTITLE_COPY", () => {
  assert.match(pageSource, /房源、租客、收支与待办，一目了然。/);
  assert.doesNotMatch(pageSource, /首页保留核心经营数据和常用入口/);
});

test("REMINDER_TRIGGER_REASON_VISIBLE", () => {
  const display = buildReminderDisplayModel(rent(8), context);
  assert.deepEqual(display.secondaryReason, { before: "覆盖至 2026-08-29 | 剩余 ", emphasis: "8 天", after: " | €460.00", tone: "orange" });
  assert.match(rowSource, /reminder-rent-status/);
});

test("URGENCY_THRESHOLD_EXISTING_RULE_REUSED", () => {
  assert.equal(buildReminderDisplayModel(rent(20), context).secondaryReason?.tone, "yellow");
  assert.equal(buildReminderDisplayModel(rent(8), context).secondaryReason?.tone, "orange");
  assert.equal(buildReminderDisplayModel(rent(0), context).secondaryReason?.tone, "danger");
});

test("DIFFERENT_URGENCY_LEVELS_DIFFERENT_EXISTING_COLORS", () => {
  const tones = [20, 8, 0].map((days) => buildReminderDisplayModel(rent(days), context).secondaryReason?.tone);
  assert.deepEqual(tones, ["yellow", "orange", "danger"]);
  assert.match(cssSource, /\.reminder-rent-status\.orange/);
  assert.match(cssSource, /\.reminder-rent-status\.yellow/);
  assert.match(cssSource, /\.reminder-rent-status\.danger/);
});

test("OVERDUE_STATE_EXISTING_DANGER_STYLE", () => {
  const display = buildReminderDisplayModel({
    ...rent(0), type: "rent_debt", daysRemaining: undefined, daysOverdue: 2,
    debtCase: { tenantId: "tenant-1", tenantName: "测试租客", propertyId: "property-1", propertyName: "一号房源", roomId: "room-1", roomName: "01", paymentId: "payment-1", coverageEnd: "2026-08-20", daysOverdue: 2, remainingAmount: 460, debtKind: "current", tenantLifecycle: "current", navigation: { tenantHref: "/tenants" }, canCollect: false, canWaive: false }
  } as ReminderItem, context);
  assert.equal(display.secondaryReason?.tone, "danger");
});

test("AMOUNT_STYLE_UNCHANGED", () => {
  assert.equal(buildReminderDisplayModel(rent(8), context).secondaryReason?.after, " | €460.00");
});

test("CURRENCY_FORMATTER_UNCHANGED", () => {
  assert.match(readFileSync(new URL("../lib/format.ts", import.meta.url), "utf8"), /function euro/);
});

test("VACANCY_REMINDER_REASON_PRESERVED", () => {
  const display = buildReminderDisplayModel({
    ...rent(8), id: "vacant-room:room-1", type: "vacant_room", category: "空置房间", description: "一号房源"
  } as ReminderItem, context);
  assert.equal(display.secondaryLine, "一号房源");
  assert.equal(display.secondaryReason, undefined);
});
