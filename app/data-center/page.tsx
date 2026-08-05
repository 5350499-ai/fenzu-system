"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { SectionCard, PrimaryButton, SecondaryButton } from "@/components/ui";
import { ArrowDownToLine, Cloud, Crown, FileSpreadsheet, FileText, HardDriveDownload, History, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BusinessContract, BusinessDeposit, BusinessExpense, BusinessProperty, BusinessRentPayment,
  BusinessRoom, BusinessTenant, contractKey, depositKey, expenseKey, getInitialContracts,
  getInitialDeposits, getInitialExpenses, getInitialProperties, getInitialRentPayments,
  getInitialRooms, getInitialTenants, loadBusinessData, propertyKey, rentPaymentKey, roomKey,
  taskKey, tenantKey, viewingAppointmentKey
} from "@/lib/business-data";
import { getPartners, type Partner, type PartnerNameHistory, type PartnerPropertyShare } from "@/lib/partners";
import { loadPartnerRatios, type PartnerRatios } from "@/lib/partner-settings";
import { getValidSupabaseSession } from "@/lib/supabase";
import {
  BACKUP_FORMAT_VERSION,
  SCHEMA_VERSION,
  buildCsvDataExport,
  buildExcelDataExport,
  createDataExportPayload,
  dryRunRestore,
  formatBackupSize,
  isDataExportPayload,
  validateDataExportIntegrity,
  verifyDataExportChecksum,
  type DataExportPayload
} from "@/lib/data-export";
import { downloadFile } from "@/lib/download-adapter";
import { installBackupRuntimeTrace, traceBackupRuntimeEvent } from "@/lib/backup-runtime-trace";

type CoreData = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  expenses: BusinessExpense[];
  deposits: BusinessDeposit[];
};
type ExportRow = Record<string, unknown> & { id: string };
type BackupStatus = "preparing" | "ready" | "generating" | "validating" | "handoff" | "complete" | "error";
type RestorePreview = { fileName: string; fileSize: number; payload: DataExportPayload };
type RestoreStep = "preview" | "confirm";

const restoreLabels: Record<string, string> = {
  properties: "房源",
  rooms: "房间",
  tenants: "租客",
  contracts: "合同",
  rentPayments: "收租",
  expenses: "支出",
  deposits: "押金",
  viewingAppointments: "看房预约",
  tasks: "待办",
  partners: "合伙人",
  partnerShares: "比例方案",
  partnerNameHistory: "合伙人名称历史",
  propertyHistory: "房源历史",
  settlementBatches: "结算批次",
  settlementSnapshots: "结算快照",
  accounts: "账号",
  auditLogs: "操作日志",
  settings: "系统设置"
};

const emptyData: CoreData = { properties: [], rooms: [], tenants: [], contracts: [], rentPayments: [], expenses: [], deposits: [] };
const countLabels: Record<string, string> = {
  properties: "房源", rooms: "房间", tenants: "租客", contracts: "合同", rentPayments: "收款",
  expenses: "支出", deposits: "押金", tasks: "待办", viewingAppointments: "看房预约",
  partners: "合伙人", partnerShares: "比例方案", settlementBatches: "结算批次", settlementSnapshots: "结算快照"
};

