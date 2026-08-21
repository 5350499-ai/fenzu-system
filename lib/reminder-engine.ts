import type { BusinessContract, BusinessDeposit, BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "./business-data.ts";
import type { BackupReminderSettings } from "./backup-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { isBackupReminderDue } from "./backup-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { pendingDepositReturnRecords } from "./deposit-return-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { euro } from "./format.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { getLatestRentPeriodState, rentPeriodToday, type RentPeriodReminderStage, type RentPeriodState } from "./rent-period-state.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { getDebtCases, type DebtCase } from "./debt-case.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { roomOccupancyStatus } from "./rent-coverage.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { tenantReminderHref } from "./reminder-navigation.ts";

/**
 * The one pure aggregation point for operational reminders.  It consumes
 * immutable business facts and RentPeriodState; UI surfaces only choose how
 * much of the resulting collection to render.
 */
export type ReminderType = "rent_debt" | "rent_collection" | "contract_expiry" | "deposit_return" | "moving_out_room" | "vacant_room" | "backup";
export type ReminderCategory = "欠费提醒" | "收租提醒" | "合同30天内到期" | "押金异常" | "即将退租" | "空置房间" | "备份提醒";
export type ReminderTone = "danger" | "warning" | "yellow" | "green" | "info" | "blue";
export type ReminderAction = "collect" | "waive";

export type ReminderNavigationTarget = {
  kind: "tenant" | "room" | "property" | "settings" | "deposits";
  href: string;
  tenantId?: string;
  roomId?: string;
  propertyId?: string;
  contractId?: string;
  paymentId?: string;
  depositId?: string;
};

export type ReminderItem = {
  id: string;
  type: ReminderType;
  category: ReminderCategory;
  title: string;
  description: string;
  tone: ReminderTone;
  priority: number;
  href: string;
  navigationTarget: ReminderNavigationTarget;
  tenantId?: string;
  roomId?: string;
  propertyId?: string;
  contractId?: string;
  paymentId?: string;
  depositId?: string;
  dueDate?: string;
  daysRemaining?: number;
  daysOverdue?: number;
  amount?: number;
  availableActions: ReminderAction[];
  debtCase?: DebtCase;
  surfaces: Array<"dashboard" | "reminder_center">;
};
type ReminderDraft = Omit<ReminderItem, "surfaces">;

export type ReminderSnapshot = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  waivedPaymentIds?: ReadonlySet<string>;
  backupReminderSettings?: BackupReminderSettings;
  includeBackupReminder?: boolean;
  today?: string;
};

export type ReminderSummary = {
  total: number;
  debtCount: number;
  rentCollectionCount: number;
  contractCount: number;
  depositCount: number;
  movingOutCount: number;
  vacantRoomCount: number;
  backupCount: number;
  text: string;
};

