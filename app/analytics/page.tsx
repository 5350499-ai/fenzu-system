import { AppLayout } from "@/components/app-layout";

export default function AnalyticsPage() {
  return (
    <AppLayout title="统计分析" description="第一版显示月度收入、支出、利润、入住率和来源统计。">
      <section className="card panel">
        <h2 className="panel-title">统计分析</h2>
        <p className="muted">本模块已保留入口，下一轮补充图表和排行榜。</p>
      </section>
    </AppLayout>
  );
}
