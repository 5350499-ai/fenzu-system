"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import type { AccountModuleKey } from "@/lib/account-permissions";
import { MetricCard } from "@/components/metric-card";
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
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange } from "@/lib/profit";
import { fixedRentCollectionReminderStage, isCoverageExpired, latestCoverageForTenant, overdueReferenceAmount, paymentCoverageEnd, roomOccupancyStatus, strictCurrentRentalTenant } from "@/lib/rent-coverage";
import { AlertTriangle, BedDouble, Building2, ChevronDown, CreditCard, HandCoins, LogIn, MoreHorizontal, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const shortcuts = [
  { title: "一键入住", href: "/check-in", icon: LogIn, tone: "green", module: "check_in" },
  { title: "支出", href: "/expenses", icon: CreditCard, tone: "red", module: "expenses" },
  { title: "收款", href: "/rent-payments", icon: ReceiptText, tone: "green", module: "rent_payments" },
  { title: "房源", href: "/properties", icon: Building2, tone: "amber", module: "properties" },
  { title: "租客", href: "/tenants", icon: UserPlus, tone: "blue", module: "tenants" },
  { title: "房间", href: "/rooms", icon: BedDouble, tone: "blue", module: "rooms" },
  { title: "结算", href: "/partnership-settlement", icon: HandCoins, tone: "blue", module: "partnership_settlement", sensitive: "canViewPartnershipSettlement" },
  { title: "更多", href: "/more", icon: MoreHorizontal, tone: "amber" }
] satisfies Array<{ title: string; href: string; icon: typeof LogIn; tone: string; module?: AccountModuleKey; sensitive?: "canViewPartnershipSettlement" }>;

export default function DashboardPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [rentPayments, setRentPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedContracts = access.can("tenants") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
      const loadedPayments = access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants)) : [];
      const loadedExpenses = access.can("expenses") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : [];
      const loadedDeposits = access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants)) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setRentPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
    }
    load().catch((error) => window.alert(`加载首页数据失败：${error.message || error}`));
  }, [access.ready]);

  const thisMonthRange = useMemo(() => getDateRange("thisMonth"), []);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const propertyStats = useMemo(
    () => calculatePropertyProfits(properties, rooms, tenants, rentPayments, expenses, deposits, thisMonthRange),
    [deposits, expenses, properties, rentPayments, rooms, tenants, thisMonthRange]
  );
  const totals = calculateTotals(propertyStats, calculateUnassignedIncome(rentPayments, thisMonthRange));
  const reminders = useMemo(
    () => buildDashboardReminders({ properties, rooms, tenants, contracts, rentPayments, deposits }),
    [contracts, deposits, properties, rentPayments, rooms, tenants]
  );
  const visibleReminders = reminders.slice(0, 3);
  const reminderSummary = useMemo(
    () => buildReminderSummary({ rooms, tenants, contracts, rentPayments, deposits }),
    [contracts, deposits, rentPayments, rooms, tenants]
  );

  return (
    <AppLayout title="分租管理仪表盘" description="首页保留核心经营数据和常用入口，详细分析进入独立页面查看。">
      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totals.income)} note="点击查看本月收款" href={`/rent-payments?month=${currentMonth}`} />
        <MetricCard label="本月总支出" value={euro(totals.expense)} note="点击查看本月支出" href={`/expenses?month=${currentMonth}`} />
        <MetricCard label="本月净利润" value={euro(totals.netProfit)} note="收入减支出" tone={totals.netProfit < 0 ? "danger" : "profit"} href="/property-profits" hero />
        <MetricCard label="应收未收金额" value={euro(totals.unpaid)} note="点击查看欠费" tone={totals.unpaid > 0 ? "danger" : "info"} href="/rent-payments?overdue=1" />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" href="/rooms" />
        <MetricCard label="空置房间数" value={`${totals.vacantRooms} 间`} note="点击查看空置房间" href="/rooms?status=空置" />
      </div>

      <section className="card compact-shortcuts home-shortcuts">
        <div className="shortcut-grid compact-icon-grid">
          {shortcuts.filter((item) => (!item.module || access.can(item.module)) && (!item.sensitive || access.canSensitive(item.sensitive))).map((item) => {
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

      <section className="card panel reminder-center">
        <button className="reminder-toggle" onClick={() => setRemindersOpen((current) => !current)} type="button">
          <span className="reminder-toggle-title"><AlertTriangle size={17} /> 提醒中心（{reminders.length}）</span>
          <span className={`reminder-summary ${reminders[0]?.tone || ""}`}>{reminderSummary}</span>
          <ChevronDown className={remindersOpen ? "open" : ""} size={18} />
        </button>
        {remindersOpen ? (
          <div className="reminder-list">
            {visibleReminders.length ? visibleReminders.map((item) => (
              <Link className={`reminder-item ${item.tone}${item.rentContext ? " rent-reminder" : ""}`} href={item.href} key={item.id}>
                {item.rentContext ? (
                  <>
                    <span className="reminder-rent-head">
                      <strong>{item.rentContext.propertyLabel}｜{item.rentContext.roomLabel}</strong>
                      <em className={`reminder-rent-status ${item.tone}`}>{item.rentContext.statusLabel}</em>
                    </span>
                    <small>{item.rentContext.tenantName}｜覆盖至：{item.rentContext.coverageEnd}</small>
                  </>
                ) : (
                  <>
                    <span>{item.title}</span>
                    <small>{item.description}</small>
                  </>
                )}
              </Link>
            )) : <p className="muted">暂无需要处理的提醒。</p>}
            {reminders.length > 3 ? <Link className="btn" href="/reminders">查看更多</Link> : null}
          </div>
        ) : null}
      </section>

    </AppLayout>
  );
}

type Reminder = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "danger" | "warning" | "yellow" | "info";
  priority: number;
  rentContext?: {
    propertyLabel: string;
    roomLabel: string;
    tenantName: string;
    coverageEnd: string;
    statusLabel: string;
  };
};

