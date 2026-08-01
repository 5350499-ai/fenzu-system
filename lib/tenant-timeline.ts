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
  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(paymentDay) || paymentDay < 1) return null;
  const day = Math.min(Math.floor(paymentDay), daysInMonth(month));
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
  if (start.slice(8) !== "01" || end.slice(0, 7) !== month || end.slice(8) !== String(daysInMonth(month)).padStart(2, "0")) return true;
  return false;
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

export function calculateTenantPaymentPerformance(tenant: BusinessTenant, payments: BusinessRentPayment[], today: string): TenantPaymentPerformance {
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
  for (const payment of payments.filter(isCompletedRentPayment)) months.add(monthOf(paymentCoverageStart(payment) || payment.rentMonth) || "");
  for (const event of events) months.add(monthOf(event.date) || "");
  months.delete("");
  const points = [...months].sort();
  const selected = points.slice(-Math.max(1, limit));
  return selected.map((month) => {
    const monthPayments = payments.filter((payment) => monthOf(paymentCoverageStart(payment) || payment.rentMonth) === month && isCompletedRentPayment(payment));
    const periods = monthPayments.map((payment) => periodsByPayment.get(payment.id)).filter(Boolean) as TenantPaymentPerformance["periods"];
    const monthEvents = events.filter((event) => monthOf(event.date) === month);
    const unpaid = monthPayments.find((payment) => {
      const end = paymentCoverageEnd(payment);
      return end < today && (Number(payment.amountUnpaid || 0) > 0 || Number(payment.amountPaid || 0) < Number(payment.amountDue || 0));
    });
    let status: MonthlyPaymentStatus = "untracked";
    if (periods.length) {
      const maxDelay = Math.max(...periods.map((period) => period.delay.days));
      status = maxDelay >= 6 ? "late-red" : maxDelay > 0 ? "late-yellow" : "on-time";
    } else if (unpaid) {
      const overdueDays = Math.max(0, dateDifference(today, paymentCoverageEnd(unpaid)));
      status = overdueDays >= 6 ? "current-red" : "current-yellow";
    } else if (month > today.slice(0, 7)) status = "future";
    const { year, monthNumber } = monthParts(month);
    return { month, year, monthNumber, status, payments: monthPayments, periods, events: monthEvents, amountPaid: monthPayments.reduce((sum, payment) => sum + (isRentIncome(payment) ? Number(payment.amountPaid || 0) : 0), 0) };
  });
}

/** Aggregates received rent by payment month; deposits and unpaid amounts are excluded. */
export function buildMonthlyRentIncome(payments: BusinessRentPayment[], limit = 12): MonthlyRentIncomePoint[] {
  const grouped = new Map<string, BusinessRentPayment[]>();
  for (const payment of payments.filter(isCompletedRentPayment)) {
    const month = monthOf(payment.paymentDate || payment.rentMonth);
    if (!month || !isRentIncome(payment)) continue;
    grouped.set(month, [...(grouped.get(month) || []), payment]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-Math.max(1, limit)).map(([month, monthPayments]) => {
    const { year, monthNumber } = monthParts(month);
    return { month, year, monthNumber, payments: monthPayments, amount: monthPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amountPaid || 0)), 0) };
  });
}
