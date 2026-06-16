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
          <p className="muted">当前为 V1 演示数据，接入 Supabase 后保存到数据库。</p>
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
