import assert from "node:assert/strict";
import type { BusinessRentPayment } from "../lib/business-data";
import { buildRentPaymentEditPayload, normalizeLocalDate, validateRentPaymentDates } from "../lib/rent-payment-edit";

const original: BusinessRentPayment = {
  id: "payment-504",
  createdAt: "2026-07-01T10:00:00.000Z",
  propertyId: "property-1",
  roomId: "room-504",
  tenantId: "tenant-504",
  incomeItem: "504",
  rentMonth: "2026-08",
  paymentDate: "2026-07-29",
  amountDue: 460,
  amountPaid: 460,
  amountUnpaid: 0,
  coverageStartDate: "2026-07-29",
  coverageEndDate: "2026-08-29",
  paymentMethod: "杞处",
  receivedBy: "A",
  paymentStatus: "宸叉敹",
  isOverdue: false,
  notes: "原备注"
};

const edited = buildRentPaymentEditPayload(original, {
  ...original,
  paymentDate: "2026-07-30",
  coverageStartDate: "2026-08-01",
  coverageEndDate: "2026-08-31",
  amountDue: 480,
  amountPaid: 480,
  notes: "新备注"
});

assert.equal(edited.id, original.id);
assert.equal(edited.createdAt, original.createdAt);
assert.equal(edited.rentMonth, original.rentMonth);
assert.equal(edited.coverageStartDate, "2026-08-01");
assert.equal(edited.coverageEndDate, "2026-08-31");
assert.equal(edited.paymentDate, "2026-07-30");
assert.equal(edited.amountPaid, 480);
assert.equal(edited.notes, "新备注");
assert.equal(normalizeLocalDate("2026-08-01"), "2026-08-01");
assert.equal(normalizeLocalDate("2026-08-01T00:00:00.000Z"), "");
assert.equal(validateRentPaymentDates(edited), "");
assert.match(validateRentPaymentDates({ coverageStartDate: "2026-09-01", coverageEndDate: "2026-08-31" }), /不能晚于/);

// The edit is an in-place replacement, not an append/new payment.
const payments = [original, { ...original, id: "payment-other" }];
const replaced = payments.map((payment) => payment.id === edited.id ? edited : payment);
assert.equal(replaced.length, payments.length);
assert.equal(replaced.filter((payment) => payment.id === edited.id).length, 1);

console.log("rent-payment-edit tests passed");
