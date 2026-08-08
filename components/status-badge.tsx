export function StatusBadge({ children, tone, className }: { children: React.ReactNode; tone?: string; className?: string }) {
  return <span className={`badge ${tone || ""} ${className || ""}`}>{children}</span>;
}
