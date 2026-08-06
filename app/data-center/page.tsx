"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { SectionCard, PrimaryButton, SecondaryButton, DangerButton } from "@/components/ui";
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
  dryRunRestore,
  formatBackupSize,
  isDataExportPayload,
  validateDataExportIntegrity,
  verifyDataExportChecksum,
  type DataExportPayload
} from "@/lib/data-export";
import { downloadFile } from "@/lib/download-adapter";
import { saveFileWithSystemFallback, UserCancelledFileHandoffError } from "@/lib/file-handoff";
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
type RestorePreview = { fileName: string; fileSize: number; payload: DataExportPayload; currentData: Record<string, unknown> };
type RestoreStep = "preview" | "confirm";
type BeforeRestorePackage = { fileName: string; storagePath: string; payload: DataExportPayload };
type BeforeRestoreDiagnostic = { error?: string; code?: string; sqlState?: string | null; message?: string; details?: string | null; hint?: string | null; stack?: string | null; stage?: string; schema?: string | null; table?: string | null; constraint?: string | null; recordId?: string | null; recordCount?: number | null; bucket?: string | null; objectPath?: string | null; mimeType?: string | null; workspaceId?: string | null; ownerId?: string | null; storageResponse?: unknown; supabaseResponse?: unknown; rawRpcError?: unknown; rawDryRun?: unknown };

class BeforeRestoreClientError extends Error {
  diagnostic: BeforeRestoreDiagnostic;
  constructor(diagnostic: BeforeRestoreDiagnostic) {
    super(diagnostic.message || diagnostic.error || "BeforeRestore 生成失败");
    this.name = "BeforeRestoreClientError";
    this.diagnostic = diagnostic;
  }
}

function beforeRestoreStageLabel(stage?: string) {
  return ({ database_read: "数据库读取", json_generation: "JSON 生成", json_serialization: "JSON 序列化", storage_upload: "Storage 上传", response: "服务端返回", file_generation: "生成分享文件", navigator_share: "navigator.share 分享", file_system_access: "文件选择器保存", browser_download: "浏览器下载" } as Record<string, string>)[stage || ""] || stage || "未知步骤";
}

function beforeRestoreErrorText(diagnostic: BeforeRestoreDiagnostic) {
  const lines = [`❌ ${beforeRestoreStageLabel(diagnostic.stage)}失败`, diagnostic.message || diagnostic.error || "BeforeRestore 生成失败"];
  if (diagnostic.code) lines.push(`错误代码：${diagnostic.code}`);
  if (diagnostic.sqlState) lines.push(`SQLSTATE：${diagnostic.sqlState}`);
  if (diagnostic.details) lines.push(`详情：${diagnostic.details}`);
  if (diagnostic.hint) lines.push(`建议：${diagnostic.hint}`);
  if (diagnostic.schema || diagnostic.table) lines.push(`对象：${diagnostic.schema || "public"}.${diagnostic.table || "未知表"}`);
  if (diagnostic.recordCount !== undefined && diagnostic.recordCount !== null) lines.push(`已读取记录数：${diagnostic.recordCount}`);
  if (diagnostic.bucket) lines.push(`bucket：${diagnostic.bucket}`);
  if (diagnostic.objectPath) lines.push(`object path：${diagnostic.objectPath}`);
  if (diagnostic.workspaceId) lines.push(`workspace：${diagnostic.workspaceId}`);
  return lines.join("\n");
}

