"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentCandidate, AttachmentSummary } from "@/lib/server/attachment-management";
import { ArrowDownToLine, ArrowUpFromLine, FileArchive } from "lucide-react";
import { useEffect, useState } from "react";

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function CandidateList({ title, data }: { title: string; data: AttachmentSummary["candidates"]["over3Months"] }) {
  return (
    <section className="card panel">
      <div className="panel-header"><div><h2 className="panel-title">{title}</h2><p className="muted">仅展示 Supabase 合同和收款附件；最终清理前仍需再次核验押金与待办。</p></div></div>
      <div className="detail-grid">
        <Stat label="符合候选租客" value={`${data.tenantCount} 人`} />
        <Stat label="符合候选附件" value={`${data.attachmentCount} 个`} />
        <Stat label="符合候选容量" value={formatBytes(data.bytes)} />
      </div>
      {data.tenants.length ? <div className="attachment-management-list">{data.tenants.map((item) => <CandidateRow key={item.tenantId} item={item} />)}</div> : <p className="muted">暂无符合条件的候选。</p>}
      {data.skipped.length ? <details className="attachment-management-skipped"><summary>已跳过 {data.skipped.length} 位租客</summary><div className="attachment-management-list">{data.skipped.map((item) => <CandidateRow key={item.tenantId} item={item} />)}</div></details> : null}
    </section>
  );
}

function CandidateRow({ item }: { item: AttachmentCandidate }) {
  return <div className="attachment-management-row">
    <div><strong>{item.tenantName}</strong><span className="muted">{item.room || "房间未关联"} · 退租 {item.actualMoveOutDate || "日期缺失"}</span></div>
    <div className="attachment-management-row-stats"><span>合同 {item.contractCount} 个 / {formatBytes(item.contractBytes)}</span><span>收款 {item.rentPaymentCount} 个 / {formatBytes(item.rentPaymentBytes)}</span></div>
    {item.skipReason ? <span className="muted">跳过：{item.skipReason}</span> : null}
  </div>;
}

export default function AttachmentManagementPage() {
  const [summary, setSummary] = useState<AttachmentSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");

  async function exportAttachments() {
    if (exportState === "exporting") return;
    setExportState("exporting"); setExportMessage("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录管理员账号。");
      const response = await fetch("/api/admin/attachments/export", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "附件导出失败，请稍后重试。");
      }
      const blob = await response.blob();
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "attachments.zip";
      const { downloadFile } = await import("@/lib/download-adapter");
      await downloadFile(new File([blob], fileName, { type: "application/zip" }), { title: "附件归档" });
      setExportMessage("附件 ZIP 已生成，可在系统菜单中选择保存位置。");
      setExportState("idle");
    } catch (caught) {
      setExportMessage(caught instanceof Error ? caught.message : "附件导出失败，请稍后重试。");
      setExportState("error");
    }
  }

  async function load() {
    setState("loading"); setError("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录管理员账号。");
      const response = await fetch("/api/admin/attachments/summary", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件统计加载失败。");
      setSummary(payload as AttachmentSummary); setState("ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "附件统计加载失败。"); setState("error"); }
  }

  useEffect(() => { void load(); }, []);

  return <AppLayout title="附件管理与归档" description="只读查看 Supabase 附件容量与退租归档候选。">
    {state === "loading" ? <section className="card panel"><p>正在加载附件统计…</p></section> : null}
    {state === "error" ? <section className="card panel"><p className="error-text">{error}</p><button className="btn" type="button" onClick={() => void load()}>重试</button></section> : null}
    {summary ? <>
      <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">Supabase 附件概览</h2><p className="muted">只读统计，不下载文件、不生成签名链接。</p></div></div>
        <div className="detail-grid">
          <Stat label="Supabase 附件总数" value={`${summary.supabase.totalCount} 个`} /><Stat label="Supabase 总容量" value={formatBytes(summary.supabase.totalBytes)} />
          <Stat label="合同附件" value={`${summary.supabase.byTable.contract_files.count} 个 · ${formatBytes(summary.supabase.byTable.contract_files.bytes)}`} /><Stat label="收款附件" value={`${summary.supabase.byTable.rent_payment_files.count} 个 · ${formatBytes(summary.supabase.byTable.rent_payment_files.bytes)}`} /><Stat label="支出附件" value={`${summary.supabase.byTable.expense_files.count} 个 · ${formatBytes(summary.supabase.byTable.expense_files.bytes)}`} />
          <Stat label="图片" value={`${summary.supabase.byType.image.count} 个 · ${formatBytes(summary.supabase.byType.image.bytes)}`} /><Stat label="PDF" value={`${summary.supabase.byType.pdf.count} 个 · ${formatBytes(summary.supabase.byType.pdf.bytes)}`} /><Stat label="其他文件" value={`${summary.supabase.byType.other.count} 个 · ${formatBytes(summary.supabase.byType.other.bytes)}`} />
          <Stat label="在租租客关联附件" value={`${summary.supabase.inRent.count} 个 · ${formatBytes(summary.supabase.inRent.bytes)}`} /><Stat label="已退租租客关联附件" value={`${summary.supabase.movedOut.count} 个 · ${formatBytes(summary.supabase.movedOut.bytes)}`} /><Stat label="Google Drive 历史附件" value={`${summary.googleDriveCount} 个（不计入 Supabase 容量）`} />
        </div>
      </section>
      <section className="card panel attachment-management-actions">
        <div className="panel-header"><div><h2 className="panel-title">附件导入与导出</h2><p className="muted">所有图片、PDF、合同及其它 Storage 文件统一从这里管理，业务 JSON 不包含这些文件。</p></div></div>
        <div className="settings-actions">
          <button className="btn" type="button" disabled={exportState === "exporting"} onClick={() => void exportAttachments()}><ArrowDownToLine size={17} /> {exportState === "exporting" ? "正在生成 attachments.zip…" : "导出 attachments.zip"}</button>
          <button className="btn" type="button" disabled><ArrowUpFromLine size={17} /> 导入 attachments.zip</button>
        </div>
        {exportMessage ? <p className={exportState === "error" ? "error-text" : "success-text"}>{exportMessage}</p> : null}
        <p className="muted attachment-management-reserved"><FileArchive size={16} /> 附件导出已开放；附件导入暂未开放，后续仍将只在本页面处理。</p>
      </section>
      <CandidateList title="退租超过 3 个月的候选" data={summary.candidates.over3Months} />
      <CandidateList title="退租超过 6 个月的候选" data={summary.candidates.over6Months} />
    </> : null}
  </AppLayout>;
}
