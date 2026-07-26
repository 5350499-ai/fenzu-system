"use client";

import { useAccountAccess } from "@/components/account-access";
import { AppLayout } from "@/components/app-layout";
import { ProfitBarChart } from "@/components/profit-bar-chart";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange, RangePreset, rangeOptions } from "@/lib/profit";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PropertyProfitsPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedPropertyId, setSelectedPropertyId] = useState("all");

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedPayments = access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : [];
      const loadedExpenses = access.can("expenses") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : [];
      const loadedDeposits = access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载房源利润失败：${error.message || error}`));
  }, [access.ready]);

  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const stats = useMemo(
    () => calculatePropertyProfits(properties, rooms, tenants, payments, expenses, deposits, range).sort((a, b) => a.netProfit - b.netProfit),
    [deposits, expenses, payments, properties, range, rooms, tenants]
  );
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const visibleStats = selectedPropertyId === "all" ? stats : stats.filter((stat) => stat.property.id === selectedPropertyId);
  const unassignedIncome = useMemo(() => selectedPropertyId === "all" ? calculateUnassignedIncome(payments, range) : 0, [payments, range, selectedPropertyId]);
  const totals = useMemo(() => calculateTotals(visibleStats, unassignedIncome), [unassignedIncome, visibleStats]);
  const scopeLabel = selectedPropertyId === "all" ? "全部房源汇总" : selectedProperty?.name || "房源汇总";

  return (
    <AppLayout title="房源利润分析" description="按现有收款与支出流水只读汇总；可查看全部房源或单套房源在当前时间范围的结果。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">统计范围</h2>
            <p className="muted">{range.start} 至 {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="时间范围" value={preset} options={rangeOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setPreset(value as RangePreset)} />
          <SearchableSelect label="房源范围" value={selectedPropertyId} options={[{ value: "all", label: "全部房源" }, ...properties.map((property) => ({ value: property.id, label: property.name }))]} onChange={setSelectedPropertyId} />
          {preset === "custom" ? (
            <>
              <div className="field"><label>开始日期</label><input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="field"><label>结束日期</label><input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </>
          ) : null}
        </div>
      </section>

      <section className="card compact-profit-summary" aria-label={scopeLabel}>
        <ProfitMetric label="总收入" value={euro(totals.income)} tone="profit" />
        <ProfitMetric label="总支出" value={euro(totals.expense)} />
        <ProfitMetric label="总净利润" value={euro(totals.netProfit)} tone={totals.netProfit < 0 ? "danger" : "profit"} />
        <ProfitMetric label="总欠租" value={euro(totals.unpaid)} tone={totals.unpaid > 0 ? "danger" : ""} />
        <ProfitMetric label="总空置" value={`${totals.vacantRooms} 间`} />
        <ProfitMetric label="总入住率" value={`${totals.occupancy}%`} />
      </section>

      <section className="card panel profit-bar-panel">
        <div className="panel-header">
          <h2 className="panel-title">{scopeLabel}收支对比</h2>
          {selectedPropertyId !== "all" ? <Link className="text-link" href={`/property-profits/${selectedPropertyId}`}>查看收入支出明细</Link> : null}
        </div>
        <ProfitBarChart income={totals.income} expense={totals.expense} netProfit={totals.netProfit} label={`${scopeLabel}收入、支出与净利润对比`} />
        {unassignedIncome > 0 ? <p className="profit-unassigned-note">已按现有首页规则计入未分配房源收入：{euro(unassignedIncome)}。</p> : null}
      </section>

      <section className="card panel">
        <div className="panel-header">
          <h2 className="panel-title">按房源统计</h2>
          <span className="muted">当前范围内所有房源</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>房源名称</th><th>收入</th><th>支出</th><th>净利润</th><th>状态</th><th>操作</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.property.id}>
                  <td><Link className="text-link" href={`/property-profits/${stat.property.id}`}>{stat.property.name}</Link></td>
                  <td>{euro(stat.income)}</td><td>{euro(stat.expense)}</td><td className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</td>
                  <td><StatusBadge tone={stat.netProfit < 0 ? "red" : "green"}>{stat.netProfit < 0 ? "亏损" : "盈利"}</StatusBadge></td>
                  <td><Link className="text-link" href={`/property-profits/${stat.property.id}`}>查看明细</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {stats.map((stat) => (
            <article className="mobile-record-card" key={stat.property.id}>
              <div className="mobile-record-title"><strong>{stat.property.name}</strong><span><StatusBadge tone={stat.netProfit < 0 ? "red" : "green"}>{stat.netProfit < 0 ? "亏损" : "盈利"}</StatusBadge></span></div>
              <div className="mobile-record-fields">
                <div className="mobile-record-field"><span>收入</span><strong>{euro(stat.income)}</strong></div><div className="mobile-record-field"><span>支出</span><strong>{euro(stat.expense)}</strong></div>
                <div className="mobile-record-field"><span>净利润</span><strong className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</strong></div>
              </div>
              <Link className="btn" href={`/property-profits/${stat.property.id}`}>查看明细</Link>
            </article>
          ))}
        </div>
      </section>
    </AppLayout>
  );
}

function ProfitMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`compact-profit-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