function restoreDryRunErrorText(result: Record<string, unknown>) {
  return ["❌ Restore Dry Run 失败", JSON.stringify(result, null, 2)].join("\n");
}

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
  const [loading, setLoading] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState("");
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [subscriptionDialog, setSubscriptionDialog] = useState<"backup" | "restore" | null>(null);
  const [backupCreating, setBackupCreating] = useState(false);
  const [backupRetryFile, setBackupRetryFile] = useState<File | null>(null);
  const [backupNotice, setBackupNotice] = useState("点击创建备份后开始读取数据");
  const [backupStatus, setBackupStatus] = useState<BackupStatus>("ready");
  const backupRunRef = useRef(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreStep, setRestoreStep] = useState<RestoreStep>("preview");
  const [restoreError, setRestoreError] = useState("");
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [beforeRestorePackage, setBeforeRestorePackage] = useState<BeforeRestorePackage | null>(null);
  const [beforeRestoreConfirmed, setBeforeRestoreConfirmed] = useState(false);
  const [beforeRestoreStatus, setBeforeRestoreStatus] = useState<"idle" | "preparing" | "saving" | "ready" | "error">("idle");
  const [beforeRestoreError, setBeforeRestoreError] = useState("");

  useEffect(() => installBackupRuntimeTrace(), []);

  async function loadExportData(updatePageState = true) {
    if (updatePageState) {
      setLoading(true);
      setError("");
    }
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
      const nextAccounts = Array.isArray(accountBody.accounts) ? accountBody.accounts : [];
      const nextAuditLogs = Array.isArray(auditBody.logs) ? auditBody.logs : [];
      const nextPartnerRatios = loadPartnerRatios();
      const nextData = { properties, rooms, tenants, contracts, rentPayments, expenses, deposits };
      const nextExportData: Record<string, unknown> = {
        ...nextData, tasks: taskRows, viewingAppointments: appointments, partners: nextPartners, partnerShares: nextShares,
        partnerNameHistory: nextHistory, propertyHistory: [], settlementBatches: batches, settlementSnapshots: snapshots,
        accounts: nextAccounts, auditLogs: nextAuditLogs, settings: { legacyPartnerRatios: nextPartnerRatios }
      };
      if (updatePageState) {
        setData(nextData); setTasks(taskRows); setViewingAppointments(appointments); setPartners(nextPartners); setPartnerShares(nextShares);
        setNameHistory(nextHistory); setSettlementBatches(batches); setSettlementSnapshots(snapshots); setAccounts(nextAccounts); setAuditLogs(nextAuditLogs);
        setPartnerRatios(nextPartnerRatios);
        setDataLoaded(true);
      }
      return nextExportData;
    } finally {
      if (updatePageState) setLoading(false);
    }
  }

  const counts = useMemo<Record<string, number>>(() => ({
    properties: data.properties.length, rooms: data.rooms.length, tenants: data.tenants.length, contracts: data.contracts.length,
    rentPayments: data.rentPayments.length, expenses: data.expenses.length, deposits: data.deposits.length,
    tasks: tasks.length, viewingAppointments: viewingAppointments.length, partners: partners.length,
    partnerShares: partnerShares.length, settlementBatches: settlementBatches.length, settlementSnapshots: settlementSnapshots.length
  }), [data, tasks, viewingAppointments, partners, partnerShares, settlementBatches, settlementSnapshots]);

  function buildExportFile(fileName: string, content: string, type: string) {
    const needsUtf8Bom = type.startsWith("text/csv") || type.includes("ms-excel");
    return new File([needsUtf8Bom ? "\uFEFF" : "", content], fileName, { type });
  }

  function backupFileName(date: Date) {
    const part = (value: number) => String(value).padStart(2, "0");
    return `rental-backup-${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}-${part(date.getHours())}${part(date.getMinutes())}.json`;
  }

  async function createBackup() {
    if (!access.ready || !access.canSensitive("canExportData") || backupRunRef.current) return;
    if (["preparing", "generating", "validating", "handoff"].includes(backupStatus)) return;
    backupRunRef.current = true;
    traceBackupRuntimeEvent("EXPORT_START");
    setBackupCreating(true); setBackupStatus("preparing"); setBackupNotice("正在读取数据，请稍候…");
    setBackupRetryFile(null);
    const now = new Date();
    try {
      setBackupStatus("generating"); setBackupNotice("正在生成备份…");
      traceBackupRuntimeEvent("CREATE_PAYLOAD");
      const session = await getValidSupabaseSession();
      if (!session?.access_token) throw new Error("登录已失效，请重新登录后再创建备份。");
      const response = await fetch("/api/data-backup", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store"
      });
      const result = await response.json().catch(() => null) as { payload?: DataExportPayload; error?: string } | null;
      if (!response.ok || !result?.payload) throw new Error(result?.error || "备份生成失败，请稍后重试。");
      const payload = result.payload;
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
      try {
        await saveFileWithSystemFallback(file);
        setBackupRetryFile(file);
        setBackupStatus("complete");
        setBackupNotice(`备份已创建：${file.name}`);
      } catch (error) {
        setBackupRetryFile(file);
        if (error instanceof UserCancelledFileHandoffError) {
          setBackupStatus("complete");
          setBackupNotice("用户取消保存，备份文件已生成，可重新创建。");
        } else {
          setBackupStatus("error");
          setBackupNotice(error instanceof Error ? `备份失败：${error.message}` : "备份失败，请稍后重试。");
        }
      }
    } catch (error) {
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

  async function downloadCompletedBackup() {
    if (!backupRetryFile || backupCreating) return;
    const file = backupRetryFile;
    setBackupCreating(true);
    setBackupStatus("handoff");
    setBackupNotice("正在调用系统保存…");
    try {
      await saveFileWithSystemFallback(file);
      setBackupStatus("ready");
      setBackupNotice("下载已结束，可再次创建备份。");
    } catch {
      setBackupStatus("error");
      setBackupNotice("下载未完成，请重新创建备份。");
    } finally {
      setBackupRetryFile(null);
      setBackupCreating(false);
    }
  }

  const backupStatusMessage = backupStatus === "preparing" ? "正在检查数据，请稍候…"
    : backupStatus === "ready" ? (backupNotice || "✓ 已准备完成，可以创建备份")
    : backupStatus === "generating" ? "正在生成备份…"
    : backupStatus === "validating" ? "正在校验…"
    : backupStatus === "handoff" ? "正在调用系统保存…"
    : backupStatus === "complete" ? (backupNotice || "备份已创建。")
    : (backupNotice || "文件生成失败，请稍后重试。");
  const backupButtonLabel = backupStatus === "preparing" ? "正在准备备份…"
    : backupStatus === "generating" ? "正在生成备份…"
    : backupStatus === "validating" ? "正在校验…"
    : backupStatus === "handoff" ? "正在调用系统保存…"
    : backupStatus === "complete" ? "下载 Backup"
    : "创建备份";

  async function exportTable(format: "excel" | "csv") {
    const exportDataForTable = await loadExportData();
    const now = new Date(); const stamp = now.toISOString().replace(/[:.]/g, "-");
    if (format === "excel") void downloadFile(buildExportFile(`分租管理数据-${stamp}.xls`, buildExcelDataExport(exportDataForTable), "application/vnd.ms-excel;charset=utf-8"), { title: "咱家分租 Excel 导出" });
    else void downloadFile(buildExportFile(`分租管理数据-${stamp}.csv`, buildCsvDataExport(exportDataForTable), "text/csv;charset=utf-8"), { title: "咱家分租 CSV 导出" });
    setExportSheetOpen(false);
  }

  async function previewRestoreFile(file: File | undefined) {
    setRestorePreview(null);
    setRestoreStep("preview");
    setRestoreError("");
    setBeforeRestorePackage(null);
    setBeforeRestoreConfirmed(false);
    setBeforeRestoreStatus("idle");
    setBeforeRestoreError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setRestoreError("请选择 .json 备份文件。");
      return;
    }
    if (!access.ready) {
      setRestoreError("账号信息仍在加载，请稍后重试。");
      return;
    }
    setRestoreLoading(true);
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
      const currentData = await loadExportData(false);
      setRestorePreview({ fileName: file.name, fileSize: file.size, payload: parsed, currentData });
    } catch (previewError) {
      setRestoreError(previewError instanceof Error ? previewError.message : "备份文件无法读取，请重新选择。");
    } finally {
      setRestoreLoading(false);
    }
  }

  async function prepareBeforeRestore() {
    setBeforeRestoreStatus("preparing");
    setBeforeRestoreError("");
    try {
      const session = await getValidSupabaseSession();
      if (!session?.access_token) throw new Error("登录已失效，请重新登录后再继续。");
      const response = await fetch("/api/data-restore", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "prepare_before_restore" })
      });
      const result = await response.json().catch(() => null) as (BeforeRestoreDiagnostic & { beforeRestore?: BeforeRestorePackage }) | null;
      if (!response.ok || !result?.beforeRestore) throw new BeforeRestoreClientError(result || { stage: "response", code: "before_restore_response_invalid", message: "服务端没有返回有效的 BeforeRestore 文件" });
      const packageData = result.beforeRestore;
      let file: File;
      try {
        file = buildExportFile(packageData.fileName, JSON.stringify(packageData.payload, null, 2), "application/json");
      } catch (error) {
        throw new BeforeRestoreClientError({ stage: "file_generation", code: "before_restore_file_generation_failed", message: error instanceof Error ? error.message : "分享文件生成失败" });
      }
      setBeforeRestoreStatus("saving");
      await saveFileWithSystemFallback(file);
      setBeforeRestorePackage(packageData);
      setBeforeRestoreConfirmed(false);
      setBeforeRestoreStatus("ready");
    } catch (error) {
      setBeforeRestoreStatus("error");
      const diagnostic = error instanceof BeforeRestoreClientError ? error.diagnostic : { stage: "unknown", message: error instanceof Error ? error.message : "BeforeRestore 生成失败" };
      setBeforeRestoreError(beforeRestoreErrorText(diagnostic));
      throw error;
    }
  }

  async function executeRestore(payload: DataExportPayload, beforeRestoreBackupPath: string, mode: "dry_run" | "restore" = "dry_run") {
    const session = await getValidSupabaseSession();
    if (!session?.access_token) throw new Error("登录已失效，请重新登录后再恢复。");
    const response = await fetch("/api/data-restore", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action: mode, payload, beforeRestoreBackupPath })
    });
    const result = await response.json().catch(() => null) as (Record<string, unknown> & { report?: RestoreDryRunReport }) | null;
    if (!response.ok) {
      const diagnosticResult: Record<string, unknown> = result ?? { error: "Restore Dry Run 失败" };
      throw new Error(restoreDryRunErrorText(diagnosticResult));
    }
    if (!result?.report) throw new Error("Restore Dry Run 未返回完整检查报告。");
    return result.report;
  }

  return <AppLayout title="Backup & Restore" description="备份与恢复业务数据、导出报表并查看后续云端能力。">
    <div className="data-center-page">
      {error ? <div className="data-center-alert data-center-alert--danger" role="alert">{error}</div> : null}
      <SectionCard className="data-center-card">
        <DataCardHeader icon={<HardDriveDownload size={20} />} title="数据备份" description="用于以后恢复整个系统。" />
        <CountSummary counts={counts} loading={loading} loaded={dataLoaded} />
        <p className="data-center-note"><ShieldCheck size={16} /> 创建备份会下载一份本地 JSON 文件，不会写入云端 Storage。</p>
        <PrimaryButton type="button" disabled={!access.ready || loading || backupCreating || backupStatus === "preparing" || backupStatus === "generating" || backupStatus === "validating" || backupStatus === "handoff" || !access.canSensitive("canExportData")} onClick={() => void (backupStatus === "complete" && backupRetryFile ? downloadCompletedBackup() : createBackup())}>
          {backupButtonLabel}
        </PrimaryButton>
        <p className={`data-center-backup-status ${backupStatus === "error" ? "data-center-backup-status--error" : backupStatus === "ready" || backupStatus === "complete" ? "data-center-backup-status--success" : ""}`} role="status" aria-live="polite">{backupStatusMessage}</p>
        {!access.canSensitive("canExportData") ? <p className="data-center-muted">当前账号没有数据导出权限。</p> : null}
      </SectionCard>
      <SectionCard className="data-center-card">
        <DataCardHeader icon={<History size={20} />} title="恢复备份" description="选择官方 JSON 备份文件，先查看恢复内容预览。当前不会修改任何数据。" />
        <input ref={restoreInputRef} style={{ display: "none" }} type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void previewRestoreFile(file); }} />
        {!restorePreview ? <SecondaryButton type="button" disabled={!access.ready || restoreLoading} onClick={() => restoreInputRef.current?.click()}>恢复备份</SecondaryButton> : null}
        {restoreError ? <p className="data-center-alert data-center-alert--danger" role="alert">{restoreError}</p> : null}
        {restoreLoading ? <p className="data-center-muted" role="status" aria-live="polite">正在解析备份并读取当前数据，请稍候…</p> : null}
      {restorePreview ? <RestorePreviewCard preview={restorePreview} step={restoreStep} beforeRestorePackage={beforeRestorePackage} beforeRestoreConfirmed={beforeRestoreConfirmed} onBeforeRestoreConfirmed={setBeforeRestoreConfirmed} beforeRestoreStatus={beforeRestoreStatus} beforeRestoreError={beforeRestoreError} canRealRestore={access.isOwner} onPrepareBeforeRestore={prepareBeforeRestore} onNext={() => setRestoreStep("confirm")} onRestore={executeRestore} onBack={() => { if (restoreStep === "confirm") setRestoreStep("preview"); else setRestorePreview(null); setRestoreError(""); }} /> : null}
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
function CountSummary({ counts, loading, loaded }: { counts: Record<string, number>; loading: boolean; loaded: boolean }) { return <div className="data-center-counts"><strong>预计备份内容</strong>{loading ? <span className="data-center-muted">正在读取授权范围…</span> : !loaded ? <span className="data-center-muted">点击创建备份后读取数据</span> : Object.entries(countLabels).map(([key, label]) => <span key={key}><b>{label}</b><em>{counts[key] ?? 0}</em></span>)}</div>; }
function SubscriptionCard({ title, icon, description, onOpen }: { title: string; icon: React.ReactNode; description: string; onOpen: () => void }) { return <SectionCard className="data-center-card"><div className="data-center-card-header"><div className="data-center-icon">{icon}</div><div><div className="data-center-title-row"><h2 className="panel-title">{title}</h2><span className="data-center-subscription-badge" aria-label="订阅功能"><Crown size={12} /></span></div><p className="data-center-muted">{description}</p></div></div><SecondaryButton type="button" onClick={onOpen}>了解功能</SecondaryButton></SectionCard>; }

