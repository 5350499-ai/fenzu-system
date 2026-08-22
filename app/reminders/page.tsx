"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";
import { Toast } from "@/components/ui";
import { ModalPortal } from "@/components/modal-portal";
import { ReminderRow as SharedReminderRow } from "@/components/reminder-row";
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
import { defaultBackupReminderSettings, loadBackupReminderSettings, loadServerBackupReminderSettings, type BackupReminderSettings } from "@/lib/backup-reminders";
import { getValidSupabaseSession } from "@/lib/supabase";
import { cacheManager } from "@/lib/cache/cache-manager";
import { DASHBOARD_CACHE_KEY } from "@/lib/cache/cache-keys";
import { useEffect, useMemo, useState } from "react";

type Reminder = ReminderItem;

type ReminderRuntimeDiagnostic = {
  viewport: {
    innerHeight: number;
    visualViewportHeight: number | null;
    documentClientHeight: number;
  };
  main: {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    boundingTop: number;
    boundingBottom: number;
    overflowY: string;
    height: string;
    minHeight: string;
    maxHeight: string;
    paddingBottom: string;
    maxScrollTop: number;
    visibleBottomAtMaxScroll: number;
  } | null;
  remindersPage: ElementDiagnostic | null;
  reminderList: ElementDiagnostic | null;
  lastCard: ElementDiagnostic | null;
  mobileNav: ElementDiagnostic | null;
  requiredExtraScroll: number | null;
  ancestorChain: AncestorDiagnostic[];
  mainDirectChildren: ScrollContributorDiagnostic[];
  topScrollHeightContributors: ScrollContributorDiagnostic[];
  expectedMainContentBottom: number;
  actualMainScrollHeight: number | null;
  phantomHeight: number | null;
  diagnosticChild: ScrollContributorDiagnostic | undefined;
};

type ElementDiagnostic = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
  boundingTop: number;
  boundingBottom: number;
  height: number;
  overflowY: string;
  overflow: string;
  position: string;
  computedHeight: string;
  minHeight: string;
  maxHeight: string;
  paddingBottom: string;
};

type AncestorDiagnostic = {
  tag: string;
  className: string;
  clientHeight: number;
  scrollHeight: number;
  overflowY: string;
  overflow: string;
  position: string;
  height: string;
  minHeight: string;
  maxHeight: string;
  transform: string;
  contain: string;
};

type ScrollContributorDiagnostic = {
  tag: string;
  className: string;
  id: string;
  offsetTop: number;
  offsetHeight: number;
  scrollHeight: number;
  clientHeight: number;
  boundingTop: number;
  boundingBottom: number;
  flowBottom: number;
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  overflowY: string;
  transform: string;
  contain: string;
  hidden: boolean;
  ariaHidden: string | null;
};

function roundDiagnosticValue(value: number) {
  return Math.round(value * 100) / 100;
}

function readElementDiagnostic(element: HTMLElement | null): ElementDiagnostic | null {
  if (!element) return null;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    scrollTop: roundDiagnosticValue(element.scrollTop),
    boundingTop: roundDiagnosticValue(rect.top),
    boundingBottom: roundDiagnosticValue(rect.bottom),
    height: roundDiagnosticValue(rect.height),
    overflowY: style.overflowY,
    overflow: style.overflow,
    position: style.position,
    computedHeight: style.height,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    paddingBottom: style.paddingBottom
  };
}

function readAncestorDiagnostics(element: HTMLElement | null): AncestorDiagnostic[] {
  const chain: AncestorDiagnostic[] = [];
  let current = element;
  while (current && chain.length < 24) {
    const style = window.getComputedStyle(current);
    chain.push({
      tag: current.tagName.toLowerCase(),
      className: typeof current.className === "string" ? current.className : "",
      clientHeight: current.clientHeight,
      scrollHeight: current.scrollHeight,
      overflowY: style.overflowY,
      overflow: style.overflow,
      position: style.position,
      height: style.height,
      minHeight: style.minHeight,
      maxHeight: style.maxHeight,
      transform: style.transform,
      contain: style.contain
    });
    current = current.parentElement;
  }
  return chain;
}

function readScrollContributor(element: HTMLElement, main: HTMLElement, mainRect: DOMRect): ScrollContributorDiagnostic {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    className: typeof element.className === "string" ? element.className : "",
    id: element.id,
    offsetTop: element.offsetTop,
    offsetHeight: element.offsetHeight,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    boundingTop: roundDiagnosticValue(rect.top),
    boundingBottom: roundDiagnosticValue(rect.bottom),
    flowBottom: roundDiagnosticValue(rect.bottom - mainRect.top + main.scrollTop),
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    position: style.position,
    overflowY: style.overflowY,
    transform: style.transform,
    contain: style.contain,
    hidden: element.hidden,
    ariaHidden: element.getAttribute("aria-hidden")
  };
}

