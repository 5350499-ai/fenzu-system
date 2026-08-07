"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentSummary } from "@/lib/server/attachment-management";
import type { AttachmentCleanupCandidate, AttachmentCleanupReport } from "@/lib/server/attachment-cleanup";
import { ArrowDownToLine, FileArchive, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

type LoadState = "loading" | "ready" | "error";

export default function AttachmentArchivePage() {
  const [summary, setSummary] = useState<AttachmentSummary | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [candidates, setCandidates] = useState<AttachmentCleanupCandidate[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [cleanupLoading, setCleanupLoading] = useState(true);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [cleanupReport, setCleanupReport] = useState<AttachmentCleanupReport | null>(null);
  const [confirmCleanup, setConfirmCleanup] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const selectedCandidate = useMemo(() => candidates.find((item) => item.tenantId === selectedTenantId) || null, [candidates, selectedTenantId]);

  async function authHeaders() {
    if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("请先登录管理账号。");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function loadSummary() {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/admin/attachments/summary", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件统计加载失败，请稍后重试。");
      setSummary(payload as AttachmentSummary);
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "附件统计加载失败，请稍后重试。");
      setState("error");
    }
  }

  async function loadCandidates() {
    setCleanupLoading(true);
    try {
      const response = await fetch("/api/admin/attachments/cleanup-candidates", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "清理候选加载失败。");
      setCandidates((payload.candidates || []) as AttachmentCleanupCandidate[]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "清理候选加载失败。");
    } finally {
      setCleanupLoading(false);
    }
  }

  async function exportAttachments() {
    if (exportState === "exporting") return;
    setExportState("exporting");
    setExportMessage("");
    try {
      const response = await fetch("/api/admin/attachments/export", { headers: await authHeaders(), cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "附件归档生成失败，请稍后重试。");
      }
      const blob = await response.blob();
      const fileName = response.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/i)?.[1] || "attachments-archive.zip";
      const { downloadFile } = await import("@/lib/download-adapter");
      await downloadFile(new File([blob], fileName, { type: "application/zip" }), { title: "附件归档" });
      const total = Number(response.headers.get("X-Attachment-Count") || 0);
      const skipped = Number(response.headers.get("X-Attachment-Skipped") || 0);
      setExportMessage(`附件归档已生成：共 ${total} 个，未能归档 ${skipped} 个，文件大小 ${formatBytes(blob.size)}。请保存到本地。`);
      setExportState("idle");
    } catch (caught) {
      setExportMessage(caught instanceof Error ? caught.message : "附件归档生成失败，请稍后重试。");
      setExportState("error");
    }
  }

  async function cleanupSelected() {
    if (!selectedCandidate || cleaning) return;
    setCleaning(true);
    setCleanupMessage("");
    setCleanupReport(null);
    try {
      const response = await fetch("/api/admin/attachments/cleanup", {
        method: "POST",
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedCandidate.tenantId, confirmation: true }),
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "云端附件清理失败。");
      setCleanupReport(payload.report as AttachmentCleanupReport);
      setSelectedTenantId("");
      setConfirmCleanup(false);
      await Promise.all([loadSummary(), loadCandidates()]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "云端附件清理失败。");
    } finally {
      setCleaning(false);
    }
  }

  useEffect(() => {
    void loadSummary();
    void loadCandidates();
  }, []);

  return <AppLayout title="附件归档与清理" description="导出并保存历史附件，归档后可清理云端文件以释放空间。">
    {state === "loading" ? <section className="card panel"><p>正在加载附件统计…</p></section> : null}
    {state === "error" ? <section className="card panel"><p className="error-text">{error}</p><button className="btn" type="button" onClick={() => void loadSummary()}>重试</button></section> : null}
    {summary ? <>
      <section className="card panel">
        <div className="panel-header"><div><h2 className="panel-title">附件归档</h2><p className="muted">建议先将历史附件导出并保存到本地，再按需清理云端文件。</p></div><FileArchive size={22} /></div>
        <div className="detail-grid">
          <Stat label="云端附件" value={`${summary.supabase.totalCount} 个 · ${formatBytes(summary.supabase.totalBytes)}`} />
          <Stat label="合同附件" value={`${summary.supabase.byTable.contract_files.count} 个 · ${formatBytes(summary.supabase.byTable.contract_files.bytes)}`} />
          <Stat label="收款附件" value={`${summary.supabase.byTable.rent_payment_files.count} 个 · ${formatBytes(summary.supabase.byTable.rent_payment_files.bytes)}`} />
          <Stat label="支出附件" value={`${summary.supabase.byTable.expense_files.count} 个 · ${formatBytes(summary.supabase.byTable.expense_files.bytes)}`} />
        </div>
        <button className="btn primary" type="button" disabled={exportState === "exporting"} onClick={() => void exportAttachments()}><ArrowDownToLine size={17} /> {exportState === "exporting" ? "正在生成附件归档…" : "导出附件归档"}</button>
        {exportMessage ? <p className={exportState === "error" ? "error-text" : "success-text"}>{exportMessage}</p> : null}
        <p className="muted attachment-management-reserved">数据备份与附件归档彼此独立；本页面不提供附件重新导入。</p>
      </section>

      <section className="card panel">
        <div className="panel-header"><div><h2 className="panel-title">云端附件清理</h2><p className="muted">只显示已退租租客的附件候选。建议确认附件已保存到本地后再删除。</p></div><Trash2 size={22} /></div>
        {cleanupLoading ? <p className="muted">正在检查清理候选…</p> : null}
        {!cleanupLoading && !candidates.length ? <p className="muted">暂无可清理的已退租租客附件。</p> : null}
        {candidates.length ? <>
          <label className="form-field"><span>选择租客</span><select value={selectedTenantId} onChange={(event) => { setSelectedTenantId(event.target.value); setConfirmCleanup(false); setCleanupReport(null); }}><option value="">请选择</option>{candidates.map((item) => <option key={item.tenantId} value={item.tenantId}>{item.tenantName} · {item.attachmentCount} 个 · {formatBytes(item.bytes)}</option>)}</select></label>
          {selectedCandidate ? <div className="attachment-management-row"><strong>{selectedCandidate.tenantName}</strong><span className="muted">{selectedCandidate.propertyName} · {selectedCandidate.roomName}</span><span>将删除 {selectedCandidate.attachmentCount} 个附件 · {formatBytes(selectedCandidate.bytes)}</span>{selectedCandidate.googleDriveCount ? <span className="muted">其中 {selectedCandidate.googleDriveCount} 个外部云端附件需人工处理，系统不会自动删除。</span> : null}</div> : null}
          {selectedCandidate && !confirmCleanup ? <button className="btn danger" type="button" onClick={() => setConfirmCleanup(true)} disabled={cleaning}>删除云端附件</button> : null}
          {selectedCandidate && confirmCleanup ? <div className="card panel"><p className="warning-text">删除后软件中将无法再查看这些附件，请确认已完成本地归档。</p><div className="settings-actions"><button className="btn" type="button" onClick={() => setConfirmCleanup(false)} disabled={cleaning}>取消</button><button className="btn danger" type="button" onClick={() => void cleanupSelected()} disabled={cleaning}>{cleaning ? "正在清理…" : "确认删除"}</button></div></div> : null}
        </> : null}
        {cleanupMessage ? <p className="error-text">{cleanupMessage}</p> : null}
        {cleanupReport ? <div className="attachment-management-row"><strong>清理完成</strong><span>计划 {cleanupReport.planned} 个 · 成功删除 {cleanupReport.deleted} 个 · 失败 {cleanupReport.failed} 个</span><span>已释放 {formatBytes(cleanupReport.releasedBytes)} · 未释放 {formatBytes(cleanupReport.unreleasedBytes)}</span>{cleanupReport.skippedGoogleDrive ? <span className="muted">跳过外部云端附件 {cleanupReport.skippedGoogleDrive} 个，需人工处理。</span> : null}{cleanupReport.errors.length ? <details><summary>查看未处理原因（{cleanupReport.errors.length}）</summary><ul>{cleanupReport.errors.map((item) => <li key={`${item.attachmentId}-${item.fileName}`}>{item.fileName}：{item.reason}</li>)}</ul></details> : null}</div> : null}
      </section>
    </> : null}
  </AppLayout>;
}
