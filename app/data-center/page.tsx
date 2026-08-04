"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { SectionCard, PrimaryButton, SecondaryButton } from "@/components/ui";
import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Cloud,
  Database,
  FileArchive,
  History,
  Paperclip,
  ShieldCheck,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  expenseKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  tenantKey
} from "@/lib/business-data";
import { getPartners, type PartnerNameHistory, type PartnerPropertyShare, type Partner } from "@/lib/partners";
import { loadPartnerRatios, type PartnerRatios } from "@/lib/partner-settings";
import { getValidSupabaseSession } from "@/lib/supabase";

type CoreData = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  expenses: BusinessExpense[];
  deposits: BusinessDeposit[];
};

type ImportPreview = { counts: Record<string, number>; fileName: string };
type ExportPayload = {
  format: "fenzu-system-json";
  version: 1;
  exportedAt: string;
  attachmentsIncluded: false;
  data: Record<string, unknown>;
};

const emptyData: CoreData = { properties: [], rooms: [], tenants: [], contracts: [], rentPayments: [], expenses: [], deposits: [] };
const countLabels: Record<string, string> = {
  properties: "房源",
  rooms: "房间",
  tenants: "租客",
  contracts: "合同",
  rentPayments: "收款",
  expenses: "支出",
  deposits: "押金",
  partners: "合伙人",
  partnerShares: "比例方案",
  settlementBatches: "结算快照",
  accounts: "账号",
  auditLogs: "操作日志"
};

