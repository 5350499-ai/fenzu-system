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
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { pendingDepositReturnRecords } from "@/lib/deposit-return-reminders";
import { fixedRentCollectionReminderStage, isRentReminderTenant, latestCoverageForTenant, overdueReferenceAmount, paymentCoverageEnd, strictCurrentRentalTenant } from "@/lib/rent-coverage";
import { rentCollectionRemaining } from "@/lib/rent-collection";
import { getValidSupabaseSession } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Reminder = {
  id: string;
  category: string;
  title: string;
  description: string;
  href: string;
  tone: "danger" | "warning" | "yellow" | "green" | "info" | "blue";
  priority: number;
  rentContext?: {
    paymentId: string;
    propertyLabel: string;
    roomLabel: string;
    tenantName: string;
    coverageEnd: string;
    statusLabel: string;
  };
};

export default function RemindersPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [waivedPaymentIds, setWaivedPaymentIds] = useState<Set<string>>(new Set());
  const [waiveTarget, setWaiveTarget] = useState<Reminder | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiving, setWaiving] = useState(false);

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = access.can("properties") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
      const loadedRooms = access.can("rooms") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties)) : [];
      const loadedTenants = access.can("tenants") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms)) : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(access.can("tenants") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : []);
      setPayments(access.can("rent_payments") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants)) : []);
      setDeposits(access.can("deposits") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants)) : []);
      const session = await getValidSupabaseSession();
      if (session) {
        const response = await fetch("/api/rent-collection", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { actions?: Array<{ rentPaymentId?: string }> };
          setWaivedPaymentIds(new Set((payload.actions || []).map((action) => action.rentPaymentId).filter(Boolean) as string[]));
        }
      }
    }
    load().catch((error) => window.alert(`加载提醒中心失败：${error.message || error}`));
  }, [access.ready]);

  const reminders = useMemo(
    () => buildReminders({ properties, rooms, tenants, contracts, payments, deposits, waivedPaymentIds }),
    [contracts, deposits, payments, properties, rooms, tenants, waivedPaymentIds]
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
      setWaiveTarget(null);
      setWaiveReason("");
    } catch (error: any) {
      window.alert(error.message || "放弃追缴失败。");
    } finally {
      setWaiving(false);
    }
  }

  const grouped = useMemo(() => {
    const groups = ["欠费提醒", "收租提醒", "合同30天内到期", "押金异常", "空置房间", "备份提醒"];
    return groups.map((group) => ({
      title: group,
      items: reminders.filter((item) => item.category === group)
    }));
  }, [reminders]);

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
      {waiveTarget ? <div className="modal-backdrop" onMouseDown={() => !waiving && setWaiveTarget(null)}>
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
  if (item.rentContext?.paymentId && item.category === "欠费提醒") return <div className={`reminder-page-row ${item.tone}`}>
    <Link className="reminder-page-row-link" href={item.href}>
      <StatusBadge tone="red">欠费提醒</StatusBadge>
      <span className="reminder-page-rent-content"><strong>{item.rentContext.propertyLabel} · {item.rentContext.roomLabel}</strong><b className={`reminder-rent-status ${item.tone}`}>{item.rentContext.statusLabel}</b><small>{item.rentContext.tenantName} · 覆盖至：{item.rentContext.coverageEnd}</small></span>
    </Link>
    <span className="reminder-rent-actions"><Link className="btn primary" href={`/rent-payments?collectPayment=${encodeURIComponent(item.rentContext.paymentId)}&overdue=1`}>登记补交</Link><button className="btn warning" type="button" onClick={() => onWaive(item)}>放弃追缴</button></span>
  </div>;
  return (
    <Link className={`reminder-page-row ${item.tone}`} href={item.href}>
      <StatusBadge tone={item.tone === "danger" ? "red" : item.tone === "warning" ? "amber" : item.tone === "yellow" ? "yellow" : "blue"}>{item.category}</StatusBadge>
      {item.rentContext ? (
        <span className="reminder-page-rent-content">
          <strong>{item.rentContext.propertyLabel}｜{item.rentContext.roomLabel}</strong>
          <b className={`reminder-rent-status ${item.tone}`}>{item.rentContext.statusLabel}</b>
          <small>{item.rentContext.tenantName}｜覆盖至：{item.rentContext.coverageEnd}</small>
        </span>
      ) : (
        <>
          <span>{item.title}</span>
          <small>{item.description}</small>
        </>
      )}
    </Link>
  );
}

