import Link from "next/link";

export function MetricCard({
  label,
  value,
  note,
  tone,
  hero,
  href
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "profit" | "danger" | "warning" | "info";
  hero?: boolean;
  href?: string;
}) {
  const toneClass =
    tone === "profit"
      ? "profit"
      : tone === "danger"
        ? "danger-text"
        : tone === "warning"
          ? "warning-text"
          : tone === "info"
            ? "info-text"
            : "";

  const content = (
    <section className={`card metric-card ${hero ? "hero" : ""}`}>
      <div className="metric-label">
        <span>{label}</span>
      </div>
      <div className={`metric-value ${toneClass}`}>{value}</div>
      {note ? <div className="metric-note">{note}</div> : null}
    </section>
  );

  if (!href) return content;

  return (
    <Link className="metric-link" href={href}>
      {content}
    </Link>
  );
}
