import type { BusinessRentPayment, BusinessRoom, BusinessTenant } from "./business-data";

export function paymentCoverageStart(payment: BusinessRentPayment) {
  return payment.coverageStartDate || monthStart(payment.rentMonth);
}

export function paymentCoverageEnd(payment: BusinessRentPayment) {
  return payment.coverageEndDate || monthEnd(payment.rentMonth);
}

export function latestCoveragePayment(payments: BusinessRentPayment[]) {
  return [...payments]
    .filter(isValidCoveragePayment)
    .sort((a, b) => paymentEntryTimestamp(b).localeCompare(paymentEntryTimestamp(a)))[0] || null;
}

export function latestCoverageForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.tenantId === tenantId));
}

export function latestRentPaymentForTenantByPaymentDate(tenantId: string, payments: BusinessRentPayment[]) {
  return payments
    .filter((payment) => payment.tenantId === tenantId && isRentIncome(payment) && !isVoided(payment.notes) && Number(payment.amountDue || 0) > 0)
    .sort((a, b) => (b.paymentDate || b.rentMonth || "").localeCompare(a.paymentDate || a.rentMonth || ""))[0] || null;
}

// Legacy payment-created tenants may have missed their persistent rent standard.
// Repair only a zero value from the latest rent payment; never change payment history.
export function repairMissingTenantMonthlyRents(tenants: BusinessTenant[], payments: BusinessRentPayment[]) {
  let changed = false;
  const repaired = tenants.map((tenant) => {
    if (Number(tenant.monthlyRent || 0) > 0) return tenant;
    const latest = latestRentPaymentForTenantByPaymentDate(tenant.id, payments);
    const monthlyRent = Number(latest?.amountDue || 0);
    if (monthlyRent <= 0) return tenant;
    changed = true;
    return { ...tenant, monthlyRent };
  });
  return changed ? repaired : tenants;
}

export function latestCoverageForRoom(roomId: string, payments: BusinessRentPayment[]) {
  return latestCoveragePayment(payments.filter((payment) => payment.roomId === roomId));
}

export function activeCoveragePaymentForTenant(tenantId: string, payments: BusinessRentPayment[], today = todayString()) {
  return latestCoveragePayment(payments.filter((payment) => payment.tenantId === tenantId && isPaymentActiveOnDate(payment, today)));
}

export function activeCoveragePaymentForRoom(roomId: string, payments: BusinessRentPayment[], today = todayString()) {
  return latestCoveragePayment(payments.filter((payment) => payment.roomId === roomId && isPaymentActiveOnDate(payment, today)));
}

export function isCurrentRentalTenant(tenant: BusinessTenant) {
  const status = tenant.status || "";
  if (["已退租", "已归档", "已结束", "非在租"].some((item) => status.includes(item))) return false;
  if (status.includes("空置") || status.includes("预定入住")) return false;
  return true;
}

export function roomOccupancyStatus(room: BusinessRoom, tenants: BusinessTenant[]) {
  if (tenants.some((tenant) => tenant.roomId === room.id && strictCurrentRentalTenant(tenant))) return "已租";
  if (["维修中", "暂停出租", "已归档"].includes(room.status)) return room.status;
  return "空置";
}

