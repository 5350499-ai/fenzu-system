"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
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
  refreshBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { buildEffectiveReminders, type ReminderItem } from "@/lib/reminder-engine";
import { defaultBackupReminderSettings, loadBackupReminderSettings, type BackupReminderSettings } from "@/lib/backup-reminders";
import { getValidSupabaseSession } from "@/lib/supabase";
import { cacheManager } from "@/lib/cache/cache-manager";
import { DASHBOARD_CACHE_KEY } from "@/lib/cache/cache-keys";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reminder = ReminderItem;

export default function RemindersPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [waivedPaymentIds, setWaivedPaymentIds] = useState<Set<string>>(new Set());
  const [backupReminderSettings, setBackupReminderSettings] = useState<BackupReminderSettings>(() => defaultBackupReminderSettings());
  const [waiveTarget, setWaiveTarget] = useState<Reminder | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiving, setWaiving] = useState(false);
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!access.ready) return;
    let active = true;
    setDataStatus("loading");
    setLoadError("");
    async function load() {
      try {
      const loadedProperties = access.can("properties") ? await refreshBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await refreshBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await refreshBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      const loadedContracts = access.can("tenants") ? await refreshBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
      const loadedPayments = access.can("rent_payments") ? await refreshBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants)) : [];
      const loadedDeposits = access.can("deposits") ? await refreshBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants)) : [];
      if (!active) return;
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("Session expired");
      setBackupReminderSettings(loadBackupReminderSettings(session.user.id));
      {
        const response = await fetch("/api/rent-collection", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (!response.ok) throw new Error("Reminder state load failed");
        {
          const payload = await response.json() as { actions?: Array<{ rentPaymentId?: string }> };
          setWaivedPaymentIds(new Set((payload.actions || []).map((action) => action.rentPaymentId).filter(Boolean) as string[]));
        }
      }
      if (!active) return;
      setDataStatus("ready");
      } catch (error) {
        if (!active) return;
        console.error("[reminders] data load failed", error);
        setLoadError("Reminder center failed to load. Please retry.");
        setDataStatus("error");
      }
    }
    load().catch((error) => window.alert(`加载提醒中心失败：${error.message || error}`));
    return () => { active = false; };
  }, [access.ready, access.permissionVersion, loadAttempt]);

  const reminders = useMemo(
    () => buildEffectiveReminders({ properties, rooms, tenants, contracts, rentPayments: payments, deposits, waivedPaymentIds, backupReminderSettings, includeBackupReminder: !access.isFreeSingle }),
    [access.isFreeSingle, backupReminderSettings, contracts, deposits, payments, properties, rooms, tenants, waivedPaymentIds]
  );

  async function waiveReminder() {
    if (!waiveTarget?.rentContext?.paymentId) return;
    setWaiving(true);
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录已失效，请重新登录。");
      const response = await fetch("/api/rent-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "waive", rentPaymentId: waiveTarget.rentContext.paymentId, reason: waiveReason.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "放弃追缴失败。");
      setWaivedPaymentIds((current) => new Set([...current, waiveTarget.rentContext!.paymentId]));
      try {
        await cacheManager.invalidate([DASHBOARD_CACHE_KEY], session.user.id);
      } catch (cacheError) {
        console.error("[reminders] derived dashboard cache invalidation failed", cacheError);
      }
      setWaiveTarget(null);
      setWaiveReason("");
    } catch (error: any) {
      window.alert(error.message || "放弃追缴失败。");
    } finally {
      setWaiving(false);
    }
  }

  const grouped = useMemo(() => {
    const groups = ["欠费提醒", "收租提醒", "合同30天内到期", "押金异常", "即将退租", "空置房间", ...(access.isFreeSingle ? [] : ["备份提醒"])];
    return groups.map((group) => ({
      title: group,
      items: reminders.filter((item) => item.category === group)
    }));
  }, [access.isFreeSingle, reminders]);

  if (dataStatus !== "ready") {
    return (
      <AppLayout title={"\u63d0\u9192\u4e2d\u5fc3"} description={"\u6b63\u5728\u8bfb\u53d6\u6700\u65b0\u63d0\u9192\u3002"}>
        <section className="card panel">
          <p className={dataStatus === "error" ? "danger-text" : "muted"}>{dataStatus === "error" ? loadError : "\u6b63\u5728\u8bfb\u53d6\u6700\u65b0\u63d0\u9192\u2026"}</p>
          {dataStatus === "error" ? <button className="btn" type="button" onClick={() => setLoadAttempt((current) => current + 1)}>\u91cd\u65b0\u52a0\u8f7d</button> : null}
        </section>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="提醒中心" description="系统自动生成的经营风险提醒，和手动待办分开管理。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">提醒汇总</h2>
            <p className="muted">优先级：欠费 &gt; 合同到期 &gt; 押金异常 &gt; 空置房间。</p>
          </div>
          <StatusBadge tone={reminders.length ? "amber" : "green"}>{reminders.length} 条提醒</StatusBadge>
        </div>
        <div className="reminder-page-list">
          {reminders.slice(0, 8).map((item) => (
            <ReminderRow item={item} key={item.id} onWaive={setWaiveTarget} />
          ))}
          {!reminders.length ? <p className="muted">暂无系统提醒。</p> : null}
        </div>
      </section>

      <div className="grid dashboard-panels">
        {grouped.map((group) => (
          <section className="card panel" key={group.title}>
            <div className="panel-header">
              <h2 className="panel-title">{group.title}</h2>
              <span className="muted">{group.items.length} 条</span>
            </div>
            <div className="reminder-page-list compact">
              {group.items.map((item) => <ReminderRow item={item} key={item.id} onWaive={setWaiveTarget} />)}
              {!group.items.length ? <p className="muted">暂无</p> : null}
            </div>
          </section>
        ))}
      </div>
      {waiveTarget ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !waiving) setWaiveTarget(null); }}>
        <section className="card modal-card reminder-waive-modal" onMouseDown={(event) => event.stopPropagation()}>
          <h2 className="panel-title">确认放弃追缴</h2>
          <p>确认放弃追缴这笔欠租吗？该操作不会生成收入或支出，欠租历史仍会保留，但不会继续出现在提醒中心。</p>
          <div className="field"><label>原因（可选）</label><textarea value={waiveReason} maxLength={500} onChange={(event) => setWaiveReason(event.target.value)} /></div>
          <div className="modal-actions"><button className="btn" disabled={waiving} type="button" onClick={() => setWaiveTarget(null)}>取消</button><button className="btn warning" disabled={waiving} type="button" onClick={() => void waiveReminder()}>{waiving ? "处理中…" : "确认放弃追缴"}</button></div>
        </section>
      </div> : null}
    </AppLayout>
  );
}
function ReminderRow({ item, onWaive }: { item: Reminder; onWaive: (item: Reminder) => void }) {
  if (item.rentContext?.paymentId && item.availableActions.includes("waive")) return <div className={`reminder-page-row reminder-page-row--actions ${item.tone}`}>
    <Link className="reminder-page-row-link" href={item.href}>
      <span className="reminder-page-kind"><StatusBadge tone="red">欠费提醒</StatusBadge></span>
      <span className="reminder-page-rent-content"><strong>{item.rentContext.propertyLabel} · {item.rentContext.roomLabel}</strong><small>{item.rentContext.tenantName} · 覆盖至：{item.rentContext.coverageEnd}</small></span>
      <b className={`reminder-page-state reminder-rent-status ${item.tone}`}>{item.rentContext.statusLabel}</b>
    </Link>
    <span className="reminder-rent-actions">{item.availableActions.includes("collect") ? <Link className="btn primary" href={`/rent-payments?collectPayment=${encodeURIComponent(item.rentContext.paymentId)}&overdue=1`}>登记补交</Link> : null}{item.availableActions.includes("waive") ? <button className="btn warning" type="button" onClick={() => onWaive(item)}>放弃追缴</button> : null}</span>
  </div>;
  return (
    <Link className={`reminder-page-row ${item.tone}`} href={item.href}>
      <span className="reminder-page-kind"><StatusBadge tone={item.tone === "danger" ? "red" : item.tone === "warning" ? "amber" : item.tone === "yellow" ? "yellow" : "blue"}>{item.category}</StatusBadge></span>
      {item.rentContext ? (
        <span className="reminder-page-rent-content">
          <strong>{item.rentContext.propertyLabel}｜{item.rentContext.roomLabel}</strong>
          <small>{item.rentContext.tenantName}｜覆盖至：{item.rentContext.coverageEnd}</small>
        </span>
      ) : (
        <span className="reminder-page-rent-content">
          <span>{item.title}</span>
          <small>{item.description}</small>
        </span>
      )}
      {item.rentContext ? <b className={`reminder-page-state reminder-rent-status ${item.tone}`}>{item.rentContext.statusLabel}</b> : <span className="reminder-page-state" aria-hidden="true" />}
    </Link>
  );
}
