"use client";

import { useAccountAccess } from "@/components/account-access";
import { AppLayout } from "@/components/app-layout";
import { ProfitBarChart } from "@/components/profit-bar-chart";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessExpense,
  BusinessContract,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  contractKey,
  expenseKey,
  getInitialDeposits,
  getInitialExpenses,
  getInitialContracts,
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
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange, paymentAccountingDate } from "@/lib/profit";
import { calculateOccupancySummary, resolvePropertyOccupancyStart } from "@/lib/room-occupancy";
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
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState("all");
  const [monthlyMode, setMonthlyMode] = useState<"overview" | "year" | "custom">("overview");
  const [monthlyYear, setMonthlyYear] = useState(() => new Date().getFullYear());
  const [customStart, setCustomStart] = useState(() => firstDayOfCurrentMonth());
  const [customEnd, setCustomEnd] = useState(() => todayDate());
  const [appliedCustomStart, setAppliedCustomStart] = useState(() => firstDayOfCurrentMonth());
  const [appliedCustomEnd, setAppliedCustomEnd] = useState(() => todayDate());
  const [customError, setCustomError] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const [showOccupancyDetails, setShowOccupancyDetails] = useState(false);
  const [expandedOccupancyProperties, setExpandedOccupancyProperties] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpandedOccupancyProperties(selectedPropertyId === "all" ? new Set() : new Set([selectedPropertyId]));
  }, [selectedPropertyId]);

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedPayments = access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : [];
      const loadedExpenses = access.can("expenses") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : [];
      const loadedDeposits = access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
      const loadedContracts = access.can("tenants") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
      setContracts(loadedContracts);
    }
    load().catch((error) => window.alert(`加载房源利润失败：${error.message || error}`));
  }, [access.ready]);

  const allTimeRange = useMemo(() => {
    const scopedPayments = selectedPropertyId === "all" ? payments : payments.filter((payment) => payment.propertyId === selectedPropertyId);
    const scopedExpenses = selectedPropertyId === "all" ? expenses : expenses.filter((expense) => expense.propertyId === selectedPropertyId);
    const dates = [
      ...scopedPayments.filter((payment) => !isVoidedRecord(payment.notes)).map(paymentAccountingDate),
      ...scopedExpenses.filter((expense) => !isVoidedRecord(expense.notes)).map((expense) => expense.expenseMonth ? `${expense.expenseMonth.slice(0, 7)}-01` : "")
    ].filter(isDateString).sort();
    const end = todayDate();
    return getDateRange("custom", dates[0] && dates[0] <= end ? dates[0] : end, end);
  }, [expenses, payments, selectedPropertyId]);
  const yearRange = useMemo(() => {
    const year = String(monthlyYear);
    return getDateRange("custom", `${year}-01-01`, `${year}-12-31`);
  }, [monthlyYear]);
  const customRange = useMemo(() => getDateRange("custom", appliedCustomStart, appliedCustomEnd), [appliedCustomEnd, appliedCustomStart]);
  const range = monthlyMode === "overview" ? allTimeRange : monthlyMode === "year" ? yearRange : customRange;
  const occupancyRange = useMemo(() => getOccupancyRange(monthlyMode, selectedPropertyId, properties, tenants, contracts, payments, yearRange, customRange), [contracts, customRange, monthlyMode, payments, properties, selectedPropertyId, tenants, yearRange]);
  const occupancySummary = useMemo(() => calculateOccupancySummary(
    selectedPropertyId === "all" ? properties : properties.filter((property) => property.id === selectedPropertyId),
    selectedPropertyId === "all" ? rooms : rooms.filter((room) => room.propertyId === selectedPropertyId),
    selectedPropertyId === "all" ? tenants : tenants.filter((tenant) => tenant.propertyId === selectedPropertyId),
    contracts,
    payments,
    occupancyRange,
    todayDate()
  ), [contracts, occupancyRange, payments, properties, rooms, selectedPropertyId, tenants]);
  const stats = useMemo(
    () => calculatePropertyProfits(properties, rooms, tenants, payments, expenses, deposits, range).sort((a, b) => a.netProfit - b.netProfit),
    [deposits, expenses, payments, properties, range, rooms, tenants]
  );
  const selectedProperty = properties.find((property) => property.id === selectedPropertyId);
  const visibleStats = selectedPropertyId === "all" ? stats : stats.filter((stat) => stat.property.id === selectedPropertyId);
  const unassignedIncome = useMemo(() => selectedPropertyId === "all" ? calculateUnassignedIncome(payments, range) : 0, [payments, range, selectedPropertyId]);
  const totals = useMemo(() => calculateTotals(visibleStats, unassignedIncome), [unassignedIncome, visibleStats]);
  const scopeLabel = selectedPropertyId === "all" ? "全部房源汇总" : selectedProperty?.name || "房源汇总";
  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    payments.forEach((payment) => { const value = payment.paymentDate || payment.rentMonth; if (value) years.add(Number(value.slice(0, 4))); });
    expenses.forEach((expense) => { if (expense.expenseMonth) years.add(Number(expense.expenseMonth.slice(0, 4))); });
    deposits.forEach((deposit) => { if (deposit.transactionDate) years.add(Number(deposit.transactionDate.slice(0, 4))); });
    return [...years].filter(Number.isFinite).sort((a, b) => a - b);
  }, [deposits, expenses, payments]);
  const monthlyRows = useMemo(
    () => buildGlobalMonthlyRows(properties, rooms, tenants, payments, expenses, deposits, range, selectedPropertyId),
    [deposits, expenses, payments, properties, range, rooms, selectedPropertyId, tenants]
  );
  const monthlyOccupancyRows = useMemo(() => buildMonthlyOccupancyRows(properties, rooms, tenants, contracts, payments, occupancyRange, selectedPropertyId), [contracts, occupancyRange, payments, properties, rooms, selectedPropertyId, tenants]);
  const unifiedMonthlyRows = useMemo(() => {
    const occupancyByMonth = new Map(monthlyOccupancyRows.map((row) => [row.month, row]));
    const financialByMonth = new Map(monthlyRows.map((row) => [row.month, row]));
    const months = [...new Set([...financialByMonth.keys(), ...occupancyByMonth.keys()])].sort().reverse();
    return months.map((month) => ({
      financial: financialByMonth.get(month) || { month, monthLabel: occupancyByMonth.get(month)?.monthLabel || month, income: 0, expense: 0, netProfit: 0 },
      occupancy: occupancyByMonth.get(month) || { rentedDays: 0, availableDays: 0, rate: null }
    }));
  }, [monthlyOccupancyRows, monthlyRows]);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(unifiedMonthlyRows.length / pageSize));
  const displayedMonthlyRows = monthlyMode === "overview" ? unifiedMonthlyRows.slice(historyPage * pageSize, (historyPage + 1) * pageSize) : unifiedMonthlyRows;

  function selectMonthlyMode(mode: "overview" | "year" | "custom") {
    setMonthlyMode(mode);
    setHistoryPage(0);
    if (mode === "custom") setCustomError("");
  }

  function applyCustomRange() {
    if (!customStart || !customEnd) {
      setCustomError("开始日期和结束日期不能为空。");
      return;
    }
    if (customStart > customEnd) {
      setCustomError("开始日期不得晚于结束日期。");
      return;
    }
    setAppliedCustomStart(customStart);
    setAppliedCustomEnd(customEnd);
    setCustomError("");
    setHistoryPage(0);
  }

  function resetCustomRange() {
    const start = firstDayOfCurrentMonth();
    const end = todayDate();
    setCustomStart(start);
    setCustomEnd(end);
    setAppliedCustomStart(start);
    setAppliedCustomEnd(end);
    setCustomError("");
    setHistoryPage(0);
  }

  return (
    <AppLayout title="房源利润分析" description="按现有收款与支出流水只读汇总；可查看全部房源或单套房源在当前时间范围的结果。">
      <section className="card panel profit-filter-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">统计范围</h2>
            <p className="muted">{range.start} 至 {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="房源范围" value={selectedPropertyId} options={[{ value: "all", label: "全部房源" }, ...properties.map((property) => ({ value: property.id, label: property.name }))]} onChange={setSelectedPropertyId} />
        </div>
      </section>

      <section className="card profit-overview-card" aria-label={scopeLabel}>
        <div className="profit-overview-header">
          <div>
            <h2 className="panel-title">利润概览</h2>
            <p className="muted">{scopeLabel} · 收入、支出与净利润</p>
          </div>
          {selectedPropertyId !== "all" ? <Link className="text-link" href={`/property-profits/${selectedPropertyId}`}>查看收入支出明细</Link> : null}
        </div>
        <ProfitBarChart income={totals.income} expense={totals.expense} netProfit={totals.netProfit} label={`${scopeLabel}收入、支出与净利润对比`} />
        <div className="profit-occupancy-summary">
          <div><span>出租率</span><strong>{formatRate(occupancySummary.rate)}</strong><small>{occupancySummary.availableDays > 0 ? `${occupancySummary.rentedDays}/${occupancySummary.availableDays} 房间日` : "暂无可统计房间日"}</small></div>
          <button className="btn" type="button" onClick={() => setShowOccupancyDetails((current) => !current)}>{showOccupancyDetails ? "收起出租率明细" : "查看出租率明细"}</button>
        </div>
        {showOccupancyDetails ? <OccupancyDetails summary={occupancySummary} properties={properties} expanded={expandedOccupancyProperties} onToggle={(propertyId) => setExpandedOccupancyProperties((current) => { const next = new Set(current); if (next.has(propertyId)) next.delete(propertyId); else next.add(propertyId); return next; })} /> : null}
        {unassignedIncome > 0 ? <p className="profit-unassigned-note">已按现有首页规则计入未分配房源收入：{euro(unassignedIncome)}。</p> : null}
      </section>

      <section className="card panel property-profit-panel">
        <div className="panel-header">
          <h2 className="panel-title">按房源统计</h2>
          <span className="muted">当前范围内所有房源</span>
        </div>
        <div className="profit-property-list">
          {stats.map((stat) => (
            <article className="profit-property-card" key={stat.property.id}>
              <div className="profit-property-card-header"><strong>{stat.property.name}</strong><StatusBadge tone={stat.netProfit < 0 ? "red" : "green"}>{stat.netProfit < 0 ? "亏损" : "盈利"}</StatusBadge></div>
              <div className="profit-property-values">
                <div><span>收入</span><strong className="profit">{euro(stat.income)}</strong></div>
                <div><span>支出</span><strong>{euro(stat.expense)}</strong></div>
                <div><span>净利润</span><strong className={stat.netProfit < 0 ? "danger-text" : "profit"}>{euro(stat.netProfit)}</strong></div>
              </div>
              <Link className="text-link profit-property-detail-link" href={`/property-profits/${stat.property.id}`}>查看明细</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="card panel global-monthly-profit-panel">
        <div className="panel-header">
          <div><h2 className="panel-title">按月经营统计</h2><p className="muted">{scopeLabel} · 收入、支出、利润与出租率</p></div>
        </div>
        <div className="profit-period-switch" role="tablist" aria-label="利润时间模式">
          {([["overview", "总览"], ["year", "按年"], ["custom", "自定义"]] as const).map(([value, label]) => <button className={`tab-button ${monthlyMode === value ? "active" : ""}`} key={value} type="button" role="tab" aria-selected={monthlyMode === value} onClick={() => selectMonthlyMode(value)}>{label}</button>)}
        </div>
        {monthlyMode === "custom" ? <div className="global-custom-range-controls">
          <div className="field"><label>开始日期</label><input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} /></div>
          <div className="field"><label>结束日期</label><input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} /></div>
          <div className="global-custom-range-actions"><button className="btn primary" type="button" onClick={applyCustomRange}>应用</button><button className="btn" type="button" onClick={resetCustomRange}>重置</button></div>
          {customError ? <p className="form-error global-custom-range-error">{customError}</p> : null}
        </div> : null}
        <div className="global-profit-overview-values">
          <ProfitSecondaryMetric label={monthlyMode === "overview" ? "累计收入" : "时间段收入"} value={euro(totals.income)} />
          <ProfitSecondaryMetric label={monthlyMode === "overview" ? "累计支出" : "时间段支出"} value={euro(totals.expense)} />
          <ProfitSecondaryMetric label={monthlyMode === "overview" ? "累计净利润" : "时间段净利润"} value={euro(totals.netProfit)} tone={totals.netProfit < 0 ? "danger" : "profit"} />
        </div>
        {monthlyMode !== "overview" ? <div className="global-monthly-controls">
          {monthlyMode === "year" ? <>
            <button className="btn" type="button" disabled={monthlyYear <= availableYears[0]} onClick={() => setMonthlyYear((current) => Math.max(availableYears[0], current - 1))}>上一年</button>
            <strong>{monthlyYear}年</strong>
            <button className="btn" type="button" disabled={monthlyYear >= availableYears[availableYears.length - 1]} onClick={() => setMonthlyYear((current) => Math.min(availableYears[availableYears.length - 1], current + 1))}>下一年</button>
          </> : <strong>{range.start} 至 {range.end}</strong>}
        </div> : null}
        <div className="global-monthly-list">
          {displayedMonthlyRows.map((row) => <div className="global-monthly-row unified-monthly-row" key={row.financial.month}>
            <div className="unified-monthly-head"><strong>{row.financial.monthLabel}</strong></div>
            <div className="unified-monthly-finance"><span className="global-monthly-income">收入 <b>{euro(row.financial.income)}</b></span><span className="global-monthly-expense">支出 <b>{euro(row.financial.expense)}</b></span></div>
            <div className={`unified-monthly-net ${row.financial.netProfit < 0 ? "danger-text" : row.financial.netProfit > 0 ? "profit" : ""}`}><span>净利润 <b>{euro(row.financial.netProfit)}</b></span><strong>{profitStatus(row.financial.netProfit)}</strong></div>
            <div className="unified-monthly-occupancy"><span>出租率 <b>{formatRate(row.occupancy.rate)}</b></span><small>{row.occupancy.availableDays > 0 ? `${row.occupancy.rentedDays}/${row.occupancy.availableDays} 房间日` : "尚未开始统计"}</small></div>
          </div>)}
        </div>
        {monthlyMode === "overview" && pageCount > 1 ? <div className="global-history-pagination">
          <button className="btn" type="button" disabled={historyPage === 0} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>较新月份</button>
          <span className="muted">第 {historyPage + 1} / {pageCount} 页</span>
          <button className="btn" type="button" disabled={historyPage >= pageCount - 1} onClick={() => setHistoryPage((page) => Math.min(pageCount - 1, page + 1))}>更早月份</button>
        </div> : null}
      </section>

    </AppLayout>
  );
}

function ProfitSecondaryMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`profit-secondary-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function OccupancyDetails({
  summary,
  properties,
  expanded,
  onToggle
}: {
  summary: ReturnType<typeof calculateOccupancySummary>;
  properties: BusinessProperty[];
  expanded: Set<string>;
  onToggle: (propertyId: string) => void;
}) {
  return <div className="occupancy-details-list">
    {summary.properties.map((property) => <div className="occupancy-property-detail" key={property.propertyId}>
      <button className="occupancy-property-summary" type="button" onClick={() => onToggle(property.propertyId)}>
        <strong>{properties.find((item) => item.id === property.propertyId)?.name || "未命名房源"}</strong><span>{property.availableDays > 0 ? `${property.rentedDays}/${property.availableDays} 房间日` : "尚未开始统计"}</span><b>{formatRate(property.rate)}</b>
      </button>
      {expanded.has(property.propertyId) ? <div className="occupancy-room-list">{property.rooms.map((room) => <div className="occupancy-room-row" key={room.roomId}><span>{room.roomName}</span><small>{room.availableDays > 0 ? `${room.rentedDays}/${room.availableDays} 天` : "尚未开始统计"}</small><b>{formatRate(room.rate)}</b></div>)}</div> : null}
    </div>)}
  </div>;
}

function formatRate(rate: number | null) {
  if (rate == null || !Number.isFinite(rate)) return "暂无数据";
  const rounded = Math.round(rate * 100) / 100;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}%`;
}

