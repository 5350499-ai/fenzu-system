import type { BusinessContract, BusinessDeposit, BusinessRentPayment, BusinessTenant } from "./business-data";
import { isRentIncome, paymentCoverageEnd, paymentCoverageStart } from "./rent-coverage";

export type PaymentDelayLevel = "on-time" | "yellow" | "red";

export type PaymentDelay = {
  included: boolean;
  reason?: string;
  dueDate?: string;
  paymentDate?: string;
  days: number;
  level: PaymentDelayLevel;
};

export type TenantPaymentPerformance = {
  periods: Array<{ payment: BusinessRentPayment; delay: PaymentDelay }>;
  excludedCount: number;
  lateCount: number;
  averageLateDays: number | null;
  longestLateDays: number | null;
  onTimeRate: number | null;
  currentOverdueDays: number | null;
};

export type TenantTimelineEvent = {
  id: string;
  date: string;
  type: string;
  title: string;
  detail?: string;
  delay?: PaymentDelay;
  payment?: BusinessRentPayment;
  depositAmount?: number;
};

export type TimelineDateGroup = { date: string; events: TenantTimelineEvent[] };

export type PaymentDelayTrendPoint = {
  id: string;
  label: string;
  payment: BusinessRentPayment;
  delay: PaymentDelay;
};

export type MonthlyPaymentStatus = "on-time" | "late-yellow" | "late-red" | "current-yellow" | "current-red" | "future" | "untracked";

export type MonthlyPaymentStatusPoint = {
  month: string;
  year: number;
  monthNumber: number;
  status: MonthlyPaymentStatus;
  payments: BusinessRentPayment[];
  periods: TenantPaymentPerformance["periods"];
  events: TenantTimelineEvent[];
  amountPaid: number;
};

export type MonthlyRentIncomePoint = {
  month: string;
  year: number;
  monthNumber: number;
  amount: number;
  payments: BusinessRentPayment[];
};

export function buildTenantMonthRange(tenant: BusinessTenant, payments: BusinessRentPayment[], events: TenantTimelineEvent[], today: string): string[] {
  const values = [tenant.moveInDate, ...payments.map((payment) => paymentCoverageStart(payment) || payment.paymentDate || payment.rentMonth), ...events.map((event) => event.date)].filter((value): value is string => Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value)));
  if (!values.length) return [];
  const start = (tenant.moveInDate || values.sort()[0]).slice(0, 7);
  const end = (tenant.actualMoveOutDate || today).slice(0, 7);
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const result: string[] = [];
  let cursor = startYear * 12 + startMonth - 1;
  const last = endYear * 12 + endMonth - 1;
  while (cursor <= last && result.length < 60) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    cursor += 1;
  }
  return result;
}

