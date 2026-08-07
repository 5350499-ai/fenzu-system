"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentCandidate, AttachmentSummary } from "@/lib/server/attachment-management";
import type { AttachmentRestorePreview, AttachmentRestoreReport } from "@/lib/server/attachment-restore";
import { ArrowDownToLine, ArrowUpFromLine, FileArchive } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

function RestoreReport({ report }: { report: AttachmentRestoreReport }) {
  return <div className="attachment-restore-report">
    <strong>附件恢复完成</strong>
    <div className="detail-grid">
      <Stat label="总附件" value={report.total} />
      <Stat label="新恢复" value={report.restored} />
      <Stat label="已存在" value={report.existing} />
      <Stat label="已修复" value={report.repaired} />
      <Stat label="缺失" value={report.missing} />
      <Stat label="Checksum 失败" value={report.checksumFailed} />
      <Stat label="找不到对应记录" value={report.orphan} />
      <Stat label="上传失败" value={report.uploadFailed} />
      <Stat label="其它跳过" value={report.skipped} />
    </div>
    {report.errors.length ? <details><summary>查看跳过原因（{report.errors.length}）</summary><ul>{report.errors.map((item, index) => <li key={`${item.attachmentId || "unknown"}-${index}`}>{item.category}：{item.reason}</li>)}</ul></details> : <p className="success-text">所有附件均已处理。</p>}
  </div>;
}

