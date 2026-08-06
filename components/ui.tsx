import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { euro } from "@/lib/format";

function cx(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode };

export function PrimaryButton({ className, children, ...props }: ButtonProps) {
  return <button className={cx("btn primary ui-button", className)} {...props}>{children}</button>;
}

export function SecondaryButton({ className, children, ...props }: ButtonProps) {
  return <button className={cx("btn ui-button", className)} {...props}>{children}</button>;
}

export function DangerButton({ className, children, ...props }: ButtonProps) {
  return <button className={cx("btn danger ui-button", className)} {...props}>{children}</button>;
}

export function SectionCard({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("card panel ui-section-card", className)} {...props}>{children}</section>;
}

export function DetailCard({ title, subtitle, children, className }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cx("card panel ui-detail-card", className)}><div className="ui-detail-card-heading"><div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div></div>{children}</section>;
}

export function DetailGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("ui-detail-grid", className)}>{children}</div>;
}

export function DetailItem({ label, value, tone = "default", className }: { label: ReactNode; value: ReactNode; tone?: "default" | "income" | "expense" | "profit" | "loss"; className?: string }) {
  return <div className={cx("ui-detail-item", `ui-detail-item-${tone}`, className)}><span>{label}</span><strong>{value}</strong></div>;
}

export function MoneyValue({ value, tone = "default", className }: { value: number; tone?: "default" | "income" | "expense" | "profit" | "loss"; className?: string }) {
  return <span className={cx("ui-money-value", `ui-money-value-${tone}`, className)}>{euro(value)}</span>;
}

export function PageHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return <header className={cx("ui-page-header", className)}><div><h1 className="page-title">{title}</h1>{description ? <p className="page-desc">{description}</p> : null}</div>{actions ? <div className="top-actions">{actions}</div> : null}</header>;
}

export function FormField({ label, htmlFor, children, hint, className }: { label: ReactNode; htmlFor?: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <div className={cx("field ui-form-field", className)}><label htmlFor={htmlFor}>{label}</label>{children}{hint ? <span className="field-hint">{hint}</span> : null}</div>;
}

export function StatCard({ label, value, detail, tone, className }: { label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: "success" | "warning" | "danger" | "info"; className?: string }) {
  return <section className={cx("card metric-card ui-stat-card", tone ? `tone-${tone}` : undefined, className)}><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong>{detail ? <span className="metric-detail">{detail}</span> : null}</section>;
}

export function StatusTag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "info" | "neutral"; className?: string }) {
  const badgeTone = tone === "neutral" ? "" : tone === "success" ? "green" : tone === "danger" ? "red" : tone === "warning" ? "amber" : "blue";
  return <span className={cx("badge ui-status-tag", badgeTone, className)}>{children}</span>;
}

export function LoadingOverlay({ label = "正在加载…" }: { label?: ReactNode }) {
  return <div className="ui-loading-overlay" role="status" aria-live="polite"><span className="ui-spinner" aria-hidden="true" />{label}</div>;
}

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", cancelLabel = "取消", onConfirm, onCancel }: { open: boolean; title: ReactNode; description?: ReactNode; confirmLabel?: ReactNode; cancelLabel?: ReactNode; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return <div className="modal-backdrop ui-dialog-backdrop" role="presentation" onClick={onCancel}><section className="card modal-card ui-dialog" role="dialog" aria-modal="true" aria-labelledby="ui-dialog-title" onClick={(event) => event.stopPropagation()}><h2 id="ui-dialog-title" className="panel-title">{title}</h2>{description ? <p className="muted">{description}</p> : null}<div className="modal-actions"><SecondaryButton type="button" onClick={onCancel}>{cancelLabel}</SecondaryButton><DangerButton type="button" onClick={onConfirm}>{confirmLabel}</DangerButton></div></section></div>;
}

export function Toast({ message, tone = "info" }: { message?: ReactNode; tone?: "success" | "warning" | "danger" | "info" }) {
  if (!message) return null;
  return <div className={cx("ui-toast", `ui-toast-${tone}`)} role="status" aria-live="polite">{message}</div>;
}
