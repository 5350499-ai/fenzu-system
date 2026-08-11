import type { ReminderItem } from "@/lib/reminder-engine";
import { buildRentReminderDisplay } from "@/lib/rent-reminder-display";
import { StatusBadge } from "@/components/status-badge";

/**
 * Shared presentation of payment-backed reminders. Both the dashboard and the
 * reminder center receive lifecycle and debt-kind context from the same
 * ReminderItem metadata instead of reconstructing it in page JSX.
 */
export function RentReminderDisplay({ item, className = "" }: { item: ReminderItem; className?: string }) {
  const display = buildRentReminderDisplay(item);
  if (!display) return null;
  return <span className={`rent-reminder-display ${className}`.trim()}>
    <span className="rent-reminder-primary">
      <strong>{display.primaryLine}</strong>
      <span className="rent-reminder-badges">
        <StatusBadge tone={display.lifecycleTone}>{display.lifecycleLabel}</StatusBadge>
        {display.debtKindLabel ? <StatusBadge tone="red">{display.debtKindLabel}</StatusBadge> : null}
      </span>
    </span>
    <small>{display.secondaryLine}</small>
  </span>;
}