export function buildEffectiveReminders(snapshot: ReminderSnapshot): ReminderItem[] {
  const today = snapshot.today || rentPeriodToday();
  const waivedPaymentIds = snapshot.waivedPaymentIds || new Set<string>();
  const propertyById = new Map(snapshot.properties.map((item) => [item.id, item]));
  const roomById = new Map(snapshot.rooms.map((item) => [item.id, item]));
  const tenantById = new Map(snapshot.tenants.map((item) => [item.id, item]));
  const reminders: ReminderDraft[] = [];

  const debtCases = getDebtCases({ properties: snapshot.properties, rooms: snapshot.rooms, tenants: snapshot.tenants, rentPayments: snapshot.rentPayments, waivedPaymentIds, today });
  for (const debtCase of debtCases) {
    // Archive is a reminder-presentation policy only. The DebtCase remains
    // open and inspectable, but daily debt reminders are muted.
    if (!debtCase.tenantLifecycle.startsWith("archived")) reminders.push(reminderFromDebtCase(debtCase));
  }

  for (const tenant of snapshot.tenants) {
    const tenantPayments = snapshot.rentPayments.filter((item) => item.tenantId === tenant.id);
    const latestPeriod = getLatestRentPeriodState({ tenant, payments: tenantPayments, today, waivedPaymentIds });
    if (latestPeriod.lifecycle === "current" && !latestPeriod.isExpired && latestPeriod.reminderStage) {
      const payment = tenantPayments.find((item) => item.id === latestPeriod.paymentId);
      if (payment) reminders.push(rentCollectionReminderFromPeriod({ tenant, payment, state: latestPeriod }));
    }
  }

  for (const contract of snapshot.contracts) {
    const days = daysUntil(contract.endDate, today);
    const tenant = tenantById.get(contract.tenantId);
    if (!isContractReminderCandidate(contract, tenant, days)) continue;
    const room = roomById.get(contract.roomId);
    const navigationTarget: ReminderNavigationTarget = tenant
      ? { kind: "tenant", href: tenantReminderHref(tenant.id), tenantId: tenant.id, roomId: contract.roomId, propertyId: contract.propertyId, contractId: contract.id }
      : { kind: "property", href: "/tenants", propertyId: contract.propertyId, contractId: contract.id };
    reminders.push({
      id: `contract-expiry:${contract.id}`,
      type: "contract_expiry",
      category: "合同30天内到期",
      title: `${tenant?.name || "租客"}合同${days < 0 ? `已到期${Math.abs(days)}天` : `还有${days}天到期`}`,
      description: `${propertyById.get(contract.propertyId)?.name || "房源"} · ${room?.roomNumber || room?.name || "-"}`,
      tone: days < 0 ? "danger" : "warning",
      priority: 30_000 - days,
      href: navigationTarget.href,
      navigationTarget,
      tenantId: tenant?.id,
      roomId: contract.roomId,
      propertyId: contract.propertyId,
      contractId: contract.id,
      dueDate: contract.endDate,
      daysRemaining: days,
      availableActions: []
    });
  }

  for (const deposit of pendingDepositReturnRecords(snapshot.deposits, snapshot.tenants)) {
    const tenant = tenantById.get(deposit.tenantId);
    if (tenant && isArchivedTenant(tenant)) continue;
    const navigationTarget: ReminderNavigationTarget = tenant
      ? { kind: "tenant", href: tenantReminderHref(tenant.id), tenantId: tenant.id, roomId: deposit.roomId, propertyId: deposit.propertyId, depositId: deposit.id }
      : { kind: "deposits", href: "/deposits", roomId: deposit.roomId, propertyId: deposit.propertyId, depositId: deposit.id };
    reminders.push({
      id: `deposit-return:${deposit.id}`,
      type: "deposit_return",
      category: "押金异常",
      title: `${tenant?.name || "租客"}押金${deposit.status}`,
      description: euro(deposit.amount),
      tone: "info",
      priority: 10_000,
      href: navigationTarget.href,
      navigationTarget,
      tenantId: tenant?.id,
      roomId: deposit.roomId,
      propertyId: deposit.propertyId,
      depositId: deposit.id,
      amount: Number(deposit.amount || 0),
      availableActions: []
    });
  }

  for (const room of snapshot.rooms) {
    if (room.status.includes("即将退租")) {
      const navigationTarget: ReminderNavigationTarget = { kind: "room", href: `/rooms?roomId=${encodeURIComponent(room.id)}`, roomId: room.id, propertyId: room.propertyId };
      reminders.push({
        id: `moving-out-room:${room.id}`,
        type: "moving_out_room",
        category: "即将退租",
        title: `${room.name || room.roomNumber || "房间"} 即将退租`,
        description: propertyById.get(room.propertyId)?.name || "房间状态提醒",
        tone: "warning",
        priority: 20_000,
        href: navigationTarget.href,
        navigationTarget,
        roomId: room.id,
        propertyId: room.propertyId,
        availableActions: []
      });
    }
    if (roomOccupancyStatus(room, snapshot.tenants).includes("空置")) {
      const navigationTarget: ReminderNavigationTarget = { kind: "room", href: `/rooms?roomId=${encodeURIComponent(room.id)}`, roomId: room.id, propertyId: room.propertyId };
      reminders.push({
        id: `vacant-room:${room.id}`,
        type: "vacant_room",
        category: "空置房间",
        title: `${room.roomNumber || room.name || "房间"} 空置`,
        description: propertyById.get(room.propertyId)?.name || "点击查看房间",
        tone: "warning",
        priority: 1_000,
        href: navigationTarget.href,
        navigationTarget,
        roomId: room.id,
        propertyId: room.propertyId,
        availableActions: []
      });
    }
  }

  if (snapshot.includeBackupReminder && snapshot.backupReminderSettings && isBackupReminderDue(snapshot.backupReminderSettings, dateAtLocalMidday(today))) {
    const navigationTarget: ReminderNavigationTarget = { kind: "settings", href: "/settings" };
    reminders.push({
      id: "backup:scheduled",
      type: "backup",
      category: "备份提醒",
      title: "建议定期导出数据备份",
      description: "点击进入设置页面导出 Excel 或 CSV",
      tone: "blue",
      priority: 100,
      href: navigationTarget.href,
      navigationTarget,
      availableActions: []
    });
  }

  return dedupeAndSort(reminders);
}

