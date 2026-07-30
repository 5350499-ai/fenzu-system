"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentSummary } from "@/lib/server/attachment-management";
import { useEffect, useState } from "react";

type CleanupCandidate = {
  tenantId: string;
  tenantName: string;
  room: string;
  actualMoveOutDate: string | null;
  contractCount: number;
  contractBytes: number;
  rentPaymentCount: number;
  rentPaymentBytes: number;
  attachmentCount: number;
  bytes: number;
  skipReason: string | null;
};

type CleanupPreview = {
  thresholdMonths: 3 | 6;
  candidateTenantCount: number;
  candidateAttachmentCount: number;
  candidateTotalBytes: number;
  candidates: CleanupCandidate[];
  skipped: CleanupCandidate[];
  riskNotices: string[];
  executionEnabled: false;
};

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function CandidateRow({ item }: { item: CleanupCandidate }) {
  return <div className="attachment-management-row">
    <div>
      <strong>{item.tenantName}</strong>
      <span className="muted">{item.room || "未关联房间"} · 实际退租：{item.actualMoveOutDate || "日期缺失"}</span>
    </div>
    <div className="attachment-management-row-stats">
      <span>合同 {item.contractCount} 个 / {formatBytes(item.contractBytes)}</span>
      <span>收款 {item.rentPaymentCount} 个 / {formatBytes(item.rentPaymentBytes)}</span>
    </div>
    {item.skipReason ? <span className="muted">跳过：{item.skipReason}</span> : null}
  </div>;
}

function CleanupPreviewPanel({ thresholdMonths }: { thresholdMonths: 3 | 6 }) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");

  async function loadPreview() {
    setState("loading");
    setError("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录管理员账号。");
      const response = await fetch(`/api/admin/attachments/cleanup-preview?thresholdMonths=${thresholdMonths}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件清理预览加载失败。");
      setPreview(payload as CleanupPreview);
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "附件清理预览加载失败。");
      setState("error");
    }
  }

  const title = `退租超过${thresholdMonths}个月的清理候选`;
  return <section className="card panel">
    <div className="panel-header">
      <div><h2 className="panel-title">{title}</h2><p className="muted">仅预览：只统计 Supabase 合同与收款附件，不会删除、移动或下载文件。</p></div>
      <button className="btn" type="button" disabled={state === "loading"} onClick={() => void loadPreview()}>{state === "loading" ? "正在生成预览" : "生成预览"}</button>
    </div>
    {state === "idle" ? <p className="muted">请先生成预览。执行清理功能当前默认关闭。</p> : null}
    {state === "error" ? <p className="error-text">{error}</p> : null}
    {preview ? <>
      <div className="detail-grid">
        <Stat label="符合候选租客" value={`${preview.candidateTenantCount} 人`} />
        <Stat label="符合候选附件" value={`${preview.candidateAttachmentCount} 个`} />
        <Stat label="预计可释放容量" value={formatBytes(preview.candidateTotalBytes)} />
      </div>
      {preview.candidates.length ? <details className="attachment-management-skipped" open><summary>按租客查看候选（{preview.candidates.length} 人）</summary><div className="attachment-management-list">{preview.candidates.map((item) => <CandidateRow key={item.tenantId} item={item} />)}</div></details> : <p className="muted">暂无可安全清理的附件候选。</p>}
      {preview.skipped.length ? <details className="attachment-management-skipped"><summary>已跳过（{preview.skipped.length} 人）</summary><div className="attachment-management-list">{preview.skipped.map((item) => <CandidateRow key={item.tenantId} item={item} />)}</div></details> : null}
      <div className="attachment-management-notices">{preview.riskNotices.map((notice) => <p className="muted" key={notice}>{notice}</p>)}</div>
      <div className="settings-actions">
        <button className="btn danger" type="button" disabled title="功能尚未启用">执行清理（功能尚未启用）</button>
      </div>
    </> : null}
  </section>;
}

export default function AttachmentManagementPage() {
  const [summary, setSummary] = useState<AttachmentSummary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  async function load() {
    setState("loading");
    setError("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("当前环境未配置登录服务。");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录管理员账号。");
      const response = await fetch("/api/admin/attachments/summary", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件统计加载失败。");
      setSummary(payload as AttachmentSummary);
      setState("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "附件统计加载失败。");
      setState("error");
    }
  }

  useEffect(() => { void load(); }, []);

  return <AppLayout title="附件管理与归档" description="管理员只读统计、清理预览与归档设计；所有写操作默认关闭。">
    {state === "loading" ? <section className="card panel"><p>正在加载附件统计…</p></section> : null}
    {state === "error" ? <section className="card panel"><p className="error-text">{error}</p><button className="btn" type="button" onClick={() => void load()}>重试</button></section> : null}
    {summary ? <section className="card panel">
      <div className="panel-header"><div><h2 className="panel-title">Supabase 附件概览</h2><p className="muted">只读统计，不下载文件、不生成签名链接。</p></div></div>
      <div className="detail-grid">
        <Stat label="Supabase 附件总数" value={`${summary.supabase.totalCount} 个`} /><Stat label="Supabase 总容量" value={formatBytes(summary.supabase.totalBytes)} />
        <Stat label="合同附件" value={`${summary.supabase.byTable.contract_files.count} 个 · ${formatBytes(summary.supabase.byTable.contract_files.bytes)}`} /><Stat label="收款附件" value={`${summary.supabase.byTable.rent_payment_files.count} 个 · ${formatBytes(summary.supabase.byTable.rent_payment_files.bytes)}`} /><Stat label="支出附件" value={`${summary.supabase.byTable.expense_files.count} 个 · ${formatBytes(summary.supabase.byTable.expense_files.bytes)}`} />
        <Stat label="图片" value={`${summary.supabase.byType.image.count} 个 · ${formatBytes(summary.supabase.byType.image.bytes)}`} /><Stat label="PDF" value={`${summary.supabase.byType.pdf.count} 个 · ${formatBytes(summary.supabase.byType.pdf.bytes)}`} /><Stat label="其他文件" value={`${summary.supabase.byType.other.count} 个 · ${formatBytes(summary.supabase.byType.other.bytes)}`} />
        <Stat label="在租租客关联附件" value={`${summary.supabase.inRent.count} 个 · ${formatBytes(summary.supabase.inRent.bytes)}`} /><Stat label="已退租租客关联附件" value={`${summary.supabase.movedOut.count} 个 · ${formatBytes(summary.supabase.movedOut.bytes)}`} /><Stat label="Google Drive 历史附件" value={`${summary.googleDriveCount} 个（不计入 Supabase 容量）`} />
      </div>
    </section> : null}
    <CleanupPreviewPanel thresholdMonths={3} />
    <CleanupPreviewPanel thresholdMonths={6} />
    <section className="card panel">
      <div className="panel-header"><div><h2 className="panel-title">ZIP 归档</h2><p className="muted">将来会以租客目录和 manifest.csv 组织私有归档；本版本未读取附件、不生成 ZIP。</p></div></div>
      <button className="btn" type="button" disabled title="功能尚未启用">创建 ZIP 归档（功能尚未启用）</button>
    </section>
  </AppLayout>;
}
