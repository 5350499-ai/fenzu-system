import type { BusinessRentPayment, BusinessTenant } from "./business-data";
import type { DebtCase } from "./debt-case";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { getLatestRentPeriodState, type RentPeriodState } from "./rent-period-state.ts";

export type TenantDebtDisplay = {
  state: RentPeriodState;
  debtCases: DebtCase[];
  stateKind: "normal" | "upcoming" | "current_overdue" | "historical_debt" | "current_overdue_historical_debt" | "no_period";
  hasHistoricalOpenDebt: boolean;
  historicalDebtLabel: string;
  displayStatus: string;
  expiry: { daysRemaining: number | null; endDate: string; level: "normal" | "yellow" | "orange" | "red"; label: string; sortGroup: number };
};

/** Presentation-only label for the Tenant List rent row; facts come from RentPeriodState. */
export function tenantRentRowLabel(expiry: TenantDebtDisplay["expiry"]): string {
  if (expiry.daysRemaining === null) return "无覆盖日期";
  if (expiry.daysRemaining > 0) return `剩余${expiry.daysRemaining}天`;
  if (expiry.daysRemaining === 0) return "今日到期";
  return `已逾期${Math.abs(expiry.daysRemaining)}天`;
}

/** Maps the existing coverage level to the Tenant List semantic color classes. */
export function tenantRentRowTone(expiry: TenantDebtDisplay["expiry"]): "green" | "yellow" | "orange" | "red" | "neutral" {
  if (!expiry.endDate || expiry.daysRemaining === null) return "neutral";
  return expiry.level === "normal" ? "green" : expiry.level;
}

/** Tenant-list adapter: latest coverage comes from RentDomain; debt only from DebtCase. */
export function getTenantDebtDisplay({ tenant, payments, debtCases, waivedPaymentIds, today }: { tenant: BusinessTenant; payments: BusinessRentPayment[]; debtCases: DebtCase[]; waivedPaymentIds?: ReadonlySet<string>; today?: string }): TenantDebtDisplay {
  const state = getLatestRentPeriodState({ tenant, payments, waivedPaymentIds, today });
  const currentDebt = debtCases.some((item) => item.paymentId === state.paymentId && item.debtKind === "current");
  const hasHistoricalOpenDebt = debtCases.some((item) => item.debtKind === "historical");
  const historicalDebtLabel = hasHistoricalOpenDebt ? "历史欠费" : "";
  const inactive = state.lifecycle !== "current";
  const fallback = { daysRemaining: null, endDate: "", level: "normal" as const, label: "", sortGroup: inactive ? 5 : 4 };
  if (inactive) return { state, debtCases, stateKind: hasHistoricalOpenDebt ? "historical_debt" : "normal", hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "已结束", expiry: fallback };
  if (!state.paymentId) return { state, debtCases, stateKind: hasHistoricalOpenDebt ? "historical_debt" : "no_period", hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: "无收款", expiry: fallback };
  if (currentDebt) return { state, debtCases, stateKind: hasHistoricalOpenDebt ? "current_overdue_historical_debt" : "current_overdue", hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: "欠租", expiry: { daysRemaining: state.coverageDaysRemaining, endDate: state.coverageEndDate, level: "red", label: `已逾期${state.overdueDays}天`, sortGroup: 0 } };
  const days = state.coverageDaysRemaining;
  const stateKind = hasHistoricalOpenDebt ? "historical_debt" : "normal";
  if (days === null) return { state, debtCases, stateKind, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: fallback };
  if (days >= 31) return { state, debtCases, stateKind, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "normal", label: "", sortGroup: 3 } };
  if (days >= 16) return { state, debtCases, stateKind, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "yellow", label: `剩余${days}天`, sortGroup: 2 } };
  if (days >= 1) return { state, debtCases, stateKind: hasHistoricalOpenDebt ? "historical_debt" : "upcoming", hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "orange", label: `即将到期${days}天`, sortGroup: 1 } };
  if (days === 0) return { state, debtCases, stateKind: hasHistoricalOpenDebt ? "historical_debt" : "upcoming", hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "red", label: "今日到期", sortGroup: 0 } };
  return { state, debtCases, stateKind, hasHistoricalOpenDebt, historicalDebtLabel, displayStatus: tenant.status || "在租", expiry: { daysRemaining: days, endDate: state.coverageEndDate, level: "normal", label: "", sortGroup: 4 } };
}