export function buildCalendarYearMonths(year: number) {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

export function isCompleteNaturalMonthCoverage(payment: BusinessRentPayment): boolean {
  const start = payment.coverageStartDate;
  const end = payment.coverageEndDate;
  if (!validDate(start) || !validDate(end)) return false;
  const month = start.slice(0, 7);
  return end.slice(0, 7) === month && start.slice(8) === "01" && end.slice(8) === String(daysInMonth(month)).padStart(2, "0");
}

/** Returns the single natural month a rent record belongs to; ambiguous cross-month records are excluded. */
export function getRentAttributionMonth(payment: BusinessRentPayment): string | null {
  const start = payment.coverageStartDate;
  const end = payment.coverageEndDate;
  if (!validDate(start) || !validDate(end) || start.slice(0, 7) !== end.slice(0, 7)) return null;
  return start.slice(0, 7);
}

/** Amount-only attribution may safely fall back to a structured month/date; status never uses this fallback. */
export function getRentAmountAttributionMonth(payment: BusinessRentPayment): string | null {
  if (validDate(payment.coverageStartDate)) {
    const startMonth = monthOf(payment.coverageStartDate);
    if (validDate(payment.coverageEndDate) && startMonth !== monthOf(payment.coverageEndDate)) {
      const start = new Date(`${payment.coverageStartDate}T12:00:00Z`).getTime();
      const end = new Date(`${payment.coverageEndDate}T12:00:00Z`).getTime();
      const spansMultipleCompleteMonths = payment.coverageStartDate.endsWith("-01") && payment.coverageEndDate.endsWith(`-${String(daysInMonth(monthOf(payment.coverageEndDate) || "")).padStart(2, "0")}`) && end - start >= 45 * 86400000;
      return spansMultipleCompleteMonths ? null : startMonth;
    }
    return startMonth;
  }
  if (payment.coverageEndDate) {
    if (validDate(payment.coverageEndDate)) return monthOf(payment.coverageEndDate);
    return null;
  }
  return monthOf(payment.paymentDate) || monthOf(payment.rentMonth);
}

function receivedRentAmount(payment: BusinessRentPayment) {
  const due = Math.max(0, Number(payment.amountDue || 0));
  const paid = Math.max(0, Number(payment.amountPaid || 0));
  return due > 0 ? Math.min(due, paid) : 0;
}

/** The historical rent field used by the chart. Deposits are not part of amount_due. */
export function rentAmountFromRecord(payment: BusinessRentPayment) {
  const amount = Number(payment.amountDue || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

export type TenantPaymentDiagnostic = {
  paymentIdSuffix: string;
  paymentDate: string;
  coverageStartDate: string;
  coverageEndDate: string;
  rentAmount: number;
  depositAmount: number;
  receivedTotal: number;
  incomeType?: string;
  paymentStatus?: string;
  attributionMonth: string | null;
  amountIncluded: boolean;
  timingIncluded: boolean;
  exclusionReason?: string;
};

/** Redacted read-only audit data for diagnosing tenant chart inclusion. */
export function diagnoseTenantRentPayments(payments: BusinessRentPayment[]): TenantPaymentDiagnostic[] {
  return payments.map((payment) => {
    const rentAmount = rentAmountFromRecord(payment);
    const attributionMonth = getRentAmountAttributionMonth(payment);
    const validRent = isCompletedRentPayment(payment) && isRentIncome(payment) && rentAmount > 0;
    const amountIncluded = validRent && Boolean(attributionMonth);
    const timingIncluded = amountIncluded && isCompleteNaturalMonthCoverage(payment) && validDate(payment.paymentDate);
    const exclusionReason = amountIncluded ? (timingIncluded ? undefined : "状态字段或完整覆盖日期不足") : !isRentIncome(payment) ? "非房租收入" : rentAmount <= 0 ? "缺少本次房租金额" : attributionMonth ? "收款已作废或归档" : "缺少可归属月份";
    return {
      paymentIdSuffix: payment.id.slice(-8),
      paymentDate: payment.paymentDate || "",
      coverageStartDate: payment.coverageStartDate || "",
      coverageEndDate: payment.coverageEndDate || "",
      rentAmount,
      depositAmount: Math.max(Number(payment.amountPaid || 0) - rentAmount, 0),
      receivedTotal: Math.max(Number(payment.amountPaid || 0), 0),
      incomeType: payment.incomeType,
      paymentStatus: payment.paymentStatus,
      attributionMonth,
      amountIncluded,
      timingIncluded,
      exclusionReason
    };
  });
}

export function calculateMonthlyPaymentStatusDays(month: string, payments: BusinessRentPayment[], today: string, monthlyRent = 0): number | null {
  const complete = payments.filter((payment) => isRentIncome(payment) && getRentAttributionMonth(payment) === month && isCompleteNaturalMonthCoverage(payment));
  if (!complete.length) return null;
  const expected = Number(monthlyRent || 0) > 0 ? Number(monthlyRent) : complete.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountDue || 0)), 0);
  const ordered = [...complete].filter((payment) => validDate(payment.paymentDate)).sort((left, right) => (left.paymentDate || "").localeCompare(right.paymentDate || ""));
  let paid = 0;
  let completionDate: string | null = null;
  for (const payment of ordered) {
    paid += receivedRentAmount(payment);
    if (paid >= expected && expected > 0) {
      completionDate = payment.paymentDate || null;
      break;
    }
  }
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const startDate = paymentCoverageStart(complete[0]);
  const dueDate = validDate(startDate) ? previousCalendarDate(startDate) : monthEnd;
  if (paid < expected || expected <= 0 || !completionDate) return today > dueDate ? -dateDifference(today, dueDate) : null;
  return dateDifference(dueDate, completionDate);
}

