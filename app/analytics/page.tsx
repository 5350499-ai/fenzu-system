"use client";

import { useAccountAccess } from "@/components/account-access";
import { AppLayout } from "@/components/app-layout";
import { OperationsContractFlowChart } from "@/components/operations-contract-flow-chart";
import { OperationsRoomStatusChart } from "@/components/operations-room-status-chart";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  getInitialContracts,
  getInitialDeposits,
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
import {
  buildOperationsRooms,
  calculateOperationsContractFlow,
  calculateOperationsRoomStatusDistribution,
  calculateOperationsStats,
  OperationsScope
} from "@/lib/operations-analytics";
import { todayString } from "@/lib/rent-coverage";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function AnalyticsPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [propertyId, setPropertyId] = useState("all");
  const today = todayString();

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedContracts = access.can("tenants") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
      const loadedPayments = access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments()) : [];
      const loadedDeposits = access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载经营统计失败：${error.message || error}`));
  }, [access.ready]);

  const selectedProperties = propertyId === "all" ? properties : properties.filter((property) => property.id === propertyId);
  const scope = useMemo(
    () => scopeForProperties(selectedProperties, rooms, tenants, contracts, payments, deposits),
    [contracts, deposits, payments, rooms, selectedProperties, tenants]
  );
  const stats = useMemo(() => calculateOperationsStats(scope, today), [scope, today]);
  const operationRooms = useMemo(() => buildOperationsRooms(scope, today), [scope, today]);
  const contractFlow = useMemo(() => calculateOperationsContractFlow(scope, today), [scope, today]);
  const roomStatusDistribution = useMemo(() => calculateOperationsRoomStatusDistribution(scope), [scope]);
  const selectedProperty = properties.find((property) => property.id === propertyId);
  const scopeLabel = propertyId === "all" ? "全部房源" : selectedProperty?.name || "当前房源";
  const byProperty = useMemo(
    () => properties.map((property) => ({ property, stats: calculateOperationsStats(scopeForProperties([property], rooms, tenants, contracts, payments, deposits), today) })),
    [contracts, deposits, payments, properties, rooms, tenants, today]
  );

  return (
    <AppLayout title="经营统计" description="按房源查看租客、房间、合同、租金与押金的当前经营状态。">
      <section className="card panel operations-filter-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">统计范围</h2>
            <p className="muted">截至今天：{today}</p>
          </div>
        </div>
        <SearchableSelect
          label="房源范围"
          value={propertyId}
          options={[{ value: "all", label: "全部房源" }, ...properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.city} ${property.address}` }))]}
          onChange={setPropertyId}
        />
      </section>

      <section className="operations-metric-group" aria-label={`${scopeLabel}租客统计`}>
        <div className="operations-section-heading"><h2>租客</h2><span>{scopeLabel}</span></div>
        <div className="operations-metric-grid">
          <OperationsMetric label="当前在租人数" value={`${stats.activeOccupants} 人`} />
          <OperationsMetric label="已退租" value={`${stats.movedOutTenants} 人`} />
          <OperationsMetric label="本月开始合同" value={`${stats.contractsStartedThisMonth} 份`} />
          <OperationsMetric label="30天内到期" value={`${stats.expiringContracts} 份`} tone={stats.expiringContracts ? "warning" : ""} />
        </div>
      </section>

      <section className="operations-metric-group" aria-label={`${scopeLabel}租金与押金统计`}>
        <div className="operations-section-heading"><h2>租金与押金</h2><span>当前状态</span></div>
        <div className="operations-metric-grid">
          <OperationsMetric label="待收租" value={`${stats.rentDueTenants} 人`} tone={stats.rentDueTenants ? "warning" : ""} />
          <OperationsMetric label="欠租" value={`${stats.overdueTenants} 人`} tone={stats.overdueTenants ? "danger" : ""} />
          <OperationsMetric label="欠租金额" value={euro(stats.overdueAmount)} tone={stats.overdueAmount ? "danger" : ""} />
          <OperationsMetric label="押金待处理" value={`${stats.pendingDepositTenants} 人`} tone={stats.pendingDepositTenants ? "warning" : ""} />
        </div>
      </section>

      <section className="operations-metric-group" aria-label={`${scopeLabel}房间统计`}>
        <div className="operations-section-heading"><h2>房间</h2><span>动态入住状态</span></div>
        <div className="operations-metric-grid">
          <OperationsMetric label="房间总数" value={`${stats.totalRooms} 间`} />
          <OperationsMetric label="已出租" value={`${stats.rentedRooms} 间`} tone="success" />
          <OperationsMetric label="空置" value={`${stats.vacantRooms} 间`} tone={stats.vacantRooms ? "warning" : ""} />
          <OperationsMetric label="入住率" value={`${stats.occupancy}%`} tone="info" />
        </div>
      </section>

      <section className="card panel operations-chart-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">近6个月租赁变化</h2>
            <p className="muted">按合同开始日期与结束日期统计，不代表实际搬入或搬出日期。</p>
          </div>
        </div>
        <OperationsContractFlowChart months={contractFlow} />
      </section>

      <section className="card panel operations-chart-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">当前房间状态</h2>
            <p className="muted">按当前有效房间的动态入住与房间状态统计。</p>
          </div>
        </div>
        <OperationsRoomStatusChart distribution={roomStatusDistribution} />
      </section>

      <section className="card panel operations-alerts" aria-label="经营提醒">
        <div className="panel-header"><h2 className="panel-title">经营提醒</h2><Link className="text-link" href="/reminders">查看提醒中心</Link></div>
        <div className="operations-alert-links">
          <Link href="/rent-payments">待收租 {stats.rentDueTenants} 人</Link>
          <Link href="/rent-payments?overdue=1">欠租 {stats.overdueTenants} 人</Link>
                  <Link href="/tenants?contractExpiring=30">30天内到期 {stats.expiringContracts} 份</Link>
          <Link href="/deposits">押金待处理 {stats.pendingDepositTenants} 人</Link>
          <Link href="/rooms?status=空置">空置 {stats.vacantRooms} 间</Link>
        </div>
      </section>

      <section className="card panel operations-room-panel">
        <div className="panel-header"><div><h2 className="panel-title">房间状态</h2><p className="muted">当前出租、覆盖与合同状态；空置天数只使用已结束合同的结束日。</p></div></div>
        <div className="operations-room-list">
          {operationRooms.map((item) => (
            <article className="operations-room-row" key={item.room.id}>
              <div className="operations-room-head">
                <div><strong>{item.room.roomNumber || item.room.name}</strong><small>{item.property?.name || "未分配房源"}{item.room.name && item.room.roomNumber ? ` · ${item.room.name}` : ""}</small></div>
                <StatusBadge tone={item.statusTone}>{item.statusLabel}</StatusBadge>
              </div>
              {item.statusLabel === "已出租" ? (
                <div className="operations-room-meta">
                  <span>租客：{item.currentTenantLabel}</span>
                  <span>当前月租：{euro(item.monthlyRent)}</span>
                  {item.coverageEnd ? <span>覆盖至：{item.coverageEnd}</span> : null}
                  {item.contractEnd ? <span className={item.contractUrgent ? "operations-warning" : ""}>{item.contractUrgent ? "30天内到期：" : "合同至："}{item.contractEnd}</span> : null}
                </div>
              ) : item.statusLabel === "空置" ? (
                <div className="operations-room-meta">
                  {item.vacancy === "known" ? <span className="operations-warning">已空置 {item.vacantDays} 天</span> : null}
                  {item.vacancy === "unknown" ? <span>空置中 · 暂无可靠起算日</span> : null}
                  {item.vacancy === "invalid-date" ? <span className="danger-text">计划空置日期异常</span> : null}
                </div>
              ) : <div className="operations-room-meta"><span>当前状态：{item.statusLabel}</span></div>}
            </article>
          ))}
          {!operationRooms.length ? <p className="muted">当前范围内暂无房间。</p> : null}
        </div>
      </section>

      {propertyId === "all" ? (
        <section className="card panel operations-property-panel">
          <div className="panel-header"><div><h2 className="panel-title">各房源经营概览</h2><p className="muted">仅显示运营状态，不包含收入、支出或利润。</p></div></div>
          <div className="operations-property-list">
            {byProperty.map(({ property, stats: propertyStats }) => (
              <Link className="operations-property-card" href={`/properties/${property.id}`} key={property.id}>
                <div className="operations-property-head"><strong>{property.name}</strong><span>查看房源</span></div>
                <div className="operations-property-values">
                  <span>房间 {propertyStats.totalRooms}</span><span>已租 {propertyStats.rentedRooms}</span><span>空置 {propertyStats.vacantRooms}</span><span>入住率 {propertyStats.occupancy}%</span><span>在租 {propertyStats.activeOccupants}</span><span>待收租 {propertyStats.rentDueTenants}</span><span>欠租 {propertyStats.overdueTenants}</span><span>即将到期 {propertyStats.expiringContracts}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AppLayout>
  );
}

function scopeForProperties(
  selectedProperties: BusinessProperty[],
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  payments: BusinessRentPayment[],
  deposits: BusinessDeposit[]
): OperationsScope {
  const propertyIds = new Set(selectedProperties.map((property) => property.id));
  return {
    properties: selectedProperties,
    rooms: rooms.filter((room) => propertyIds.has(room.propertyId)),
    tenants: tenants.filter((tenant) => propertyIds.has(tenant.propertyId)),
    contracts: contracts.filter((contract) => propertyIds.has(contract.propertyId)),
    payments: payments.filter((payment) => propertyIds.has(payment.propertyId)),
    deposits: deposits.filter((deposit) => propertyIds.has(deposit.propertyId))
  };
}

function OperationsMetric({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return <div className={`operations-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}
