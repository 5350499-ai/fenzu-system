"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessRentPayment, BusinessTenant } from "@/lib/business-data";
import { euro } from "@/lib/format";
import { buildCalendarYearMonths, buildMonthlyPaymentStatus, buildMonthlyRentIncome, calculateMonthlyPaymentStatusDays, type TenantPaymentPerformance, type TenantTimelineEvent } from "@/lib/tenant-timeline";

type Props = { tenant: BusinessTenant; payments: BusinessRentPayment[]; events: TenantTimelineEvent[]; performance: TenantPaymentPerformance; today: string };
const SVG_WIDTH = 336;
const COL = 28;
const BAR_WIDTH = 7;
const AXIS_Y = 105;
const PLOT_HEIGHT = 55;

export function TenantMonthlyPaymentPanel({ tenant, payments, events, performance, today }: Props) {
  const years = useMemo(() => [...new Set([today, tenant.moveInDate, tenant.actualMoveOutDate, ...payments.map((payment) => payment.paymentDate || payment.rentMonth), ...events.map((event) => event.date)].filter(Boolean).map((value) => Number(String(value).slice(0, 4))).filter(Number.isFinite))].sort((a, b) => a - b), [tenant, payments, events, today]);
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
  const yearIndex = years.indexOf(selectedYear);
  const maxAmount = Math.max(0, ...yearMonths.map((month) => incomeByMonth.get(month)?.amount || 0));
  const pointStatus = (month: string) => {
    const start = tenant.moveInDate?.slice(0, 7);
    const end = tenant.actualMoveOutDate?.slice(0, 7) || today.slice(0, 7);
    if ((start && month < start) || (end && month > end)) return "out-of-range";
    return statusByMonth.get(month)?.status || (month > today.slice(0, 7) ? "future" : "untracked");
  };
  const statusValue = (month: string) => calculateMonthlyPaymentStatusDays(month, statusByMonth.get(month)?.payments || [], today);
  return <section className="tenant-monthly-payment-panel">
    <div className="tenant-year-switcher"><button type="button" disabled={yearIndex <= 0} onClick={() => setSelectedYear(years[Math.max(0, yearIndex - 1)])}>‹</button>{years.map((year) => <button type="button" key={year} className={selectedYear === year ? "selected" : ""} onClick={() => setSelectedYear(year)}>{year}年</button>)}<button type="button" disabled={yearIndex < 0 || yearIndex >= years.length - 1} onClick={() => setSelectedYear(years[Math.min(years.length - 1, yearIndex + 1)])}>›</button></div>
    <div className="detail-section-title">付款表现</div>
    <div className="tenant-svg-chart-frame tenant-combined-chart-frame"><svg className="tenant-combined-svg" viewBox={`0 0 ${SVG_WIDTH} 150`} role="img" aria-label={`${selectedYear}年每月付款金额和付款表现`}>
      <line x1="8" x2={SVG_WIDTH - 8} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--border)" strokeWidth="2" />
      {yearMonths.map((month, index) => {
        const amount = incomeByMonth.get(month)?.amount || 0;
        const amountHeight = maxAmount > 0 && amount > 0 ? Math.max(5, amount / maxAmount * PLOT_HEIGHT) : 3;
        const value = statusValue(month);
        const status = pointStatus(month);
        const statusMagnitude = value == null || value === 0 ? 0 : Math.min(22, Math.max(4, Math.abs(value) * 3));
        const monthCenter = index * COL + COL / 2;
        const amountX = monthCenter - BAR_WIDTH;
        const statusX = monthCenter;
        const selected = selectedMonth === month;
        const statusColor = value == null ? "#8b95a5" : value > 0 ? "#1f9d72" : value < -5 ? "#dc2626" : "#d39a00";
        return <g key={month} className={`tenant-svg-month ${selected ? "selected" : ""}`} role="button" tabIndex={0} onClick={() => setSelectedMonth(month)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedMonth(month); }} aria-label={`${selectedYear}年${index + 1}月，房租${euro(amount)}${value == null ? "，未统计" : `，${value > 0 ? "+" : ""}${value}天`}`}>
          <rect x={amountX} y={AXIS_Y - amountHeight} width={BAR_WIDTH} height={amountHeight} fill="var(--blue)" opacity={amount ? ".9" : ".35"} />
          {value === 0 ? <circle cx={statusX + BAR_WIDTH / 2} cy={AXIS_Y} r="3" fill="#1f9d72" /> : statusMagnitude ? <rect x={statusX} y={(value || 0) > 0 ? AXIS_Y - statusMagnitude : AXIS_Y} width={BAR_WIDTH} height={statusMagnitude} fill={statusColor} /> : <rect x={statusX} y={AXIS_Y - 2} width={BAR_WIDTH} height="2" fill="#8b95a5" />}
          <text x={amountX + BAR_WIDTH / 2} y={Math.max(12, AXIS_Y - amountHeight - 4)} textAnchor="middle" className="tenant-svg-amount-label">{euro(amount)}</text>
          {value != null && value !== 0 ? <text x={statusX + BAR_WIDTH / 2} y={value > 0 ? AXIS_Y - statusMagnitude - 4 : AXIS_Y + statusMagnitude + 12} textAnchor="middle" className="tenant-svg-status-value">{value > 0 ? `+${value}` : value}</text> : null}
          <text x={monthCenter} y="142" textAnchor="middle" className="tenant-svg-month-label">{index + 1}</text>
        </g>;
      })}
    </svg></div>
  </section>;
}
