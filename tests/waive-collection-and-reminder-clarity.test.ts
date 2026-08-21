import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ReminderItem } from "../lib/reminder-engine.ts";
// @ts-expect-error node runner imports TypeScript directly.
import { summarizeEffectiveReminders } from "../lib/reminder-engine.ts";

const routeSource = readFileSync("app/api/rent-collection/route.ts", "utf8");
const pageSource = readFileSync("app/page.tsx", "utf8");
const rowSource = readFileSync("components/reminder-row.tsx", "utf8");
const tenantSource = readFileSync("app/tenants/page.tsx", "utf8");
const remindersSource = readFileSync("app/reminders/page.tsx", "utf8");

test("waive supports payment-backed and derived DebtCase identifiers", () => {
  assert.match(routeSource, /parseDerivedDebtId/);
  assert.match(routeSource, /getDebtCases\(/);
  assert.match(routeSource, /resolveHistoricalPropertyId\(/);
  assert.match(routeSource, /assertWorkspaceProperty\(admin, payment\.property_id, context\.profile\.workspace_owner_id/);
  assert.match(routeSource, /debtCase\?\.isDerived/);
  assert.match(routeSource, /audit_logs/);
});

test("waive keeps the current business accounting contract", () => {
  assert.match(routeSource, /status: "waived"/);
  assert.match(routeSource, /remaining_amount: remaining/);
  assert.match(tenantSource, /不会生成收入或支出/);
  assert.match(remindersSource, /欠租历史仍会保留/);
});

test("homepage summary exposes debt amount and tenant count without ellipsis", () => {
  const debt = { id: "debt-1", type: "rent_debt", tenantId: "tenant-1", amount: 50 } as ReminderItem;
  const second = { ...debt, id: "debt-2", tenantId: "tenant-2", amount: 82 } as ReminderItem;
  const collection = { id: "collection-1", type: "rent_collection" } as ReminderItem;
  const summary = summarizeEffectiveReminders([debt, second, collection]);
  assert.equal(summary.headline, "欠费€132.00 · 2人");
  assert.equal(summary.detail, "待收租 1");
  assert.equal(summary.text, "欠费€132.00 · 2人 · 待收租 1");
  assert.match(pageSource, /reminder-summary-headline/);
  assert.match(pageSource, /reminder-summary-detail/);
  assert.match(rowSource, /reminder-debt-amount/);
});