function buildReminders({
  properties,
  rooms,
  tenants,
  contracts,
  payments,
  deposits,
  waivedPaymentIds
}: {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  payments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  waivedPaymentIds: Set<string>;
}) {
  const today = new Date();
  const propertyById = new Map(properties.map((item) => [item.id, item]));
  const roomById = new Map(rooms.map((item) => [item.id, item]));
  const tenantById = new Map(tenants.map((item) => [item.id, item]));
  const reminders: Reminder[] = [];

    tenants
      .filter((tenant) => isRentReminderTenant(tenant, rooms, contracts))
      .map((tenant) => {
        const payment = latestCoverageForTenant(tenant.id, payments);
        return { tenant, payment, stage: fixedRentCollectionReminderStage(tenant, payment) };
    })
    .filter(({ payment, stage }) => Boolean(stage) && Boolean(payment) && !waivedPaymentIds.has(payment!.id) && (stage!.level !== "overdue" || rentCollectionRemaining(payment!) > 0))
    .forEach(({ tenant, payment, stage }) => {
      if (!stage) return;
      const room = roomById.get(tenant.roomId);
      const amount = stage.level === "overdue" ? rentCollectionRemaining(payment!) : overdueReferenceAmount(payment, tenant);
      const roomLabel = room?.roomNumber || room?.name || tenant.name || "房间";
      reminders.push({
        id: `payment-${tenant.id}`,
        category: stage.level === "overdue" ? "欠费提醒" : "收租提醒",
        title: fixedRentReminderTitle(roomLabel, stage, amount),
        description: `${tenant.name || "未命名租客"}｜覆盖至 ${payment ? paymentCoverageEnd(payment) : "-"}`,
        href: `/rooms?roomId=${encodeURIComponent(tenant.roomId)}`,
        tone: rentStageTone(stage.level),
        priority: rentStagePriority(stage.level) + (stage.level === "overdue" ? amount : 10 - stage.daysRemaining),
        rentContext: {
          paymentId: payment!.id,
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
    .forEach(({ contract, days }) => {
      const tenant = tenantById.get(contract.tenantId);
      const room = roomById.get(contract.roomId);
      reminders.push({
        id: `contract-${contract.id}`,
        category: "合同30天内到期",
        title: `${tenant?.name || "租客"}合同${days < 0 ? `已到期${Math.abs(days)}天` : `还有${days}天到期`}`,
        description: `${propertyById.get(contract.propertyId)?.name || "房源"}｜${room?.roomNumber || room?.name || "-"}`,
        href: "/tenants",
        tone: days < 0 ? "danger" : "warning",
        priority: 30_000 - days
      });
    });

  pendingDepositReturnRecords(deposits, tenants)
    .forEach((deposit) => {
      const tenant = tenantById.get(deposit.tenantId);
      reminders.push({
        id: `deposit-${deposit.id}`,
        category: "押金异常",
        title: `${tenant?.name || "租客"}押金${deposit.status}`,
        description: euro(deposit.amount),
        href: "/deposits",
        tone: "info",
        priority: 10_000
      });
    });

  rooms
    .filter((room) => room.status.includes("空置"))
    .forEach((room) => {
      reminders.push({
        id: `vacant-${room.id}`,
        category: "空置房间",
        title: `${room.roomNumber || room.name} 空置`,
        description: propertyById.get(room.propertyId)?.name || "点击查看房间",
        href: "/rooms?status=空置",
        tone: "warning",
        priority: 1_000
      });
    });

  reminders.push({
    id: "backup-reminder",
    category: "备份提醒",
    title: "建议定期导出数据备份",
    description: "点击进入设置页面导出 Excel 或 CSV",
    href: "/settings",
    tone: "blue",
    priority: 100
  });

  return reminders.sort((a, b) => b.priority - a.priority);
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

function rentStagePriority(level: string) {
  if (level === "overdue") return 50_000;
  if (level === "critical") return 45_000;
  if (level === "urgent") return 42_000;
  return 40_000;
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
