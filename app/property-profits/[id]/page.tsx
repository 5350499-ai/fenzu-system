"use client";

import { useAccountAccess } from "@/components/account-access";
import { AppLayout } from "@/components/app-layout";
import { ProfitBarChart } from "@/components/profit-bar-chart";
import { SearchableSelect } from "@/components/searchable-select";
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
import { calculatePropertyProfit, getDateRange, RangePreset, rangeOptions } from "@/lib/profit";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function PropertyProfitDetailPage() {
  const access = useAccountAccess();
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

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

  const property = properties.find((item) => item.id === propertyId);
  const range = useMemo(() => getDateRange(preset, customStart, customEnd), [customEnd, customStart, preset]);
  const stat = useMemo(
    () => property ? calculatePropertyProfit(property, rooms, tenants, payments, expenses, deposits, range) : null,
    [deposits, expenses, payments, property, range, rooms, tenants]
  );

  if (!property || !stat) {
    return (
      <AppLayout title="房源利润明细" description="正在读取房源统计。">
        <section className="card panel">房源不存在或正在加载。</section>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={`${property.name} 利润明细`} description="仅展示当前范围的统计概览；逐笔流水请前往收款或支出页面查看。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">时间范围</h2>
            <p className="muted">{range.start} 至 {range.end}</p>
          </div>
        </div>
        <div className="filter-grid">
          <SearchableSelect label="时间范围" value={preset} options={rangeOptions.map((item) => ({ value: item.value, label: item.label }))} onChange={(value) => setPreset(value as RangePreset)} />
          {preset === "custom" ? (
            <>
              <div className="field"><label>开始日期</label><input type="date" value={customStart} max={customEnd || undefined} onChange={(event) => setCustomStart(event.target.value)} /></div>
              <div className="field"><label>结束日期</label><input type="date" value={customEnd} min={customStart || undefined} onChange={(event) => setCustomEnd(event.target.value)} /></div>
            </>
          ) : null}
        </div>
      </section>

      <section className="card compact-profit-summary" aria-label="房源利润汇总">
        <ProfitMetric label="收入" value={euro(stat.income)} tone="profit" />
        <ProfitMetric label="支出" value={euro(stat.expense)} />
        <ProfitMetric label="净利润" value={euro(stat.netProfit)} tone={stat.netProfit < 0 ? "danger" : "profit"} />
        <ProfitMetric label="欠租" value={euro(stat.unpaid)} tone={stat.unpaid > 0 ? "danger" : ""} />
        <ProfitMetric label="入住率" value={`${stat.occupancy}%`} />
        <ProfitMetric label="空置房间" value={`${stat.vacantRooms} 间`} />
      </section>

      <section className="card panel profit-bar-panel">
        <h2 className="panel-title">收支与净利润对比</h2>
        <ProfitBarChart income={stat.income} expense={stat.expense} netProfit={stat.netProfit} label={`${property.name}收入、支出与净利润对比`} />
      </section>

      <section className="card panel profit-detail-actions">
        <div>
          <h2 className="panel-title">查看业务明细</h2>
          <p className="muted">逐笔流水不在统计页展开，避免影响概览阅读。</p>
        </div>
        <div className="inline-actions">
          <Link className="btn" href="/rent-payments">查看收入明细</Link>
          <Link className="btn" href="/expenses">查看支出明细</Link>
        </div>
      </section>
    </AppLayout>
  );
}

function ProfitMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`compact-profit-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
