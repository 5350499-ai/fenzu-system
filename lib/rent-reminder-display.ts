import type { ReminderItem } from "./reminder-engine";
// @ts-expect-error Node's strip-types test runner loads TypeScript modules directly.
import { euro } from "./format.ts";

/**
 * Shared mobile-safe presentation contract for payment-backed reminders.
 * Primary identity and secondary coverage/status facts deliberately remain
 * separate lines so coverage end is never sacrificed to an ellipsis.
 */
export type RentReminderDisplay = {
  primaryLine: string;
  secondaryLine: string;
  statusText: string;
  lifecycleLabel: string;
  lifecycleTone: "green" | "amber" | "blue";
  debtKindLabel: string;
  availableActions: ReminderItem["availableActions"];
};

export function buildRentReminderDisplay(item: Pick<ReminderItem, "type" | "rentContext" | "amount" | "daysOverdue" | "daysRemaining" | "tenantLifecycle" | "debtKind" | "availableActions">): RentReminderDisplay | null {
  const context = item.rentContext;
  if (!context) return null;
  const primaryLine = [context.tenantName, context.propertyLabel, context.roomLabel].filter(Boolean).join(" | ");
  const amount = context.amount ?? item.amount;
  const daysOverdue = context.daysOverdue ?? item.daysOverdue ?? 0;
  const daysRemaining = context.daysRemaining ?? item.daysRemaining;
  const statusText = item.type === "rent_debt"
    ? `已逾期 ${daysOverdue} 天${amount == null ? "" : ` | ${euro(amount)}`}`
    : daysRemaining === 0 ? "今日到期" : `即将到期 ${Math.max(0, daysRemaining || 0)} 天`;
  const lifecycle = context.tenantLifecycle || item.tenantLifecycle || "other";
  const lifecycleLabel = lifecycle === "current" ? "在租" : lifecycle === "moved_out" ? "已退租" : lifecycle === "archived" ? "已归档" : "租客状态待确认";
  const lifecycleTone = lifecycle === "current" ? "green" : lifecycle === "moved_out" ? "amber" : "blue";
  const debtKind = context.debtKind || item.debtKind;
  return {
    primaryLine,
    secondaryLine: `覆盖至 ${context.coverageEnd} | ${statusText}`,
    statusText,
    lifecycleLabel,
    lifecycleTone,
    debtKindLabel: debtKind === "historical" ? "历史欠费" : debtKind === "current" ? "当前欠租" : "",
    availableActions: item.availableActions
  };
}
