import type { BusinessRentPayment, BusinessTenant } from "./business-data";

export function paymentCoverageStart(payment: BusinessRentPayment) {
  return payment.coverageStartDate || monthStart(payment.rentMonth);
}

export function paymentCoverageEnd(payment: BusinessRentPayment) {
  return payment.coverageEndDate || monthEnd(payment.rentMonth);
}

export function latestCoveragePayment(payments: BusinessRentPayment[]) {
  return [...payments]
    .filter((payment) => !isVoided(payment.notes))
    .sort((a, b) => paymentCoverageEnd(b).localeCompare(paymentCoverageEnd(a)))[0] || null;
}

export function latestCoverageForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.tenantId === tenantId));
}

export function latestCoverageForRoom(roomId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.roomId === roomId));
}

export function isCoverageExpired(payment: BusinessRentPayment | null, today = todayString()) {
  if (!payment) return false;
  const endDate = paymentCoverageEnd(payment);
  return Boolean(endDate && endDate < today);
}

export function coverageLabel(payment: BusinessRentPayment | null) {
  return payment ? paymentCoverageEnd(payment) || "-" : "-";
}

export function overdueReferenceAmount(payment: BusinessRentPayment | null, tenant?: BusinessTenant) {
  if (!payment) return 0;
  return Number(payment.amountDue || tenant?.monthlyRent || 0);
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

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
