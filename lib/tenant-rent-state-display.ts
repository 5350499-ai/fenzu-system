import type { BusinessRentPayment, BusinessTenant } from "./business-data";
// @ts-expect-error Node's strip-types test runner needs an explicit TypeScript extension here.
import { getLatestRentPeriodState, getOpenRentDebtPeriodStates, type RentPeriodState } from "./rent-period-state.ts";

export type TenantRentDisplay = {
  state: RentPeriodState;
  openDebtPeriodStates: RentPeriodState[];
  hasHistoricalOpenDebt: boolean;
  historicalDebtLabel: string;
  displayStatus: string;
  expiry: {
    daysRemaining: number | null;
    endDate: string;
    level: "normal" | "yellow" | "orange" | "red";
    label: string;
    sortGroup: number;
  };
};

/**
 * Tenant-list presentation adapter. It owns no debt calculation: every rent
 * status comes from the same latest payment state consumed by the Reminder
 * Engine, including payment-specific waivers.
 */
export function getTenantRentDisplay({
  tenant,
  payments,
  waivedPaymentIds,
  today
}: {
  tenant: BusinessTenant;
  payments: BusinessRentPayment[];
  waivedPaymentIds?: ReadonlySet<string>;
  today?: string;
}): TenantRentDisplay {
  const state = getLatestRentPeriodState({ tenant, payments, waivedPaymentIds, today });
  const openDebtPeriodStates = getOpenRentDebtPeriodStates({ tenant, payments, waivedPaymentIds, today });
  const hasHistoricalOpenDebt = openDebtPeriodStates.some((period) => period.paymentId !== state.paymentId);
  const historicalDebtLabel = hasHistoricalOpenDebt ? "历史欠费" : "";
  const inactiveLifecycle = state.lifecycle !== "current";
  const defaultExpiry = { daysRemaining: null, endDate: "", level: "normal" as const, label: "", sortGroup: inactiveLifecycle ? 5 : 4 };
  if (inactiveLifecycle) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "已结束", expiry: defaultExpiry };
  if (!state.paymentId) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: "无收款", expiry: defaultExpiry };
  if (state.isExpired && state.hasOpenDebtFollowUp) {
    return {
      state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel,
      displayStatus: "欠租",
      expiry: { daysRemaining: state.coverageDaysRemaining, endDate: state.coverageEndDate, level: "red", label: `已逾期${state.overdueDays}天`, sortGroup: 0 }
    };
  }
  const days = state.coverageDaysRemaining;
  if (days === null) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: defaultExpiry };
  if (days >= 31) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "normal", label: "", sortGroup: 3 } };
  if (days >= 16) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "yellow", label: `剩余${days}天`, sortGroup: 2 } };
  if (days >= 1) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "orange", label: `即将到期${days}天`, sortGroup: 1 } };
  if (days === 0) return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "red", label: "今日到期", sortGroup: 0 } };
  // An expired paid or waived period remains historical coverage only. It is
  // not displayed as a currently actionable debt on the tenant list.
  return { state, openDebtPeriodStates, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "normal", label: "", sortGroup: 3 } };
}
