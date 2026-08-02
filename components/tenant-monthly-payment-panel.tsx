"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { paymentCoverageEnd, paymentCoverageStart } from "@/lib/rent-coverage";
import { buildCalendarYearMonths, buildMonthlyPaymentStatus, buildMonthlyRentIncome, type MonthlyPaymentStatusPoint, type TenantPaymentPerformance, type TenantTimelineEvent } from "@/lib/tenant-timeline";

type Props = { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string };
const SVG_WIDTH = 336;
const COL = 28;

function monthText(month: string) { return `${month.slice(0, 4)}年${Number(month.slice(5))}月`; }
function statusLabel(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "按时" : status === "late-yellow" || status === "late-red" ? "迟交" : status === "current-yellow" || status === "current-red" ? "当前" : status === "future" ? "未到期" : "未统计"; }
function statusColor(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "#1f9d72" : status === "late-yellow" || status === "current-yellow" ? "#d39a00" : status === "late-red" || status === "current-red" ? "#dc2626" : "#8b95a5"; }

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: Props) {
  const years = useMemo(() => {
    const values = [today, tenant.moveInDate, tenant.actualMoveOutDate, ...payments.map((payment) => payment.paymentDate || payment.rentMonth), ...events.map((event) => event.date)].filter(Boolean).map((value) => Number(String(value).slice(0, 4))).filter(Number.isFinite);
    return [...new Set(values)].sort((left, right) => left - right);
  }, [tenant, payments, events, today]);
  const latestYear = years.at(-1) || Number(today.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(latestYear);
  const yearMonths = useMemo(() => buildCalendarYearMonths(selectedYear), [selectedYear]);
  const statusData = useMemo(() => buildMonthlyPaymentStatus(tenant, payments, events, today, 60), [tenant, payments, events, today]);
  const incomeData = useMemo(() => buildMonthlyRentIncome(payments, 60), [payments]);
  const statusByMonth = useMemo(() => new Map(statusData.map((point) => [point.month, point])), [statusData]);
  const incomeByMonth = useMemo(() => new Map(incomeData.map((point) => [point.month, point])), [incomeData]);
  const [selectedMonth, setSelectedMonth] = useState(`${latestYear}-${today.slice(5, 7)}`);
  useEffect(() => {
    const relevant = yearMonths.filter((month) => statusByMonth.has(month) || incomeByMonth.has(month));
    setSelectedMonth(relevant.at(-1) || (yearMonths.includes(today.slice(0, 7)) ? today.slice(0, 7) : `${selectedYear}-12`));
  }, [selectedYear, yearMonths.join(",")]);
  const selectMonth = (month: string) => setSelectedMonth(month);
  const maxAmount = Math.max(0, ...yearMonths.map((month) => incomeByMonth.get(month)?.amount || 0));
  const startMonth = tenant.moveInDate?.slice(0, 7);
  const endMonth = tenant.actualMoveOutDate?.slice(0, 7) || today.slice(0, 7);
  const pointStatus = (month: string): MonthlyPaymentStatusPoint["status"] => {
    if ((startMonth && month < startMonth) || (endMonth && month > endMonth)) return "untracked";
    return statusByMonth.get(month)?.status || (month > today.slice(0, 7) ? "future" : "untracked");
  };
  const selectedStatus = statusByMonth.get(selectedMonth);
  const selectedIncome = incomeByMonth.get(selectedMonth);
  const selectedPayments = selectedStatus?.payments.length ? selectedStatus.payments : selectedIncome?.payments || [];
  const selectedEvents = events.filter((event) => event.date.slice(0, 7) === selectedMonth && (!event.payment || !selectedPayments.some((payment) => payment.id === event.payment?.id)));
  return <section className="tenant-monthly-payment-panel">
    <div className="tenant-year-switcher"><button type="button" disabled={years.indexOf(selectedYear) <= 0} onClick={() => setSelectedYear((year) => years[Math.max(0, years.indexOf(year) - 1)])}>‹</button>{years.map((year) => <button type="button" key={year} className={selectedYear === year ? "selected" : ""} onClick={() => setSelectedYear(year)}>{year}年</button>)}<button type="button" disabled={years.indexOf(selectedYear) === years.length - 1} onClick={() => setSelectedYear((year) => years[Math.min(years.length - 1, years.indexOf(year) + 1)])}>›</button></div>
    <div className="detail-section-title">每月付款状态</div>
    <div className="tenant-chart-legend"><span><i className="legend-dot on-time" />绿色实心：按时</span><span><i className="legend-dot yellow" />黄色实心：迟交1–5天</span><span><i className="legend-dot red" />红色实心：迟交6天以上</span><span><i className="legend-dot yellow hollow" />黄色空心：当前逾期1–5天</span><span><i className="legend-dot red hollow" />红色空心：当前逾期6天以上</span><span><i className="legend-dot gray" />灰色：未到期/范围外</span><span><i className="legend-dot gray hollow" />灰色空心：未统计</span></div>
    <div className="tenant-svg-chart-frame"><svg className="tenant-annual-svg" viewBox={`0 0 ${SVG_WIDTH} 126`} role="img" aria-label={`${selectedYear}年每月付款状态`}>
      <line x1="14" x2={SVG_WIDTH - 14} y1="34" y2="34" stroke="var(--border)" strokeWidth="2" />
      {yearMonths.map((month, index) => { const status = pointStatus(month); const point = statusByMonth.get(month); const delay = point?.periods.length ? Math.max(...point.periods.map((period) => period.delay.days)) : 0; const x = index * COL + COL / 2; return <g key={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthText(month)}，${delay ? `迟交${delay}天` : statusLabel(status)}`}><circle cx={x} cy="34" r={selectedMonth === month ? 8 : 5} fill={status.startsWith("current") || status === "untracked" ? "var(--surface)" : statusColor(status)} stroke={selectedMonth === month ? "var(--accent)" : statusColor(status)} strokeWidth={selectedMonth === month ? 3 : 2} /><text x={x} y="62" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text></g>; })}
    </svg></div>

    <div className="detail-section-title tenant-month-chart-title">每月收款金额</div>
    <div className="tenant-svg-chart-frame"><svg className="tenant-annual-svg tenant-income-annual-svg" viewBox={`0 0 ${SVG_WIDTH} 180`} role="img" aria-label={`${selectedYear}年每月房租收入`}>
      <line x1="8" x2={SVG_WIDTH - 8} y1="145" y2="145" stroke="var(--border)" strokeWidth="2" />{[35, 70, 105].map((y) => <line key={y} x1="8" x2={SVG_WIDTH - 8} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" opacity=".5" />)}
      {yearMonths.map((month, index) => { const amount = incomeByMonth.get(month)?.amount || 0; const height = maxAmount > 0 && amount > 0 ? Math.max(8, amount / maxAmount * 110) : 3; const x = index * COL + 7; return <g key={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthText(month)}，房租${euro(amount)}`}><rect x={x} y={145 - height} width="14" height={height} rx="2" fill={selectedMonth === month ? "var(--accent)" : "var(--blue)"} opacity={amount ? ".95" : ".25"} />{selectedMonth === month && amount > 0 ? <text x={x + 7} y={Math.max(16, 140 - height)} textAnchor="middle" className="tenant-svg-amount-label">{euro(amount)}</text> : null}<text x={x + 7} y="168" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text></g>; })}
    </svg></div>

    <div className="tenant-month-detail"><strong>{monthText(selectedMonth)}详情</strong><span>付款状态：{selectedStatus ? statusLabel(selectedStatus.status) : "未统计"}</span>{selectedPayments.length ? selectedPayments.map((payment) => { const delay = selectedStatus?.periods.find((period) => period.payment.id === payment.id)?.delay; return <div className="tenant-month-payment-detail" key={payment.id}><span>房租 {euro(payment.amountDue)} · 押金 {euro(Math.max(0, Number(payment.amountPaid || 0) - Number(payment.amountDue || 0)))} · 实收 {euro(payment.amountPaid)}</span><span>{payment.paymentDate || "—"} · 覆盖 {paymentCoverageStart(payment) || "—"} 至 {paymentCoverageEnd(payment) || "—"}</span><span>{delay ? delay.days ? `迟交${delay.days}天` : "按时付款" : "未纳入迟交统计"}</span></div>; }) : <span className="muted">当月房租 €0 · 当月押金 €0 · 实收合计 €0 · 当月事件：暂无</span>}{selectedEvents.map((event) => <div className="tenant-month-event-detail" key={event.id}>{event.date} · {event.title}{event.detail ? ` · ${event.detail}` : ""}</div>)}</div>
    {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 6 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
  </section>;
}
