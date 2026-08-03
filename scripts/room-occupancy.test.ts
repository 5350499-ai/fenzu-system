import assert from "node:assert/strict";
import { calculateOccupancySummary, resolvePropertyOccupancyStart } from "../lib/room-occupancy";

const property = { id: "p", name: "Property", address: "", city: "" } as any;
const room = (id: string, propertyId = "p") => ({ id, propertyId, name: id }) as any;
const payment = (overrides: Record<string, unknown> = {}) => ({
  id: "payment",
  propertyId: "p",
  roomId: "r1",
  tenantId: "tenant",
  coverageStartDate: "2026-06-28",
  coverageEndDate: "2026-07-27",
  paymentStatus: "received",
  incomeType: "rent",
  amountPaid: 300,
  ...overrides
}) as any;

assert.equal(resolvePropertyOccupancyStart(property, [{ id: "tenant", propertyId: "p", roomId: "r1", status: "retired" } as any], [{ propertyId: "p", tenantId: "tenant", roomId: "r1", startDate: "2026-07-05", status: "ended" } as any], [payment()]), "2026-06-01");

const month = (start: string, end: string, payments: any[]) => calculateOccupancySummary(
  [{ ...property, occupancyTrackingStartDate: "2026-06-01" }],
  [room("r1")],
  [],
  [],
  payments,
  { start, end },
  end
);

assert.deepEqual([month("2026-06-01", "2026-06-30", [payment()]).rentedDays, month("2026-07-01", "2026-07-31", [payment()]).rentedDays], [3, 27]);
assert.equal(month("2026-06-01", "2026-06-30", [payment(), payment({ id: "duplicate" })]).rentedDays, 3);
assert.equal(month("2026-06-01", "2026-06-30", [payment({ notes: "[void]" }), payment({ incomeType: "other" })]).rentedDays, 0);

const twoPeople = month("2026-06-01", "2026-06-30", [payment(), payment({ id: "second", tenantId: "second" })]);
assert.equal(twoPeople.rentedDays, 3);
assert.equal(twoPeople.rate, 100 * 3 / 30);

const combined = calculateOccupancySummary(
  [{ ...property, occupancyTrackingStartDate: "2026-06-01" }, { ...property, id: "p2", occupancyTrackingStartDate: "2026-06-15" }],
  [room("r1"), room("r2", "p2")],
  [],
  [],
  [payment(), payment({ id: "p2", propertyId: "p2", roomId: "r2", coverageStartDate: "2026-06-15", coverageEndDate: "2026-06-30" })],
  { start: "2026-06-01", end: "2026-06-30" },
  "2026-06-30"
);
assert.deepEqual([combined.rentedDays, combined.availableDays], [19, 46]);
console.log("room occupancy tests passed");