function profitStatus(value: number) {
  return value > 0 ? "盈利" : value < 0 ? "亏损" : "持平";
}

function getOccupancyRange(
  mode: "overview" | "year" | "custom",
  selectedPropertyId: string,
  properties: BusinessProperty[],
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  payments: BusinessRentPayment[],
  yearRange: { start: string; end: string },
  customRange: { start: string; end: string }
) {
  if (mode === "year") return yearRange;
  if (mode === "custom") return customRange;
  const scopedProperties = selectedPropertyId === "all" ? properties : properties.filter((property) => property.id === selectedPropertyId);
  const dates = scopedProperties.map((property) => resolvePropertyOccupancyStart(property, tenants, contracts, payments)).filter(isDateString).sort();
  const end = endOfCurrentMonth();
  return { start: dates[0] && dates[0] <= end ? dates[0] : end, end };
}

function buildMonthlyOccupancyRows(
  properties: BusinessProperty[],
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  payments: BusinessRentPayment[],
  dateRange: { start: string; end: string },
  selectedPropertyId: string
) {
  if (!dateRange.start || !dateRange.end || dateRange.start > dateRange.end) return [];
  const rows: Array<{ month: string; monthLabel: string; rentedDays: number; availableDays: number; rate: number | null }> = [];
  const start = new Date(`${dateRange.start}T00:00:00Z`);
  const end = new Date(`${dateRange.end}T00:00:00Z`);
  for (const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); cursor <= end; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const year = cursor.getUTCFullYear();
    const monthNumber = cursor.getUTCMonth() + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const monthLastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const monthStart = month === dateRange.start.slice(0, 7) ? dateRange.start : `${month}-01`;
    const monthEnd = month === dateRange.end.slice(0, 7) ? dateRange.end : `${month}-${String(monthLastDay).padStart(2, "0")}`;
    const scopedRooms = selectedPropertyId === "all" ? rooms : rooms.filter((room) => room.propertyId === selectedPropertyId);
    const scopedTenants = selectedPropertyId === "all" ? tenants : tenants.filter((tenant) => tenant.propertyId === selectedPropertyId);
    const scopedProperties = selectedPropertyId === "all" ? properties : properties.filter((property) => property.id === selectedPropertyId);
    const summary = calculateOccupancySummary(scopedProperties, scopedRooms, scopedTenants, contracts, payments, { start: monthStart, end: monthEnd }, todayDate());
    rows.push({ month, monthLabel: `${year}年${monthNumber}月`, rentedDays: summary.rentedDays, availableDays: summary.availableDays, rate: summary.rate });
  }
  return rows.reverse();
}