export function summarizeEffectiveReminders(reminders: ReminderItem[]): ReminderSummary {
  const count = (type: ReminderType) => reminders.filter((item) => item.type === type).length;
  const debtItems = reminders.filter((item) => item.type === "rent_debt");
  const debtAmount = debtItems.reduce((sum, item) => sum + Math.max(0, item.amount || 0), 0);
  const debtCount = debtItems.length;
  const rentCollectionCount = count("rent_collection");
  const contractCount = count("contract_expiry");
  const depositCount = count("deposit_return");
  const movingOutCount = count("moving_out_room");
  const vacantRoomCount = count("vacant_room");
  const backupCount = count("backup");
  const parts: string[] = [];
  if (debtCount) parts.push(debtAmount > 0 ? `欠费${euro(debtAmount)}` : `欠费${debtCount}`);
  if (rentCollectionCount) parts.push(`待收租${rentCollectionCount}`);
  if (contractCount) parts.push(`快到期${contractCount}`);
  if (depositCount) parts.push(`押金异常${depositCount}`);
  if (movingOutCount) parts.push(`即将退租${movingOutCount}`);
  if (vacantRoomCount) parts.push(`空置${vacantRoomCount}`);
  return { total: reminders.length, debtCount, rentCollectionCount, contractCount, depositCount, movingOutCount, vacantRoomCount, backupCount, text: parts.length ? parts.join(" · ") : "暂无待处理提醒" };
}

function dedupeAndSort(items: ReminderDraft[]): ReminderItem[] {
  const byId = new Map<string, ReminderDraft>();
  for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
  return [...byId.values()]
    .sort((left, right) => right.priority - left.priority || (left.dueDate || "").localeCompare(right.dueDate || "") || left.id.localeCompare(right.id))
    .map((item) => ({ ...item, surfaces: ["dashboard", "reminder_center"] }));
}

function isContractReminderCandidate(contract: BusinessContract, tenant: BusinessTenant | undefined, days: number) {
  const status = `${contract.status || ""}`.toLowerCase();
  if (!contract.endDate || days > 30) return false;
  if (["已结束", "已归档", "已退租", "作废", "void"].some((marker) => status.includes(marker))) return false;
  return !tenant || !isArchivedTenant(tenant);
}

function isArchivedTenant(tenant: BusinessTenant) {
  const status = (tenant.status || "").trim().toLowerCase();
  return status === "已归档" || status === "archived";
}

