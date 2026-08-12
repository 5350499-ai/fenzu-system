import assert from "node:assert/strict";
import test from "node:test";
import type { BusinessDeposit, BusinessProperty, BusinessRoom, BusinessTenant } from "../lib/business-data.ts";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { buildEffectiveReminders } from "../lib/reminder-engine.ts";

test("deposit reminder preserves the deposit tenant and owned room/property context", () => {
  const property = { id: "property-1", name: "Property" } as BusinessProperty;
  const room = { id: "room-1", propertyId: property.id, name: "02", roomNumber: "02", status: "已出租" } as BusinessRoom;
  const tenant = { id: "tenant-moved-out", propertyId: property.id, roomId: room.id, name: "Moved out", status: "已退租" } as BusinessTenant;
  const deposit = { id: "deposit-1", tenantId: tenant.id, propertyId: property.id, roomId: room.id, amount: 500, status: "待退", notes: "" } as BusinessDeposit;
  const [reminder] = buildEffectiveReminders({ properties: [property], rooms: [room], tenants: [tenant], contracts: [], rentPayments: [], deposits: [deposit], waivedPaymentIds: new Set(), includeBackupReminder: false, today: "2026-08-12" }).filter((item) => item.type === "deposit_return");
  assert.equal(reminder.tenantId, deposit.tenantId);
  assert.equal(reminder.navigationTarget.tenantId, deposit.tenantId);
  assert.equal(reminder.roomId, deposit.roomId);
  assert.equal(reminder.propertyId, deposit.propertyId);
});
