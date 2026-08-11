import type { BusinessContract, BusinessDeposit, BusinessProperty, BusinessRentPayment, BusinessRoom, BusinessTenant } from "./business-data.ts";
import type { BackupReminderSettings } from "./backup-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { isBackupReminderDue } from "./backup-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { pendingDepositReturnRecords } from "./deposit-return-reminders.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { euro } from "./format.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { getOpenRentDebtPeriodStates, getRentPeriodState, latestValidRentPeriodPayment, rentPeriodToday, type RentPeriodReminderStage } from "./rent-period-state.ts";
// @ts-expect-error node's strip-types test runner loads TypeScript modules directly.
import { paymentCoverageEnd, roomOccupancyStatus } from "./rent-coverage.ts";
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

export type ReminderRentContext = {
  paymentId: string;
  propertyLabel: string;
  roomLabel: string;
  tenantName: string;
  coverageEnd: string;
  statusLabel: string;
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
  surfaces: Array<"dashboard" | "reminder_center">;
  rentContext?: ReminderRentContext;
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

  for (const listedTenant of snapshot.tenants) {
    const payment = latestValidRentPeriodPayment(snapshot.rentPayments.filter((item) => item.tenantId === listedTenant.id));
    // A rent payment is the immutable subject link for a period reminder.
    // Do not infer its tenant, room or property from current room occupancy.
    const tenant = payment ? tenantById.get(payment.tenantId) : undefined;
    if (!tenant) continue;
    const state = getRentPeriodState({ tenant, payment, today, waivedPaymentIds });
    const stage = state.reminderStage;
    if (!payment || !stage || state.lifecycle === "archived") continue;

    // A moved-out tenancy may still have an open historical debt. It cannot
    // generate a future collection reminder, but its expired payment can.
    const isDebtReminder = state.isExpired && state.hasOpenDebtFollowUp;
    const isFutureCollectionReminder = !state.isExpired && state.lifecycle === "current";
    if (!isDebtReminder && !isFutureCollectionReminder) continue;

    const room = roomById.get(payment.roomId);
    const amount = isDebtReminder ? state.remainingAmount : referenceRentAmount(payment, tenant);
    const type: ReminderType = isDebtReminder ? "rent_debt" : "rent_collection";
    const category: ReminderCategory = isDebtReminder ? "欠费提醒" : "收租提醒";
    const navigationTarget: ReminderNavigationTarget = {
      kind: "tenant", href: tenantReminderHref(payment.tenantId), tenantId: payment.tenantId, roomId: payment.roomId, propertyId: payment.propertyId, paymentId: payment.id
    };
    const statusLabel = rentReminderStatus(stage, amount);
    reminders.push({
      id: `${type}:${payment.id}`,
      type,
      category,
      title: rentReminderTitle(room?.roomNumber || room?.name || tenant.name || "租客", stage, amount),
      description: `${tenant.name || "未命名租客"} · 覆盖至 ${paymentCoverageEnd(payment) || "-"}`,
      tone: rentStageTone(stage),
      priority: rentStagePriority(stage) + (isDebtReminder ? amount : 10 - (state.coverageDaysRemaining || 0)),
      href: navigationTarget.href,
      navigationTarget,
      tenantId: payment.tenantId,
      roomId: payment.roomId,
      propertyId: payment.propertyId,
      paymentId: payment.id,
      dueDate: payment.coverageEndDate,
      daysRemaining: state.coverageDaysRemaining ?? undefined,
      daysOverdue: state.overdueDays || undefined,
      amount,
      availableActions: isDebtReminder ? [
        ...(state.canCollect ? ["collect" as const] : []),
        ...(state.canWaive ? ["waive" as const] : [])
      ] : [],
      rentContext: {
        paymentId: payment.id,
        propertyLabel: compactPropertyName(propertyById.get(payment.propertyId)?.name),
        roomLabel: compactRoomName(room),
        tenantName: tenant.name || "未命名租客",
        coverageEnd: paymentCoverageEnd(payment) || "-",
        statusLabel
      }
    });
  }

  // The latest coverage period answers future collection. Older expired
  // payments remain separate debt subjects until their own payment-specific
  // collection/waiver state closes them.
  for (const tenant of snapshot.tenants) {
    if (tenant.status === "已归档" || tenant.status.toLowerCase() === "archived") continue;
    const tenantPayments = snapshot.rentPayments.filter((item) => item.tenantId === tenant.id);
    const latestPaymentId = latestValidRentPeriodPayment(tenantPayments)?.id || "";
    for (const state of getOpenRentDebtPeriodStates({ tenant, payments: tenantPayments, today, waivedPaymentIds })) {
      if (!state.paymentId || state.paymentId === latestPaymentId) continue;
      const payment = tenantPayments.find((item) => item.id === state.paymentId);
      if (!payment) continue;
      const room = roomById.get(payment.roomId);
      const amount = state.remainingAmount;
      const navigationTarget: ReminderNavigationTarget = {
        kind: "tenant", href: tenantReminderHref(payment.tenantId), tenantId: payment.tenantId, roomId: payment.roomId, propertyId: payment.propertyId, paymentId: payment.id
      };
      reminders.push({
        id: `rent_debt:${payment.id}`,
        type: "rent_debt",
        category: "欠费提醒",
        title: rentReminderTitle(room?.roomNumber || room?.name || tenant.name || "租客", "overdue", amount),
        description: `${tenant.name || "未命名租客"} · 覆盖至：${paymentCoverageEnd(payment) || "-"}`,
        tone: "danger",
        priority: rentStagePriority("overdue") + amount,
        href: navigationTarget.href,
        navigationTarget,
        tenantId: payment.tenantId,
        roomId: payment.roomId,
        propertyId: payment.propertyId,
        paymentId: payment.id,
        dueDate: payment.coverageEndDate,
        daysRemaining: state.coverageDaysRemaining ?? undefined,
        daysOverdue: state.overdueDays || undefined,
        amount,
        availableActions: [
          ...(state.canCollect ? ["collect" as const] : []),
          ...(state.canWaive ? ["waive" as const] : [])
        ],
        rentContext: {
          paymentId: payment.id,
          propertyLabel: compactPropertyName(propertyById.get(payment.propertyId)?.name),
          roomLabel: compactRoomName(room),
          tenantName: tenant.name || "未命名租客",
          coverageEnd: paymentCoverageEnd(payment) || "-",
          statusLabel: rentReminderStatus("overdue", amount)
        }
      });
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

function referenceRentAmount(payment: BusinessRentPayment, tenant: BusinessTenant) {
  return Math.max(0, Number(payment.amountDue || 0), Number(tenant.monthlyRent || 0));
}

function rentReminderStatus(stage: RentPeriodReminderStage, amount: number) {
  if (stage === "overdue") return `已逾期 ${euro(amount)}`;
  if (stage === "critical") return "今日到期";
  if (stage === "urgent") return "即将到期";
  return "即将到期";
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

function compactPropertyName(name?: string) {
  const value = (name || "").replace(/\s+/g, "").trim();
  return value ? value.slice(0, 7) + (value.length > 7 ? "..." : "") : "房源";
}

function compactRoomName(room?: BusinessRoom) {
  const value = (room?.name || room?.roomNumber || "").trim();
  if (!value) return "房间";
  const number = room?.roomNumber?.trim() || value.match(/^\d{1,4}/)?.[0] || "";
  if (!number) return value.slice(0, 10) + (value.length > 10 ? "..." : "");
  const description = value.slice(value.indexOf(number) + number.length).trim();
  return description ? `${number} ${description.slice(0, 6)}` : number;
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
