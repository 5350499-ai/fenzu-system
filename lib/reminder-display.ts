import type { BusinessProperty, BusinessRoom, BusinessTenant } from "./business-data";
import type { DebtCase } from "./debt-case";
import type { ReminderItem } from "./reminder-engine";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { buildDebtDisplayModel } from "./debt-display.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { euro } from "./format.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { isEndedTenantStatus } from "./tenant-sorting.ts";

export type ReminderDisplayContext = {
  properties: readonly BusinessProperty[];
  rooms: readonly BusinessRoom[];
  tenants: readonly BusinessTenant[];
};

export type ReminderUrgencyTone = "green" | "yellow" | "orange" | "danger";

export type ReminderSecondaryReason = {
  before: string;
  emphasis: string;
  after: string;
  tone: ReminderUrgencyTone;
};

export type ReminderDisplayModel = {
  categoryLabel: string;
  tenantName: string;
  contextLine: string;
  lifecycleLabel?: string;
  lifecycleTone?: "green" | "amber";
  debtKindLabel?: string;
  secondaryLine: string;
  secondaryReason?: ReminderSecondaryReason;
  amountLabel?: string;
  debtCase?: DebtCase;
  vacantRoom?: {
    roomName: string;
    propertyName: string;
    statusLabel: "空置";
  };
};

export function buildReminderDisplayModel(item: ReminderItem, context: ReminderDisplayContext): ReminderDisplayModel {
  if (item.debtCase) {
    const debt = buildDebtDisplayModel(item.debtCase);
    const secondaryPrefix = `覆盖至 ${item.debtCase.coverageEnd || "-"} | 已逾期 `;
    return {
      categoryLabel: item.category,
      tenantName: debt.tenantName,
      contextLine: debt.contextLine,
      lifecycleLabel: debt.lifecycleLabel,
      lifecycleTone: debt.lifecycleTone === "green" ? "green" : "amber",
      debtKindLabel: debt.debtKindLabel,
      secondaryLine: debt.secondaryLine,
      secondaryReason: { before: secondaryPrefix, emphasis: `${item.debtCase.daysOverdue} 天`, after: ` | ${debt.amountLabel}`, tone: "danger" },
      amountLabel: debt.amountLabel,
      debtCase: item.debtCase
    };
  }

  if (item.type === "rent_collection") {
    const tenant = context.tenants.find((candidate) => candidate.id === item.tenantId);
    const property = context.properties.find((candidate) => candidate.id === item.propertyId);
    const room = context.rooms.find((candidate) => candidate.id === item.roomId);
    const daysRemaining = item.daysRemaining ?? null;
    const status = daysRemaining === 0 ? "今日到期" : daysRemaining != null ? `剩余 ${daysRemaining} 天` : "";
    const secondaryReason = daysRemaining != null
      ? {
          before: `覆盖至 ${item.dueDate || "-"} | ${daysRemaining === 0 ? "" : "剩余 "}`,
          emphasis: daysRemaining === 0 ? "今日到期" : `${daysRemaining} 天`,
          after: item.amount != null ? ` | ${euro(item.amount)}` : "",
          tone: rentUrgencyTone(daysRemaining)
        }
      : undefined;
    return {
      categoryLabel: item.category,
      tenantName: tenant?.name || item.title,
      contextLine: [property?.name, room?.roomNumber || room?.name].filter(Boolean).join(" | ") || item.description,
      lifecycleLabel: isEndedTenantStatus(tenant?.status || "") ? "已退租" : "在租",
      lifecycleTone: isEndedTenantStatus(tenant?.status || "") ? "amber" : "green",
      secondaryLine: [`覆盖至 ${item.dueDate || "-"}`, status, item.amount != null ? euro(item.amount) : ""].filter(Boolean).join(" | "),
      secondaryReason,
      amountLabel: item.amount != null ? euro(item.amount) : undefined
    };
  }

  if (item.type === "vacant_room") {
    const room = context.rooms.find((candidate) => candidate.id === item.roomId);
    const property = context.properties.find((candidate) => candidate.id === item.propertyId);
    return {
      categoryLabel: item.category,
      tenantName: room?.name || room?.roomNumber || "房间",
      contextLine: property?.name || "房源",
      secondaryLine: property?.name || "房源",
      vacantRoom: {
        roomName: room?.name || room?.roomNumber || "房间",
        propertyName: property?.name || "房源",
        statusLabel: "空置"
      }
    };
  }

  return {
    categoryLabel: item.category,
    tenantName: item.title,
    contextLine: item.description,
    secondaryLine: item.description
  };
}

/** Reuses the established coverage urgency scale from BUSINESS_RULES and the tenant-list coverage renderer. */
function rentUrgencyTone(daysRemaining: number): ReminderUrgencyTone {
  if (daysRemaining <= 0) return "danger";
  if (daysRemaining <= 15) return "orange";
  if (daysRemaining <= 30) return "yellow";
  return "green";
}