export default function AttachmentManagementPage() {
  const [summary, setSummary] = useState<AttachmentSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<AttachmentRestorePreview | null>(null);
  const [restoreReport, setRestoreReport] = useState<AttachmentRestoreReport | null>(null);
  const [restoreState, setRestoreState] = useState<"idle" | "previewing" | "confirming" | "restoring" | "error">("idle");
  const [restoreMessage, setRestoreMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function authHeaders() {
    if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("请先登录管理账号。");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function exportAttachments() {
    if (exportState === "exporting") return;
    setExportState("exporting"); setExportMessage("");
    try {
      const response = await fetch("/api/admin/attachments/export", { headers: await authHeaders(), cache: "no-store" });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "附件导出失败，请稍后重试。"); }
      const blob = await response.blob();
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "attachments.zip";
      const { downloadFile } = await import("@/lib/download-adapter");
      await downloadFile(new File([blob], fileName, { type: "application/zip" }), { title: "附件归档" });
      setExportMessage("附件 ZIP 已生成，可在系统菜单中选择保存位置。"); setExportState("idle");
    } catch (caught) { setExportMessage(caught instanceof Error ? caught.message : "附件导出失败，请稍后重试。"); setExportState("error"); }
  }

  async function inspectRestoreFile(file: File) {
    setRestoreFile(file); setRestorePreview(null); setRestoreReport(null); setRestoreMessage(""); setRestoreState("previewing");
    try {
      if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("请选择 attachments.zip 文件。");
      const form = new FormData(); form.append("file", file);
      const response = await fetch("/api/admin/attachments/restore-preview", { method: "POST", headers: await authHeaders(), body: form, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件恢复预览失败。");
      setRestorePreview(payload as AttachmentRestorePreview); setRestoreState("confirming");
    } catch (caught) { setRestoreMessage(caught instanceof Error ? caught.message : "附件恢复预览失败。"); setRestoreState("error"); }
  }

  async function restoreAttachments() {
    if (!restoreFile || restoreState === "restoring") return;
    setRestoreState("restoring"); setRestoreMessage(""); setRestoreReport(null);
    try {
      const form = new FormData(); form.append("file", restoreFile);
      const response = await fetch("/api/admin/attachments/restore", { method: "POST", headers: await authHeaders(), body: form, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件恢复失败。");
      setRestoreReport(payload as AttachmentRestoreReport); setRestoreState("idle"); setRestoreMessage("附件恢复已完成，现有 ZIP 之外的附件未被删除。");
      void load();
    } catch (caught) { setRestoreMessage(caught instanceof Error ? caught.message : "附件恢复失败。"); setRestoreState("error"); }
  }

  async function load() {
    setState("loading"); setError("");
    try {
      const response = await fetch("/api/admin/attachments/summary", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件统计加载失败。");
      setSummary(payload as AttachmentSummary); setState("ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "附件统计加载失败。"); setState("error"); }
  }

  useEffect(() => { void load(); }, []);

  return <AppLayout title="备份与恢复（附件）" description="统一导出和恢复图片、PDF、合同及其它附件。">
    {state === "loading" ? <section className="card panel"><p>正在加载附件统计…</p></section> : null}
    {state === "error" ? <section className="card panel"><p className="error-text">{error}</p><button className="btn" type="button" onClick={() => void load()}>重试</button></section> : null}
    {summary ? <>
      <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">附件概览</h2><p className="muted">附件备份独立于业务数据 Backup；恢复只按 manifest 中的稳定 ID 重新关联。</p></div></div>
        <div className="detail-grid">
          <Stat label="Supabase 附件总数" value={`${summary.supabase.totalCount} 个`} /><Stat label="Supabase 总容量" value={formatBytes(summary.supabase.totalBytes)} />
          <Stat label="合同附件" value={`${summary.supabase.byTable.contract_files.count} 个 · ${formatBytes(summary.supabase.byTable.contract_files.bytes)}`} /><Stat label="收款附件" value={`${summary.supabase.byTable.rent_payment_files.count} 个 · ${formatBytes(summary.supabase.byTable.rent_payment_files.bytes)}`} /><Stat label="支出附件" value={`${summary.supabase.byTable.expense_files.count} 个 · ${formatBytes(summary.supabase.byTable.expense_files.bytes)}`} />
          <Stat label="图片" value={`${summary.supabase.byType.image.count} 个 · ${formatBytes(summary.supabase.byType.image.bytes)}`} /><Stat label="PDF" value={`${summary.supabase.byType.pdf.count} 个 · ${formatBytes(summary.supabase.byType.pdf.bytes)}`} /><Stat label="其它文件" value={`${summary.supabase.byType.other.count} 个 · ${formatBytes(summary.supabase.byType.other.bytes)}`} />
          <Stat label="在租租客关联附件" value={`${summary.supabase.inRent.count} 个 · ${formatBytes(summary.supabase.inRent.bytes)}`} /><Stat label="已退租租客关联附件" value={`${summary.supabase.movedOut.count} 个 · ${formatBytes(summary.supabase.movedOut.bytes)}`} /><Stat label="Google Drive 历史附件" value={`${summary.googleDriveCount} 个（不计入 Supabase 容量）`} />
        </div>
      </section>
      <section className="card panel attachment-management-actions">
        <div className="panel-header"><div><h2 className="panel-title">附件备份与恢复</h2><p className="muted">附件 ZIP 自带 manifest，恢复采用非破坏性、幂等合并，不删除 ZIP 之外的现有附件。</p></div></div>
        <div className="settings-actions">
          <button className="btn" type="button" disabled={exportState === "exporting"} onClick={() => void exportAttachments()}><ArrowDownToLine size={17} /> {exportState === "exporting" ? "正在生成 attachments.zip…" : "导出 attachments.zip"}</button>
          <button className="btn" type="button" disabled={restoreState === "previewing" || restoreState === "restoring"} onClick={() => fileInputRef.current?.click()}><ArrowUpFromLine size={17} /> {restoreState === "previewing" ? "正在读取 ZIP…" : "恢复 attachments.zip"}</button>
          <input ref={fileInputRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectRestoreFile(file); event.currentTarget.value = ""; }} />
        </div>
        {exportMessage ? <p className={exportState === "error" ? "error-text" : "success-text"}>{exportMessage}</p> : null}
        {restoreMessage ? <p className={restoreState === "error" ? "error-text" : "success-text"}>{restoreMessage}</p> : null}
        {restorePreview ? <div className="attachment-restore-preview"><h3>恢复预览</h3><div className="detail-grid"><Stat label="备份时间" value={restorePreview.generatedAt ? new Date(restorePreview.generatedAt).toLocaleString("zh-CN") : "未提供"} /><Stat label="ZIP 附件总数" value={restorePreview.total} /><Stat label="可恢复" value={restorePreview.recoverable} /><Stat label="已存在" value={restorePreview.existing} /><Stat label="异常/需跳过" value={restorePreview.abnormal} /></div><p className="muted">恢复只会新增或修复 ZIP 中的附件；当前系统已有但 ZIP 没有的附件会保留。</p><div className="settings-actions"><button className="btn" type="button" onClick={() => { setRestoreFile(null); setRestorePreview(null); setRestoreState("idle"); }}>取消</button><button className="btn primary" type="button" disabled={restoreState !== "confirming"} onClick={() => void restoreAttachments()}>确认恢复附件</button></div></div> : null}
        {restoreState === "restoring" ? <p className="muted">正在逐个处理附件，请稍候…单个异常会记录并自动跳过。</p> : null}
        {restoreReport ? <RestoreReport report={restoreReport} /> : null}
        <p className="muted attachment-management-reserved"><FileArchive size={16} /> 数据 Backup 与附件 ZIP 独立；本页面是唯一附件导出与恢复入口。</p>
      </section>
      <CandidateList title="退租超过 3 个月的候选" data={summary.candidates.over3Months} />
      <CandidateList title="退租超过 6 个月的候选" data={summary.candidates.over6Months} />
    </> : null}
  </AppLayout>;
}