function isPreviewDiagnosticEnvironment() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return window.location.hostname.endsWith("-5350499-ais-projects.vercel.app");
}

function captureReminderRuntimeDiagnostic(): ReminderRuntimeDiagnostic {
  const main = document.querySelector<HTMLElement>(".main");
  const remindersPage = document.querySelector<HTMLElement>(".reminders-more-page");
  const reminderList = remindersPage?.querySelector<HTMLElement>(".reminder-page-list-single") || null;
  const lastCard = reminderList?.querySelector<HTMLElement>(".reminder-row-full:last-child") || reminderList?.lastElementChild as HTMLElement | null;
  const mobileNav = document.querySelector<HTMLElement>(".mobile-nav");
  const mainRect = main?.getBoundingClientRect();
  const maxScrollTop = main ? Math.max(0, main.scrollHeight - main.clientHeight) : null;
  const visibleBottomAtMaxScroll = main && mainRect && maxScrollTop !== null
    ? roundDiagnosticValue(mainRect.top + maxScrollTop + main.clientHeight)
    : null;
  const lastCardRect = lastCard?.getBoundingClientRect();
  const requiredExtraScroll = lastCardRect && visibleBottomAtMaxScroll !== null
    ? roundDiagnosticValue(Math.max(0, lastCardRect.bottom - visibleBottomAtMaxScroll))
    : null;
  const mainDiagnostic = readElementDiagnostic(main);
  const mainChildren = main && mainRect
    ? Array.from(main.children).map((child) => readScrollContributor(child as HTMLElement, main, mainRect)).sort((a, b) => b.flowBottom - a.flowBottom)
    : [];
  const contributors = main && mainRect
    ? Array.from(main.querySelectorAll<HTMLElement>("*")).map((element) => readScrollContributor(element, main, mainRect)).sort((a, b) => b.flowBottom - a.flowBottom).slice(0, 20)
    : [];
  const diagnosticChild = mainChildren.find((child) => child.id === "preview-runtime-diagnostic");
  const expectedMainContentBottom = mainChildren.filter((child) => child.id !== "preview-runtime-diagnostic" && child.display !== "none" && child.visibility !== "hidden").reduce((max, child) => Math.max(max, child.flowBottom), 0);

  return {
    viewport: {
      innerHeight: window.innerHeight,
      visualViewportHeight: window.visualViewport ? roundDiagnosticValue(window.visualViewport.height) : null,
      documentClientHeight: document.documentElement.clientHeight
    },
    main: mainDiagnostic && maxScrollTop !== null && visibleBottomAtMaxScroll !== null ? {
      clientHeight: mainDiagnostic.clientHeight,
      scrollHeight: mainDiagnostic.scrollHeight,
      scrollTop: mainDiagnostic.scrollTop,
      boundingTop: mainDiagnostic.boundingTop,
      boundingBottom: mainDiagnostic.boundingBottom,
      overflowY: mainDiagnostic.overflowY,
      height: mainDiagnostic.computedHeight,
      minHeight: mainDiagnostic.minHeight,
      maxHeight: mainDiagnostic.maxHeight,
      paddingBottom: mainDiagnostic.paddingBottom,
      maxScrollTop,
      visibleBottomAtMaxScroll
    } : null,
    remindersPage: readElementDiagnostic(remindersPage),
    reminderList: readElementDiagnostic(reminderList),
    lastCard: readElementDiagnostic(lastCard),
    mobileNav: readElementDiagnostic(mobileNav),
    requiredExtraScroll,
    ancestorChain: readAncestorDiagnostics(lastCard),
    mainDirectChildren: mainChildren,
    topScrollHeightContributors: contributors,
    expectedMainContentBottom,
    actualMainScrollHeight: main?.scrollHeight ?? null,
    phantomHeight: main ? roundDiagnosticValue(Math.max(0, main.scrollHeight - expectedMainContentBottom)) : null,
    diagnosticChild
  };
}

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
  const [waiveNotice, setWaiveNotice] = useState("");
  const [dataStatus, setDataStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [diagnosticEnabled, setDiagnosticEnabled] = useState(false);
  const [runtimeDiagnostic, setRuntimeDiagnostic] = useState<ReminderRuntimeDiagnostic | null>(null);
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = useState("");

  useEffect(() => {
    setDiagnosticEnabled(isPreviewDiagnosticEnvironment());
  }, []);

  async function copyRuntimeDiagnostic() {
    if (!runtimeDiagnostic) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(runtimeDiagnostic, null, 2));
      setDiagnosticCopyStatus("已复制");
    } catch {
      setDiagnosticCopyStatus("复制失败，请截图面板内容");
    }
  }

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
      setBackupReminderSettings(await loadServerBackupReminderSettings(session.user.id, session.access_token));
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
    () => buildEffectiveReminders({ properties, rooms, tenants, contracts, rentPayments: payments, deposits, waivedPaymentIds, backupReminderSettings, includeBackupReminder: access.canSensitive("canExportData") }),
    [access.canSensitive, backupReminderSettings, contracts, deposits, payments, properties, rooms, tenants, waivedPaymentIds]
  );

  useEffect(() => {
    if (!diagnosticEnabled || dataStatus !== "ready") return;
    const measure = () => setRuntimeDiagnostic(captureReminderRuntimeDiagnostic());
    const firstFrame = window.requestAnimationFrame(() => {
      measure();
      window.requestAnimationFrame(measure);
    });
    const visualViewport = window.visualViewport;
    const main = document.querySelector<HTMLElement>(".main");
    visualViewport?.addEventListener("resize", measure);
    main?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.cancelAnimationFrame(firstFrame);
      visualViewport?.removeEventListener("resize", measure);
      main?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [dataStatus, diagnosticEnabled, reminders.length]);

  async function waiveReminder() {
    if (!waiveTarget?.debtCase?.paymentId) return;
    setWaiving(true);
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录已失效，请重新登录。");
      const response = await fetch("/api/rent-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "waive", rentPaymentId: waiveTarget.debtCase.paymentId, reason: waiveReason.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "放弃追缴失败。");
      setWaivedPaymentIds((current) => new Set([...current, waiveTarget.debtCase!.paymentId]));
      try {
        await cacheManager.invalidate([DASHBOARD_CACHE_KEY], session.user.id);
      } catch (cacheError) {
        console.error("[reminders] derived dashboard cache invalidation failed", cacheError);
      }
      setWaiveTarget(null);
      setWaiveReason("");
      setWaiveNotice("已放弃追缴，欠租提醒已关闭，历史记录已保留。");
    } catch (error: any) {
      window.alert(error.message || "放弃追缴失败。");
    } finally {
      setWaiving(false);
    }
  }

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
      <section className="card panel reminders-more-page">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">提醒汇总</h2>
            <p className="muted">优先级：欠费 &gt; 合同到期 &gt; 押金异常 &gt; 空置房间。</p>
          </div>
          <StatusBadge tone={reminders.length ? "amber" : "green"}>{reminders.length} 条提醒</StatusBadge>
        </div>
        <div className="reminder-page-list reminder-page-list-single">
          {reminders.map((item) => (
            <SharedReminderRow item={item} context={{ properties, rooms, tenants }} key={item.id} onWaive={setWaiveTarget} />
          ))}
          {!reminders.length ? <p className="muted">暂无系统提醒。</p> : null}
        </div>
      </section>

      {diagnosticEnabled ? <section id="preview-runtime-diagnostic" className="card panel" aria-label="Preview 临时滚动诊断">
        <details>
          <summary>Preview 临时滚动诊断</summary>
          <p className="muted">仅记录布局几何与 CSS，不包含账号、租客、房源、金额或身份信息。</p>
          <button className="btn" type="button" onClick={() => void copyRuntimeDiagnostic()}>复制滚动诊断</button>
          {diagnosticCopyStatus ? <span className="muted" style={{ marginInlineStart: 8 }}>{diagnosticCopyStatus}</span> : null}
          <p className="muted">{runtimeDiagnostic ? "已采集；请使用复制按钮发送完整诊断。" : "正在采集运行时几何…"}</p>
        </details>
      </section> : null}

      {waiveTarget ? <ModalPortal><div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !waiving) setWaiveTarget(null); }}>
        <section className="card modal-card reminder-waive-modal" onMouseDown={(event) => event.stopPropagation()}>
          <h2 className="panel-title">确认放弃追缴</h2>
          <p>确认放弃追缴这笔欠租吗？该操作不会生成收入或支出，欠租历史仍会保留，但不会继续出现在提醒中心。</p>
          <div className="field"><label>原因（可选）</label><textarea value={waiveReason} maxLength={500} onChange={(event) => setWaiveReason(event.target.value)} /></div>
          <div className="modal-actions"><button className="btn" disabled={waiving} type="button" onClick={() => setWaiveTarget(null)}>取消</button><button className="btn warning" disabled={waiving} type="button" onClick={() => void waiveReminder()}>{waiving ? "处理中…" : "确认放弃追缴"}</button></div>
        </section>
      </div></ModalPortal> : null}
      <Toast message={waiveNotice} tone="success" />
    </AppLayout>
  );
}
