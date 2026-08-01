"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type ScanItem = {
  attachmentId: string;
  table: string;
  fileName: string;
  databaseMime: string | null;
  databaseSize: number;
  sourceStatus: string;
  driveMime: string | null;
  driveSize: number | null;
  targetBucket: string;
  targetStatus: string;
  readable: boolean;
  migratable: boolean;
  reason: string | null;
  providerFingerprint: string | null;
};
type ScanResult = { scannedAt: string; expiresAt: string; previewToken: string; summary: Record<string, number>; items: ScanItem[] };

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = { readable: "可读取", missing: "文件不存在", trashed: "回收站", permission_denied: "无权限或不可下载", metadata_mismatch: "元数据不一致", duplicate: "重复索引", outside_root: "目录范围异常", target_conflict: "目标冲突", target_exists: "目标已存在", scan_failed: "扫描失败" };
  return labels[value] || "待核验";
}

export default function GoogleAttachmentMigrationPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [error, setError] = useState("");
  async function scan() {
    setState("loading"); setError("");
    try {
      if (!isSupabaseConfigured || !supabase) throw new Error("请先登录管理员账号。");
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录管理员账号。");
      const response = await fetch("/api/admin/google-attachment-migration/scan", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "扫描失败。");
      setResult(payload as ScanResult); setState("ready");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "扫描失败。"); setState("error"); }
  }
  useEffect(() => { void scan(); }, []);
  const summary = result?.summary;
  return <AppLayout title="Google Drive 历史附件迁移" description="管理员只读扫描与迁移预览；本页面不会下载、上传或切换任何附件。">
    <section className="card panel">
      <div className="panel-header"><div><h2 className="panel-title">只读迁移预览</h2><p className="muted">扫描按附件索引中的文件标识逐条核对，不按目录或文件名迁移。迁移执行默认关闭。</p></div><button className="btn" type="button" onClick={() => void scan()} disabled={state === "loading"}>{state === "loading" ? "扫描中…" : "重新扫描"}</button></div>
      {state === "error" ? <p className="error-text">{error}</p> : null}
      {summary ? <div className="detail-grid">
        <div className="detail-field"><span>索引总数</span><strong>{summary.total}</strong></div><div className="detail-field"><span>可读取</span><strong>{summary.readable}</strong></div><div className="detail-field"><span>可迁移</span><strong>{summary.migratable}</strong></div><div className="detail-field"><span>总容量</span><strong>{formatBytes(summary.totalBytes)}</strong></div><div className="detail-field"><span>文件不存在</span><strong>{summary.missing}</strong></div><div className="detail-field"><span>回收站</span><strong>{summary.trashed}</strong></div><div className="detail-field"><span>无权限/不可下载</span><strong>{summary.permissionDenied}</strong></div><div className="detail-field"><span>重复索引</span><strong>{summary.duplicates}</strong></div><div className="detail-field"><span>元数据不一致</span><strong>{summary.metadataMismatch}</strong></div><div className="detail-field"><span>目录范围异常</span><strong>{summary.outsideRoot}</strong></div><div className="detail-field"><span>目标冲突</span><strong>{summary.targetConflicts}</strong></div>
      </div> : null}
    </section>
    {result ? <section className="card panel"><div className="panel-header"><div><h2 className="panel-title">逐条状态</h2><p className="muted">不显示完整 Google 文件标识、私有路径、签名链接或附件正文。</p></div></div><div className="attachment-management-list">{result.items.map((item) => <div className="attachment-management-row" key={`${item.table}:${item.attachmentId}`}><div><strong>{item.fileName}</strong><span className="muted">{item.table} · {formatBytes(item.databaseSize)} · {statusLabel(item.sourceStatus)}</span></div><div className="attachment-management-row-stats"><span>目标：{item.targetBucket}</span><span>{item.migratable ? "可迁移" : "暂不可迁移"}</span></div>{item.reason ? <span className="muted">原因：{item.reason}</span> : null}</div>)}</div></section> : null}
    <section className="card panel"><h2 className="panel-title">执行状态</h2><p className="muted">扫描完成后，迁移仍需单独授权启用。当前不会下载文件、上传对象、更新索引或删除 Google Drive 文件。</p><button className="btn" type="button" disabled>开始迁移（功能未启用）</button></section>
  </AppLayout>;
}