function validDate(value: string | undefined | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function daysInMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}

function dateDifference(later: string, earlier: string) {
  const left = new Date(`${later}T12:00:00Z`).getTime();
  const right = new Date(`${earlier}T12:00:00Z`).getTime();
  return Number.isFinite(left) && Number.isFinite(right) ? Math.round((left - right) / 86400000) : 0;
}

export function calculatePaymentDueDate(payment: BusinessRentPayment, tenant: BusinessTenant): string | null {
  const source = paymentCoverageStart(payment) || payment.rentMonth;
  const month = source.slice(0, 7);
  const paymentDay = Number(tenant.paymentDay);
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const effectivePaymentDay = Number.isFinite(paymentDay) && paymentDay >= 1 ? Math.floor(paymentDay) : 20;
  const day = Math.min(effectivePaymentDay, daysInMonth(month));
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function classifyPaymentDelay(paymentDate: string | undefined, dueDate: string | null): PaymentDelay {
  if (!validDate(paymentDate) || !dueDate || !validDate(dueDate)) {
    return { included: false, reason: "缺少可靠的应收日期或实际收款日期", days: 0, level: "on-time" };
  }
  const days = Math.max(0, dateDifference(paymentDate, dueDate));
  return { included: true, dueDate, paymentDate, days, level: days >= 10 ? "red" : days > 0 ? "yellow" : "on-time" };
}

function isPartialOrAmbiguous(payment: BusinessRentPayment) {
  if (Number(payment.amountDue || 0) <= 0 || Number(payment.amountPaid || 0) < Number(payment.amountDue || 0)) return true;
  const start = paymentCoverageStart(payment);
  const end = paymentCoverageEnd(payment);
  const month = start.slice(0, 7);
  if (!validDate(start) || !validDate(end) || !/^\d{4}-\d{2}$/.test(month)) return true;
  // Partial first-month periods and multi-month coverage do not provide a reliable monthly due cycle.
  if (!isCompleteNaturalMonthCoverage(payment)) return true;
  return false;
}

function previousCalendarDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function isCompletedRentPayment(payment: BusinessRentPayment) {
  const status = payment.paymentStatus || "";
  return isRentIncome(payment) && !status.includes("已作废") && !status.includes("已归档") && !payment.notes?.includes("[已作废]");
}

function latestCoveragePayment(payments: BusinessRentPayment[]) {
  return [...payments].filter(isCompletedRentPayment).sort((left, right) =>
    paymentCoverageEnd(right).localeCompare(paymentCoverageEnd(left)) || (right.createdAt || right.paymentDate || "").localeCompare(left.createdAt || left.paymentDate || "")
  )[0] || null;
}

/** Summarizes only complete, reliably attributed natural-month cycles. */
export function calculateTenantPaymentPerformance(tenant: BusinessTenant, payments: BusinessRentPayment[], today: string): TenantPaymentPerformance {
  const periods: TenantPaymentPerformance["periods"] = [];
  let excludedCount = 0;
  const byMonth = new Map<string, BusinessRentPayment[]>();
  for (const payment of payments.filter(isCompletedRentPayment)) {
    const month = getRentAttributionMonth(payment);
    if (!month || !isCompleteNaturalMonthCoverage(payment)) {
      excludedCount += 1;
      continue;
    }
    byMonth.set(month, [...(byMonth.get(month) || []), payment]);
  }
  for (const [month, monthPayments] of byMonth) {
    const expected = Number(tenant.monthlyRent || 0) > 0 ? Number(tenant.monthlyRent) : monthPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountDue || 0)), 0);
    const paid = monthPayments.reduce((sum, payment) => sum + receivedRentAmount(payment), 0);
    const statusDays = calculateMonthlyPaymentStatusDays(month, monthPayments, today, tenant.monthlyRent);
    if (paid < expected || statusDays == null) {
      excludedCount += 1;
      continue;
    }
    const payment = [...monthPayments].sort((left, right) => (left.paymentDate || "").localeCompare(right.paymentDate || "")).at(-1) || monthPayments[0];
    const delayDays = Math.max(0, -(statusDays || 0));
    const dueDate = validDate(paymentCoverageStart(payment)) ? previousCalendarDate(paymentCoverageStart(payment)) : null;
    periods.push({ payment, delay: { included: true, dueDate: dueDate || undefined, paymentDate: payment.paymentDate, days: delayDays, level: delayDays >= 10 ? "red" : delayDays > 0 ? "yellow" : "on-time" } });
  }
  const latePeriods = periods.filter((period) => period.delay.days > 0);
  const totalLateDays = periods.reduce((sum, period) => sum + period.delay.days, 0);
  const currentPayment = latestCoveragePayment(payments);
  const currentOverdue = !/退租|归档/.test(tenant.status) && currentPayment && paymentCoverageEnd(currentPayment) < today
    && (currentPayment.paymentStatus?.includes("鏈敹") || Number(currentPayment.amountUnpaid || 0) > 0 || Number(currentPayment.amountPaid || 0) < Number(currentPayment.amountDue || 0))
    ? Math.max(0, dateDifference(today, paymentCoverageEnd(currentPayment)))
    : null;
  return {
    periods,
    excludedCount,
    lateCount: latePeriods.length,
    averageLateDays: periods.length ? totalLateDays / periods.length : null,
    longestLateDays: periods.length ? Math.max(...periods.map((period) => period.delay.days)) : null,
    onTimeRate: periods.length ? (periods.filter((period) => period.delay.days === 0).length / periods.length) * 100 : null,
    currentOverdueDays: currentOverdue
  };
}

