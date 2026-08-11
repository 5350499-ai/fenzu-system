import type { BusinessRentPayment, BusinessTenant } from "./business-data";

/**
 * Pure, payment-specific view of a rent coverage period.
 * Historical payment facts remain immutable: a waiver comes from the
 * append-only audit-log projection and never changes payment amounts.
 */
export type RentPeriodTenantLifecycle = "current" | "archived" | "ended" | "other";
export type RentPeriodReminderStage = "upcoming" | "urgent" | "critical" | "overdue" | null;

export type RentPeriodState = {
  tenantId: string;
  paymentId: string | null;
  today: string;
  lifecycle: RentPeriodTenantLifecycle;
  coverageStartDate: string;
  coverageEndDate: string;
  hasValidRentPayment: boolean;
  hasCoveragePeriod: boolean;
  coverageDaysRemaining: number | null;
  isCoverageActive: boolean;
  isDueToday: boolean;
  isExpired: boolean;
  overdueDays: number;
  reminderStage: RentPeriodReminderStage;
  amountDue: number;
  amountPaid: number;
  amountUnpaidRecorded: number;
  remainingAmount: number;
  hasHistoricalDebtEvent: boolean;
  hasUnresolvedHistoricalDebt: boolean;
  hasCurrentUnresolvedDebt: boolean;
  isZeroAmountOverdueEvent: boolean;
  waived: boolean;
  waiverPaymentId: string | null;
  collectionRequired: boolean;
  canCollect: boolean;
  canWaive: boolean;
  hasOpenDebtFollowUp: boolean;
};

export type RentPeriodStateInput = {
  tenant: Pick<BusinessTenant, "id" | "status">;
  payment?: BusinessRentPayment | null;
  today?: string;
  waivedPaymentIds?: ReadonlySet<string>;
};

export type LatestRentPeriodStateInput = Omit<RentPeriodStateInput, "payment"> & {
  payments: BusinessRentPayment[];
};

const ARCHIVED_STATUS = "\u5df2\u5f52\u6863";
const ENDED_MARKERS = ["\u5df2\u9000\u79df", "\u5df2\u7ed3\u675f", "\u975e\u5728\u79df", "moved_out", "ended"];
const NOT_CURRENT_MARKERS = [...ENDED_MARKERS, "\u7a7a\u7f6e", "\u9884\u5b9a\u5165\u4f4f", "\u9884\u7ea6\u5165\u4f4f"];
const CURRENT_MARKERS = ["\u5728\u79df", "\u5373\u5c06\u9000\u79df", "\u6b20\u79df"];

export function getRentPeriodState({
  tenant,
  payment = null,
  today = rentPeriodToday(),
  waivedPaymentIds = new Set<string>()
}: RentPeriodStateInput): RentPeriodState {
  const lifecycle = classifyRentPeriodTenantLifecycle(tenant.status);
  const paymentId = payment?.id || null;
  const hasValidRentPayment = Boolean(payment && isValidRentPeriodPayment(payment));
  const coverageStartDate = payment?.coverageStartDate || "";
  const coverageEndDate = payment?.coverageEndDate || "";
  // Existing coverage rules have always accepted legacy rows that only retain
  // a coverage end date.  Keep that compatibility while exposing the missing
  // start date explicitly through coverageStartDate.
  const hasCoveragePeriod = hasValidRentPayment && Boolean(coverageEndDate);
  const coverageDaysRemaining = hasCoveragePeriod ? rentPeriodDayDifference(coverageEndDate, today) : null;
  const isDueToday = coverageDaysRemaining === 0;
  const isExpired = coverageDaysRemaining !== null && coverageDaysRemaining < 0;
  const overdueDays = isExpired && coverageDaysRemaining !== null ? Math.abs(coverageDaysRemaining) : 0;
  const isCoverageActive = hasCoveragePeriod && Boolean(coverageStartDate) && coverageStartDate <= today && today <= coverageEndDate;
  const amountDue = money(payment?.amountDue);
  const amountPaid = money(payment?.amountPaid);
  const amountUnpaidRecorded = money(payment?.amountUnpaid);
  const remainingAmount = rentPeriodRemainingAmount(payment);
  const waived = Boolean(paymentId && waivedPaymentIds.has(paymentId));
  const reminderStage = coverageReminderStage(coverageDaysRemaining);
  const hasHistoricalDebtEvent = hasValidRentPayment && isExpired;
  const hasUnresolvedHistoricalDebt = hasHistoricalDebtEvent && remainingAmount > 0;
  const hasCurrentUnresolvedDebt = hasUnresolvedHistoricalDebt && !waived;
  const isZeroAmountOverdueEvent = hasHistoricalDebtEvent && amountDue === 0 && amountUnpaidRecorded === 0;
  const collectionRequired = hasCurrentUnresolvedDebt;
  // This is a domain fact, not final reminder presentation. The future Reminder
  // Engine applies archive/UI policy to this candidate without changing debt.
  const hasOpenDebtFollowUp = !waived && (hasCurrentUnresolvedDebt || isZeroAmountOverdueEvent);

  return {
    tenantId: tenant.id,
    paymentId,
    today,
    lifecycle,
    coverageStartDate,
    coverageEndDate,
    hasValidRentPayment,
    hasCoveragePeriod,
    coverageDaysRemaining,
    isCoverageActive,
    isDueToday,
    isExpired,
    overdueDays,
    reminderStage,
    amountDue,
    amountPaid,
    amountUnpaidRecorded,
    remainingAmount,
    hasHistoricalDebtEvent,
    hasUnresolvedHistoricalDebt,
    hasCurrentUnresolvedDebt,
    isZeroAmountOverdueEvent,
    waived,
    waiverPaymentId: waived ? paymentId : null,
    collectionRequired,
    canCollect: collectionRequired,
    // A waiver closes an expired payment-specific event, including a zero-balance event.
    canWaive: hasOpenDebtFollowUp,
    hasOpenDebtFollowUp
  };
}

