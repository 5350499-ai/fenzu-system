"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { paymentCoverageEnd, paymentCoverageStart } from "@/lib/rent-coverage";
import type { TenantPaymentPerformance, TenantTimelineEvent, MonthlyPaymentStatusPoint, MonthlyRentIncomePoint } from "@/lib/tenant-timeline";
import { buildMonthlyPaymentStatus, buildMonthlyRentIncome } from "@/lib/tenant-timeline";

function monthLabel(point: { year: number; monthNumber: number }) { return `${point.monthNumber}`; }
function statusLabel(status: MonthlyPaymentStatusPoint["status"]) {
  if (status === "on-time") return "按时";
  if (status === "late-yellow") return "迟交";
  if (status === "late-red") return "迟交";
  if (status === "current-yellow" || status === "current-red") return "当前";
  if (status === "future") return "未到期";
  return "未统计";
}

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string }) {
  const statuses = useMemo(() => buildMonthlyPaymentStatus(tenant, payments, events, today), [tenant, payments, events, today]);
  const income = useMemo(() => buildMonthlyRentIncome(payments), [payments]);
  const months = useMemo(() => [...new Set([...statuses.map((point) => point.month), ...income.map((point) => point.month)])].sort(), [statuses, income]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setSelectedMonth(months.at(-1) || null); if (trackRef.current) trackRef.current.scrollLeft = trackRef.current.scrollWidth; }, [tenant.id, months.join(",")]);
  const selectedStatus = statuses.find((point) => point.month === selectedMonth);
  const selectedIncome = income.find((point) => point.month === selectedMonth);
  const selectedEvents = events.filter((event) => event.date.slice(0, 7) === selectedMonth);
  const selectedPayments = [...(selectedStatus?.payments || selectedIncome?.payments || [])];

  return <section className="tenant-monthly-payment-panel">
    <div className="detail-section-title">每月付款状态</div>
    <div className="tenant-month-track" ref={trackRef} aria-label="每月付款状态轨道">
      <div className="tenant-month-track-inner">
        {statuses.map((point) => <button key={point.month} type="button" className={`tenant-month-node ${point.status}${selectedMonth === point.month ? " selected" : ""}`} onClick={() => setSelectedMonth(point.month)} aria-pressed={selectedMonth === point.month}>
          <span className="tenant-month-node-dot" />
          <strong>{monthLabel(point)}</strong>
          <small>{statusLabel(point.status)}</small>
        </button>)}
      </div>
    </div>
    {statuses[0] ? <div className="tenant-month-year">{statuses[statuses.length - 1].year}年</div> : null}

    <div className="detail-section-title tenant-month-chart-title">每月收款金额</div>
    <div className="tenant-rent-chart" aria-label="每月房租收入">
      {income.length ? income.map((point) => <button type="button" key={point.month} className={`tenant-rent-bar${selectedMonth === point.month ? " selected" : ""}`} onClick={() => setSelectedMonth(point.month)} aria-label={`${point.year}年${point.monthNumber}月 ${euro(point.amount)}`}>
        <span className="tenant-rent-bar-value">{euro(point.amount)}</span><span className="tenant-rent-bar-fill" style={{ height: `${Math.max(8, Math.min(100, point.amount / Math.max(...income.map((item) => item.amount), 1) * 100))}%` }} /><small>{monthLabel(point)}</small>
      </button>) : <span className="muted">暂无已收房租数据</span>}
    </div>

    <div className="tenant-month-detail">
      {selectedMonth ? <>
        <strong>{selectedMonth.slice(0, 4)}年{Number(selectedMonth.slice(5))}月</strong>
        {selectedPayments.map((payment) => {
          const status = selectedStatus?.periods.find((period) => period.payment.id === payment.id)?.delay;
          return <div className="tenant-month-payment-detail" key={payment.id}>
            <span>{payment.paymentDate || "未记录收款日期"} · 房租 {euro(payment.amountDue)} · 押金 {euro(Math.max(0, Number(payment.amountPaid || 0) - Number(payment.amountDue || 0)))}</span>
            <span>实收 {euro(payment.amountPaid)} · 覆盖 {paymentCoverageStart(payment) || "-"} 至 {paymentCoverageEnd(payment) || "-"}</span>
            <span>{status ? (status.days ? `迟交${status.days}天` : "按时付款") : "未纳入迟交统计"}</span>
          </div>;
        })}
        {selectedEvents.filter((event) => !event.payment || !selectedPayments.some((payment) => payment.id === event.payment?.id)).map((event) => <div className="tenant-month-event-detail" key={event.id}>{event.date} · {event.title}{event.detail ? ` · ${event.detail}` : ""}</div>)}
        {!selectedPayments.length && !selectedEvents.length ? <span className="muted">该月暂无事件</span> : null}
      </> : <span className="muted">暂无月度记录</span>}
    </div>
    {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 6 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
  </section>;
}