function calculateTenantPaymentPerformanceLegacy(tenant: BusinessTenant, payments: BusinessRentPayment[], today: string): TenantPaymentPerformance {
  const periods: TenantPaymentPerformance["periods"] = [];
  let excludedCount = 0;
  for (const payment of payments.filter(isCompletedRentPayment)) {
    const dueDate = calculatePaymentDueDate(payment, tenant);
    const delay = isPartialOrAmbiguous(payment)
      ? { included: false, reason: "首月、部分付款或覆盖区间无法可靠对应单月周期", days: 0, level: "on-time" as const, dueDate: dueDate || undefined }
      : classifyPaymentDelay(payment.paymentDate, dueDate);
    if (delay.included) periods.push({ payment, delay });
    else excludedCount += 1;
  }
  const latePeriods = periods.filter((period) => period.delay.days > 0);
  const totalLateDays = periods.reduce((sum, period) => sum + period.delay.days, 0);
  const currentPayment = latestCoveragePayment(payments);
  const currentOverdue = !tenant.status.includes("已退租") && !tenant.status.includes("已归档") && currentPayment && paymentCoverageEnd(currentPayment) < today
    && (currentPayment.paymentStatus?.includes("未收") || Number(currentPayment.amountUnpaid || 0) > 0 || Number(currentPayment.amountPaid || 0) < Number(currentPayment.amountDue || 0))
    ? Math.max(0, dateDifference(today, paymentCoverageEnd(currentPayment)))
    : null;
  return {
    periods,
    excludedCount,
    lateCount: latePeriods.length,
    averageLateDays: periods.length ? totalLateDays / periods.length : null,
    longestLateDays: periods.length ? Math.max(...periods.map((period) => period.delay.days)) : null,
    onTimeRate: periods.length ? (periods.filter((period) => period.delay.days === 0).length / periods.length) * 100 : null,
    currentOverdueDays: currentOverdue
  };
}

