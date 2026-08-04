import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { buildSettlement, buildTransfers, hasSettlementOverlap } from "../lib/partner-settlement.ts";

const partners = [
  { id: "a", workspaceOwnerId: "w", legacyCode: "A", displayName: "蓓蓓", colorKey: null, sortOrder: 1, isActive: true, linkedAccountId: null, propertyCount: 1, currentPropertyCount: 1, futurePropertyCount: 0 },
  { id: "b", workspaceOwnerId: "w", legacyCode: "B", displayName: "峰峰", colorKey: null, sortOrder: 2, isActive: true, linkedAccountId: null, propertyCount: 1, currentPropertyCount: 1, futurePropertyCount: 0 },
  { id: "c", workspaceOwnerId: "w", legacyCode: null, displayName: "测试", colorKey: null, sortOrder: 3, isActive: true, linkedAccountId: null, propertyCount: 1, currentPropertyCount: 0, futurePropertyCount: 1 },
];
const shares = [
  { id: "a1", workspaceOwnerId: "w", propertyId: "p", partnerId: "a", percentage: 50, effectiveFrom: "2026-07-01", effectiveTo: "2026-08-31" },
  { id: "b1", workspaceOwnerId: "w", propertyId: "p", partnerId: "b", percentage: 50, effectiveFrom: "2026-07-01", effectiveTo: "2026-08-31" },
  { id: "a2", workspaceOwnerId: "w", propertyId: "p", partnerId: "a", percentage: 50, effectiveFrom: "2026-09-01", effectiveTo: null },
  { id: "b2", workspaceOwnerId: "w", propertyId: "p", partnerId: "b", percentage: 40, effectiveFrom: "2026-09-01", effectiveTo: null },
  { id: "c2", workspaceOwnerId: "w", propertyId: "p", partnerId: "c", percentage: 10, effectiveFrom: "2026-09-01", effectiveTo: null },
];

test("settlement splits a range at share effective dates", () => {
  const result = buildSettlement("p", { startDate: "2026-08-15", endDate: "2026-09-15" }, [{ id: "p" }], partners, shares, [
    { id: "income-1", propertyId: "p", roomId: "r", tenantId: "t", rentMonth: "2026-08", paymentDate: "2026-08-20", amountDue: 100, amountPaid: 100, amountUnpaid: 0, paymentMethod: "", receivedBy: "A", paymentStatus: "已收", isOverdue: false },
    { id: "income-2", propertyId: "p", roomId: "r", tenantId: "t", rentMonth: "2026-09", paymentDate: "2026-09-10", amountDue: 200, amountPaid: 200, amountUnpaid: 0, paymentMethod: "", receivedBy: "B", paymentStatus: "已收", isOverdue: false },
  ], [
    { id: "expense-1", propertyId: "p", roomId: "r", expenseMonth: "2026-09", category: "维护", amount: 50, paymentDate: "2026-09-10", paidBy: "A", isPaid: true },
  ]);
  assert.deepEqual(result.segments.map((segment) => [segment.startDate, segment.endDate, segment.shares.map((share) => share.percentage)]), [
    ["2026-08-15", "2026-08-31", [50, 50]],
    ["2026-09-01", "2026-09-15", [50, 40, 10]],
  ]);
  assert.equal(result.totalIncome, 300);
  assert.equal(result.totalExpense, 50);
  assert.equal(result.netProfit, 250);
  assert.equal(result.partners.find((partner) => partner.partnerId === "c")?.profitEntitlement, 15);
});

test("transfers are non-negative, settle cent balances, and support one partner", () => {
  const transfers = buildTransfers([
    { partnerId: "a", displayName: "A", legacyCode: "A", collected: 0, advanced: 0, actualRetained: 0, profitEntitlement: 50, balance: -50 },
    { partnerId: "b", displayName: "B", legacyCode: "B", collected: 100, advanced: 0, actualRetained: 100, profitEntitlement: 50, balance: 50 },
  ]);
  assert.deepEqual(transfers, [{ fromPartnerId: "b", toPartnerId: "a", amount: 50 }]);
  assert.deepEqual(buildTransfers([{ partnerId: "a", displayName: "A", legacyCode: "A", collected: 100, advanced: 0, actualRetained: 100, profitEntitlement: 100, balance: 0 }]), []);
});

test("only confirmed overlapping batches block a new settlement", () => {
  const candidate = { propertyId: "p", periodStart: "2026-08-04", periodEnd: "2026-08-31" };
  assert.equal(hasSettlementOverlap(candidate, [{ propertyId: "p", periodStart: "2026-08-01", periodEnd: "2026-08-03", status: "confirmed" }]), false);
  assert.equal(hasSettlementOverlap(candidate, [{ propertyId: "p", periodStart: "2026-08-01", periodEnd: "2026-08-10", status: "confirmed" }]), true);
  assert.equal(hasSettlementOverlap(candidate, [{ propertyId: "p", periodStart: "2026-08-01", periodEnd: "2026-08-10", status: "reversed" }]), false);
});
