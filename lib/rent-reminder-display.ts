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
};

export function buildRentReminderDisplay(item: Pick<ReminderItem, "type" | "rentContext" | "amount" | "daysOverdue" | "daysRemaining">): RentReminderDisplay | null {
  const context = item.rentContext;
  if (!context) return null;
  const primaryLine = [context.tenantName, context.propertyLabel, context.roomLabel].filter(Boolean).join(" | ");
  const amount = context.amount ?? item.amount;
  const daysOverdue = context.daysOverdue ?? item.daysOverdue ?? 0;
  const daysRemaining = context.daysRemaining ?? item.daysRemaining;
  const statusText = item.type === "rent_debt"
    ? `已逾期 ${daysOverdue} 天${amount == null ? "" : ` | ${euro(amount)}`}`
    : daysRemaining === 0 ? "今日到期" : `即将到期 ${Math.max(0, daysRemaining || 0)} 天`;
  return {
    primaryLine,
    secondaryLine: `覆盖至 ${context.coverageEnd} | ${statusText}`,
    statusText
  };
}