export function formatPaymentCycleLabel(payment: BusinessRentPayment) {
  const month = (payment.coverageStartDate || payment.rentMonth || "").slice(0, 7);
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? `${Number(match[1])}年${Number(match[2])}月` : month || "未知周期";
}

export function buildPaymentDelayTrend(periods: TenantPaymentPerformance["periods"], limit = 12, showAll = false): PaymentDelayTrendPoint[] {
  const ordered = [...periods].sort((left, right) =>
    (paymentCoverageStart(left.payment) || left.payment.rentMonth || "").localeCompare(paymentCoverageStart(right.payment) || right.payment.rentMonth || "")
    || left.payment.id.localeCompare(right.payment.id)
  );
  const selected = showAll ? ordered : ordered.slice(-Math.max(1, limit));
  return selected.map((period) => ({ id: period.payment.id, label: formatPaymentCycleLabel(period.payment), payment: period.payment, delay: period.delay }));
}

export function groupTimelineEventsByDate(events: TenantTimelineEvent[]): TimelineDateGroup[] {
  const groups = new Map<string, TenantTimelineEvent[]>();
  for (const event of events) groups.set(event.date, [...(groups.get(event.date) || []), event]);
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, groupedEvents]) => ({ date, events: groupedEvents }));
}

export function buildTenantTimeline(tenant: BusinessTenant, contract: BusinessContract | null | undefined, payments: BusinessRentPayment[], deposits: BusinessDeposit[], today: string): TenantTimelineEvent[] {
  const performance = calculateTenantPaymentPerformance(tenant, payments, today);
  const delayByPayment = new Map(performance.periods.map((period) => [period.payment.id, period.delay]));
  const events: TenantTimelineEvent[] = [];
  if (tenant.moveInDate) events.push({ id: `${tenant.id}-move-in`, date: tenant.moveInDate, type: "入住", title: "入住" });
  if (contract?.startDate && contract.startDate !== tenant.moveInDate) events.push({ id: `${contract.id}-start`, date: contract.startDate, type: "合同开始", title: "合同开始" });
  for (const payment of payments.filter(isCompletedRentPayment)) {
    const date = payment.paymentDate || paymentCoverageEnd(payment) || payment.rentMonth;
    const delay = delayByPayment.get(payment.id);
    const coverage = paymentCoverageStart(payment) && paymentCoverageEnd(payment) ? `覆盖 ${paymentCoverageStart(payment)} 至 ${paymentCoverageEnd(payment)}` : undefined;
    const paymentDeposit = deposits.find((deposit) => deposit.notes?.includes(`[收租押金:${payment.id}]`))?.amount || Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0);
    const detail = [payment.incomeType || "房租收款", `实收 €${Number(payment.amountPaid || 0).toFixed(2)}`, coverage, delay?.included && delay.days > 0 ? `迟交${delay.days}天` : delay?.included ? "按时" : "未纳入迟交统计"].filter(Boolean).join(" · ");
    events.push({ id: payment.id, date, type: payment.incomeType === "续交房租" ? "续交房租" : "房租收款", title: payment.incomeType === "续交房租" ? "续交房租" : "房租收款", detail, delay, payment, depositAmount: paymentDeposit });
  }
  for (const deposit of deposits) {
    events.push({ id: `${deposit.id}-deposit`, date: deposit.transactionDate, type: "押金", title: deposit.type === "收取" ? "押金收取" : `押金${deposit.type}`, detail: `€${Number(deposit.amount || 0).toFixed(2)} · ${deposit.status}` });
  }
  if (performance.currentOverdueDays != null) events.push({ id: `${tenant.id}-overdue`, date: today, type: "当前逾期", title: `当前逾期 ${performance.currentOverdueDays} 天` });
  if (tenant.actualMoveOutDate) events.push({ id: `${tenant.id}-move-out`, date: tenant.actualMoveOutDate, type: "实际退租", title: "实际退租" });
  if (tenant.status.includes("已归档")) events.push({ id: `${tenant.id}-archived`, date: today, type: "归档", title: "归档" });
  return events.filter((event) => validDate(event.date)).sort((left, right) => right.date.localeCompare(left.date));
}

