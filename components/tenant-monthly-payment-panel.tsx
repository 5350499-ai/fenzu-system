"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { buildCalendarYearMonths, buildMonthlyPaymentStatus, buildMonthlyRentIncome, type MonthlyPaymentStatusPoint, type TenantPaymentPerformance, type TenantTimelineEvent } from "@/lib/tenant-timeline";

type Props = { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string };
const SVG_WIDTH = 336;
const COL = 28;

function statusLabel(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "0" : status === "late-yellow" || status === "late-red" ? "迟交" : status === "current-yellow" || status === "current-red" ? "当前" : ""; }
function statusColor(status: MonthlyPaymentStatusPoint["status"]) { return status === "on-time" ? "#1f9d72" : status === "late-yellow" || status === "current-yellow" ? "#d39a00" : status === "late-red" || status === "current-red" ? "#dc2626" : "#8b95a5"; }

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: Props) {
  const years = useMemo(() => [...new Set([today, tenant.moveInDate, tenant.actualMoveOutDate, ...payments.map((payment) => payment.paymentDate || payment.rentMonth), ...events.map((event) => event.date)].filter(Boolean).map((value) => Number(String(value).slice(0, 4))).filter(Number.isFinite))].sort((left, right) => left - right), [tenant, payments, events, today]);
  const latestYear = years.at(-1) || Number(today.slice(0, 4));
  const [selectedYear, setSelectedYear] = useState(latestYear);
  const yearMonths = useMemo(() => buildCalendarYearMonths(selectedYear), [selectedYear]);
  const statusData = useMemo(() => buildMonthlyPaymentStatus(tenant, payments, events, today, 60), [tenant, payments, events, today]);
  const incomeData = useMemo(() => buildMonthlyRentIncome(payments, 60), [payments]);
  const statusByMonth = useMemo(() => new Map(statusData.map((point) => [point.month, point])), [statusData]);
  const incomeByMonth = useMemo(() => new Map(incomeData.map((point) => [point.month, point])), [incomeData]);
  const [selectedMonth, setSelectedMonth] = useState(`${latestYear}-${today.slice(5, 7)}`);
  useEffect(() => { const relevant = yearMonths.filter((month) => statusByMonth.has(month) || incomeByMonth.has(month)); setSelectedMonth(relevant.at(-1) || (yearMonths.includes(today.slice(0, 7)) ? today.slice(0, 7) : `${selectedYear}-12`)); }, [selectedYear, yearMonths.join(",")]);
  const pointStatus = (month: string): MonthlyPaymentStatusPoint["status"] => { const start = tenant.moveInDate?.slice(0, 7); const end = tenant.actualMoveOutDate?.slice(0, 7) || today.slice(0, 7); if ((start && month < start) || (end && month > end)) return "untracked"; return statusByMonth.get(month)?.status || (month > today.slice(0, 7) ? "future" : "untracked"); };
  const maxAmount = Math.max(0, ...yearMonths.map((month) => incomeByMonth.get(month)?.amount || 0));
  const monthAria = (month: string) => `${selectedYear}年${Number(month.slice(5))}月`;
  const selectMonth = (month: string) => setSelectedMonth(month);
  const yearIndex = years.indexOf(selectedYear);
  return <section className="tenant-monthly-payment-panel">
    <div className="tenant-year-switcher"><button type="button" disabled={yearIndex <= 0} onClick={() => setSelectedYear(years[Math.max(0, yearIndex - 1)])}>‹</button>{years.map((year) => <button type="button" key={year} className={selectedYear === year ? "selected" : ""} onClick={() => setSelectedYear(year)}>{year}年</button>)}<button type="button" disabled={yearIndex < 0 || yearIndex >= years.length - 1} onClick={() => setSelectedYear(years[Math.min(years.length - 1, yearIndex + 1)])}>›</button></div>
    <div className="detail-section-title">每月付款状态</div>
    <div className="tenant-svg-chart-frame"><svg className="tenant-annual-svg tenant-status-bars-svg" viewBox={`0 0 ${SVG_WIDTH} 170`} role="img" aria-label={`${selectedYear}年每月付款状态柱状图`}>
      <line x1="8" x2={SVG_WIDTH - 8} y1="82" y2="82" stroke="var(--border)" strokeWidth="2" />
      {yearMonths.map((month, index) => { const status = pointStatus(month); const point = statusByMonth.get(month); const late = point?.periods.length ? Math.max(...point.periods.map((period) => period.delay.days)) : status === "current-yellow" || status === "current-red" ? performance.currentOverdueDays || 0 : 0; const value = status === "late-yellow" || status === "late-red" || status === "current-yellow" || status === "current-red" ? -Math.max(1, late) : status === "on-time" ? 0 : 0; const magnitude = Math.min(45, Math.max(2, Math.abs(value) * 5)); const x = index * COL + 7; return <g key={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthAria(month)}，${value < 0 ? `迟交${Math.abs(value)}天` : statusLabel(status)}`}><rect x={x} y={value < 0 ? 82 : 80 - magnitude} width="14" height={magnitude} rx="2" fill={statusColor(status)} opacity={status === "untracked" || status === "future" ? ".45" : ".95"} /><text x={x + 7} y={value < 0 ? 103 + magnitude : Math.max(14, 72 - magnitude)} textAnchor="middle" className="tenant-svg-amount-label">{value < 0 ? value : status === "on-time" ? "0" : ""}</text><text x={x + 7} y="157" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text></g>; })}
    </svg></div>

    <div className="detail-section-title tenant-month-chart-title">每月收款金额</div>
    <div className="tenant-svg-chart-frame"><svg className="tenant-annual-svg tenant-income-annual-svg" viewBox={`0 0 ${SVG_WIDTH} 180`} role="img" aria-label={`${selectedYear}年每月房租收入柱状图`}>
      <line x1="8" x2={SVG_WIDTH - 8} y1="145" y2="145" stroke="var(--border)" strokeWidth="2" />{[35, 70, 105].map((y) => <line key={y} x1="8" x2={SVG_WIDTH - 8} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" opacity=".5" />)}
      {yearMonths.map((month, index) => { const amount = incomeByMonth.get(month)?.amount || 0; const height = maxAmount > 0 && amount > 0 ? Math.max(8, amount / maxAmount * 110) : 3; const x = index * COL + 7; return <g key={month} className={`tenant-svg-month ${selectedMonth === month ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => selectMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectMonth(month); }} aria-label={`${monthAria(month)}，房租${euro(amount)}`}><rect x={x} y={145 - height} width="14" height={height} rx="2" fill={selectedMonth === month ? "var(--accent)" : "var(--blue)"} opacity={amount ? ".95" : ".3"} />{amount > 0 ? <text x={x + 7} y={Math.max(14, 139 - height)} textAnchor="middle" className="tenant-svg-amount-label">{euro(amount)}</text> : null}<text x={x + 7} y="168" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text></g>; })}
    </svg></div>
  </section>;
}