function reminderFromDebtCase(debtCase: DebtCase): ReminderDraft {
  const navigationTarget: ReminderNavigationTarget = {
    kind: "tenant", href: debtCase.navigation.tenantHref, tenantId: debtCase.tenantId,
    roomId: debtCase.roomId, propertyId: debtCase.propertyId, paymentId: debtCase.paymentId
  };
  return {
    id: debtCase.debtCaseId,
    type: "rent_debt",
    category: "欠费提醒",
    title: debtCase.tenantName,
    description: `${debtCase.propertyName} | ${debtCase.roomName}`,
    tone: "danger",
    priority: 50_000 + debtCase.daysOverdue * 100 + Math.round(debtCase.remainingAmount),
    href: navigationTarget.href,
    navigationTarget,
    tenantId: debtCase.tenantId,
    roomId: debtCase.roomId,
    propertyId: debtCase.propertyId,
    paymentId: debtCase.paymentId,
    dueDate: debtCase.dueDate,
    daysOverdue: debtCase.daysOverdue,
    amount: debtCase.remainingAmount,
    availableActions: [...(debtCase.canCollect ? ["collect" as const] : []), ...(debtCase.canWaive ? ["waive" as const] : [])],
    debtCase
  };
}

function rentCollectionReminderFromPeriod({
  tenant,
  payment,
  state,
}: {
  tenant: BusinessTenant;
  payment: BusinessRentPayment;
  state: RentPeriodState;
}): ReminderDraft {
  const stage = state.reminderStage;
  if (!stage) throw new Error("Rent reminder requires a classified coverage stage.");
  const amount = referenceRentAmount(payment, tenant);
  const navigationTarget: ReminderNavigationTarget = {
    kind: "tenant",
    href: tenantReminderHref(payment.tenantId),
    tenantId: payment.tenantId,
    roomId: payment.roomId,
    propertyId: payment.propertyId,
    paymentId: payment.id
  };
  return {
    id: `rent_collection:${payment.id}`,
    type: "rent_collection",
    category: "收租提醒",
    title: rentReminderTitle(tenant.name || "租客", stage, amount),
    description: `${tenant.name || "未命名租客"} · 覆盖至：${state.coverageEndDate || "-"}`,
    tone: rentStageTone(stage),
    priority: rentStagePriority(stage) + 10 - (state.coverageDaysRemaining || 0),
    href: navigationTarget.href,
    navigationTarget,
    tenantId: payment.tenantId,
    roomId: payment.roomId,
    propertyId: payment.propertyId,
    paymentId: payment.id,
    dueDate: state.coverageEndDate,
    daysRemaining: state.coverageDaysRemaining ?? undefined,
    daysOverdue: state.overdueDays || undefined,
    amount,
    availableActions: []
  };
}

function referenceRentAmount(payment: BusinessRentPayment, tenant: BusinessTenant) {
  return Math.max(0, Number(payment.amountDue || 0), Number(tenant.monthlyRent || 0));
}

function rentReminderTitle(room: string, stage: RentPeriodReminderStage, amount: number) {
  if (stage === "overdue") return `${room}已逾期 ${euro(amount)}`;
  if (stage === "critical") return `${room}今日到期`;
  return `${room}即将到期`;
}

function rentStagePriority(stage: RentPeriodReminderStage) {
  if (stage === "overdue") return 50_000;
  if (stage === "critical") return 45_000;
  if (stage === "urgent") return 42_000;
  if (stage === "upcoming") return 40_000;
  return 0;
}

function rentStageTone(stage: RentPeriodReminderStage): ReminderTone {
  if (stage === "overdue" || stage === "critical") return "danger";
  if (stage === "urgent") return "yellow";
  return "green";
}

function daysUntil(date: string, today: string) {
  if (!date) return Number.MAX_SAFE_INTEGER;
  const target = new Date(`${date}T12:00:00`);
  const start = new Date(`${today}T12:00:00`);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function dateAtLocalMidday(date: string) {
  return new Date(`${date}T12:00:00`);
}