type RestoreDryRunReport = {
  beforeRestore: { success: boolean };
  upload: { success: boolean };
  delete: { success: boolean };
  import: { success: boolean };
  fieldValidation: { success: boolean };
  consistencyValidation: { success: boolean };
  transactionRolledBack: boolean;
  databaseUnchanged: boolean;
  databaseRestored?: boolean;
  mode?: "dry_run" | "restore";
};

function RestorePreviewCard({ preview, step, beforeRestorePackage, beforeRestoreConfirmed, onBeforeRestoreConfirmed, beforeRestoreStatus, beforeRestoreError, canRealRestore, onPrepareBeforeRestore, onNext, onRestore, onBack }: { preview: RestorePreview; step: RestoreStep; beforeRestorePackage: BeforeRestorePackage | null; beforeRestoreConfirmed: boolean; onBeforeRestoreConfirmed: (confirmed: boolean) => void; beforeRestoreStatus: "idle" | "preparing" | "saving" | "ready" | "error"; beforeRestoreError: string; canRealRestore: boolean; onPrepareBeforeRestore: () => Promise<void>; onNext: () => void; onRestore: (payload: DataExportPayload, beforeRestoreBackupPath: string, mode?: "dry_run" | "restore") => Promise<RestoreDryRunReport>; onBack: () => void }) {
  const { payload } = preview;
  const currentData = preview.currentData;
  const keys = Object.keys(payload.data).filter((key) => key !== "auditLogs");
  const countValue = (value: unknown) => Array.isArray(value) ? value.length : value && typeof value === "object" ? 1 : 0;
  const rows = keys.map((key) => {
    const current = countValue(currentData[key]);
    const backup = countValue(payload.data[key]);
    return { key, label: restoreLabels[key] || "其他数据", current, backup, differs: current !== backup };
  });
  const differenceCount = rows.filter((row) => row.differs).length;
  const allMatch = differenceCount === 0;
  const [restoreActionError, setRestoreActionError] = useState("");
  const [restoreActionSuccess, setRestoreActionSuccess] = useState("");
  const [restoreReport, setRestoreReport] = useState<RestoreDryRunReport | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreSlow, setRestoreSlow] = useState(false);
  const confirmationRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step === "confirm") {
      requestAnimationFrame(() => confirmationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [step]);
  useEffect(() => {
    if (!restoring) {
      setRestoreSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setRestoreSlow(true), 15000);
    return () => window.clearTimeout(timer);
  }, [restoring]);
  if (step === "confirm") {
    return <div ref={confirmationRef} className="data-center-restore-preview">
      <div className="data-center-restore-warning" role="alert">
        <strong>⚠ 即将恢复备份</strong>
        <p>恢复将覆盖当前所有业务数据。</p>
        <p>恢复前系统将自动创建一份当前数据 Backup，以便需要时可以恢复回来。</p>
        <p>本次操作不可撤销。</p>
      </div>
      <div className="panel-header"><div><h3 className="panel-title">最终确认</h3><p className="data-center-muted">恢复前会自动保存当前数据备份；恢复过程由数据库事务保护，失败将完整回滚。</p></div></div>
      <div className="detail-grid">
        <div className="detail-field"><span>Backup 文件名</span><strong>{preview.fileName}</strong></div>
        <div className="detail-field"><span>Backup 时间</span><strong>{new Date(payload.metadata.exportedAt).toLocaleString("zh-CN")}</strong></div>
        <div className="detail-field"><span>差异项数量</span><strong>{differenceCount}</strong></div>
        <div className="detail-field"><span>数据状态</span><strong>{allMatch ? "全部一致" : "存在差异"}</strong></div>
      </div>
      <p className="data-center-restore-confirmation">
      </p>
      <div className="data-center-before-restore" role="status">
        <strong>恢复前备份</strong>
        <p>恢复开始前，系统会自动生成一份当前数据 BeforeRestore 备份，并提示保存，以便需要时恢复当前状态。</p>
        {beforeRestoreStatus === "preparing" ? <p>正在生成恢复前备份…</p> : null}
        {beforeRestoreStatus === "saving" ? <p>正在调用系统保存，请选择保存位置…</p> : null}
        {beforeRestorePackage ? <><p className="data-center-alert data-center-alert--success">✅ BeforeRestore 已生成</p><div className="detail-field"><span>文件名</span><strong>{beforeRestorePackage.fileName}</strong></div></> : null}
        {beforeRestoreError ? <p className="data-center-alert data-center-alert--warning">{beforeRestoreError}</p> : null}
      </div>
      {restoreActionError ? <pre className="data-center-alert data-center-alert--warning data-center-error-details" role="status">{restoreActionError}</pre> : null}
      {restoreActionSuccess ? <p className="data-center-alert data-center-alert--success" role="status">{restoreActionSuccess}</p> : null}
      {restoreSlow ? <p className="data-center-alert data-center-alert--warning" role="status">恢复仍在进行中，请稍候……</p> : null}
      {restoreReport && restoreReport.mode !== "restore" ? <div className="data-center-restore-report" role="status"><strong>恢复模拟报告（Restore Report）</strong><p>BeforeRestore：{restoreReport.beforeRestore.success ? "成功" : "失败"}</p><p>上传：{restoreReport.upload.success ? "成功" : "失败"}</p><p>删除模拟：{restoreReport.delete.success ? "成功" : "失败"}</p><p>导入模拟：{restoreReport.import.success ? "成功" : "失败"}</p><p>字段级校验：{restoreReport.fieldValidation.success ? "通过" : "失败"}</p><p>Restore V2 一致性校验：{restoreReport.consistencyValidation.success ? "通过" : "失败"}</p><p>事务回滚：{restoreReport.transactionRolledBack ? "已执行" : "未执行"}</p><p>数据库：{restoreReport.databaseUnchanged ? "未修改" : "状态未知"}</p></div> : null}
       {restoreReport?.mode === "restore" ? <div className="data-center-restore-report" role="status"><strong>真实 Restore 报告</strong><p>BeforeRestore：成功</p><p>上传：成功</p><p>删除：成功</p><p>导入：成功</p><p>字段级校验：通过</p><p>Restore V2 一致性校验：通过</p><p>事务回滚：未执行</p><p>数据库：已恢复</p></div> : null}
      {beforeRestorePackage ? <label className="data-center-restore-confirmation data-center-restore-confirmation--prominent"><input type="checkbox" checked={beforeRestoreConfirmed} onChange={(event) => onBeforeRestoreConfirmed(event.target.checked)} /><span>我已保存 BeforeRestore 文件，可以继续恢复</span></label> : null}
       <div className="settings-actions">
        <SecondaryButton type="button" onClick={onBack}>返回</SecondaryButton>
        {canRealRestore ? <DangerButton type="button" disabled={(beforeRestorePackage ? !beforeRestoreConfirmed : false) || restoring || Boolean(restoreReport) || beforeRestoreStatus === "preparing" || beforeRestoreStatus === "saving"} onClick={() => void (async () => {
          setRestoreActionError(""); setRestoreActionSuccess("");
          if (!beforeRestorePackage) { try { await onPrepareBeforeRestore(); } catch (error) { setRestoreActionError(error instanceof Error ? error.message : "恢复前备份生成失败，请重试。"); } return; }
          setRestoring(true); setRestoreReport(null);
          try { const report = await onRestore(payload, beforeRestorePackage.storagePath, "restore"); setRestoreReport(report); setRestoreActionSuccess(`数据库已恢复成功。恢复来源文件：${preview.fileName}。BeforeRestore 文件：${beforeRestorePackage?.fileName || "已生成的 BeforeRestore"}。建议检查收入、支出、租客和合同等关键数据。`); }
          catch (error) { setRestoreActionError(error instanceof Error ? error.message : "Restore 失败，数据库变更已自动回滚。"); }
          finally { setRestoring(false); }
        })()}>{restoring ? "正在恢复…" : "开始恢复（Restore）"}</DangerButton> : null}
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
          const status = row.current === row.backup ? "✅" : row.backup > row.current ? "↑" : "↓";
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
