import type { BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "./business-data";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { inspectTenantRentState, rentPeriodToday, type RentPeriodState } from "./rent-period-state.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { isArchivedTenantStatus } from "./tenant-archive.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { isEndedTenantStatus } from "./tenant-sorting.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { tenantDebtHref } from "./reminder-navigation.ts";

/** A payment-specific, currently actionable rent-debt fact. */
export type DebtCase = {
  debtCaseId: string;
  paymentId: string;
  tenantId: string;
  propertyId: string;
  roomId: string;
  tenantName: string;
  propertyName: string;
  roomName: string;
  coverageStart: string;
  coverageEnd: string;
  businessToday: string;
  daysOverdue: number;
  amountDue: number;
  amountPaid: number;
  remainingAmount: number;
  isOpen: true;
  isWaived: false;
  isVoid: false;
  isSettled: false;
  debtKind: "current" | "historical";
  tenantLifecycle: "current" | "moved_out" | "archived_current" | "archived_moved_out" | "other";
  canCollect: boolean;
  canWaive: boolean;
  navigation: { tenantId: string; paymentId: string; focus: "debt"; tenantHref: string };
};

export type DebtCaseSnapshot = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  rentPayments: BusinessRentPayment[];
  waivedPaymentIds?: ReadonlySet<string>;
  today?: string;
};

export type DebtCaseInspection = {
  tenantId: string;
  paymentId: string;
  reason: "open-debt-case" | "closed-waived" | "closed-void" | "closed-settled" | "not-yet-overdue" | "excluded";
  debtCaseId?: string;
  coverageEnd: string;
  remainingAmount: number;
  waived: boolean;
  void: boolean;
  settled: boolean;
};

/**
 * The sole conversion from RentDomain facts to business-facing debt cases.
 * It deliberately follows payment -> tenant/property/room; it never infers a
 * historical debt from the room's current tenant.
 */
export function getDebtCases(snapshot: DebtCaseSnapshot): DebtCase[] {
  const today = snapshot.today || rentPeriodToday();
  const waivedPaymentIds = snapshot.waivedPaymentIds || new Set<string>();
  const properties = new Map(snapshot.properties.map((item) => [item.id, item]));
  const rooms = new Map(snapshot.rooms.map((item) => [item.id, item]));
  const cases: DebtCase[] = [];

  for (const tenant of snapshot.tenants) {
    const payments = snapshot.rentPayments.filter((payment) => payment.tenantId === tenant.id);
    const reconciliation = inspectTenantRentState({ tenant, payments, today, waivedPaymentIds });
    for (const state of reconciliation.openDebtPeriods) {
      const payment = payments.find((item) => item.id === state.paymentId);
      if (!payment || !state.paymentId) continue;
      cases.push(toDebtCase({ tenant, payment, state, latestPaymentId: reconciliation.latestPeriod.paymentId, today, property: properties.get(payment.propertyId), room: rooms.get(payment.roomId) }));
    }
  }
  return cases.sort((left, right) => left.coverageEnd.localeCompare(right.coverageEnd) || left.paymentId.localeCompare(right.paymentId));
}

export function getTenantDebtCases(tenantId: string, debtCases: readonly DebtCase[]) {
  return debtCases.filter((item) => item.tenantId === tenantId);
}

export function getDebtCaseByPaymentId(paymentId: string | null | undefined, debtCases: readonly DebtCase[]) {
  return paymentId ? debtCases.find((item) => item.paymentId === paymentId) || null : null;
}

/** Canonical active receivable total. Waived and settled periods are excluded
 * by getDebtCases, while the original payment facts remain unchanged. */
export function getOutstandingReceivableAmount(snapshot: DebtCaseSnapshot) {
  return getDebtCases(snapshot).reduce((total, debtCase) => total + debtCase.remainingAmount, 0);
}

/** Read-only reconciliation output for fixture tests and future diagnostics. */
export function inspectDebtCases(snapshot: DebtCaseSnapshot): DebtCaseInspection[] {
  const cases = getDebtCases(snapshot);
  const caseByPaymentId = new Map(cases.map((item) => [item.paymentId, item]));
  const today = snapshot.today || rentPeriodToday();
  const waivedPaymentIds = snapshot.waivedPaymentIds || new Set<string>();
  return snapshot.tenants.flatMap((tenant) => {
    const reconciliation = inspectTenantRentState({ tenant, payments: snapshot.rentPayments.filter((item) => item.tenantId === tenant.id), today, waivedPaymentIds });
    return reconciliation.entries.map((entry) => {
      const debtCase = caseByPaymentId.get(entry.paymentId);
      const reason = debtCase ? "open-debt-case" : entry.reason === "closed-waived" ? "closed-waived" : entry.reason === "closed-void" ? "closed-void" : entry.reason === "closed-settled" ? "closed-settled" : entry.reason === "not-yet-overdue" ? "not-yet-overdue" : "excluded";
      return { tenantId: tenant.id, paymentId: entry.paymentId, reason, debtCaseId: debtCase?.debtCaseId, coverageEnd: entry.state.coverageEndDate, remainingAmount: entry.state.remainingAmount, waived: entry.state.waived, void: entry.reason === "closed-void", settled: entry.reason === "closed-settled" };
    });
  });
}

function toDebtCase({ tenant, payment, state, latestPaymentId, today, property, room }: { tenant: BusinessTenant; payment: BusinessRentPayment; state: RentPeriodState; latestPaymentId: string | null; today: string; property?: BusinessProperty; room?: BusinessRoom }): DebtCase {
  const archived = isArchivedTenantStatus(tenant.status || "");
  const movedOut = isEndedTenantStatus(tenant.status || "");
  const tenantLifecycle = archived ? (tenant.actualMoveOutDate ? "archived_moved_out" : "archived_current") : movedOut ? "moved_out" : state.lifecycle === "current" ? "current" : "other";
  const debtKind = latestPaymentId === payment.id && tenantLifecycle === "current" ? "current" : "historical";
  return {
  debtCaseId: `rent_debt:${payment.id}`,
    paymentId: payment.id,
    tenantId: tenant.id,
    propertyId: payment.propertyId,
    roomId: payment.roomId,
    tenantName: tenant.name || "未命名租客",
    propertyName: property?.name?.trim() || "房源",
    roomName: room?.name?.trim() || room?.roomNumber?.trim() || "房间",
    coverageStart: state.coverageStartDate,
    coverageEnd: state.coverageEndDate,
    businessToday: today,
    daysOverdue: state.overdueDays,
    amountDue: state.amountDue,
    amountPaid: state.amountPaid,
    remainingAmount: state.remainingAmount,
    isOpen: true,
    isWaived: false,
    isVoid: false,
    isSettled: false,
    debtKind,
    tenantLifecycle,
    canCollect: state.canCollect,
    canWaive: state.canWaive,
    navigation: { tenantId: tenant.id, paymentId: payment.id, focus: "debt", tenantHref: tenantDebtHref(tenant.id, payment.id) }
  };
}
