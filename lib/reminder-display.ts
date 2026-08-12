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

export type ReminderDisplayModel = {
  categoryLabel: string;
  tenantName: string;
  contextLine: string;
  lifecycleLabel?: string;
  lifecycleTone?: "green" | "amber";
  debtKindLabel?: string;
  secondaryLine: string;
  amountLabel?: string;
  debtCase?: DebtCase;
};

export function buildReminderDisplayModel(item: ReminderItem, context: ReminderDisplayContext): ReminderDisplayModel {
  if (item.debtCase) {
    const debt = buildDebtDisplayModel(item.debtCase);
    return {
      categoryLabel: item.category,
      tenantName: debt.tenantName,
      contextLine: debt.contextLine,
      lifecycleLabel: debt.lifecycleLabel,
      lifecycleTone: debt.lifecycleTone === "green" ? "green" : "amber",
      debtKindLabel: debt.debtKindLabel,
      secondaryLine: debt.secondaryLine,
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
    return {
      categoryLabel: item.category,
      tenantName: tenant?.name || item.title,
      contextLine: [property?.name, room?.roomNumber || room?.name].filter(Boolean).join(" | ") || item.description,
      lifecycleLabel: isEndedTenantStatus(tenant?.status || "") ? "已退租" : "在租",
      lifecycleTone: isEndedTenantStatus(tenant?.status || "") ? "amber" : "green",
      secondaryLine: [`覆盖至 ${item.dueDate || "-"}`, status, item.amount != null ? euro(item.amount) : ""].filter(Boolean).join(" | "),
      amountLabel: item.amount != null ? euro(item.amount) : undefined
    };
  }

  return {
    categoryLabel: item.category,
    tenantName: item.title,
    contextLine: item.description,
    secondaryLine: item.description
  };
}