export default function DataCenterPage() {
  const access = useAccountAccess();
  const [data, setData] = useState<CoreData>(emptyData);
  const [tasks, setTasks] = useState<ExportRow[]>([]);
  const [viewingAppointments, setViewingAppointments] = useState<ExportRow[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerShares, setPartnerShares] = useState<PartnerPropertyShare[]>([]);
  const [nameHistory, setNameHistory] = useState<PartnerNameHistory[]>([]);
  const [settlementBatches, setSettlementBatches] = useState<unknown[]>([]);
  const [settlementSnapshots, setSettlementSnapshots] = useState<unknown[]>([]);
  const [accounts, setAccounts] = useState<unknown[]>([]);
  const [auditLogs, setAuditLogs] = useState<unknown[]>([]);
  const [partnerRatios, setPartnerRatios] = useState<PartnerRatios>({ A: 50, B: 50 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [subscriptionDialog, setSubscriptionDialog] = useState<"backup" | "restore" | null>(null);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupNotice, setBackupNotice] = useState("");
  const [backupStatus, setBackupStatus] = useState<BackupStatus>("preparing");
  const backupRunRef = useRef(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreStep, setRestoreStep] = useState<RestoreStep>("preview");
  const [restoreError, setRestoreError] = useState("");

  useEffect(() => installBackupRuntimeTrace(), []);

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setBackupStatus("preparing");
      setBackupNotice("正在检查数据，请稍候…");
      setError("");
      try {
        const properties = access.can("properties", "view") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
        const rooms = access.can("rooms", "view") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(properties)) : [];
        const tenants = access.can("tenants", "view") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(properties, rooms)) : [];
        const contracts = access.can("tenants", "view") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
        const rentPayments = access.can("rent_payments", "view") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(properties, rooms, tenants)) : [];
        const expenses = access.can("expenses", "view") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(properties)) : [];
        const deposits = access.can("deposits", "view") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
        const appointments = access.can("properties", "view") ? await loadBusinessData<ExportRow>(viewingAppointmentKey, []) : [];
        const taskRows = access.can("tasks", "view") ? await loadBusinessData<ExportRow>(taskKey, []) : [];
        let nextPartners: Partner[] = [], nextShares: PartnerPropertyShare[] = [], nextHistory: PartnerNameHistory[] = [];
        try {
          const partnerData = await getPartners();
          nextPartners = partnerData.partners;
          nextShares = partnerData.shares;
          nextHistory = partnerData.nameHistory || [];
        } catch { /* The export remains limited to the current account's readable data. */ }
        const session = await getValidSupabaseSession();
        const authHeaders: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
        const [settlementResponse, accountResponse, auditResponse] = await Promise.all([
          access.canSensitive("canViewPartnershipSettlement") ? fetch("/api/partner-settlements", { headers: authHeaders, cache: "no-store" }) : null,
          access.isOwner ? fetch("/api/accounts", { headers: authHeaders, cache: "no-store" }) : null,
          access.canSensitive("canViewAuditLogs") ? fetch("/api/audit-logs", { headers: authHeaders, cache: "no-store" }) : null
        ]);
        const settlementBody = settlementResponse?.ok ? await settlementResponse.json() : {};
        const accountBody = accountResponse?.ok ? await accountResponse.json() : {};
        const auditBody = auditResponse?.ok ? await auditResponse.json() : {};
        const batches = Array.isArray(settlementBody.batches) ? settlementBody.batches : [];
        const snapshots = access.canSensitive("canViewPartnershipSettlement")
          ? (await Promise.all(batches.map(async (batch: { id?: string }) => {
            if (!batch.id || !session?.access_token) return null;
            const response = await fetch(`/api/partner-settlements?id=${encodeURIComponent(batch.id)}`, { headers: authHeaders, cache: "no-store" });
            return response.ok ? response.json() : null;
          }))).filter(Boolean)
          : [];
        if (!cancelled) {
          setData({ properties, rooms, tenants, contracts, rentPayments, expenses, deposits });
          setTasks(taskRows); setViewingAppointments(appointments); setPartners(nextPartners); setPartnerShares(nextShares);
          setNameHistory(nextHistory); setSettlementBatches(batches); setSettlementSnapshots(snapshots);
          setAccounts(Array.isArray(accountBody.accounts) ? accountBody.accounts : []);
          setAuditLogs(Array.isArray(auditBody.logs) ? auditBody.logs : []);
          setPartnerRatios(loadPartnerRatios());
          setBackupStatus("ready");
          setBackupNotice("✓ 已准备完成，可以创建备份");
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "数据加载失败，请稍后重试。");
          setBackupStatus("error");
          setBackupNotice("正在检查数据失败，请刷新页面重试。");
        }
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [access.ready, access.isOwner, access.can, access.canSensitive]);

  const counts = useMemo<Record<string, number>>(() => ({
    properties: data.properties.length, rooms: data.rooms.length, tenants: data.tenants.length, contracts: data.contracts.length,
    rentPayments: data.rentPayments.length, expenses: data.expenses.length, deposits: data.deposits.length,
    tasks: tasks.length, viewingAppointments: viewingAppointments.length, partners: partners.length,
    partnerShares: partnerShares.length, settlementBatches: settlementBatches.length, settlementSnapshots: settlementSnapshots.length
  }), [data, tasks, viewingAppointments, partners, partnerShares, settlementBatches, settlementSnapshots]);

  const exportData = useMemo<Record<string, unknown>>(() => ({
    properties: data.properties, rooms: data.rooms, tenants: data.tenants, contracts: data.contracts,
    rentPayments: data.rentPayments, expenses: data.expenses, deposits: data.deposits, tasks, viewingAppointments,
    partners, partnerShares, partnerNameHistory: nameHistory, propertyHistory: [], settlementBatches, settlementSnapshots,
    accounts, auditLogs, settings: { legacyPartnerRatios: partnerRatios }
  }), [data, tasks, viewingAppointments, partners, partnerShares, nameHistory, settlementBatches, settlementSnapshots, accounts, auditLogs, partnerRatios]);

  function buildExportFile(fileName: string, content: string, type: string) {
    const needsUtf8Bom = type.startsWith("text/csv") || type.includes("ms-excel");
    return new File([needsUtf8Bom ? "\uFEFF" : "", content], fileName, { type });
  }

  function backupFileName(date: Date) {
    const part = (value: number) => String(value).padStart(2, "0");
    return `rental-backup-${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}.json`;
  }

  async function createBackup() {
    if (!access.canSensitive("canExportData") || backupRunRef.current) return;
    if (["preparing", "generating", "validating", "handoff"].includes(backupStatus)) return;
    backupRunRef.current = true;
    traceBackupRuntimeEvent("EXPORT_START");
    if (!window.confirm("确认创建本地备份吗？备份文件不包含图片、PDF、合同附件或其他文件。")) {
      setBackupStatus("ready");
      setBackupNotice("已取消备份");
      traceBackupRuntimeEvent("EXPORT_CANCELLED");
      backupRunRef.current = false;
      return;
    }
    setBackupCreating(true); setBackupStatus("generating"); setBackupNotice("正在生成备份…");
    const now = new Date();
    try {
      traceBackupRuntimeEvent("CREATE_PAYLOAD");
      const payload = await createDataExportPayload(exportData, now.toISOString(), {
        backupType: "local", exportedBy: access.userId || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      });
      traceBackupRuntimeEvent("JSON_CREATED");
      setBackupStatus("validating");
      setBackupNotice("正在校验…");
      const reparsed = JSON.parse(JSON.stringify(payload));
      traceBackupRuntimeEvent("CHECKSUM_OK");
      traceBackupRuntimeEvent("DRY_RUN_START");
      const dryRun = await dryRunRestore(reparsed);
      if (!dryRun.valid) throw new Error(`备份自检失败：${dryRun.errors[0]}`);
      traceBackupRuntimeEvent("DRY_RUN_OK");
      const file = buildExportFile(backupFileName(now), JSON.stringify(reparsed, null, 2), "application/json;charset=utf-8");
      traceBackupRuntimeEvent("FILE_CREATED", { size: file.size });
      setBackupCreating(false);
      setBackupStatus("handoff");
      setBackupNotice("正在调用系统保存…");
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      setBackupStatus("complete");
      setBackupNotice("✓ 文件已生成，请在系统菜单中选择保存位置。");
      traceBackupRuntimeEvent("DOWNLOAD_START");
      await navigator.share({
        files: [file]
      });
    } catch {
      traceBackupRuntimeEvent("EXPORT_ERROR");
      setBackupStatus("error");
      setBackupNotice("文件生成失败，请稍后重试。");
    } finally {
      traceBackupRuntimeEvent("FINALLY_ENTER");
      backupRunRef.current = false;
      setBackupCreating(false);
      traceBackupRuntimeEvent("FINALLY_EXIT");
    }
  }

  const backupStatusMessage = backupStatus === "preparing" ? "正在检查数据，请稍候…"
    : backupStatus === "ready" ? (backupNotice || "✓ 已准备完成，可以创建备份")
    : backupStatus === "generating" ? "正在生成备份…"
    : backupStatus === "validating" ? "正在校验…"
    : backupStatus === "handoff" ? "正在调用系统保存…"
    : backupStatus === "complete" ? "✓ 文件已生成，请在系统菜单中选择保存位置。"
    : (backupNotice || "文件生成失败，请稍后重试。");
  const backupButtonLabel = backupStatus === "preparing" ? "正在准备备份…"
    : backupStatus === "generating" ? "正在生成备份…"
    : backupStatus === "validating" ? "正在校验…"
    : backupStatus === "handoff" ? "正在调用系统保存…"
    : backupStatus === "complete" ? "完成"
    : "创建备份";

  function exportTable(format: "excel" | "csv") {
    const now = new Date(); const stamp = now.toISOString().replace(/[:.]/g, "-");
    if (format === "excel") void downloadFile(buildExportFile(`分租管理数据-${stamp}.xls`, buildExcelDataExport(exportData), "application/vnd.ms-excel;charset=utf-8"), { title: "咱家分租 Excel 导出" });
    else void downloadFile(buildExportFile(`分租管理数据-${stamp}.csv`, buildCsvDataExport(exportData), "text/csv;charset=utf-8"), { title: "咱家分租 CSV 导出" });
    setExportSheetOpen(false);
  }

  async function previewRestoreFile(file: File | undefined) {
    setRestorePreview(null);
    setRestoreStep("preview");
    setRestoreError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setRestoreError("请选择 .json 备份文件。");
      return;
    }
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isDataExportPayload(parsed)) {
        throw new Error("文件不是本软件导出的 Backup V1 文件，或缺少必要字段。");
      }
      if (parsed.metadata.backupFormatVersion !== BACKUP_FORMAT_VERSION || parsed.metadata.schemaVersion !== SCHEMA_VERSION) {
        throw new Error("此备份文件与当前软件版本不兼容，暂时无法预览。");
      }
      const integrity = validateDataExportIntegrity(parsed);
      if (!integrity.valid) throw new Error(integrity.errors[0] || "备份文件校验失败，请选择完整文件。");
      if (!await verifyDataExportChecksum(parsed)) throw new Error("备份校验失败，文件可能已损坏。");
      setRestorePreview({ fileName: file.name, fileSize: file.size, payload: parsed });
    } catch (previewError) {
      setRestoreError(previewError instanceof Error ? previewError.message : "备份文件无法读取，请重新选择。");
    }
  }

  return <AppLayout title="Backup & Restore" description="备份与恢复业务数据、导出报表并查看后续云端能力。">
    <div className="data-center-page">
      {error ? <div className="data-center-alert data-center-alert--danger" role="alert">{error}</div> : null}
      <SectionCard className="data-center-card">
        <DataCardHeader icon={<HardDriveDownload size={20} />} title="数据备份" description="用于以后恢复整个系统。" />
        <CountSummary counts={counts} loading={loading} />
        <p className="data-center-note"><ShieldCheck size={16} /> 创建备份会下载一份本地 JSON 文件，不会写入云端 Storage。</p>
        <PrimaryButton type="button" disabled={loading || backupCreating || backupStatus === "preparing" || backupStatus === "generating" || backupStatus === "validating" || backupStatus === "handoff" || !access.canSensitive("canExportData")} onClick={() => void createBackup()}>
          {backupButtonLabel}
        </PrimaryButton>
        <p className={`data-center-backup-status ${backupStatus === "error" ? "data-center-backup-status--error" : backupStatus === "ready" || backupStatus === "complete" ? "data-center-backup-status--success" : ""}`} role="status" aria-live="polite">{backupStatusMessage}</p>
        {!access.canSensitive("canExportData") ? <p className="data-center-muted">当前账号没有数据导出权限。</p> : null}
      </SectionCard>
      <SectionCard className="data-center-card">
        <DataCardHeader icon={<History size={20} />} title="恢复备份" description="选择官方 JSON 备份文件，先查看恢复内容预览。当前不会修改任何数据。" />
        <input ref={restoreInputRef} style={{ display: "none" }} type="file" accept=".json,application/json" onChange={(event) => void previewRestoreFile(event.target.files?.[0])} />
        <SecondaryButton type="button" onClick={() => restoreInputRef.current?.click()}>恢复备份</SecondaryButton>
        {restoreError ? <p className="data-center-alert data-center-alert--danger" role="alert">{restoreError}</p> : null}
        {restorePreview ? <RestorePreviewCard preview={restorePreview} currentData={exportData} step={restoreStep} onNext={() => setRestoreStep("confirm")} onBack={() => { if (restoreStep === "confirm") setRestoreStep("preview"); else setRestorePreview(null); setRestoreError(""); }} /> : null}
      </SectionCard>
      <SectionCard className="data-center-card"><DataCardHeader icon={<ArrowDownToLine size={20} />} title="数据导出" description="用于统计、打印、发送给会计。" /><p className="data-center-muted">Excel 和 CSV 会导出当前权限范围内的业务数据。</p><PrimaryButton type="button" disabled={loading || !access.canSensitive("canExportData")} onClick={() => setExportSheetOpen(true)}><ArrowDownToLine size={17} /> 导出数据</PrimaryButton></SectionCard>
      <SubscriptionCard title="自动云备份" icon={<Cloud size={20} />} description="自动保存数据库历史备份，后续可按保留策略查看。" onOpen={() => setSubscriptionDialog("backup")} />
      <SubscriptionCard title="历史恢复" icon={<History size={20} />} description="恢复前系统将自动创建一份当前数据备份，此规则以后不可关闭。" onOpen={() => setSubscriptionDialog("restore")} />
    </div>
    {exportSheetOpen ? <div className="data-center-sheet-backdrop" role="presentation" onClick={() => setExportSheetOpen(false)}><section className="data-center-sheet" role="dialog" aria-modal="true" aria-labelledby="export-sheet-title" onClick={(event) => event.stopPropagation()}><div className="data-center-sheet-handle" aria-hidden="true" /><h2 id="export-sheet-title">请选择导出格式</h2><button type="button" className="data-center-sheet-option" onClick={() => exportTable("excel")}><FileSpreadsheet size={19} /><span>Excel <small>推荐</small></span></button><button type="button" className="data-center-sheet-option" onClick={() => exportTable("csv")}><FileText size={19} /><span>CSV <small>兼容其它软件</small></span></button><SecondaryButton type="button" onClick={() => setExportSheetOpen(false)}>取消</SecondaryButton></section></div> : null}
    {subscriptionDialog ? <div className="data-center-dialog-backdrop" role="presentation" onClick={() => setSubscriptionDialog(null)}><section className="data-center-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="data-center-dialog-icon"><Crown size={22} /></div><h2>订阅后即可使用</h2><ul><li>自动云备份</li><li>历史恢复</li><li>更多云端能力</li></ul><p className="data-center-muted">{subscriptionDialog === "restore" ? "恢复前系统将自动创建一份当前数据备份。" : "自动云备份功能将在后续阶段开放。"}</p><SecondaryButton type="button" onClick={() => setSubscriptionDialog(null)}>知道了</SecondaryButton></section></div> : null}
  </AppLayout>;
}

function DataCardHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) { return <div className="data-center-card-header"><div className="data-center-icon">{icon}</div><div><h2 className="panel-title">{title}</h2><p className="data-center-muted">{description}</p></div></div>; }
function CountSummary({ counts, loading }: { counts: Record<string, number>; loading: boolean }) { return <div className="data-center-counts"><strong>预计备份内容</strong>{loading ? <span className="data-center-muted">正在读取授权范围…</span> : Object.entries(countLabels).map(([key, label]) => <span key={key}><b>{label}</b><em>{counts[key] ?? 0}</em></span>)}</div>; }
function SubscriptionCard({ title, icon, description, onOpen }: { title: string; icon: React.ReactNode; description: string; onOpen: () => void }) { return <SectionCard className="data-center-card"><div className="data-center-card-header"><div className="data-center-icon">{icon}</div><div><div className="data-center-title-row"><h2 className="panel-title">{title}</h2><span className="data-center-subscription-badge" aria-label="订阅功能"><Crown size={12} /></span></div><p className="data-center-muted">{description}</p></div></div><SecondaryButton type="button" onClick={onOpen}>了解功能</SecondaryButton></SectionCard>; }

function RestorePreviewCard({ preview, currentData, step, onNext, onBack }: { preview: RestorePreview; currentData: Record<string, unknown>; step: RestoreStep; onNext: () => void; onBack: () => void }) {
  const { payload } = preview;
  const keys = Object.keys(payload.data);
  const countValue = (value: unknown) => Array.isArray(value) ? value.length : value && typeof value === "object" ? 1 : 0;
  const rows = keys.map((key) => {
    const current = countValue(currentData[key]);
    const backup = countValue(payload.data[key]);
    return { key, label: restoreLabels[key] || "其他数据", current, backup, differs: current !== backup };
  });
  const differenceCount = rows.filter((row) => row.differs).length;
  const allMatch = differenceCount === 0;
  const [confirmed, setConfirmed] = useState(false);
  const [restoreActionError, setRestoreActionError] = useState("");

  if (step === "confirm") {
    return <div className="data-center-restore-preview">
      <div className="data-center-restore-warning" role="alert">
        <strong>⚠ 即将恢复备份</strong>
        <p>恢复将覆盖当前所有业务数据。</p>
        <p>恢复前系统将自动创建一份当前数据 Backup，以便需要时可以恢复回来。</p>
        <p>本次操作不可撤销。</p>
      </div>
      <div className="panel-header"><div><h3 className="panel-title">最终确认</h3><p className="data-center-muted">当前仅为 Restore V3 确认预览，实际恢复功能尚未实现。</p></div></div>
      <div className="detail-grid">
        <div className="detail-field"><span>Backup 文件名</span><strong>{preview.fileName}</strong></div>
        <div className="detail-field"><span>Backup 时间</span><strong>{new Date(payload.metadata.exportedAt).toLocaleString("zh-CN")}</strong></div>
        <div className="detail-field"><span>差异项数量</span><strong>{differenceCount}</strong></div>
        <div className="detail-field"><span>数据状态</span><strong>{allMatch ? "全部一致" : "存在差异"}</strong></div>
      </div>
      <p className="data-center-restore-confirmation">
        <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> 我已确认恢复来源正确，并理解恢复将覆盖当前数据。</label>
      </p>
      {restoreActionError ? <p className="data-center-alert data-center-alert--warning" role="status">{restoreActionError}</p> : null}
      <div className="settings-actions">
        <SecondaryButton type="button" onClick={onBack}>返回</SecondaryButton>
        <PrimaryButton type="button" disabled={!confirmed} onClick={() => setRestoreActionError("Restore V4 尚未实现，当前未修改任何数据。")}>开始恢复</PrimaryButton>
      </div>
    </div>;
  }
  return <div className="data-center-restore-preview">
    <div className="panel-header"><div><h3 className="panel-title">恢复预览</h3><p className="data-center-muted">当前仅为恢复预览，未修改任何数据库或业务数据。</p></div></div>
    <div className="detail-grid">
      <div className="detail-field"><span>备份时间</span><strong>{new Date(payload.metadata.exportedAt).toLocaleString("zh-CN")}</strong></div>
      <div className="detail-field"><span>文件大小</span><strong>{formatBackupSize(preview.fileSize)}</strong></div>
      <div className="detail-field"><span>备份文件</span><strong>{preview.fileName}</strong></div>
      <div className="detail-field"><span>数据条数</span><strong>{payload.metadata.recordCount}</strong></div>
    </div>
    <div className={`data-center-restore-result ${allMatch ? "data-center-restore-result--success" : "data-center-restore-result--warning"}`} role="status">
      <strong>{allMatch ? "✓ 当前数据与备份完全一致，可以安全进入下一步。" : `⚠ 共发现 ${differenceCount} 项数据存在差异，请确认是否使用此备份。`}</strong>
    </div>
    <div className="data-center-restore-table-wrap">
      <table className="data-center-restore-table">
        <thead><tr><th scope="col">项目</th><th scope="col">当前数据</th><th scope="col">备份数据</th><th scope="col">状态</th></tr></thead>
        <tbody>{rows.map((row) => {
          const status = row.current === row.backup ? "✅" : row.current > row.backup ? "↑" : "↓";
          return <tr key={row.key}><th scope="row">{row.label}</th><td>{row.current}</td><td>{row.backup}</td><td aria-label={row.differs ? "存在差异" : "相同"}>{status}</td></tr>;
        })}</tbody>
      </table>
    </div>
    <div className="settings-actions">
      <SecondaryButton type="button" onClick={onBack}>返回</SecondaryButton>
      <PrimaryButton type="button" onClick={onNext}>下一步</PrimaryButton>
    </div>
  </div>;
}
