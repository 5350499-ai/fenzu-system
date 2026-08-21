"use client";

import { AppLayout } from "@/components/app-layout";
import { PRODUCT_BRAND } from "@/lib/brand";
import { useAccountAccess } from "@/components/account-access";
import type { AccountModuleKey } from "@/lib/account-permissions";
import { MetricCard } from "@/components/metric-card";
import { HomepageReminderRow } from "@/components/homepage-reminder-row";
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
import { calculatePropertyProfits, calculateTotals, calculateUnassignedIncome, getDateRange } from "@/lib/profit";
import { isCoverageExpired, latestCoverageForTenant } from "@/lib/rent-coverage";
import { rentCollectionRemaining } from "@/lib/rent-collection";
import { buildEffectiveReminders, summarizeEffectiveReminders } from "@/lib/reminder-engine";
import { getValidSupabaseSession } from "@/lib/supabase";
import { AlertTriangle, BedDouble, Building2, CalendarCheck, ChevronDown, CreditCard, HandCoins, LogIn, MoreHorizontal, ReceiptText, UserPlus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cacheManager } from "@/lib/cache/cache-manager";
import { DASHBOARD_CACHE_KEY } from "@/lib/cache/cache-keys";
import { defaultBackupReminderSettings, loadBackupReminderSettings, loadServerBackupReminderSettings, type BackupReminderSettings } from "@/lib/backup-reminders";

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
  const [backupReminderSettings, setBackupReminderSettings] = useState<BackupReminderSettings>(() => defaultBackupReminderSettings());

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
      setBackupReminderSettings(loadBackupReminderSettings(scope));
      const memorySnapshot = cacheManager.peekMemory<DashboardSnapshot>(DASHBOARD_CACHE_KEY, scope);
      if (memorySnapshot) applySnapshot(memorySnapshot);
      else setDataStatus("loading");
      setDataError("");
      unsubscribe = cacheManager.subscribe(scope, DASHBOARD_CACHE_KEY, () => {
        const next = cacheManager.peekMemory<DashboardSnapshot>(DASHBOARD_CACHE_KEY, scope);
        if (next && active) applySnapshot(next);
      });
      // Backup reminders are secondary homepage content. They must never delay
      // rendering a cached business snapshot or turn a warm route return into
      // a full-page loading state.
      void loadServerBackupReminderSettings(scope, session.access_token)
        .then((serverReminderSettings) => {
          if (active && serverReminderSettings) setBackupReminderSettings(serverReminderSettings);
        })
        .catch(() => undefined);
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
      // Keep browser diagnostics available without presenting a raw IndexedDB
      // implementation error to ordinary users.
      console.error("[dashboard] data load failed", error);
      setDataStatus("error");
      setDataError("首页数据加载失败，请重试。");
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
    () => buildEffectiveReminders({ properties, rooms, tenants, contracts, rentPayments, deposits, waivedPaymentIds, backupReminderSettings, includeBackupReminder: access.canSensitive("canExportData") }),
    [access.canSensitive, backupReminderSettings, contracts, deposits, properties, rentPayments, rooms, tenants, waivedPaymentIds]
  );
  const visibleReminders = reminders.slice(0, 3);
  const reminderSummary = useMemo(
    () => summarizeEffectiveReminders(reminders).text,
    [reminders]
  );
  const today = localToday();
  const pendingAppointments = useMemo(() => [...viewingAppointments]
    .filter((item) => item.status === "待看房" && item.appointmentDate >= today)
    .sort((a, b) => `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`))
    , [today, viewingAppointments]);
  const upcomingAppointments = pendingAppointments.slice(0, 3);

  return (
    <AppLayout title={PRODUCT_BRAND} description="首页保留核心经营数据和常用入口，详细分析进入独立页面查看。">
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
          {shortcuts.map((item) => {
            if (item.href === "/partnership-settlement" && access.isFreeSingle) {
              return { ...item, href: "/property-profits", module: "profits" as const, sensitive: "canViewProfits" as const };
            }
            return item;
          }).filter((item) => (!item.module || access.can(item.module)) && (!item.sensitive || access.canSensitive(item.sensitive))).map((item) => {
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
            {visibleReminders.length ? visibleReminders.map((item) => {
              return <HomepageReminderRow item={item} context={{ properties, rooms, tenants }} key={item.id} />;
            }) : <p className="muted">暂无需要处理的提醒。</p>}
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