function buildDashboardReminders({
  properties,
  rooms,
  tenants,
  contracts,
  rentPayments,
  deposits
}: {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
}) {
  const reminders: Reminder[] = [];
  const today = new Date();
  const propertyById = new Map(properties.map((item) => [item.id, item]));
  const roomById = new Map(rooms.map((item) => [item.id, item]));
  const tenantById = new Map(tenants.map((item) => [item.id, item]));

  tenants
    .filter((tenant) => strictCurrentRentalTenant(tenant))
    .map((tenant) => {
      const payment = latestCoverageForTenant(tenant.id, rentPayments);
      return { tenant, payment, stage: fixedRentCollectionReminderStage(tenant, payment) };
    })
    .filter(({ stage }) => Boolean(stage))
    .sort((a, b) => rentStagePriority(b.stage?.level) - rentStagePriority(a.stage?.level))
    .forEach(({ tenant, payment, stage }) => {
      if (!stage) return;
      const room = roomById.get(tenant.roomId);
      const amount = overdueReferenceAmount(payment, tenant);
      const roomLabel = room?.roomNumber || room?.name || tenant.name || "租客";
      reminders.push({
        id: `rent-${tenant.id}`,
        title: fixedRentReminderTitle(roomLabel, stage, amount),
        description: `${tenant.name || "未命名租客"}｜覆盖至 ${payment ? paymentCoverageEnd(payment) : "-"}`,
        href: stage.level === "overdue" ? "/rent-payments?overdue=1" : "/rent-payments",
        tone: rentStageTone(stage.level),
        priority: rentStagePriority(stage.level) + (stage.level === "overdue" ? amount : 10 - stage.daysRemaining),
        rentContext: {
          propertyLabel: compactReminderPropertyName(propertyById.get(tenant.propertyId)?.name),
          roomLabel: compactReminderRoomName(room),
          tenantName: tenant.name || "未命名租客",
          coverageEnd: payment ? paymentCoverageEnd(payment) : "-",
          statusLabel: fixedRentReminderStatus(stage, amount)
        }
      });
    });

  contracts
    .map((contract) => ({ contract, days: daysUntil(contract.endDate, today) }))
    .filter(({ days }) => days <= 30)
    .sort((a, b) => a.days - b.days)
    .forEach(({ contract, days }) => {
      const tenant = tenantById.get(contract.tenantId);
      const room = roomById.get(contract.roomId);
      reminders.push({
        id: `contract-${contract.id}`,
        title: `${tenant?.name || "租客"}合同${days < 0 ? `已到期${Math.abs(days)}天` : `还有${days}天到期`}`,
        description: room?.name || contract.endDate || "合同到期提醒",
        href: "/tenants",
        tone: "danger",
        priority: 30_000 - days
      });
    });

  rooms
    .filter((room) => room.status.includes("即将退租"))
    .forEach((room) => {
      reminders.push({
        id: `moving-${room.id}`,
        title: `${room.name} 即将退租`,
        description: propertyById.get(room.propertyId)?.name || "房间状态提醒",
        href: "/rooms",
        tone: "warning",
        priority: 20_000
      });
    });

  deposits
    .filter((deposit) => ["待退", "部分扣除"].includes(deposit.status) && !isVoided(deposit.notes))
    .forEach((deposit) => {
      const tenant = tenantById.get(deposit.tenantId);
      reminders.push({
        id: `deposit-${deposit.id}`,
        title: `${tenant?.name || "租客"}押金${deposit.status}`,
        description: euro(deposit.amount),
        href: "/deposits",
        tone: "info",
        priority: 10_000
      });
    });

  const vacantByProperty = rooms
    .filter((room) => roomOccupancyStatus(room, rentPayments).includes("空置"))
    .reduce<Record<string, number>>((map, room) => {
      map[room.propertyId] = (map[room.propertyId] || 0) + 1;
      return map;
    }, {});
  Object.entries(vacantByProperty).forEach(([propertyId, count]) => {
    reminders.push({
      id: `vacant-${propertyId}`,
      title: `${propertyById.get(propertyId)?.name || "房源"}空置${count}间`,
      description: "点击查看房间状态",
      href: "/rooms?status=空置",
      tone: "warning",
      priority: 1_000 + count
    });
  });

  return reminders.sort((a, b) => b.priority - a.priority);
}