function buildGlobalMonthlyRows(
  properties: BusinessProperty[],
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[],
  deposits: BusinessDeposit[],
  dateRange: { start: string; end: string },
  selectedPropertyId: string
) {
  const start = new Date(`${dateRange.start}T00:00:00`);
  const end = new Date(`${dateRange.end}T00:00:00`);
  const rows: Array<{ month: string; monthNumber: number; monthLabel: string; income: number; expense: number; netProfit: number }> = [];
  for (const cursor = new Date(start.getFullYear(), start.getMonth(), 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    const year = cursor.getFullYear();
    const monthNumber = cursor.getMonth() + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    const monthEnd = new Date(year, monthNumber, 0);
    const monthStart = month === dateRange.start.slice(0, 7) ? dateRange.start : `${month}-01`;
    const monthEndValue = month === dateRange.end.slice(0, 7) ? dateRange.end : `${month}-${String(monthEnd.getDate()).padStart(2, "0")}`;
    const range = getDateRange("custom", monthStart, monthEndValue);
    const stats = calculatePropertyProfits(properties, rooms, tenants, payments, expenses, deposits, range);
    const visibleStats = selectedPropertyId === "all" ? stats : stats.filter((stat) => stat.property.id === selectedPropertyId);
    const unassignedIncome = selectedPropertyId === "all" ? calculateUnassignedIncome(payments, range) : 0;
    const totals = calculateTotals(visibleStats, unassignedIncome);
    rows.push({ month, monthNumber, monthLabel: `${year}年${monthNumber}月`, income: totals.income, expense: totals.expense, netProfit: totals.netProfit });
  }
  return rows.reverse();
}

function todayDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function firstDayOfCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfCurrentMonth() {
  const now = new Date();
  const lastDay = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).getUTCDate();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function isDateString(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}/.test(value));
}

function isVoidedRecord(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
