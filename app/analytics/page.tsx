"use client";

import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange, RangePreset, rangeOptions } from "@/lib/profit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function AnalyticsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [propertyId, setPropertyId] = useState("all");

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载统计数据失败：${error.message || error}`));
  }, []);

  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const propertyStats = useMemo(() => {
    const stats = calculatePropertyProfits(properties, rooms, payments, expenses, deposits, range);
    return stats.sort((a, b) => a.netProfit - b.netProfit);
  }, [deposits, expenses, payments, properties, range, rooms]);
  const visibleStats = propertyId === "all" ? propertyStats : propertyStats.filter((item) => item.property.id === propertyId);
  const totals = calculateTotals(visibleStats, propertyId === "all" ? calculateUnassignedIncome(payments, range) : 0);
  const selected = propertyId === "all" ? null : visibleStats[0];

  return (
    <AppLayout title="统计分析" description="按时间范围和房源核算收入、支出、净利润、欠租与空置情况。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">筛选条件</h2>
            <p className="muted">当前范围：{range.start} 至 {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="时间范围" value={preset} options={rangeOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setPreset(value as RangePreset)} />
          <SearchableSelect label="房源" value={propertyId} options={[{ value: "all", label: "全部房源" }, ...properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.city} ${property.address}` }))]} onChange={setPropertyId} />
          {preset === "custom" ? (
            <>
              <div className="field"><label>开始日期</label><input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="field"><label>结束日期</label><input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </>
          ) : null}
        </div>
      </section>

      <div className="grid metrics">
        <MetricCard label="收入" value={euro(totals.income)} note="房租、押金、赔偿及其他收入" tone="profit" />
        <MetricCard label="支出" value={euro(totals.expense)} note="经营支出合计" />
        <MetricCard label="净利润" value={euro(totals.netProfit)} note="收入 - 支出" tone={totals.netProfit < 0 ? "danger" : "profit"} hero />
        <MetricCard label="欠租" value={euro(totals.unpaid)} note="应收未收金额" tone={totals.unpaid > 0 ? "danger" : "info"} />
        <MetricCard label="押金净流入" value={euro(totals.depositAmount)} note="押金收入 - 押金退还" />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" />
      </div>

      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">房源利润概览</h2>
          <span className="muted">亏损和欠租会高亮显示</span>
        </div>
        <div className="property-profit-grid">
          {visibleStats.map((stat) => (
            <Link className={`property-profit-card ${stat.hasLoss ? "loss" : ""}`} href={`/properties/${stat.property.id}`} key={stat.property.id}>
              <div className="profit-card-head">
                <div>
                  <strong>{stat.property.name}</strong>
                  <p>{stat.property.city || "-"} · 空置 {stat.vacantRooms} 间</p>
                </div>
                {stat.hasLoss ? <StatusBadge tone="red">亏损</StatusBadge> : <StatusBadge tone="green">盈利</StatusBadge>}
              </div>
              <div className="profit-card-metrics">
                <span>收入 <b>{euro(stat.income)}</b></span>
                <span>支出 <b>{euro(stat.expense)}</b></span>
                <span>净利润 <b className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</b></span>
                <span>入住率 <b>{stat.occupancy}%</b></span>
              </div>
              {stat.hasUnpaid ? <div className="profit-alert">欠租 {euro(stat.unpaid)}</div> : null}
            </Link>
          ))}
          {!visibleStats.length ? <p className="muted">暂无房源或统计数据。</p> : null}
        </div>
      </section>

      {selected ? (
        <div className="grid dashboard-panels">
          <DetailTable title="收入明细" headers={["日期", "类型/项目", "实收", "未收", "状态"]}>
            {selected.payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paymentDate || payment.rentMonth}</td>
                <td>{payment.incomeItem || payment.incomeType || "房租收入"}</td>
                <td>{euro(payment.amountPaid)}</td>
                <td>{euro(payment.amountUnpaid)}</td>
                <td><StatusBadge tone={payment.amountUnpaid > 0 ? "red" : "green"}>{payment.amountUnpaid > 0 ? "欠费" : "已收"}</StatusBadge></td>
              </tr>
            ))}
          </DetailTable>
          <DetailTable title="支出明细" headers={["付款日期", "类别", "金额", "状态"]}>
            {selected.expenses.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.paymentDate || "-"}</td>
                <td>{expense.category}</td>
                <td>{euro(expense.amount)}</td>
                <td><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td>
              </tr>
            ))}
          </DetailTable>
        </div>
      ) : null}
    </AppLayout>
  );
}

function DetailTable({ title, headers, children }: { title: string; headers: string[]; children: React.ReactNode }) {
  return (
    <section className="card panel">
      <h2 className="panel-title">{title}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </section>
  );
}
