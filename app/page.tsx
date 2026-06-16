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
import { BedDouble, Building2, CreditCard, FileText, LogIn, MoreHorizontal, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const shortcuts = [
  { title: "一键入住", href: "/check-in", icon: LogIn, tone: "green" },
  { title: "收款", href: "/rent-payments", icon: ReceiptText, tone: "green" },
  { title: "支出", href: "/expenses", icon: CreditCard, tone: "red" },
  { title: "租客", href: "/tenants", icon: UserPlus, tone: "blue" },
  { title: "房源", href: "/properties", icon: Building2, tone: "amber" },
  { title: "房间", href: "/rooms", icon: BedDouble, tone: "blue" },
  { title: "合同", href: "/contracts", icon: FileText, tone: "blue" },
  { title: "更多", href: "/more", icon: MoreHorizontal, tone: "amber" }
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
  const currentMonth = new Date().toISOString().slice(0, 7);
  const propertyStats = useMemo(
    () => calculatePropertyProfits(properties, rooms, rentPayments, expenses, deposits, thisMonthRange),
    [deposits, expenses, properties, rentPayments, rooms, thisMonthRange]
  );
  const totals = calculateTotals(propertyStats);

  return (
    <AppLayout title="分租管理仪表盘" description="首页保留核心经营数据和常用入口，详细分析进入独立页面查看。">
      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totals.income)} note="点击查看本月收租" href={`/rent-payments?month=${currentMonth}`} />
        <MetricCard label="本月总支出" value={euro(totals.expense)} note="点击查看本月支出" href={`/expenses?month=${currentMonth}`} />
        <MetricCard label="本月净利润" value={euro(totals.netProfit)} note="收入减支出" tone={totals.netProfit < 0 ? "danger" : "profit"} href="/property-profits" hero />
        <MetricCard label="应收未收金额" value={euro(totals.unpaid)} note="点击查看欠费" tone={totals.unpaid > 0 ? "danger" : "info"} href="/rent-payments?overdue=1" />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" href="/rooms" />
        <MetricCard label="空置房间数" value={`${totals.vacantRooms} 间`} note="点击查看空置房间" href="/rooms?status=空置" />
      </div>

      <section className="card compact-shortcuts home-shortcuts">
        <div className="shortcut-grid compact-icon-grid">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="shortcut-card compact-icon-card" href={item.href} key={item.title}>
                <span className={`shortcut-icon ${item.tone}`}><Icon size={18} /></span>
                <strong>{item.title}</strong>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="card action-strip">
        <Link className="btn primary" href="/property-profits">房源利润分析 →</Link>
      </section>
    </AppLayout>
  );
}