function monthOf(value: string | undefined | null) {
  return value && /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
}

function monthParts(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, monthNumber };
}

/** Builds one status node per rent month; no payment/tenant data is mutated. */
export function buildMonthlyPaymentStatus(
  tenant: BusinessTenant,
  payments: BusinessRentPayment[],
  events: TenantTimelineEvent[],
  today: string,
  limit = 12
): MonthlyPaymentStatusPoint[] {
  const performance = calculateTenantPaymentPerformance(tenant, payments, today);
  const periodsByPayment = new Map(performance.periods.map((period) => [period.payment.id, period]));
  const months = new Set<string>();
  for (const payment of payments.filter(isCompletedRentPayment)) months.add(getRentAmountAttributionMonth(payment) || "");
  for (const event of events) months.add(monthOf(event.date) || "");
  months.delete("");
  const points = [...months].sort();
  const selected = points.slice(-Math.max(1, limit));
  return selected.map((month) => {
    const monthPayments = payments.filter((payment) => getRentAmountAttributionMonth(payment) === month && isCompletedRentPayment(payment));
    const periods = monthPayments.map((payment) => periodsByPayment.get(payment.id)).filter(Boolean) as TenantPaymentPerformance["periods"];
    const monthEvents = events.filter((event) => monthOf(event.date) === month);
    const unpaid = monthPayments.find((payment) => {
      const end = paymentCoverageEnd(payment);
      return isCompleteNaturalMonthCoverage(payment) && end < today && (Number(payment.amountUnpaid || 0) > 0 || Number(payment.amountPaid || 0) < Number(payment.amountDue || 0));
    });
    const statusDays = calculateMonthlyPaymentStatusDays(month, monthPayments, today, tenant.monthlyRent);
    let status: MonthlyPaymentStatus = "untracked";
    if (statusDays != null) {
      status = statusDays >= 0 ? "on-time" : Math.abs(statusDays) >= 6 ? "late-red" : "late-yellow";
    } else if (unpaid) {
      const overdueDays = Math.max(0, dateDifference(today, paymentCoverageEnd(unpaid)));
      status = overdueDays >= 6 ? "current-red" : "current-yellow";
    } else if (month > today.slice(0, 7)) status = "future";
    const { year, monthNumber } = monthParts(month);
    return { month, year, monthNumber, status, payments: monthPayments, periods, events: monthEvents, amountPaid: monthPayments.reduce((sum, payment) => sum + (isRentIncome(payment) ? receivedRentAmount(payment) : 0), 0) };
  });
}

/** Aggregates actual cash received by payment month. Coverage dates do not remove cash from this chart. */
export function buildMonthlyRentIncome(payments: BusinessRentPayment[], limit = 12): MonthlyRentIncomePoint[] {
  const grouped = new Map<string, BusinessRentPayment[]>();
  for (const payment of payments) {
    const month = monthOf(payment.paymentDate);
    const amountPaid = Math.max(0, Number(payment.amountPaid || 0));
    const status = payment.paymentStatus || "";
    const invalid = status.includes("已作废") || status.includes("已归档") || payment.notes?.includes("[已作废]");
    if (!month || amountPaid <= 0 || invalid) continue;
    grouped.set(month, [...(grouped.get(month) || []), payment]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-Math.max(1, limit)).map(([month, monthPayments]) => {
    const { year, monthNumber } = monthParts(month);
    return { month, year, monthNumber, payments: monthPayments, amount: monthPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountPaid || 0)), 0) };
  });
}
