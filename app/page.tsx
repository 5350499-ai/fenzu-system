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
  BusinessViewingAppointment,
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
  refreshBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey,
  viewingAppointmentKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { localToday } from "@/lib/actual-move-out-date";
import { formatHomeAppointmentDateTime, resolveAppointmentLocation } from "@/lib/viewing-appointments";
import { pendingDepositReturnRecords } from "@/lib/deposit-return-reminders";
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange } from "@/lib/profit";
import { fixedRentCollectionReminderStage, isCanonicalRentReminderTenant, isCoverageExpired, latestCoverageForTenant, overdueReferenceAmount, paymentCoverageEnd, roomOccupancyStatus, isCurrentRentalRelationship } from "@/lib/rent-coverage";
import { rentCollectionRemaining } from "@/lib/rent-collection";
import { getValidSupabaseSession } from "@/lib/supabase";
import { AlertTriangle, BedDouble, Building2, CalendarCheck, ChevronDown, CreditCard, HandCoins, LogIn, MoreHorizontal, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cacheManager } from "@/lib/cache/cache-manager";
import { DASHBOARD_CACHE_KEY } from "@/lib/cache/cache-keys";

const shortcuts = [
  { title: "一键入住", href: "/check-in", icon: LogIn, tone: "green", module: "check_in" },
  { title: "支出", href: "/expenses", icon: CreditCard, tone: "red", module: "expenses" },
  { title: "收款", href: "/rent-payments", icon: ReceiptText, tone: "green", module: "rent_payments" },
  { title: "房源", href: "/properties", icon: Building2, tone: "amber", module: "properties" },
  { title: "租客", href: "/tenants", icon: UserPlus, tone: "blue", module: "tenants" },
  { title: "房间", href: "/rooms", icon: BedDouble, tone: "blue", module: "rooms" },
  { title: "结算", href: "/partnership-settlement", icon: HandCoins, tone: "blue", module: "partnership_settlement", sensitive: "canViewPartnershipSettlement" },
  { title: "更多", href: "/more", icon: MoreHorizontal, tone: "amber" }
] satisfies Array<{ title: string; href: string; icon: typeof LogIn; tone: string; module?: AccountModuleKey; sensitive?: "canViewPartnershipSettlement" | "canViewProfits" }>;

type DashboardSnapshot = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  expenses: BusinessExpense[];
  deposits: BusinessDeposit[];
  viewingAppointments: BusinessViewingAppointment[];
  waivedPaymentIds: string[];
};

