"use client";

import { AppLayout } from "@/components/app-layout";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { AttachmentSummary } from "@/lib/server/attachment-management";
import type { AttachmentCleanupCandidate, AttachmentCleanupReport, AttachmentInventoryItem } from "@/lib/server/attachment-cleanup";
import { openStoredFile, type StoredFile } from "@/lib/storage-files";
import { ArrowDownToLine, FileArchive } from "lucide-react";
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

function displayDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "日期未知";
}

function sortInventory(items: AttachmentInventoryItem[]) {
  return [...items].sort((left, right) => {
    const leftBusiness = left.businessDate || "";
    const rightBusiness = right.businessDate || "";
    const businessOrder = rightBusiness.localeCompare(leftBusiness);
    if (businessOrder) return businessOrder;
    return (right.uploadedAt || "").localeCompare(left.uploadedAt || "");
  });
}

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
  const [selectedTenantGroupIds, setSelectedTenantGroupIds] = useState<string[]>([]);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupMessage, setCleanupMessage] = useState("");
  const [cleanupReport, setCleanupReport] = useState<AttachmentCleanupReport | null>(null);
  const [singleAttachmentId, setSingleAttachmentId] = useState<string | null>(null);
  const [expandedTenantIds, setExpandedTenantIds] = useState<string[]>([]);

  const visibleItems = useMemo(() => inventoryFilter ? sortInventory(inventory.filter((item) => inventoryFilter === "all" || item.category === inventoryFilter)) : [], [inventory, inventoryFilter]);
  const selectedItems = useMemo(() => visibleItems.filter((item) => selectedAttachmentIds.includes(item.id)), [selectedAttachmentIds, visibleItems]);
  const selectedAttachmentItems = useMemo(() => inventory.filter((item) => selectedAttachmentIds.includes(item.id)), [inventory, selectedAttachmentIds]);
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every((item) => selectedAttachmentIds.includes(item.id));
  const movedOutTenantIds = useMemo(() => new Set(candidates.map((item) => item.tenantId)), [candidates]);
  const tenantGroups = useMemo(() => {
    if (inventoryFilter !== "tenant") return [];
    const groups = new Map<string, { id: string; tenantId: string | null; tenantName: string; propertyName: string; roomName: string; items: AttachmentInventoryItem[]; movedOut: boolean }>();
    for (const item of visibleItems) {
      const id = item.tenantId || `unassigned:${item.id}`;
      const existing = groups.get(id);
      if (existing) existing.items.push(item);
      else groups.set(id, { id, tenantId: item.tenantId, tenantName: item.tenantName || "未关联租客", propertyName: item.propertyName || "未关联房源", roomName: item.roomName || "", items: [item], movedOut: Boolean(item.tenantId && movedOutTenantIds.has(item.tenantId)) });
    }
    return Array.from(groups.values()).map((group) => ({ ...group, items: sortInventory(group.items) })).sort((left, right) => (left.roomName || "").localeCompare(right.roomName || "", "zh-CN", { numeric: true }) || left.tenantName.localeCompare(right.tenantName, "zh-CN"));
  }, [inventoryFilter, movedOutTenantIds, visibleItems]);
  const currentTenantGroups = useMemo(() => tenantGroups.filter((group) => !group.movedOut), [tenantGroups]);
  const movedOutTenantGroups = useMemo(() => tenantGroups.filter((group) => group.movedOut), [tenantGroups]);
  const movedOutGroupIds = useMemo(() => movedOutTenantGroups.flatMap((group) => group.tenantId ? [group.tenantId] : []), [movedOutTenantGroups]);
  const allMovedOutSelected = movedOutGroupIds.length > 0 && movedOutGroupIds.every((id) => selectedTenantGroupIds.includes(id));
  const selectedTenantGroups = useMemo(() => tenantGroups.filter((group) => group.tenantId && selectedTenantGroupIds.includes(group.tenantId)), [selectedTenantGroupIds, tenantGroups]);
  const selectedTenantAttachmentCount = selectedTenantGroups.reduce((total, group) => total + group.items.length, 0);
  const selectedTenantBytes = selectedTenantGroups.reduce((total, group) => total + group.items.reduce((sum, item) => sum + item.fileSize, 0), 0);

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
    try {
      const response = await fetch("/api/admin/attachments/cleanup-candidates", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "清理候选加载失败。");
      setCandidates((payload.candidates || []) as AttachmentCleanupCandidate[]);
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "清理候选加载失败。");
    }
  }

  async function loadInventoryData(force = false) {
    if (inventory.length && !force) return;
    setInventoryLoading(true);
    setCleanupMessage("");
    try {
      const response = await fetch("/api/admin/attachments/inventory", { headers: await authHeaders(), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "附件清单加载失败。");
      setInventory(sortInventory((payload.items || []) as AttachmentInventoryItem[]));
    } catch (caught) {
      setCleanupMessage(caught instanceof Error ? caught.message : "附件清单加载失败。");
    } finally {
      setInventoryLoading(false);
    }
  }

  async function loadInventory(nextFilter: InventoryFilter, force = false) {
    setInventoryFilter(nextFilter);
    setSelectedAttachmentIds([]);
    setSelectedTenantGroupIds([]);
    await loadInventoryData(force);
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
    setSingleAttachmentId(null);
    setSelectedTenantGroupIds([]);
    setSelectedAttachmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisible() {
    setSingleAttachmentId(null);
    setSelectedTenantGroupIds([]);
    setSelectedAttachmentIds((current) => allVisibleSelected ? current.filter((id) => !visibleItems.some((item) => item.id === id)) : Array.from(new Set([...current, ...visibleItems.map((item) => item.id)])));
  }

  function toggleTenantGroup(id: string) {
    setSingleAttachmentId(null);
    setSelectedAttachmentIds([]);
    setSelectedTenantGroupIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleMovedOutGroup() {
    setSingleAttachmentId(null);
    setSelectedAttachmentIds([]);
    setSelectedTenantGroupIds((current) => allMovedOutSelected
      ? current.filter((id) => !movedOutGroupIds.includes(id))
      : Array.from(new Set([...current, ...movedOutGroupIds])));
  }

  function toggleExpandedTenant(id: string) {
    setExpandedTenantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function ownershipLines(item: AttachmentInventoryItem) {
    const date = displayDate(item.businessDate || item.uploadedAt);
    const secondLine = [date, item.roomName, item.tenantName].filter(Boolean);
    if (item.category === "property" || (!item.roomName && !item.tenantName)) secondLine.push(item.categoryLabel);
    return { firstLine: item.propertyName || "未关联房源", secondLine: secondLine.join(" · ") };
  }

  function renderInventoryRow(item: AttachmentInventoryItem) {
    const lines = ownershipLines(item);
    return <div className="attachment-management-row attachment-inventory-row" key={item.id}>
      <input type="checkbox" aria-label={`选择附件 ${item.fileName}`} checked={selectedAttachmentIds.includes(item.id)} onChange={() => toggleAttachment(item.id)} />
      <div className="attachment-inventory-content">
        <strong className="attachment-inventory-owner" title={lines.firstLine}>{lines.firstLine}</strong>
        <span className="attachment-inventory-context" title={lines.secondLine}>{lines.secondLine}</span>
        <div className="attachment-inventory-file-row"><button className="attachment-inline-action" type="button" onClick={() => void viewAttachment(item)}>查看</button><span className="attachment-inventory-file" title={item.fileName}>{item.fileName} · {formatBytes(item.fileSize)}</span><button className="attachment-inline-action danger" type="button" onClick={() => { setSingleAttachmentId(item.id); setConfirmKind("single"); }}>删除</button></div>
      </div>
    </div>;
  }

  async function runCleanup() {
    if (cleaning || (!singleAttachmentId && !selectedAttachmentItems.length && !selectedTenantGroups.length)) return;
    setCleaning(true);
    setCleanupMessage("");
    setCleanupReport(null);
    try {
      const body = singleAttachmentId ? { attachmentIds: [singleAttachmentId], confirmation: true } : selectedAttachmentItems.length ? { attachmentIds: selectedAttachmentItems.map((item) => item.id), confirmation: true } : { tenantIds: selectedTenantGroups.map((group) => group.tenantId), confirmation: true };
      const response = await fetch("/api/admin/attachments/cleanup", { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "云端附件清理失败。");
      setCleanupReport(payload.report as AttachmentCleanupReport);
      setSelectedAttachmentIds([]);
      setSelectedTenantGroupIds([]);
      setSingleAttachmentId(null);
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
          {inventoryFilter === "tenant" ? <>
            <div className="attachment-tenant-groups">{currentTenantGroups.map((group) => <div className="attachment-tenant-group" key={group.id}><div className="attachment-group-header"><input type="checkbox" aria-label={`选择租客 ${group.tenantName}`} checked={Boolean(group.tenantId && selectedTenantGroupIds.includes(group.tenantId))} onChange={() => group.tenantId && toggleTenantGroup(group.tenantId)} /><button className="attachment-group-toggle" type="button" onClick={() => toggleExpandedTenant(group.id)} aria-expanded={expandedTenantIds.includes(group.id)}><span>{group.roomName || "未关联房间"} · {group.tenantName}</span><strong>{group.items.length} 个附件 · {expandedTenantIds.includes(group.id) ? "收起" : "展开"}</strong></button></div>{expandedTenantIds.includes(group.id) ? <div className="attachment-management-list">{group.items.map(renderInventoryRow)}</div> : null}</div>)}</div>
            {movedOutTenantGroups.length ? <div className="attachment-tenant-group attachment-tenant-group-retired"><div className="attachment-group-header"><input type="checkbox" aria-label="选择全部已退租租客" checked={allMovedOutSelected} onChange={toggleMovedOutGroup} /><button className="attachment-group-toggle" type="button" onClick={() => toggleExpandedTenant("__moved_out__")} aria-expanded={expandedTenantIds.includes("__moved_out__")}><span>已退租租客</span><strong>{movedOutTenantGroups.reduce((sum, group) => sum + group.items.length, 0)} 个附件 · {expandedTenantIds.includes("__moved_out__") ? "收起" : "展开"}</strong></button></div>{expandedTenantIds.includes("__moved_out__") ? <div className="attachment-tenant-groups">{movedOutTenantGroups.map((group) => <div className="attachment-tenant-group" key={group.id}><div className="attachment-group-header"><input type="checkbox" aria-label={`选择租客 ${group.tenantName}`} checked={Boolean(group.tenantId && selectedTenantGroupIds.includes(group.tenantId))} onChange={() => group.tenantId && toggleTenantGroup(group.tenantId)} /><button className="attachment-group-toggle" type="button" onClick={() => toggleExpandedTenant(group.id)} aria-expanded={expandedTenantIds.includes(group.id)}><span>{group.roomName || "未关联房间"} · {group.tenantName}</span><strong>{group.items.length} 个附件 · {expandedTenantIds.includes(group.id) ? "收起" : "展开"}</strong></button></div>{expandedTenantIds.includes(group.id) ? <div className="attachment-management-list">{group.items.map(renderInventoryRow)}</div> : null}</div>)}</div> : null}</div> : null}
          </> : <div className="attachment-management-list">{visibleItems.map(renderInventoryRow)}</div>}
          {selectedItems.length ? <div className="attachment-selection-bar">已选择 {selectedItems.length} 个附件 · {formatBytes(selectedItems.reduce((total, item) => total + item.fileSize, 0))}<button className="btn danger" type="button" onClick={() => setConfirmKind("attachments")}>删除所选云端附件</button></div> : null}
          {inventoryFilter === "tenant" && selectedTenantGroups.length ? <div className="attachment-selection-bar">已选择 {selectedTenantGroups.length} 位租客 · {selectedTenantAttachmentCount} 个附件 · {formatBytes(selectedTenantBytes)}<button className="btn danger" type="button" onClick={() => setConfirmKind("tenants")}>删除所选租客附件</button></div> : null}
        </> : null}
      </section> : null}

      {cleanupMessage ? <p className="error-text">{cleanupMessage}</p> : null}
      {cleanupReport ? <div className="attachment-management-row"><strong>清理完成</strong><span>计划删除：{cleanupReport.planned} 个 · 成功删除：{cleanupReport.deleted} 个 · 删除失败：{cleanupReport.failed} 个</span><span>释放空间：{formatBytes(cleanupReport.releasedBytes)} · 未释放：{formatBytes(cleanupReport.unreleasedBytes)}</span>{cleanupReport.skippedGoogleDrive ? <span className="muted">跳过外部云端附件 {cleanupReport.skippedGoogleDrive} 个，需要人工处理。</span> : null}{cleanupReport.errors.length ? <details><summary>查看失败原因（{cleanupReport.errors.length}）</summary><ul>{cleanupReport.errors.map((item) => <li key={`${item.attachmentId}-${item.fileName}`}>{item.fileName}：{item.reason}</li>)}</ul></details> : null}</div> : null}

      {confirmKind ? <div className="attachment-modal-backdrop"><section role="dialog" aria-modal="true" className="card panel attachment-cleanup-confirm"><p className="warning-text">{confirmKind === "single" ? <>确定永久删除这个附件吗？<br />删除后无法恢复。</> : confirmKind === "tenants" ? <>本操作只永久删除所选租客名下的附件，不删除租客、租约、收款、押金或其他业务记录。<br />附件删除后无法恢复。</> : <>即将永久删除 {selectedItems.length} 个附件，共 {formatBytes(selectedItems.reduce((total, item) => total + item.fileSize, 0))}。<br />请确认已经完成本地归档。</>}</p><div className="settings-actions"><button className="btn" type="button" onClick={() => { setConfirmKind(null); setSingleAttachmentId(null); }} disabled={cleaning}>取消</button><button className="btn danger" type="button" onClick={() => void runCleanup()} disabled={cleaning}>{cleaning ? "正在清理…" : "确认删除"}</button></div></section></div> : null}
    </> : null}
    <p className="muted attachment-management-reserved"><FileArchive size={16} />数据备份与附件归档彼此独立；本页面不提供附件重新导入。</p>
  </AppLayout>;
}
