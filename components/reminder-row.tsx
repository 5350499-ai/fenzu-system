import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { ReminderItem } from "@/lib/reminder-engine";
import { buildReminderDisplayModel, type ReminderDisplayContext } from "@/lib/reminder-display";

export function ReminderRow({ item, context, variant = "full", onWaive }: { item: ReminderItem; context: ReminderDisplayContext; variant?: "compact" | "full"; onWaive?: (item: ReminderItem) => void }) {
  const display = buildReminderDisplayModel(item, context);
  const identity = <>
    <span className="reminder-row-primary">
      {variant === "full" ? <span className="reminder-row-kind"><StatusBadge tone={item.tone === "danger" ? "red" : item.tone === "warning" ? "amber" : item.tone === "yellow" ? "yellow" : "blue"}>{display.categoryLabel}</StatusBadge></span> : null}
      <strong>{display.tenantName}</strong>
      <span className="reminder-row-context">{display.contextLine}</span>
      <span className="reminder-row-badges">
        {display.lifecycleLabel ? <StatusBadge tone={display.lifecycleTone}>{display.lifecycleLabel}</StatusBadge> : null}
        {display.debtKindLabel ? <StatusBadge tone="red">{display.debtKindLabel}</StatusBadge> : null}
      </span>
    </span>
    <small className="reminder-row-secondary">{display.secondaryLine}</small>
  </>;
  const body = <>
    {variant === "full" && display.debtCase && (display.debtCase.canCollect || display.debtCase.canWaive)
      ? <Link className="reminder-row-link" href={item.href}>{identity}</Link>
      : identity}
    {variant === "full" && (display.debtCase?.canCollect || display.debtCase?.canWaive) ? (
      <span className="reminder-rent-actions">
        {display.debtCase?.canCollect ? <Link className="btn primary" href={`/rent-payments?collectPayment=${encodeURIComponent(display.debtCase.paymentId)}&overdue=1`}>续交房租</Link> : null}
        {display.debtCase?.canWaive ? <button className="btn warning" type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onWaive?.(item); }}>放弃追缴</button> : null}
      </span>
    ) : null}
  </>;

  if (variant === "full" && display.debtCase && (display.debtCase.canCollect || display.debtCase.canWaive)) {
    return <div className={`reminder-row reminder-row-full ${item.tone}`}>{body}</div>;
  }
  return <Link className={`reminder-row reminder-row-${variant} ${item.tone}`} href={item.href}>{body}</Link>;
}
