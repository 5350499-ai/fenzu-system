"use client";

import { AppLayout } from "@/components/app-layout";
import { MetricCard } from "@/components/metric-card";
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
import { calculatePropertyProfits, calculateTotals, getDateRange } from "@/lib/profit";
import { Building2, FileText, LogIn, Plus, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const shortcuts = [
  { title: "一键入住", href: "/check-in", icon: LogIn, tone: "green" },
  { title: "录入收款", href: "/rent-payments", icon: ReceiptText, tone: "green" },
  { title: "录入支出", href: "/expenses", icon: ReceiptText, tone: "red" },
  { title: "新增租客", href: "/tenants", icon: UserPlus, tone: "blue" },
  { title: "合同管理", href: "/contracts", icon: FileText, tone: "blue" },
  { title: "房源管理", href: "/properties", icon: Building2, tone: "amber" }
];

export default function DashboardPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [rentPayments, setRentPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, []));
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, []));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setRentPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载首页数据失败：${error.message || error}`));
  }, []);

  const thisMonthRange = useMemo(() => getDateRange("thisMonth"), []);
  const propertyStats = useMemo(() => calculatePropertyProfits(properties, rooms, rentPayments, expenses, deposits, thisMonthRange), [deposits, expenses, properties, rentPayments, rooms, thisMonthRange]);
  const totals = calculateTotals(propertyStats);

  return (
    <AppLayout title="分租管理仪表盘" description="首页只保留核心经营数据，详细分析进入独立页面查看。">
      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totals.income)} note="本月已收房租" />
        <MetricCard label="本月总支出" value={euro(totals.expense)} note="本月经营支出" />
        <MetricCard label="本月净利润" value={euro(totals.netProfit)} note="收入减支出" tone={totals.netProfit < 0 ? "danger" : "profit"} hero />
        <MetricCard label="应收未收金额" value={euro(totals.unpaid)} note="欠租合计" tone={totals.unpaid > 0 ? "danger" : "info"} />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" />
        <MetricCard label="空置房间数" value={`${totals.vacantRooms} 间`} note="状态为空置的房间" />
      </div>

      <section className="card action-strip">
        <Link className="btn primary" href="/property-profits">房源利润分析 →</Link>
      </section>

      <section className="card compact-shortcuts">
        <div className="panel-header shortcut-header">
          <h2 className="panel-title">快捷操作</h2>
        </div>
        <div className="shortcut-grid">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="shortcut-card" href={item.href} key={item.title}>
                <span className={`shortcut-icon ${item.tone}`}><Icon size={20} /></span>
                <strong>{item.title}</strong>
              </Link>
            );
          })}
        </div>
      </section>
    </AppLayout>
  );
}
