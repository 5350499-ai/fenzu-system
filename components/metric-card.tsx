export function MetricCard({
  label,
  value,
  note,
  tone,
  hero
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "profit" | "danger" | "warning" | "info";
  hero?: boolean;
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

  return (
    <section className={`card metric-card ${hero ? "hero" : ""}`}>
      <div className="metric-label">
        <span>{label}</span>
      </div>
      <div className={`metric-value ${toneClass}`}>{value}</div>
      {note ? <div className="metric-note">{note}</div> : null}
    </section>
  );
}
