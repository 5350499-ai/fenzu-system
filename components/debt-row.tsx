import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import type { DebtCase } from "@/lib/debt-case";
import { buildDebtDisplayModel } from "@/lib/debt-display";

export function DebtRow({ debtCase, href, className = "", children, variant = "default" }: { debtCase: DebtCase; href?: string; className?: string; children?: React.ReactNode; variant?: "default" | "homepage" }) {
  const display = buildDebtDisplayModel(debtCase);
  const body = variant === "homepage" ? <>
    <span className="debt-row-primary debt-row-primary-homepage">
      <strong className="debt-row-tenant">{display.tenantName}</strong>
      <span className="debt-row-context">{display.contextLine}</span>
      <span className="debt-row-badges"><StatusBadge tone={display.lifecycleTone}>{display.lifecycleLabel}</StatusBadge><StatusBadge tone="red">{display.debtKindLabel}</StatusBadge></span>
    </span>
    <small className="debt-row-secondary">{display.secondaryLine}</small>
  </> : <>
    <span className="debt-row-primary"><strong>{display.primaryLine}</strong><span className="debt-row-badges"><StatusBadge tone={display.lifecycleTone}>{display.lifecycleLabel}</StatusBadge><StatusBadge tone="red">{display.debtKindLabel}</StatusBadge></span></span>
    <small className="debt-row-secondary">{display.secondaryLine}</small>
  </>;
  const rootClassName = `debt-row ${variant === "homepage" ? "homepage-reminder-row" : ""} ${className}`.trim();
  if (href) return <Link className={rootClassName} href={href}>{body}{children}</Link>;
  return <div className={rootClassName}>{body}{children}</div>;
}