export default function DashboardPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [rentPayments, setRentPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [viewingAppointments, setViewingAppointments] = useState<BusinessViewingAppointment[]>([]);
  const [remindersOpen, setRemindersOpen] = useState(false);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [dataError, setDataError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [waivedPaymentIds, setWaivedPaymentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!access.ready || !access.authenticated) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const applySnapshot = (snapshot: DashboardSnapshot) => {
      setProperties(snapshot.properties);
      setRooms(snapshot.rooms);
      setTenants(snapshot.tenants);
      setContracts(snapshot.contracts);
      setRentPayments(snapshot.rentPayments);
      setExpenses(snapshot.expenses);
      setDeposits(snapshot.deposits);
      setViewingAppointments(snapshot.viewingAppointments);
      setWaivedPaymentIds(new Set(snapshot.waivedPaymentIds));
      setDataStatus("ready");
    };
    async function load() {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("Session expired");
      const scope = session.user.id;
      const memorySnapshot = cacheManager.peekMemory<DashboardSnapshot>(DASHBOARD_CACHE_KEY, scope);
      if (memorySnapshot) applySnapshot(memorySnapshot);
      else setDataStatus("loading");
      setDataError("");
      unsubscribe = cacheManager.subscribe(scope, DASHBOARD_CACHE_KEY, () => {
        const next = cacheManager.peekMemory<DashboardSnapshot>(DASHBOARD_CACHE_KEY, scope);
        if (next && active) applySnapshot(next);
      });
      const snapshot = await cacheManager.get<DashboardSnapshot>(DASHBOARD_CACHE_KEY, {
        scope,
        loader: async ({ revalidate = false } = {}) => {
          const loadedProperties = access.can("properties") ? (revalidate ? await refreshBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties())) : [];
          const loadedRooms = access.can("rooms") ? (revalidate ? await refreshBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties))) : [];
          const loadedTenants = access.can("tenants") ? (revalidate ? await refreshBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms))) : [];
          const loadedContracts = access.can("tenants") ? (revalidate ? await refreshBusinessData<BusinessContract>(contractKey, getInitialContracts()) : await loadBusinessData<BusinessContract>(contractKey, getInitialContracts())) : [];
          const loadedPayments = access.can("rent_payments") ? (revalidate ? await refreshBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants)) : await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants))) : [];
          const loadedExpenses = access.can("expenses") ? (revalidate ? await refreshBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties)) : await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties))) : [];
          const loadedDeposits = access.can("deposits") ? (revalidate ? await refreshBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants)) : await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants))) : [];
          const loadedViewingAppointments = access.can("properties") ? (revalidate ? await refreshBusinessData<BusinessViewingAppointment>(viewingAppointmentKey, []) : await loadBusinessData<BusinessViewingAppointment>(viewingAppointmentKey, [])) : [];
          const latestSession = await getValidSupabaseSession();
          let waivedIds: string[] = [];
          if (latestSession) {
            const response = await fetch("/api/rent-collection", { headers: { Authorization: `Bearer ${latestSession.access_token}` }, cache: "no-store" });
            if (response.ok) {
              const payload = await response.json() as { actions?: Array<{ rentPaymentId?: string }> };
              waivedIds = (payload.actions || []).map((action) => action.rentPaymentId).filter(Boolean) as string[];
            }
          }
          return { properties: loadedProperties, rooms: loadedRooms, tenants: loadedTenants, contracts: loadedContracts, rentPayments: loadedPayments, expenses: loadedExpenses, deposits: loadedDeposits, viewingAppointments: loadedViewingAppointments, waivedPaymentIds: waivedIds };
        }
      });
      if (!active) return;
      applySnapshot(snapshot);
    }
    load().catch((error) => {
      if (!active) return;
      setDataStatus("error");
      setDataError(error instanceof Error ? error.message : "首页数据加载失败，请稍后重试。");
    });
    return () => { active = false; unsubscribe?.(); };
  }, [access.authenticated, access.ready, access.permissionVersion, loadAttempt]);

  /* legacy loading block removed: dashboard data now arrives through the aggregate cache key above. */
  /*
      if (session) {
        const response = await fetch("/api/rent-collection", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { actions?: Array<{ rentPaymentId?: string }> };
          setWaivedPaymentIds(new Set((payload.actions || []).map((action) => action.rentPaymentId).filter(Boolean) as string[]));
        }
      }
      setDataStatus("ready");
    }
    load().catch((error) => {
      if (!active) return;
      setDataStatus("error");
      setDataError(error instanceof Error ? error.message : "加载首页数据失败，请稍后重试。");
    });
    return () => { active = false; };
  }
  */
  const thisMonthRange = useMemo(() => getDateRange("thisMonth"), []);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const propertyStats = useMemo(
    () => calculatePropertyProfits(properties, rooms, tenants, rentPayments, expenses, deposits, thisMonthRange),
    [deposits, expenses, properties, rentPayments, rooms, tenants, thisMonthRange]
  );
  const totals = calculateTotals(propertyStats, calculateUnassignedIncome(rentPayments, thisMonthRange));
  const waivedUnpaid = useMemo(() => tenants.reduce((sum, tenant) => {
    const payment = latestCoverageForTenant(tenant.id, rentPayments);
    return sum + (payment && waivedPaymentIds.has(payment.id) && isCoverageExpired(payment) ? rentCollectionRemaining(payment) : 0);
  }, 0), [rentPayments, tenants, waivedPaymentIds]);
  const dashboardTotals = { ...totals, unpaid: Math.max(0, totals.unpaid - waivedUnpaid) };
  const reminders = useMemo(
    () => buildDashboardReminders({ properties, rooms, tenants, contracts, rentPayments, deposits, waivedPaymentIds, includeBackupReminder: !access.isFreeSingle }),
    [access.isFreeSingle, contracts, deposits, properties, rentPayments, rooms, tenants, waivedPaymentIds]
  );
  const visibleReminders = reminders.slice(0, 3);
  const reminderSummary = useMemo(
    () => buildReminderSummary({ rooms, tenants, contracts, rentPayments, deposits, waivedPaymentIds }),
    [contracts, deposits, rentPayments, rooms, tenants, waivedPaymentIds]
  );
  const today = localToday();
  const pendingAppointments = useMemo(() => [...viewingAppointments]
    .filter((item) => item.status === "待看房" && item.appointmentDate >= today)
    .sort((a, b) => `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`))
    , [today, viewingAppointments]);
  const upcomingAppointments = pendingAppointments.slice(0, 3);

  return (
    <AppLayout title="分租管理" description="首页保留核心经营数据和常用入口，详细分析进入独立页面查看。">
      {dataStatus !== "ready" ? (
        <section className="card panel">
          <p className={dataStatus === "error" ? "danger-text" : "muted"}>
            {dataStatus === "error" ? `加载首页数据失败：${dataError || "请稍后重试。"}` : "正在加载首页数据..."}
          </p>
          {dataStatus === "error" ? <button className="btn" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>重新加载</button> : null}
        </section>
      ) : (
        <>
      <div className="grid metrics">
        <MetricCard label="本月总收入" value={euro(totals.income)} note="点击查看本月收款" href={`/rent-payments?month=${currentMonth}`} />
        <MetricCard label="本月总支出" value={euro(totals.expense)} note="点击查看本月支出" href={`/expenses?month=${currentMonth}`} />
        <MetricCard label="本月净利润" value={euro(totals.netProfit)} note="收入减支出" tone={totals.netProfit < 0 ? "danger" : "profit"} href="/property-profits" hero />
        <MetricCard label="应收未收金额" value={euro(dashboardTotals.unpaid)} note="点击查看欠费" tone={dashboardTotals.unpaid > 0 ? "danger" : "info"} href="/rent-payments?overdue=1" />
        <MetricCard label="入住率" value={`${totals.occupancy}%`} note={`${totals.rentedRooms}/${totals.rentableRooms} 间可出租房间`} tone="info" href="/rooms" />
        <MetricCard label="空置房间数" value={`${totals.vacantRooms} 间`} note="点击查看空置房间" href="/rooms?status=空置" />
      </div>

      <section className="card compact-shortcuts home-shortcuts">
        <div className="shortcut-grid compact-icon-grid">
          {shortcuts.map((item) => access.isFreeSingle && item.title === "结算"
            ? { ...item, href: "/property-profits", module: "profits" as AccountModuleKey, sensitive: "canViewProfits" as const }
            : item
          ).filter((item) => (!item.module || access.can(item.module)) && (!item.sensitive || access.canSensitive(item.sensitive))).map((item) => {
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
      <section className="card panel viewing-summary">
        <div className="panel-header viewing-summary-header"><div className="viewing-summary-heading"><h2 className="panel-title">看房预约</h2><span className="viewing-summary-subtitle">今天、明天及未来几天</span></div><CalendarCheck size={20} className="info-text" /></div>
        {upcomingAppointments.length ? <div className="viewing-summary-list">{upcomingAppointments.map((item) => {
          const location = resolveAppointmentLocation(item, properties, rooms);
          const contact = item.contactName || item.contactWhatsapp || item.contactPhone || "未填联系人";
          if (location) return <Link className="viewing-summary-row" href="/viewing-appointments" key={item.id}>
            <div className="viewing-summary-main"><strong>{formatHomeAppointmentDateTime(item.appointmentDate, item.appointmentTime)}</strong><span className="viewing-summary-contact">{contact}</span><small className="appointment-status status-pending"><i className="appointment-status-dot pending" aria-hidden="true" />待看房</small></div>
            <div className="viewing-summary-location"><span className={`property-code property-tone-${location.tone}`}>{location.code || "未选房源"}</span><span> · {location.roomLabel}</span></div>
            {item.notes ? <small className="viewing-summary-note">{item.notes}</small> : null}
          </Link>;
        })}</div> : <p className="muted">暂无看房预约</p>}
        {pendingAppointments.length > 3 ? <p className="muted viewing-summary-more">还有{pendingAppointments.length - 3}条待看房</p> : null}
        <div className="viewing-summary-actions"><Link className="btn" href="/viewing-appointments">查看全部</Link><Link className="btn primary" href="/viewing-appointments?new=1">新增预约</Link></div>
      </section>
        </>
      )}

    </AppLayout>
  );
}

type Reminder = {
  id: string;
  title: string;
  description: string;
  href: string;
  tone: "danger" | "warning" | "yellow" | "green" | "info";
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
  deposits,
  waivedPaymentIds,
  includeBackupReminder = true
}: {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  waivedPaymentIds: Set<string>;
  includeBackupReminder?: boolean;
}) {
  const reminders: Reminder[] = [];
  const today = new Date();
  const propertyById = new Map(properties.map((item) => [item.id, item]));
  const roomById = new Map(rooms.map((item) => [item.id, item]));
  const tenantById = new Map(tenants.map((item) => [item.id, item]));

  tenants
    .filter((tenant) => isCanonicalRentReminderTenant(tenant, rooms))
    .map((tenant) => {
      const payment = latestCoverageForTenant(tenant.id, rentPayments);
      return { tenant, payment, stage: fixedRentCollectionReminderStage(tenant, payment) };
    })
    .filter(({ payment, stage }) => Boolean(stage) && Boolean(payment) && !waivedPaymentIds.has(payment!.id))
    .sort((a, b) => rentStagePriority(b.stage?.level) - rentStagePriority(a.stage?.level))
    .forEach(({ tenant, payment, stage }) => {
      if (!stage) return;
      const room = roomById.get(tenant.roomId);
      const amount = stage.level === "overdue" ? rentCollectionRemaining(payment!) : overdueReferenceAmount(payment, tenant);
      const roomLabel = room?.roomNumber || room?.name || tenant.name || "租客";
      reminders.push({
        id: `rent-${tenant.id}`,
        title: fixedRentReminderTitle(roomLabel, stage, amount),
        description: `${tenant.name || "未命名租客"}｜覆盖至 ${payment ? paymentCoverageEnd(payment) : "-"}`,
        href: `/rooms?roomId=${encodeURIComponent(tenant.roomId)}`,
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

  pendingDepositReturnRecords(deposits, tenants)
    .forEach((deposit) => {
      const tenant = tenantById.get(deposit.tenantId);
      reminders.push({
        id: `deposit-${deposit.id}`,
        title: `${tenant?.name || "租客"}押金待处理`,
        description: euro(deposit.amount),
        href: "/deposits",
        tone: "info",
        priority: 10_000
      });
    });

  const vacantByProperty = rooms
    .filter((room) => roomOccupancyStatus(room, tenants).includes("空置"))
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

  if (includeBackupReminder) {
    reminders.push({
      id: "backup-reminder",
      title: "建议定期导出数据备份",
      description: "点击进入设置页面导出 Excel 或 CSV",
      href: "/settings",
      tone: "info",
      priority: 100
    });
  }
  return reminders.sort((a, b) => b.priority - a.priority);
}

function buildReminderSummary({
  rooms,
  tenants,
  contracts,
  rentPayments,
  deposits,
  waivedPaymentIds
}: {
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  waivedPaymentIds: Set<string>;
}) {
  const today = new Date();
  const unpaid = tenants.reduce((sum, tenant) => {
    if (!isCurrentRentalRelationship(tenant)) return sum;
    const payment = latestCoverageForTenant(tenant.id, rentPayments);
    return sum + (payment && !waivedPaymentIds.has(payment.id) && isCoverageExpired(payment) ? rentCollectionRemaining(payment) : 0);
  }, 0);
  const rentDueCount = tenants.filter((tenant) => {
    if (!isCanonicalRentReminderTenant(tenant, rooms)) return false;
    const payment = latestCoverageForTenant(tenant.id, rentPayments);
    const stage = fixedRentCollectionReminderStage(tenant, payment);
    return stage && stage.level !== "overdue";
  }).length;
  const expiringCount = contracts.filter((contract) => {
    const days = daysUntil(contract.endDate, today);
    return days <= 30;
  }).length;
  const abnormalDeposits = pendingDepositReturnRecords(deposits, tenants).length;
  const vacantRooms = rooms.filter((room) => roomOccupancyStatus(room, tenants).includes("空置")).length;
  const parts = [];
  if (unpaid > 0) parts.push(`欠费${euro(unpaid)}`);
  if (rentDueCount > 0) parts.push(`待收租${rentDueCount}`);
  if (expiringCount > 0) parts.push(`快到期${expiringCount}`);
  if (abnormalDeposits > 0) parts.push(`押金异常${abnormalDeposits}`);
  if (vacantRooms > 0) parts.push(`空置${vacantRooms}`);
  return parts.length ? parts.join("｜") : "暂无待处理提醒";
}

function fixedRentReminderStatus(stage: ReturnType<typeof fixedRentCollectionReminderStage> & {}, amount: number) {
  if (stage.overdueDays > 0) return `\u5df2\u903e\u671f${stage.overdueDays}\u5929 ${euro(amount)}`;
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
  if (stage.overdueDays > 0) return `${room}\u5df2\u903e\u671f${stage.overdueDays}\u5929 ${euro(amount)}`;
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
  if (level === "urgent") return "yellow";
  return "green";
}

function daysUntil(date: string, from: Date) {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const target = new Date(`${date}T00:00:00`);
  const start = new Date(from.toISOString().slice(0, 10) + "T00:00:00");
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}
