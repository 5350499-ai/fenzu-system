import type { BusinessRentPayment, BusinessTenant } from "./business-data";

export function paymentCoverageStart(payment: BusinessRentPayment) {
  return payment.coverageStartDate || monthStart(payment.rentMonth);
}

export function paymentCoverageEnd(payment: BusinessRentPayment) {
  return payment.coverageEndDate || monthEnd(payment.rentMonth);
}

export function latestCoveragePayment(payments: BusinessRentPayment[]) {
  return [...payments]
    .filter((payment) => isRentIncome(payment) && !isVoided(payment.notes))
    .sort((a, b) => paymentCoverageEnd(b).localeCompare(paymentCoverageEnd(a)))[0] || null;
}

export function latestCoverageForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.tenantId === tenantId));
}

export function latestCoverageForRoom(roomId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.roomId === roomId));
}

export function isCoverageExpired(payment: BusinessRentPayment | null, today = todayString()) {
  if (!payment || !isRentIncome(payment)) return false;
  const endDate = paymentCoverageEnd(payment);
  return Boolean(endDate && endDate < today);
}

export type RentCoverageReminderStage = {
  daysRemaining: number;
  overdueDays: number;
  level: "upcoming" | "urgent" | "critical" | "overdue";
};

export type RentCollectionReminderStage = RentCoverageReminderStage & {
  reason: "coverage" | "payment_day";
  daysPastPaymentDay: number;
};

export function rentCollectionReminderStage(
  tenant: BusinessTenant,
  payment: BusinessRentPayment | null,
  today = todayString()
): RentCollectionReminderStage | null {
  const coverageStage = rentCoverageReminderStage(payment, today);
  if (coverageStage?.level === "overdue") {
    return { ...coverageStage, reason: "coverage", daysPastPaymentDay: 0 };
  }

  const paymentDay = Math.min(28, Math.max(1, Number(tenant.paymentDay || 20)));
  const dueDate = `${today.slice(0, 8)}${String(paymentDay).padStart(2, "0")}`;
  if (today < dueDate) return null;

  const currentMonthEnd = monthEnd(today.slice(0, 7));
  if (payment && paymentCoverageEnd(payment) > currentMonthEnd) return null;

  const daysPastPaymentDay = Math.max(0, dateDifference(today, dueDate));
  const level = daysPastPaymentDay >= 5 ? "critical" : daysPastPaymentDay >= 3 ? "urgent" : "upcoming";
  return {
    daysRemaining: 0,
    overdueDays: 0,
    level,
    reason: "payment_day",
    daysPastPaymentDay
  };
}

export function rentCoverageReminderStage(
  payment: BusinessRentPayment | null,
  today = todayString()
): RentCoverageReminderStage | null {
  if (!payment) return null;
  const endDate = paymentCoverageEnd(payment);
  if (!endDate) return null;
  const daysRemaining = dateDifference(endDate, today);
  if (daysRemaining > 10) return null;
  if (daysRemaining < 0) {
    return { daysRemaining, overdueDays: Math.abs(daysRemaining), level: "overdue" };
  }
  if (daysRemaining <= 3) return { daysRemaining, overdueDays: 0, level: "critical" };
  if (daysRemaining <= 5) return { daysRemaining, overdueDays: 0, level: "urgent" };
  return { daysRemaining, overdueDays: 0, level: "upcoming" };
}

export function coverageLabel(payment: BusinessRentPayment | null) {
  return payment ? paymentCoverageEnd(payment) || "-" : "-";
}

export function overdueReferenceAmount(payment: BusinessRentPayment | null, tenant?: BusinessTenant) {
  if (!payment) return 0;
  return Number(payment.amountDue || tenant?.monthlyRent || 0);
}

export function isRentIncome(payment: BusinessRentPayment) {
  return !payment.incomeType || payment.incomeType === "房租收入";
}

export function monthStart(month?: string) {
  if (!month) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return month.slice(0, 7) + "-01";
  if (/^\d{4}-\d{2}$/.test(month)) return `${month}-01`;
  return "";
}

export function monthEnd(month?: string) {
  const start = monthStart(month);
  if (!start) return "";
  const date = new Date(`${start}T00:00:00`);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date.toISOString().slice(0, 10);
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function dateDifference(target: string, from: string) {
  const targetDate = new Date(`${target}T12:00:00`);
  const fromDate = new Date(`${from}T12:00:00`);
  return Math.round((targetDate.getTime() - fromDate.getTime()) / 86400000);
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
