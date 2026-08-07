"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentSummary } from "@/lib/server/attachment-management";
import type { AttachmentCleanupCandidate, AttachmentCleanupReport, AttachmentInventoryItem } from "@/lib/server/attachment-cleanup";
import { openStoredFile, type StoredFile } from "@/lib/storage-files";
import { ArrowDownToLine, FileArchive, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function formatBytes(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`;
}

function StatButton({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  return <button type="button" className={`attachment-stat-button${active ? " active" : ""}`} onClick={onClick}><span>{label}</span><strong>{value}</strong></button>;
}

type LoadState = "loading" | "ready" | "error";
type InventoryFilter = "all" | "property" | "tenant" | "income" | "expense";
type ConfirmKind = "single" | "attachments" | "tenants" | null;

export default function AttachmentArchivePage() {
  const [summary, setSummary] = useState<AttachmentSummary | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [exportMessage, setExportMessage] = useState("");
  const [inventory, setInventory] = useState<AttachmentInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryFilter, setInventoryFilter] = useState<InventoryFilter | null>(null);
  const [selectedAttachmentIds, setSelectedAttachmentIds] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<AttachmentCleanupCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [selectedTenantIds, setSelectedTenantIds] = useState<string[]>([]);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [cleanupReport, setCleanupReport] = useState<AttachmentCleanupReport | null>(null);

  const visibleItems = useMemo(() => inventoryFilter ? inventory.filter((item) => inventoryFilter === "all" || item.category === inventoryFilter) : [], [inventory, inventoryFilter]);
  const selectedItems = useMemo(() => visibleItems.filter((item) => selectedAttachmentIds.includes(item.id)), [selectedAttachmentIds, visibleItems]);
  const selectedTenants = useMemo(() => candidates.filter((item) => selectedTenantIds.includes(item.tenantId)), [candidates, selectedTenantIds]);
  const selectedTenantAttachmentCount = selectedTenants.reduce((total, item) => total + item.attachmentCount, 0);
  const selectedTenantBytes = selectedTenants.reduce((total, item) => total + item.bytes, 0);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedAttachmentIds.includes(item.id));

  function storedFile(item: AttachmentInventoryItem): StoredFile {
    return { id: item.id, ownerId: "", tenantId: item.tenantId, storageBucket: item.storageBucket, storagePath: item.storagePath, fileUrl: null, fileName: item.fileName, fileType: item.fileType, fileSize: item.fileSize, uploadedAt: item.uploadedAt || "", storageProvider: item.provider === "google_drive" ? "google_drive" : "supabase", providerFileId: item.providerFileId };
  }

  async function viewAttachment(item: AttachmentInventoryItem) {
    setCleanupMessage("");
    try {
      await openStoredFile(storedFile(item));
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? `无法查看附件：${caught.message}` : "无法查看附件，请稍后重试。");
    }
  }

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
    setCandidateLoading(true);
    try {
      const response = await fetch("/api/admin/attachments/cleanup-candidates", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "清理候选加载失败。");
      setCandidates((payload.candidates || []) as AttachmentCleanupCandidate[]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "清理候选加载失败。");
    } finally {
      setCandidateLoading(false);
    }
  }

  async function loadInventory(nextFilter: InventoryFilter, force = false) {
    setInventoryFilter(nextFilter);
    setSelectedAttachmentIds([]);
    if (inventory.length && !force) return;
    setInventoryLoading(true);
    setCleanupMessage("");
    try {
      const response = await fetch("/api/admin/attachments/inventory", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件清单加载失败。");
      setInventory((payload.items || []) as AttachmentInventoryItem[]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "附件清单加载失败。");
    } finally {
      setInventoryLoading(false);
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

  function toggleAttachment(id: string) {
    setSelectedTenantIds([]);
    setSelectedAttachmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    setSelectedAttachmentIds((current) => allVisibleSelected ? current.filter((id) => !visibleItems.some((item) => item.id === id)) : Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])));
  }

  function toggleTenant(id: string) {
    setSelectedAttachmentIds([]);
    setSelectedTenantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function runCleanup() {
    if (cleaning || (!selectedItems.length && !selectedTenants.length)) return;
    setCleaning(true);
    setCleanupMessage("");
    setCleanupReport(null);
    try {
      const body = selectedItems.length ? { attachmentIds: selectedItems.map((item) => item.id), confirmation: true } : { tenantIds: selectedTenants.map((item) => item.tenantId), confirmation: true };
      const response = await fetch("/api/admin/attachments/cleanup", { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "云端附件清理失败。");
      setCleanupReport(payload.report as AttachmentCleanupReport);
      setSelectedAttachmentIds([]);
      setSelectedTenantIds([]);
      setConfirmKind(null);
      await Promise.all([loadSummary(), loadCandidates(), inventory.length ? loadInventory(inventoryFilter || "all", true) : Promise.resolve()]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "云端附件清理失败。");
    } finally {
      setCleaning(false);
    }
  }

  useEffect(() => { void loadSummary(); void loadCandidates(); }, []);

  return <AppLayout title="附件归档与清理" description="导出并保存历史附件，归档后可清理云端文件以释放空间。">
    {state === "loading" ? <section className="card panel"><p>正在加载附件统计…</p></section> : null}
    {state === "error" ? <section className="card panel"><p className="error-text">{error}</p><button className="btn" type="button" onClick={() => void loadSummary()}>重试</button></section> : null}
    {summary ? <>
      <section className="card panel">
        <div className="panel-header"><div><h2 className="panel-title">附件归档</h2><p className="muted">建议先将历史附件导出并保存到本地，再按需清理云端文件。</p></div><FileArchive size={22} /></div>
        <div className="attachment-stat-grid">
          <StatButton label="全部附件" value={`${summary.supabase.totalCount} 个 · ${formatBytes(summary.supabase.totalBytes)}`} active={inventoryFilter === "all"} onClick={() => void loadInventory("all")} />
          <StatButton label="房源附件" value={`${summary.supabase.byTable.property_files.count} 个 · ${formatBytes(summary.supabase.byTable.property_files.bytes)}`} active={inventoryFilter === "property"} onClick={() => void loadInventory("property")} />
          <StatButton label="租客附件" value={`${summary.supabase.byTable.contract_files.count} 个 · ${formatBytes(summary.supabase.byTable.contract_files.bytes)}`} active={inventoryFilter === "tenant"} onClick={() => void loadInventory("tenant")} />
          <StatButton label="收入附件" value={`${summary.supabase.byTable.rent_payment_files.count} 个 · ${formatBytes(summary.supabase.byTable.rent_payment_files.bytes)}`} active={inventoryFilter === "income"} onClick={() => void loadInventory("income")} />
          <StatButton label="支出附件" value={`${summary.supabase.byTable.expense_files.count} 个 · ${formatBytes(summary.supabase.byTable.expense_files.bytes)}`} active={inventoryFilter === "expense"} onClick={() => void loadInventory("expense")} />
        </div>
        <button className="btn primary" type="button" disabled={exportState === "exporting"} onClick={() => void exportAttachments()}><ArrowDownToLine size={17} /> {exportState === "exporting" ? "正在生成附件归档…" : "导出附件归档"}</button>
        {exportMessage ? <p className={exportState === "error" ? "error-text" : "success-text"}>{exportMessage}</p> : null}
      </section>

      {inventoryFilter !== null ? <section className="card panel">
        <div className="panel-header"><div><h2 className="panel-title">附件清单</h2><p className="muted">当前筛选内可单个或批量选择；不会自动选择其它类型附件。</p></div></div>
        {inventoryLoading ? <p className="muted">正在加载附件清单…</p> : null}
        {!inventoryLoading && !visibleItems.length ? <p className="muted">当前没有附件。</p> : null}
        {visibleItems.length ? <>
          <label className="attachment-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /> 全选当前筛选结果</label>
          <div className="attachment-management-list">{visibleItems.map((item) => {
            const ownership = [item.propertyName, item.roomName, item.tenantName].filter(Boolean);
            if (item.category === "property") ownership.push(item.categoryLabel);
            if (item.category === "income" || item.category === "expense") ownership.push(item.categoryLabel);
            const date = item.businessDate || item.uploadedAt || "日期未知";
            return <div className="attachment-management-row attachment-inventory-row" key={item.id}>
              <input type="checkbox" aria-label={`选择附件 ${item.fileName}`} checked={selectedAttachmentIds.includes(item.id)} onChange={() => toggleAttachment(item.id)} />
              <div className="attachment-inventory-content">
                <strong className="attachment-inventory-owner" title={ownership.join(" · ") || "未关联业务记录"}>{ownership.join(" · ") || "未关联业务记录"}</strong>
                <div className="attachment-inventory-meta"><span>{date} · <span title={item.fileName}>{item.fileName}</span></span><span className="attachment-inventory-actions"><button className="attachment-inline-action" type="button" onClick={() => void viewAttachment(item)}>查看</button><button className="attachment-inline-action danger" type="button" onClick={() => { setSelectedAttachmentIds([item.id]); setSelectedTenantIds([]); setConfirmKind("single"); }}>删除</button></span></div>
                <span className="sr-only">{item.fileType} · {formatBytes(item.fileSize)}</span>
              </div>
            </div>;
          })}</div>
          {selectedItems.length ? <div className="attachment-selection-bar">已选择 {selectedItems.length} 个附件 · {formatBytes(selectedItems.reduce((total, item) => total + item.fileSize, 0))}<button className="btn danger" type="button" onClick={() => setConfirmKind("attachments")}>删除所选云端附件</button></div> : null}
        </> : null}
      </section> : null}

      <section className="card panel">
        <div className="panel-header"><div><h2 className="panel-title">已退租租客清理</h2><p className="muted">只显示已退租且仍有云端附件的租客。建议确认附件已保存到本地后再删除。</p></div><Trash2 size={22} /></div>
        {candidateLoading ? <p className="muted">正在检查清理候选…</p> : null}
        {!candidateLoading && !candidates.length ? <p className="muted">暂无可清理的已退租租客附件。</p> : null}
        {candidates.length ? <div className="attachment-management-list">{candidates.map((item) => <label className="attachment-management-row attachment-tenant-row" key={item.tenantId}><input type="checkbox" checked={selectedTenantIds.includes(item.tenantId)} onChange={() => toggleTenant(item.tenantId)} /><div><strong>{item.tenantName}</strong><span className="muted">{item.propertyName} · {item.roomName}{item.actualMoveOutDate ? ` · 退租 ${item.actualMoveOutDate}` : ""}</span><span>{item.attachmentCount} 个附件 · {formatBytes(item.bytes)}{item.googleDriveCount ? ` · ${item.googleDriveCount} 个外部云端附件需人工处理` : ""}</span></div></label>)}</div> : null}
        {selectedTenants.length ? <div className="attachment-selection-bar">已选择 {selectedTenants.length} 人 · {selectedTenantAttachmentCount} 个附件 · {formatBytes(selectedTenantBytes)}<button className="btn danger" type="button" onClick={() => setConfirmKind("tenants")}>删除所选租客云端附件</button></div> : null}
        {cleanupMessage ? <p className="error-text">{cleanupMessage}</p> : null}
        {cleanupReport ? <div className="attachment-management-row"><strong>清理完成</strong><span>计划删除：{cleanupReport.planned} 个 · 成功删除：{cleanupReport.deleted} 个 · 删除失败：{cleanupReport.failed} 个</span><span>释放空间：{formatBytes(cleanupReport.releasedBytes)} · 未释放：{formatBytes(cleanupReport.unreleasedBytes)}</span>{cleanupReport.skippedGoogleDrive ? <span className="muted">跳过外部云端附件 {cleanupReport.skippedGoogleDrive} 个，需要人工处理。</span> : null}{cleanupReport.errors.length ? <details><summary>查看失败原因（{cleanupReport.errors.length}）</summary><ul>{cleanupReport.errors.map((item) => <li key={`${item.attachmentId}-${item.fileName}`}>{item.fileName}：{item.reason}</li>)}</ul></details> : null}</div> : null}
      </section>

      {confirmKind ? <section className="card panel attachment-cleanup-confirm"><p className="warning-text">{confirmKind === "single" ? "确定永久删除这个附件吗？" : `即将删除 ${confirmKind === "attachments" ? selectedItems.length : selectedTenantAttachmentCount} 个云端附件，共 ${formatBytes(confirmKind === "attachments" ? selectedItems.reduce((total, item) => total + item.fileSize, 0) : selectedTenantBytes)}。`}<br />删除后软件中将无法再查看，请确认已经完成本地归档。</p><div className="settings-actions"><button className="btn" type="button" onClick={() => setConfirmKind(null)} disabled={cleaning}>取消</button><button className="btn danger" type="button" onClick={() => void runCleanup()} disabled={cleaning}>{cleaning ? "正在清理…" : "确认删除"}</button></div></section> : null}
    </> : null}
    <p className="muted attachment-management-reserved"><FileArchive size={16} />数据备份与附件归档彼此独立；本页面不提供附件重新导入。</p>
  </AppLayout>;
}
