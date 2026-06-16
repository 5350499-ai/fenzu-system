import { Plus } from "lucide-react";

export function PageCard({
  title,
  actionLabel = "新增",
  children
}: {
  title: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card panel">
      <div className="toolbar">
        <div>
          <h2 className="panel-title">{title}</h2>
          <p className="muted">当前数据来自 Supabase 云数据库。</p>
        </div>
        <button className="btn primary" type="button">
          <Plus size={17} />
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}
