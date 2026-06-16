import { AppLayout } from "@/components/app-layout";

export default function ArchivePage() {
  return (
    <AppLayout title="档案中心" description="统一管理合同PDF、护照/NIE照片、入住照片、退房照片和付款截图。">
      <section className="card panel">
        <h2 className="panel-title">档案中心</h2>
        <p className="muted">本模块已保留入口，下一轮补充文件上传和 Supabase Storage。</p>
      </section>
    </AppLayout>
  );
}