export default function DataCenterPage() {
  const access = useAccountAccess();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<CoreData>(emptyData);
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
  const [importError, setImportError] = useState("");
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [vipDialog, setVipDialog] = useState<"backup" | "restore" | null>(null);

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const properties = access.can("properties", "view") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
        const rooms = access.can("rooms", "view") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(properties)) : [];
        const tenants = access.can("tenants", "view") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(properties, rooms)) : [];
        const contracts = access.can("tenants", "view") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
        const rentPayments = access.can("rent_payments", "view") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(properties, rooms, tenants)) : [];
        const expenses = access.can("expenses", "view") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(properties)) : [];
        const deposits = access.can("deposits", "view") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
        let nextPartners: Partner[] = [];
        let nextShares: PartnerPropertyShare[] = [];
        let nextHistory: PartnerNameHistory[] = [];
        try {
          const partnerData = await getPartners();
          nextPartners = partnerData.partners;
          nextShares = partnerData.shares;
          nextHistory = partnerData.nameHistory || [];
        } catch {
          // Partner data is optional for accounts without the settlement view permission.
        }
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
        const nextBatches = Array.isArray(settlementBody.batches) ? settlementBody.batches : [];
        const nextSnapshots = access.canSensitive("canViewPartnershipSettlement")
          ? (await Promise.all(nextBatches.map(async (batch: unknown) => {
            const id = typeof batch === "object" && batch && "id" in batch ? String((batch as { id?: unknown }).id || "") : "";
            if (!id || !session?.access_token) return null;
            const response = await fetch(`/api/partner-settlements?id=${encodeURIComponent(id)}`, { headers: authHeaders, cache: "no-store" });
            return response.ok ? response.json() : null;
          }))).filter(Boolean)
          : [];
        if (!cancelled) {
          setData({ properties, rooms, tenants, contracts, rentPayments, expenses, deposits });
          setPartners(nextPartners);
          setPartnerShares(nextShares);
          setNameHistory(nextHistory);
          setSettlementBatches(nextBatches);
          setSettlementSnapshots(nextSnapshots);
          setAccounts(Array.isArray(accountBody.accounts) ? accountBody.accounts : []);
          setAuditLogs(Array.isArray(auditBody.logs) ? auditBody.logs : []);
          setPartnerRatios(loadPartnerRatios());
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "数据加载失败，请稍后重试。 ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [access.ready, access.isOwner, access.can, access.canSensitive]);

  const counts = useMemo<Record<string, number>>(() => ({
    properties: data.properties.length,
    rooms: data.rooms.length,
    tenants: data.tenants.length,
    contracts: data.contracts.length,
    rentPayments: data.rentPayments.length,
    expenses: data.expenses.length,
    deposits: data.deposits.length,
    partners: partners.length,
    partnerShares: partnerShares.length,
    settlementBatches: settlementBatches.length,
    accounts: accounts.length,
    auditLogs: auditLogs.length
  }), [data, partners, partnerShares, settlementBatches, accounts, auditLogs]);

  const exportPayload = useMemo<ExportPayload>(() => ({
    format: "fenzu-system-json",
    version: 1,
    exportedAt: new Date().toISOString(),
    attachmentsIncluded: false,
    data: {
      properties: data.properties,
      rooms: data.rooms,
      tenants: data.tenants,
      contracts: data.contracts,
      rentPayments: data.rentPayments,
      expenses: data.expenses,
      deposits: data.deposits,
      partners,
      partnerShares,
      partnerNameHistory: nameHistory,
      settlementBatches,
      settlementSnapshots,
      accounts,
      auditLogs,
      settings: { legacyPartnerRatios: partnerRatios }
    }
  }), [data, partners, partnerShares, nameHistory, settlementBatches, settlementSnapshots, accounts, auditLogs, partnerRatios]);

  function exportJson() {
    if (!access.canSensitive("canExportData")) return;
    if (!window.confirm("确认导出以上业务数据吗？导出文件不包含图片、PDF、合同附件或 Storage 文件。")) return;
    const payload = { ...exportPayload, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `分租管理数据-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function previewImport(file: File) {
    setImportError("");
    setImportPreview(null);
    try {
      const parsed = JSON.parse(await file.text()) as Partial<ExportPayload>;
      if (parsed.format !== "fenzu-system-json" || parsed.version !== 1 || !parsed.data || typeof parsed.data !== "object") {
        throw new Error("这不是本软件导出的 JSON 文件。 ");
      }
      const source = parsed.data as Record<string, unknown>;
      const nextCounts = Object.fromEntries(Object.keys(countLabels).map((key) => [key, Array.isArray(source[key]) ? source[key].length : 0]));
      setImportPreview({ counts: nextCounts, fileName: file.name });
    } catch (parseError) {
      setImportError(parseError instanceof Error ? parseError.message : "JSON 文件解析失败，请选择本软件导出的文件。 ");
    }
  }

  return (
    <AppLayout title="数据管理" description="统一管理业务数据导出、导入和后续云端能力。">
      <div className="data-center-page">
        {error ? <div className="data-center-alert data-center-alert--danger" role="alert">{error}</div> : null}
        <div className="data-center-grid">
          <SectionCard className="data-center-card">
            <DataCardHeader icon={<ArrowDownToLine size={20} />} title="数据导出" description="导出可迁移的业务 JSON，不包含任何 Storage 文件。" />
            <CountSummary counts={counts} loading={loading} />
            <p className="data-center-note"><ShieldCheck size={16} /> 导出前会显示统计并要求确认。</p>
            <PrimaryButton type="button" disabled={loading || !access.canSensitive("canExportData")} onClick={exportJson}><ArrowDownToLine size={17} /> 导出 JSON</PrimaryButton>
            {!access.canSensitive("canExportData") ? <p className="data-center-muted">当前账号没有数据导出权限。</p> : null}
          </SectionCard>

          <SectionCard className="data-center-card">
            <DataCardHeader icon={<ArrowUpFromLine size={20} />} title="数据导入" description="仅接受本软件导出的 JSON，先解析预览再进入后续导入流程。" />
            <input ref={importInputRef} className="data-center-hidden-input" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void previewImport(file); event.currentTarget.value = ""; }} />
            <SecondaryButton type="button" onClick={() => importInputRef.current?.click()}><Upload size={17} /> 选择 JSON 文件</SecondaryButton>
            {importPreview ? <ImportSummary preview={importPreview} /> : <p className="data-center-muted">选择文件后会显示准备导入的记录数量，不会自动写入现有数据。</p>}
            {importError ? <p className="data-center-error" role="alert">{importError}</p> : null}
            {importPreview ? <button className="btn" type="button" disabled title="第一阶段仅提供安全解析预览">导入执行接口预留</button> : null}
          </SectionCard>

          <AttachmentCard title="附件导出" icon={<FileArchive size={20} />} action={<SecondaryButton type="button" disabled><ArrowDownToLine size={17} /> 导出 attachments.zip</SecondaryButton>} description="附件与业务 JSON 分离，后续将以 attachments.zip 形式导出图片、PDF和合同文件。" />
          <AttachmentCard title="附件导入" icon={<Paperclip size={20} />} action={<SecondaryButton type="button" disabled><ArrowUpFromLine size={17} /> 导入 attachments.zip</SecondaryButton>} description="附件导入只恢复 Storage 文件，不会恢复或覆盖业务数据库记录。" />

          <VipCard title="自动云备份" icon={<Cloud size={20} />} description="自动保存数据库历史备份，后续可按保留策略查看。" onOpen={() => setVipDialog("backup")} />
          <VipCard title="历史恢复" icon={<History size={20} />} description="恢复前系统将自动创建一份当前数据备份，此规则以后不可关闭。" onOpen={() => setVipDialog("restore")} />
        </div>
      </div>
      {vipDialog ? <div className="data-center-dialog-backdrop" role="presentation" onClick={() => setVipDialog(null)}><section className="data-center-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}><div className="data-center-dialog-icon"><Cloud size={22} /></div><h2>升级 VIP 后即可使用</h2><ul><li>自动云备份</li><li>历史恢复</li><li>更多附件空间</li><li>更多高级功能</li></ul><p className="data-center-muted">{vipDialog === "restore" ? "恢复前系统将自动创建一份当前数据备份。" : "自动云备份功能将在后续阶段开放。"}</p><SecondaryButton type="button" onClick={() => setVipDialog(null)}>知道了</SecondaryButton></section></div> : null}
    </AppLayout>
  );
}

function DataCardHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return <div className="data-center-card-header"><div className="data-center-icon">{icon}</div><div><h2 className="panel-title">{title}</h2><p className="data-center-muted">{description}</p></div></div>;
}

function CountSummary({ counts, loading }: { counts: Record<string, number>; loading: boolean }) {
  return <div className="data-center-counts"><strong>预计导出内容</strong>{loading ? <span className="data-center-muted">正在读取授权范围…</span> : Object.entries(countLabels).map(([key, label]) => <span key={key}><b>{label}</b><em>{counts[key] ?? 0}</em></span>)}</div>;
}

function ImportSummary({ preview }: { preview: ImportPreview }) {
  return <div className="data-center-import-summary"><strong>准备导入：{preview.fileName}</strong>{Object.entries(countLabels).map(([key, label]) => <span key={key}><b>{label}</b><em>{preview.counts[key] ?? 0}</em></span>)}</div>;
}

function AttachmentCard({ title, icon, description, action }: { title: string; icon: React.ReactNode; description: string; action: React.ReactNode }) {
  return <SectionCard className="data-center-card"><DataCardHeader icon={icon} title={title} description={description} /><div className="data-center-reserved"><Database size={18} /><span>接口预留</span></div>{action}</SectionCard>;
}

function VipCard({ title, icon, description, onOpen }: { title: string; icon: React.ReactNode; description: string; onOpen: () => void }) {
  return <SectionCard className="data-center-card"><div className="data-center-card-header"><div className="data-center-icon">{icon}</div><div><div className="data-center-title-row"><h2 className="panel-title">{title}</h2><span className="data-center-vip">VIP</span></div><p className="data-center-muted">{description}</p></div></div><SecondaryButton type="button" onClick={onOpen}>了解 VIP 功能</SecondaryButton></SectionCard>;
}
