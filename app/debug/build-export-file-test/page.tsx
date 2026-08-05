"use client";

import { useAccountAccess } from "@/components/account-access";
import { useEffect, useState } from "react";
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
import { createDataExportPayload } from "@/lib/data-export";

type ExportRow = Record<string, unknown> & { id: string };

function buildExportFile(fileName: string, content: string, type: string) {
  const needsUtf8Bom = type.startsWith("text/csv") || type.includes("ms-excel");
  return new File([needsUtf8Bom ? "\uFEFF" : "", content], fileName, { type });
}

export default function BuildExportFileTestPage() {
  const access = useAccountAccess();
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  async function prepareBackupFile() {
    console.log("LOAD_DATA");
    const properties = access.can("properties", "view") ? await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()) : [];
    const rooms = access.can("rooms", "view") ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(properties)) : [];
    const tenants = access.can("tenants", "view") ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(properties, rooms)) : [];
    const contracts = access.can("tenants", "view") ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts()) : [];
    const rentPayments = access.can("rent_payments", "view") ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(properties, rooms, tenants)) : [];
    const expenses = access.can("expenses", "view") ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(properties)) : [];
    const deposits = access.can("deposits", "view") ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits()) : [];
    const viewingAppointments = access.can("properties", "view") ? await loadBusinessData<ExportRow>(viewingAppointmentKey, []) : [];
    const tasks = access.can("tasks", "view") ? await loadBusinessData<ExportRow>(taskKey, []) : [];
    let partners: Partner[] = [], partnerShares: PartnerPropertyShare[] = [], partnerNameHistory: PartnerNameHistory[] = [];
    try {
      const partnerData = await getPartners();
      partners = partnerData.partners;
      partnerShares = partnerData.shares;
      partnerNameHistory = partnerData.nameHistory || [];
    } catch { /* The direct experiment keeps the same readable-data boundary as Backup. */ }
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
    const settlementBatches = Array.isArray(settlementBody.batches) ? settlementBody.batches : [];
    const settlementSnapshots = access.canSensitive("canViewPartnershipSettlement")
      ? (await Promise.all(settlementBatches.map(async (batch: { id?: string }) => {
        if (!batch.id || !session?.access_token) return null;
        const response = await fetch(`/api/partner-settlements?id=${encodeURIComponent(batch.id)}`, { headers: authHeaders, cache: "no-store" });
        return response.ok ? response.json() : null;
      }))).filter(Boolean)
      : [];
    const partnerRatios: PartnerRatios = loadPartnerRatios();
    console.log("CREATE_PAYLOAD");
    const payload = await createDataExportPayload({
      properties, rooms, tenants, contracts, rentPayments, expenses, deposits,
      tasks, viewingAppointments, partners, partnerShares, partnerNameHistory,
      propertyHistory: [], settlementBatches, settlementSnapshots,
      accounts: Array.isArray(accountBody.accounts) ? accountBody.accounts : [],
      auditLogs: Array.isArray(auditBody.logs) ? auditBody.logs : [],
      settings: { legacyPartnerRatios: partnerRatios }
    }, new Date().toISOString(), {
      backupType: "local",
      exportedBy: access.userId || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    });
    const json = JSON.stringify(payload, null, 2);
    console.log("JSON_DONE");
    const preparedFile = buildExportFile("same-backup.json", json, "application/json;charset=utf-8");
    console.log("FILE_DONE", { size: preparedFile.size, type: preparedFile.type, name: preparedFile.name });
    return preparedFile;
  }

  useEffect(() => {
    if (!access.ready) return;
    let cancelled = false;
    setPreparing(true);
    setError("");
    void prepareBackupFile().then((preparedFile) => {
      if (!cancelled) {
        setFile(preparedFile);
        setPreparing(false);
      }
    }).catch((reason: unknown) => {
      console.error("ERROR", reason);
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : String(reason));
        setPreparing(false);
      }
    });
    return () => { cancelled = true; };
  }, [access.ready]);

  function shareBackupJson() {
    console.log("START");
    setError("");
    if (!file) {
      const message = "文件尚未准备完成，请稍后重试。";
      console.error("ERROR", message);
      setError(message);
      return;
    }
    if (!navigator.share) {
      const message = "当前浏览器不支持系统分享。";
      console.error("ERROR", message);
      setError(message);
      return;
    }
    setSharing(true);
    console.log("BEFORE_SHARE");
    void navigator.share({ files: [file] }).then(() => {
      console.log("AFTER_SHARE");
    }).catch((reason: unknown) => {
      console.error("ERROR", reason);
      setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => {
      setSharing(false);
    });
  }

  return <main>
    <button type="button" disabled={preparing || sharing || !file} onClick={shareBackupJson}>
      {preparing ? "正在准备文件…" : sharing ? "正在分享…" : "测试 buildExportFile 分享"}
    </button>
    {error ? <p role="alert">{error}</p> : null}
  </main>;
}