function buildReminderSummary({
  rooms,
  tenants,
  contracts,
  rentPayments,
  deposits
}: {
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
}) {
  const today = new Date();
  const unpaid = tenants.reduce((sum, tenant) => {
    if (!strictCurrentRentalTenant(tenant)) return sum;
    const payment = latestCoverageForTenant(tenant.id, rentPayments);
    return sum + (isCoverageExpired(payment) ? overdueReferenceAmount(payment, tenant) : 0);
  }, 0);
  const rentDueCount = tenants.filter((tenant) => {
    if (!strictCurrentRentalTenant(tenant)) return false;
    const payment = latestCoverageForTenant(tenant.id, rentPayments);
    const stage = fixedRentCollectionReminderStage(tenant, payment);
    return stage && stage.level !== "overdue";
  }).length;
  const expiringCount = contracts.filter((contract) => {
    const days = daysUntil(contract.endDate, today);
    return days <= 30;
  }).length;
  const abnormalDeposits = deposits.filter((deposit) => ["待退", "部分扣除"].includes(deposit.status) && !isVoided(deposit.notes)).length;
  const vacantRooms = rooms.filter((room) => roomOccupancyStatus(room, rentPayments).includes("空置")).length;
  const parts = [];
  if (unpaid > 0) parts.push(`欠费${euro(unpaid)}`);
  if (rentDueCount > 0) parts.push(`待收租${rentDueCount}`);
  if (expiringCount > 0) parts.push(`快到期${expiringCount}`);
  if (abnormalDeposits > 0) parts.push(`押金异常${abnormalDeposits}`);
  if (vacantRooms > 0) parts.push(`空置${vacantRooms}`);
  return parts.length ? parts.join("｜") : "暂无待处理提醒";
}

function fixedRentReminderStatus(stage: ReturnType<typeof fixedRentCollectionReminderStage> & {}, amount: number) {
  if (stage.overdueDays > 0) return `\u5df2\u5230\u671f${stage.overdueDays}\u5929 ${euro(amount)}`;
  if (stage.daysRemaining === 0) return "\u4eca\u65e5\u5230\u671f";
  if (stage.level === "urgent") return `\u5373\u5c06\u5230\u671f${stage.daysRemaining}\u5929`;
  return `\u5269\u4f59${stage.daysRemaining}\u5929`;
}

function compactReminderPropertyName(name?: string) {
  const value = (name || "").replace(/\s+/g, "").trim();
  return value ? value.slice(0, 7) + (value.length > 7 ? "..." : "") : "房源";
}

function compactReminderRoomName(room?: BusinessRoom) {
  const value = (room?.name || room?.roomNumber || "").trim();
  if (!value) return "房间";
  const number = room?.roomNumber?.trim() || value.match(/^\d{1,4}/)?.[0] || "";
  if (!number) return value.slice(0, 10) + (value.length > 10 ? "..." : "");
  const description = value.slice(value.indexOf(number) + number.length).trim();
  return description ? `${number} ${description.slice(0, 6)}` : number;
}

function fixedRentReminderTitle(room: string, stage: ReturnType<typeof fixedRentCollectionReminderStage> & {}, amount: number) {
  if (stage.overdueDays > 0) return `${room}\u5df2\u5230\u671f${stage.overdueDays}\u5929 ${euro(amount)}`;
  if (stage.daysRemaining === 0) return `${room}\u4eca\u65e5\u5230\u671f`;
  if (stage.level === "urgent") return `${room}\u5373\u5c06\u5230\u671f${stage.daysRemaining}\u5929`;
  return `${room}\u5269\u4f59${stage.daysRemaining}\u5929`;
}

function rentReminderTitle(room: string, stage: ReturnType<typeof fixedRentCollectionReminderStage> & {}, amount: number) {
  if (stage.overdueDays > 0) return `${room}已欠费${stage.overdueDays}天 ${euro(amount)}`;
  if (stage.daysPastPaymentDay === 0) return `${room}今天是缴费日，请提醒交下期房租`;
  return `${room}已过缴费日${stage.daysPastPaymentDay}天，仍未收到下期房租`;
}

function rentStagePriority(level?: string) {
  if (level === "overdue") return 50_000;
  if (level === "critical") return 45_000;
  if (level === "urgent") return 42_000;
  if (level === "upcoming") return 40_000;
  return 0;
}

function rentStageTone(level: string): Reminder["tone"] {
  if (level === "overdue" || level === "critical") return "danger";
  if (level === "urgent") return "warning";
  return "yellow";
}

function daysUntil(date: string, from: Date) {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(from.toISOString().slice(0, 10) + "T00:00:00");
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
