"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { paymentCoverageEnd, paymentCoverageStart } from "@/lib/rent-coverage";
import { buildCalendarYearMonths, buildMonthlyPaymentStatus, buildMonthlyRentIncome, type MonthlyPaymentStatusPoint, type TenantPaymentPerformance, type TenantTimelineEvent } from "@/lib/tenant-timeline";

type Props = { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string };
const PLOT_HEIGHT = 110;
const COL = 64;

function monthText(month: string) { return `${month.slice(0, 4)}年${Number(month.slice(5))}月`; }
function statusLabel(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "按时" : status === "late-yellow" || status === "late-red" ? "迟交" : status === "current-yellow" || status === "current-red" ? "当前" : status === "future" ? "未到期" : "未统计"; }
function statusColor(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "#1f9d72" : status === "late-yellow" || status === "current-yellow" ? "#d39a00" : status === "late-red" || status === "current-red" ? "#dc2626" : "#8b95a5"; }

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: Props) {
  const year = Number((tenant.actualMoveOutDate || today || tenant.moveInDate || "2026-01-01").slice(0, 4));
  const months = useMemo(() => buildCalendarYearMonths(year), [year]);
  const statusData = useMemo(() => buildMonthlyPaymentStatus(tenant, payments, events, today, 60), [tenant, payments, events, today]);
  const incomeData = useMemo(() => buildMonthlyRentIncome(payments, 60), [payments]);
  const statusByMonth = useMemo(() => new Map(statusData.map((point) => [point.month, point])), [statusData]);
  const incomeByMonth = useMemo(() => new Map(incomeData.map((point) => [point.month, point])), [incomeData]);
  const [selectedMonth, setSelectedMonth] = useState(`${year}-${today.slice(0, 7) === `${year}-${today.slice(5, 7)}` ? today.slice(5, 7) : "01"}`);
  const statusRef = useRef<HTMLDivElement>(null);
  const incomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const current = today.slice(0, 7);
    const next = months.includes(current) ? current : months.at(-1) || months[0];
    setSelectedMonth(next);
    for (const ref of [statusRef, incomeRef]) if (ref.current) ref.current.scrollLeft = Math.max(0, ref.current.scrollWidth - ref.current.clientWidth);
  }, [tenant.id, year, months.join(",")]);
  const selectMonth = (month: string) => {
    setSelectedMonth(month);
    for (const ref of [statusRef, incomeRef]) {
      const node = ref.current?.querySelector<HTMLElement>(`[data-month="${month}"]`);
      if (node) ref.current?.scrollTo({ left: Math.max(0, node.offsetLeft - ref.current.clientWidth / 2 + COL / 2), behavior: "smooth" });
    }
  };
  const maxAmount = Math.max(0, ...months.map((month) => incomeByMonth.get(month)?.amount || 0));
  const startMonth = tenant.moveInDate?.slice(0, 7);
  const endMonth = tenant.actualMoveOutDate?.slice(0, 7) || today.slice(0, 7);
  const selectedStatus = statusByMonth.get(selectedMonth);
  const selectedIncome = incomeByMonth.get(selectedMonth);
  const selectedPayments = selectedStatus?.payments.length ? selectedStatus.payments : selectedIncome?.payments || [];
  const selectedEvents = events.filter((event) => event.date.slice(0, 7) === selectedMonth && (!event.payment || !selectedPayments.some((payment) => payment.id === event.payment?.id)));
  const pointStatus = (month: string): MonthlyPaymentStatusPoint["status"] => {
    if ((startMonth && month < startMonth) || (endMonth && month > endMonth)) return "untracked";
    return statusByMonth.get(month)?.status || (month > today.slice(0, 7) ? "future" : "untracked");
  };
  const svgWidth = months.length * COL;
  return <section className="tenant-monthly-payment-panel">
    <div className="detail-section-title">每月付款状态</div>
    <div className="tenant-svg-chart-frame">
      <div className="tenant-chart-header"><strong>{year}年</strong><button type="button" className="tenant-chart-latest" onClick={() => selectMonth(today.slice(0, 7))}>回到本月</button></div>
      <div className="tenant-svg-scroll" ref={statusRef}>
        <svg className="tenant-status-svg" width={svgWidth} height="132" viewBox={`0 0 ${svgWidth} 132`} role="img" aria-label={`${year}年每月付款状态`}>
          <line x1={COL / 2} x2={svgWidth - COL / 2} y1="35" y2="35" stroke="var(--border)" strokeWidth="2" />
          {months.map((month, index) => { const status = pointStatus(month); const point = statusByMonth.get(month); const delay = point?.periods.length ? Math.max(...point.periods.map((period) => period.delay.days)) : 0; const x = index * COL + COL / 2; return <g key={month} data-month={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthText(month)}，${delay ? `迟交${delay}天` : statusLabel(status)}`}>
            <circle cx={x} cy="35" r={selectedMonth === month ? 10 : 7} fill={status.startsWith("current") || status === "untracked" ? "var(--surface)" : statusColor(status)} stroke={selectedMonth === month ? "var(--accent)" : statusColor(status)} strokeWidth={selectedMonth === month ? 3 : 2} />
            <text x={x} y="68" textAnchor="middle" className="tenant-svg-status-text">{delay ? `迟${delay}天` : statusLabel(status)}</text><text x={x} y="105" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text>
          </g>; })}
        </svg>
      </div>
    </div>

    <div className="detail-section-title tenant-month-chart-title">每月收款金额</div>
    <div className="tenant-svg-chart-frame">
      <div className="tenant-svg-scroll" ref={incomeRef}>
        <svg className="tenant-income-svg" width={svgWidth} height="180" viewBox={`0 0 ${svgWidth} 180`} role="img" aria-label={`${year}年每月房租收入`}>
          <line x1="0" x2={svgWidth} y1="145" y2="145" stroke="var(--border)" strokeWidth="2" />
          {[35, 70, 105].map((y) => <line key={y} x1="0" x2={svgWidth} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" opacity=".55" />)}
          {months.map((month, index) => { const amount = incomeByMonth.get(month)?.amount || 0; const barHeight = maxAmount > 0 && amount > 0 ? Math.max(8, amount / maxAmount * PLOT_HEIGHT) : 3; const x = index * COL + 17; return <g key={month} data-month={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthText(month)}，房租${euro(amount)}`}>
            <rect x={x} y={145 - barHeight} width="30" height={barHeight} rx="4" fill={selectedMonth === month ? "var(--accent)" : "var(--blue)"} opacity={amount > 0 ? 0.95 : 0.28} /><text x={x + 15} y={Math.max(16, 140 - barHeight)} textAnchor="middle" className="tenant-svg-amount-label">{amount > 0 ? euro(amount) : "€0"}</text><text x={x + 15} y="168" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text>
          </g>; })}
        </svg>
      </div>
    </div>

    <div className="tenant-month-detail">
      <strong>{monthText(selectedMonth)}</strong><span>付款状态：{selectedStatus ? statusLabel(selectedStatus.status) : "未统计"}</span>
      {selectedPayments.map((payment) => { const delay = selectedStatus?.periods.find((period) => period.payment.id === payment.id)?.delay; return <div className="tenant-month-payment-detail" key={payment.id}><span>{payment.paymentDate || "未记录收款日期"} · 房租 {euro(payment.amountDue)} · 押金 {euro(Math.max(0, Number(payment.amountPaid || 0) - Number(payment.amountDue || 0)))}</span><span>实收 {euro(payment.amountPaid)} · 覆盖 {paymentCoverageStart(payment) || "-"} 至 {paymentCoverageEnd(payment) || "-"}</span><span>{delay ? delay.days ? `迟交${delay.days}天` : "按时付款" : "未纳入迟交统计"}</span></div>; })}
      {selectedEvents.map((event) => <div className="tenant-month-event-detail" key={event.id}>{event.date} · {event.title}{event.detail ? ` · ${event.detail}` : ""}</div>)}
      {!selectedPayments.length && !selectedEvents.length ? <span className="muted">该月暂无事件</span> : null}
    </div>
    {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 6 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
  </section>;
}
