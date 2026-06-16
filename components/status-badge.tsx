export function StatusBadge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone || ""}`}>{children}</span>;
}
