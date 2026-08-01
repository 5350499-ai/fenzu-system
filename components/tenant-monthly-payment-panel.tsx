"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { paymentCoverageEnd, paymentCoverageStart } from "@/lib/rent-coverage";
import { buildMonthlyPaymentStatus, buildMonthlyRentIncome, buildTenantMonthRange, type MonthlyPaymentStatusPoint, type TenantPaymentPerformance, type TenantTimelineEvent } from "@/lib/tenant-timeline";

type Props = { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string };

function label(status: MonthlyPaymentStatusPoint["status"]) {
  switch (status) {
    case "on-time": return "按时";
    case "late-yellow": return "迟交";
    case "late-red": return "迟交";
    case "current-yellow": case "current-red": return "当前";
    case "future": return "未到期";
    default: return "未统计";
  }
}

function monthText(month: string) { return `${month.slice(0, 4)}年${Number(month.slice(5))}月`; }

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: Props) {
  const months = useMemo(() => buildTenantMonthRange(tenant, payments, events, today), [tenant, payments, events, today]);
  const statusData = useMemo(() => buildMonthlyPaymentStatus(tenant, payments, events, today, 60), [tenant, payments, events, today]);
  const incomeData = useMemo(() => buildMonthlyRentIncome(payments, 60), [payments]);
  const statusByMonth = useMemo(() => new Map(statusData.map((point) => [point.month, point])), [statusData]);
  const incomeByMonth = useMemo(() => new Map(incomeData.map((point) => [point.month, point])), [incomeData]);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const incomeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const next = months.at(-1) || null;
    setSelectedMonth(next);
    for (const ref of [statusRef, incomeRef]) if (ref.current) ref.current.scrollLeft = ref.current.scrollWidth;
  }, [tenant.id, months.join(",")]);
  const selectMonth = (month: string) => {
    setSelectedMonth(month);
    for (const ref of [statusRef, incomeRef]) {
      const node = ref.current?.querySelector<HTMLElement>(`[data-month="${month}"]`);
      node?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };
  const maxAmount = Math.max(0, ...months.map((month) => incomeByMonth.get(month)?.amount || 0));
  const selectedStatus = selectedMonth ? statusByMonth.get(selectedMonth) : undefined;
  const selectedIncome = selectedMonth ? incomeByMonth.get(selectedMonth) : undefined;
  const selectedPayments = selectedStatus?.payments.length ? selectedStatus.payments : selectedIncome?.payments || [];
  const selectedEvents = events.filter((event) => event.date.slice(0, 7) === selectedMonth && (!event.payment || !selectedPayments.some((payment) => payment.id === event.payment?.id)));
  return <section className="tenant-monthly-payment-panel">
    <div className="detail-section-title">每月付款状态</div>
    <div className="tenant-chart-frame">
      <div className="tenant-chart-header"><strong>{months.length ? `${months.at(-1)?.slice(0, 4)}年` : "付款年份"}</strong><button type="button" className="tenant-chart-latest" onClick={() => selectMonth(months.at(-1) || "")}>回到最新</button></div>
      <div className="tenant-month-track" ref={statusRef}>
        <div className="tenant-month-track-inner" style={{ width: `${Math.max(100, months.length * 64)}px` }}>
          <div className="tenant-month-track-line" />
          {months.map((month) => {
            const point = statusByMonth.get(month);
            const status = point?.status || (month > today.slice(0, 7) ? "future" : "untracked");
            const text = label(status as MonthlyPaymentStatusPoint["status"]);
            const delay = point?.periods.length ? Math.max(...point.periods.map((period) => period.delay.days)) : 0;
            return <button data-month={month} type="button" key={month} className={`tenant-month-node ${status}${selectedMonth === month ? " selected" : ""}`} onClick={() => selectMonth(month)} aria-label={`${monthText(month)}，${delay ? `迟交${delay}天` : text}`}>
              <span className="tenant-month-node-dot" /><strong>{text}{delay ? `${delay}天` : ""}</strong><small>{Number(month.slice(5))}</small>
            </button>;
          })}
        </div>
      </div>
    </div>

    <div className="detail-section-title tenant-month-chart-title">每月收款金额</div>
    <div className="tenant-chart-frame tenant-rent-chart-frame">
      <div className="tenant-rent-chart" ref={incomeRef}>
        <div className="tenant-rent-chart-inner" style={{ width: `${Math.max(100, months.length * 64)}px` }}>
          <div className="tenant-rent-grid-line line-25" /><div className="tenant-rent-grid-line line-50" /><div className="tenant-rent-grid-line line-75" /><div className="tenant-rent-baseline" />
          {months.map((month) => {
            const amount = incomeByMonth.get(month)?.amount || 0;
            const height = maxAmount > 0 ? amount > 0 ? Math.max(12, amount / maxAmount * 100) : 4 : 4;
            return <button data-month={month} type="button" key={month} className={`tenant-rent-bar${selectedMonth === month ? " selected" : ""}`} onClick={() => selectMonth(month)} aria-label={`${monthText(month)}，房租${euro(amount)}`}>
              <span className="tenant-rent-bar-value">{amount > 0 ? euro(amount) : "€0"}</span><span className="tenant-rent-bar-fill" style={{ height: `${height}%` }} /><small>{Number(month.slice(5))}</small>
            </button>;
          })}
        </div>
      </div>
    </div>

    <div className="tenant-month-detail">
      {selectedMonth ? <>
        <strong>{monthText(selectedMonth)}</strong>
        <span>付款状态：{selectedStatus ? label(selectedStatus.status) : "未统计"}</span>
        {selectedPayments.map((payment) => {
          const delay = selectedStatus?.periods.find((period) => period.payment.id === payment.id)?.delay;
          return <div className="tenant-month-payment-detail" key={payment.id}>
            <span>{payment.paymentDate || "未记录收款日期"} · 房租 {euro(payment.amountDue)} · 押金 {euro(Math.max(0, Number(payment.amountPaid || 0) - Number(payment.amountDue || 0)))}</span>
            <span>实收 {euro(payment.amountPaid)} · 覆盖 {paymentCoverageStart(payment) || "-"} 至 {paymentCoverageEnd(payment) || "-"}</span>
            <span>{delay ? delay.days ? `迟交${delay.days}天` : "按时付款" : "未纳入迟交统计"}</span>
          </div>;
        })}
        {selectedEvents.map((event) => <div className="tenant-month-event-detail" key={event.id}>{event.date} · {event.title}{event.detail ? ` · ${event.detail}` : ""}</div>)}
        {!selectedPayments.length && !selectedEvents.length ? <span className="muted">该月暂无事件</span> : null}
      </> : <span className="muted">暂无月度记录</span>}
    </div>
    {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 6 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
  </section>;
}
