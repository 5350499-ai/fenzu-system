import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's strip-types test runner resolves the explicit source extension.
import { selectPendingDepositRecords, selectPendingDepositTenantIds } from "../lib/deposit-pending.ts";
import type { BusinessDeposit, BusinessTenant } from "../lib/business-data.ts";

function tenant(id: string, propertyId: string, status: string): BusinessTenant {
  return {
    id,
    propertyId,
    roomId: `${id}-room`,
    name: id,
    phone: "",
    wechat: "",
    source: "",
    monthlyRent: 0,
    depositAmount: 0,
    occupantCount: 1,
    status
  };
}

function deposit(id: string, tenantId: string, propertyId: string, overrides: Partial<BusinessDeposit> = {}): BusinessDeposit {
  return {
    id,
    propertyId,
    roomId: `${tenantId}-room`,
    tenantId,
    type: "收取",
    amount: 300,
    status: "待退",
    transactionDate: "2026-08-01",
    notes: "",
    ...overrides
  };
}

test("DEPOSIT_PENDING_METRIC_DETAIL_PARITY_TEST", () => {
  const tenants = [
    tenant("moved-out-linked", "property-a", "已退租"),
    tenant("moved-out-ordinary", "property-b", "已退租"),
    tenant("active", "property-a", "在租"),
    tenant("processed", "property-a", "已退租"),
    tenant("archived", "property-a", "已归档")
  ];
  const deposits = [
    deposit("linked-pending", "moved-out-linked", "property-a", { notes: "[收租押金:payment-1]" }),
    deposit("ordinary-pending", "moved-out-ordinary", "property-b"),
    deposit("active-pending", "active", "property-a"),
    deposit("processed", "processed", "property-a", { status: "已退" }),
    deposit("archived-pending", "archived", "property-a")
  ];

  const records = selectPendingDepositRecords(deposits, tenants);
  assert.deepEqual(records.map((item) => item.id), ["linked-pending", "ordinary-pending"]);
  assert.equal(selectPendingDepositTenantIds(deposits, tenants).size, records.length);
});

test("DEPOSIT_PENDING_PROPERTY_SCOPE_PARITY_TEST", () => {
  const tenants = [tenant("a", "property-a", "已退租"), tenant("b", "property-b", "已退租")];
  const deposits = [deposit("deposit-a", "a", "property-a"), deposit("deposit-b", "b", "property-b")];
  const scoped = selectPendingDepositRecords(deposits, tenants, new Set(["property-b"]));
  assert.equal(selectPendingDepositTenantIds(deposits, tenants, new Set(["property-b"])).size, scoped.length);
  assert.deepEqual(scoped.map((item) => item.id), ["deposit-b"]);
});

test("DEPOSIT_PENDING_ZERO_AMOUNT_AND_LIFECYCLE_TEST", () => {
  const tenants = [tenant("zero", "property-a", "已退租"), tenant("active", "property-a", "在租")];
  const deposits = [
    deposit("zero-pending", "zero", "property-a", { amount: 0 }),
    deposit("active-zero", "active", "property-a", { amount: 0 })
  ];
  assert.deepEqual(selectPendingDepositRecords(deposits, tenants).map((item) => item.id), ["zero-pending"]);
});
