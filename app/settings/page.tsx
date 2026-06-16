import { AppLayout } from "@/components/app-layout";

export default function SettingsPage() {
  return (
    <AppLayout title="设置" description="账号、主题和系统参数。">
      <section className="card panel">
        <h2 className="panel-title">设置</h2>
        <p className="muted">基础设置入口已保留。</p>
      </section>
    </AppLayout>
  );
}