export function isPaymentActiveOnDate(payment: BusinessRentPayment, today = todayString()) {
  if (!isValidCoveragePayment(payment)) return false;
  const startDate = paymentCoverageStart(payment);
  const endDate = paymentCoverageEnd(payment);
  return Boolean(startDate && endDate && startDate <= today && today <= endDate);
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
  if (!isCurrentRentalTenant(tenant)) return null;
  const coverageStage = rentCoverageReminderStage(payment, today);
  if (coverageStage?.level === "overdue") {
    return { ...coverageStage, reason: "coverage", daysPastPaymentDay: 0 };
  }

  if (tenant.paymentDay == null) {
    return coverageStage ? { ...coverageStage, reason: "coverage", daysPastPaymentDay: 0 } : null;
  }
  const paymentDay = Math.min(31, Math.max(1, Number(tenant.paymentDay)));
  const dueDay = Math.min(paymentDay, Number(monthEnd(today.slice(0, 7)).slice(-2)));
  const dueDate = `${today.slice(0, 8)}${String(dueDay).padStart(2, "0")}`;
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

export function strictCurrentRentalTenant(tenant: BusinessTenant) {
  const status = tenant.status || "";
  if (["\u5df2\u9000\u79df", "\u5df2\u5f52\u6863", "\u5df2\u7ed3\u675f", "\u975e\u5728\u79df", "\u7a7a\u7f6e", "\u9884\u5b9a\u5165\u4f4f"].some((item) => status.includes(item))) return false;
  return status.includes("\u5728\u79df");
}

export function fixedRentCollectionReminderStage(
  tenant: BusinessTenant,
  payment: BusinessRentPayment | null,
  today = todayString()
): RentCollectionReminderStage | null {
  if (!strictCurrentRentalTenant(tenant)) return null;
  const stage = rentCoverageReminderStageFixed(payment, today);
  return stage ? { ...stage, reason: "coverage", daysPastPaymentDay: 0 } : null;
}

export function rentCoverageReminderStageFixed(
  payment: BusinessRentPayment | null,
  today = todayString()
): RentCoverageReminderStage | null {
  if (!payment) return null;
  const endDate = payment?.coverageEndDate || "";
  if (!endDate) return null;
  const daysRemaining = dateDifference(endDate, today);
  if (daysRemaining > 30) return null;
  if (daysRemaining < 0) return { daysRemaining, overdueDays: Math.abs(daysRemaining), level: "overdue" };
  if (daysRemaining === 0) return { daysRemaining, overdueDays: 0, level: "critical" };
  if (daysRemaining <= 15) return { daysRemaining, overdueDays: 0, level: "urgent" };
  return { daysRemaining, overdueDays: 0, level: "upcoming" };
}

export type CoverageExpiryInfo = {
  daysRemaining: number | null;
  endDate: string;
  level: "normal" | "yellow" | "orange" | "red";
  label: string;
  sortGroup: number;
};

export function fixedCoverageExpiryInfo(
  tenant: BusinessTenant,
  payment: BusinessRentPayment | null,
  today = todayString()
): CoverageExpiryInfo {
  if (!strictCurrentRentalTenant(tenant)) {
    return { daysRemaining: null, endDate: "", level: "normal", label: "", sortGroup: 5 };
  }
  const endDate = payment?.coverageEndDate || "";
  if (!endDate) {
    return { daysRemaining: null, endDate: "", level: "normal", label: "", sortGroup: 4 };
  }
  const daysRemaining = dateDifference(endDate, today);
  if (daysRemaining >= 31) return { daysRemaining, endDate, level: "normal", label: "", sortGroup: 3 };
  if (daysRemaining >= 16) return { daysRemaining, endDate, level: "yellow", label: `\u5269\u4f59${daysRemaining}\u5929`, sortGroup: 2 };
  if (daysRemaining >= 1) return { daysRemaining, endDate, level: "orange", label: `\u5373\u5c06\u5230\u671f${daysRemaining}\u5929`, sortGroup: 1 };
  if (daysRemaining === 0) return { daysRemaining, endDate, level: "red", label: "\u4eca\u65e5\u5230\u671f", sortGroup: 0 };
  return { daysRemaining, endDate, level: "red", label: `\u5df2\u5230\u671f${Math.abs(daysRemaining)}\u5929`, sortGroup: 0 };
}

export function coverageLabel(payment: BusinessRentPayment | null) {
  return payment ? paymentCoverageEnd(payment) || "-" : "-";
}

export function overdueReferenceAmount(payment: BusinessRentPayment | null, tenant?: BusinessTenant) {
  if (!payment) return 0;
  return Number(payment.amountDue || tenant?.monthlyRent || 0);
}

export function isRentIncome(payment: BusinessRentPayment) {
  return !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
}

function isValidCoveragePayment(payment: BusinessRentPayment) {
  const status = payment.paymentStatus || "";
  return isRentIncome(payment)
    && !isVoided(payment.notes)
    && !status.includes("\u5df2\u4f5c\u5e9f")
    && !status.toLowerCase().includes("void");
}

function paymentEntryTimestamp(payment: BusinessRentPayment) {
  // Normal edits do not change created_at, so correcting an older receipt
  // cannot make it the tenant's current coverage record.
  return payment.createdAt || payment.paymentDate || payment.rentMonth || "";
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
