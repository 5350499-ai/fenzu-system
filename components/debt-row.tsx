import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { DebtCase } from "@/lib/debt-case";
import { buildDebtDisplayModel } from "@/lib/debt-display";

export function DebtRow({ debtCase, href, className = "", children }: { debtCase: DebtCase; href?: string; className?: string; children?: React.ReactNode }) {
  const display = buildDebtDisplayModel(debtCase);
  const body = <>
    <span className="debt-row-primary"><strong>{display.primaryLine}</strong><span className="debt-row-badges"><StatusBadge tone={display.lifecycleTone}>{display.lifecycleLabel}</StatusBadge><StatusBadge tone="red">{display.debtKindLabel}</StatusBadge></span></span>
    <small className="debt-row-secondary">{display.secondaryLine}</small>
  </>;
  if (href) return <Link className={`debt-row ${className}`.trim()} href={href}>{body}{children}</Link>;
  return <div className={`debt-row ${className}`.trim()}>{body}{children}</div>;
}
