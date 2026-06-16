"use client";

import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  expenseKey,
  getInitialContracts,
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
import { calculatePropertyProfits, calculateTotals, getDateRange } from "@/lib/profit";
import { AlertTriangle, FileClock, Home, LogIn, Plus, ReceiptText, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const HOME_LIMIT = 5;
const shortcuts = [
  { title: "一键入住", href: "/check-in", icon: LogIn, tone: "green" },
  { title: "录入收款", href: "/rent-payments", icon: ReceiptText, tone: "green" },
  { title: "录入支出", href: "/expenses", icon: ReceiptText, tone: "red" },
  { title: "新增房源", href: "/properties", icon: Plus, tone: "blue" },
  { title: "新增房间", href: "/rooms", icon: Home, tone: "amber" },
  { title: "新增租客", href: "/tenants", icon: UserPlus, tone: "blue" }
];

export default function DashboardPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [rentPayments, setRentPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts(loadedProperties, loadedRooms, loadedTenants));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setRentPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载首页数据失败：${error.message || error}`));
  }, []);

  const thisMonthRange = useMemo(() => getDateRange("thisMonth"), []);
  const yearRange = useMemo(() => ({ start: `${new Date().getFullYear()}-01-01`, end: `${new Date().getFullYear()}-12-31`, label: "本年" }), []);
  const propertyStats = useMemo(() => calculatePropertyProfits(properties, rooms, rentPayments, expenses, deposits, thisMonthRange), [deposits, expenses, properties, rentPayments, rooms, thisMonthRange]);
  const yearStats = useMemo(() => calculatePropertyProfits(properties, rooms, rentPayments, expenses, deposits, yearRange), [deposits, expenses, properties, rentPayments, rooms, yearRange]);
  const totals = calculateTotals(propertyStats);
  const yearTotals = calculateTotals(yearStats);
  const profitablePropertyCount = propertyStats.filter((stat) => stat.netProfit >= 0).length;
  const lossPropertyCount = propertyStats.filter((stat) => stat.netProfit < 0).length;
  const unpaidPropertyCount = propertyStats.filter((stat) => stat.unpaid > 0).length;
  const vacancyRiskPropertyCount = propertyStats.filter((stat) => stat.vacantRooms > 0 || stat.occupancy < 80).length;
  const overdueRows = rentPayments
    .filter((payment) => !payment.notes?.includes("[已作废]") && (payment.isOverdue || Number(payment.amountUnpaid) > 0))
    .sort((a, b) => Number(b.amountUnpaid) - Number(a.amountUnpaid));
  const roomSummaryRows = [...rooms].sort((a, b) => roomPriority(a.status) - roomPriority(b.status));
  const tenantContracts = contracts
    .map((contract) => {
      const tenant = tenants.find((item) => item.id === contract.tenantId);
      const room = rooms.find((item) => item.id === contract.roomId);
      return { id: contract.id, personName: tenant?.name || "-", roomName: room?.name || "-", endDate: contract.endDate, daysLeft: daysLeft(contract.endDate) };
    })
    .filter((item) => item.daysLeft >= 0 && item.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const unpaidDepositCount = tenants.filter((tenant) => Number(tenant.depositAmount) && !deposits.some((deposit) => deposit.tenantId === tenant.id && deposit.type === "收取" && ["已收", "部分扣除"].includes(deposit.status))).length;
  const refundableDeposits = deposits.filter((deposit) => deposit.status === "待退").length;
  const unpaidExpenses = expenses.filter((expense) => !expense.isPaid && !expense.notes?.includes("[已作废]")).length;
  const risks = [
    { title: "即将到期合同", count: tenantContracts.length, note: "租客合同 30 天内到期", tone: "amber", href: "/contracts", icon: <FileClock className="warning-text" size={22} /> },
    { title: "欠租提醒", count: overdueRows.length, note: `合计 ${euro(totals.unpaid)} 未收`, tone: "red", href: "/rent-payments", icon: <AlertTriangle className="danger-text" size={22} /> },
    { title: "待退押金", count: refundableDeposits, note: "押金状态为待退", tone: "blue", href: "/deposits", icon: <ShieldAlert className="info-text" size={22} /> },
    { title: "押金未收", count: unpaidDepositCount, note: "有押金额但没有收取记录", tone: "red", href: "/deposits", icon: <ShieldAlert className="danger-text" size={22} /> },
    { title: "未支付支出", count: unpaidExpenses, note: "支出状态为未支付", tone: "blue", href: "/expenses", icon: <AlertTriangle className="info-text" size={22} /> }
  ];

  return (
    <AppLayout title="分租管理仪表盘" description="先看经营数据，再处理风险和明细。">
      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totals.income)} note="来自本月已收房租" />
        <MetricCard label="本月总支出" value={euro(totals.expense)} note="本月经营支出" />
        <MetricCard label="本月净利润" value={euro(totals.netProfit)} note="收入减支出" tone={totals.netProfit < 0 ? "danger" : "profit"} hero />
        <MetricCard label="应收未收金额" value={euro(totals.unpaid)} note="所有欠费合计" tone={totals.unpaid > 0 ? "danger" : "info"} />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" />
        <MetricCard label="空置房间数" value={`${totals.vacantRooms} 间`} note="状态为空置的房间" />
        <MetricCard label="本年累计利润" value={euro(yearTotals.netProfit)} note="本年收入减支出" tone={yearTotals.netProfit < 0 ? "danger" : "profit"} />
        <MetricCard label="欠费人数" value={`${overdueRows.length} 人`} note="存在未收金额的记录" tone={overdueRows.length ? "danger" : "info"} />
      </div>

      <section className="mobile-shortcuts card compact-shortcuts">
        <div className="shortcut-grid">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return <Link className="shortcut-card" href={item.href} key={item.title}><span className={`shortcut-icon ${item.tone}`}><Icon size={20} /></span><strong>{item.title}</strong></Link>;
          })}
        </div>
      </section>

      <section className="card profit-mini-card">
        <div className="profit-mini-text">
          <strong>房源利润：</strong>
          <span>盈利 {profitablePropertyCount}</span>
          <span>亏损 {lossPropertyCount}</span>
          <span>欠租 {unpaidPropertyCount}</span>
          <span>空置风险 {vacancyRiskPropertyCount}</span>
        </div>
        <Link className="btn primary" href="/property-profits">查看分析</Link>
      </section>

      <section className="grid risk-grid">
        {risks.slice(0, HOME_LIMIT).map((risk) => {
          const active = risk.count > 0;
          const tone = active ? risk.tone : "blue";
          return <Link className="card risk-card" href={risk.href} key={risk.title}><div className="risk-topline"><StatusBadge tone={tone}>{risk.title}</StatusBadge>{active ? risk.icon : null}</div><div className={`risk-count ${active && risk.tone === "red" ? "danger-text" : active && risk.tone === "amber" ? "warning-text" : "info-text"}`}>{risk.count}</div><div className="metric-note">{risk.note}</div></Link>;
        })}
      </section>

      <div className="grid dashboard-panels">
        <section className="card panel">
          <div className="panel-header"><h2 className="panel-title">房间状态列表</h2><span className="muted">只显示前 5 条重点数据</span></div>
          <div className="table-wrap">
            <table><thead><tr><th>房源</th><th>房间</th><th>状态</th><th>当前租客</th><th>月租</th><th>收款状态</th></tr></thead><tbody>
              {roomSummaryRows.slice(0, HOME_LIMIT).map((room) => {
                const property = properties.find((item) => item.id === room.propertyId);
                const tenant = tenants.find((item) => item.roomId === room.id && item.status === "在租");
                const payment = rentPayments.find((item) => item.rentMonth === new Date().toISOString().slice(0, 7) && item.roomId === room.id);
                return <tr key={room.id}><td>{property?.name || "-"}</td><td>{room.name || "-"}</td><td><StatusBadge tone={roomTone(room.status)}>{room.status}</StatusBadge></td><td>{tenant?.name || "-"}</td><td>{euro(room.monthlyRent)}</td><td>{payment ? <StatusBadge tone={payment.isOverdue || payment.amountUnpaid > 0 ? "red" : "green"}>{payment.isOverdue || payment.amountUnpaid > 0 ? "未结清" : "已收款"}</StatusBadge> : "-"}</td></tr>;
              })}
            </tbody></table>
          </div>
          <ShowMore total={roomSummaryRows.length} shown={HOME_LIMIT} href="/rooms" />
        </section>
        <section className="card panel">
          <div className="panel-header"><h2 className="panel-title">欠费名单</h2><span className="badge red">{euro(totals.unpaid)}</span></div>
          <div className="list">{overdueRows.slice(0, HOME_LIMIT).map((payment) => { const tenant = tenants.find((item) => item.id === payment.tenantId); const room = rooms.find((item) => item.id === payment.roomId); return <div className="list-item" key={payment.id}><div><div className="list-title">{tenant?.name || "-"} · {room?.name || "-"}</div><div className="list-meta">月份：{payment.rentMonth || "-"}</div></div><strong className="danger-text">{euro(payment.amountUnpaid)}</strong></div>; })}<ShowMore total={overdueRows.length} shown={HOME_LIMIT} href="/rent-payments" /></div>
        </section>
      </div>

      <div className="grid dashboard-panels">
        <section className="card panel"><div className="panel-header"><h2 className="panel-title">即将到期合同</h2><span className="muted">租客合同 30 天内</span></div><div className="list">{tenantContracts.slice(0, HOME_LIMIT).map((item) => <div className="list-item" key={item.id}><div><div className="list-title">{item.personName} · {item.roomName}</div><div className="list-meta">到期日期：{item.endDate || "-"}</div></div><StatusBadge tone="amber">剩余 {item.daysLeft} 天</StatusBadge></div>)}<ShowMore total={tenantContracts.length} shown={HOME_LIMIT} href="/contracts" /></div></section>
        <section className="card panel"><div className="panel-header"><h2 className="panel-title">待办事项</h2><span className="muted">待办管理中录入的事项</span></div><div className="list"><div className="list-item"><span className="muted">暂无自动待办数据</span><Link className="btn" href="/tasks">查看待办</Link></div></div></section>
      </div>
    </AppLayout>
  );
}

function ShowMore({ total, shown, href }: { total: number; shown: number; href: string }) {
  const hidden = Math.max(total - shown, 0);
  if (hidden <= 0) return null;
  return <Link className="show-more" href={href}>还有 {hidden} 条，查看全部</Link>;
}

function roomPriority(status: string) {
  const priority: Record<string, number> = { "空置": 1, "即将退租": 2, "维修中": 3, "暂停出租": 4, "预订中": 5, "已租": 6, "已归档": 7 };
  return priority[status] ?? 99;
}

function roomTone(status: string) {
  if (status === "已租") return "green";
  if (status === "空置") return "blue";
  if (["维修中", "已归档"].includes(status)) return "red";
  return "amber";
}

function daysLeft(date: string) {
  if (!date) return 9999;
  const today = new Date();
  const end = new Date(date);
  return Math.ceil((end.getTime() - today.getTime()) / 86400000);
}