/** Select the same latest valid period used by legacy coverage callers. */
export function latestValidRentPeriodPayment(payments: BusinessRentPayment[]) {
  return [...payments]
    .filter(isValidRentPeriodPayment)
    .sort((left, right) => rentPeriodEntryTimestamp(right).localeCompare(rentPeriodEntryTimestamp(left)))[0] || null;
}

export function getLatestRentPeriodState({ payments, ...input }: LatestRentPeriodStateInput) {
  return getRentPeriodState({ ...input, payment: latestValidRentPeriodPayment(payments) });
}

export function classifyRentPeriodTenantLifecycle(status = ""): RentPeriodTenantLifecycle {
  const normalized = status.trim();
  const lower = normalized.toLowerCase();
  if (normalized === ARCHIVED_STATUS || lower === "archived") return "archived";
  if (ENDED_MARKERS.some((marker) => normalized.includes(marker) || lower.includes(marker))) return "ended";
  if (NOT_CURRENT_MARKERS.some((marker) => normalized.includes(marker) || lower.includes(marker))) return "other";
  if (CURRENT_MARKERS.some((marker) => normalized.includes(marker) || lower.includes(marker))) return "current";
  return "other";
}

export function isRentPeriodRentIncome(payment: Pick<BusinessRentPayment, "incomeType">) {
  return !payment.incomeType || payment.incomeType === "\u623f\u79df\u6536\u5165" || payment.incomeType === "\u7eed\u4ea4\u623f\u79df";
}

export function isRentPeriodVoided(payment: Pick<BusinessRentPayment, "paymentStatus" | "notes">) {
  const status = payment.paymentStatus || "";
  const notes = payment.notes || "";
  return status.includes("\u5df2\u4f5c\u5e9f") || status.toLowerCase().includes("void") || notes.includes("[\u5df2\u4f5c\u5e9f]");
}

export function isValidRentPeriodPayment(payment: BusinessRentPayment) {
  return isRentPeriodRentIncome(payment) && !isRentPeriodVoided(payment);
}

export function rentPeriodRemainingAmount(payment?: Pick<BusinessRentPayment, "amountDue" | "amountPaid" | "amountUnpaid"> | null) {
  if (!payment) return 0;
  const dueCents = toCents(payment.amountDue);
  const paidCents = toCents(payment.amountPaid);
  const unpaidCents = toCents(payment.amountUnpaid);
  return fromCents(dueCents > 0 ? Math.max(dueCents - paidCents, 0) : Math.max(unpaidCents, 0));
}

export function rentPeriodToday() {
  return new Date().toISOString().slice(0, 10);
}

export function rentPeriodDayDifference(target: string, from: string) {
  const targetDate = new Date(`${target}T12:00:00`);
  const fromDate = new Date(`${from}T12:00:00`);
  return Math.round((targetDate.getTime() - fromDate.getTime()) / 86400000);
}

function coverageReminderStage(daysRemaining: number | null): RentPeriodReminderStage {
  if (daysRemaining === null || daysRemaining > 10) return null;
  if (daysRemaining < 0) return "overdue";
  if (daysRemaining === 0) return "critical";
  if (daysRemaining <= 3) return "urgent";
  return "upcoming";
}

function rentPeriodEntryTimestamp(payment: BusinessRentPayment) {
  return payment.createdAt || payment.paymentDate || payment.rentMonth || "";
}

function toCents(value: unknown) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function fromCents(cents: number) {
  return cents / 100;
}

function money(value: unknown) {
  return fromCents(toCents(value));
}
