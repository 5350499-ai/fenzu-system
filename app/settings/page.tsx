"use client";

import { AppLayout } from "@/components/app-layout";
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
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Download, HardDriveDownload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const backupBucket = "system-backups";

type BackupData = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  rentPayments: BusinessRentPayment[];
  expenses: BusinessExpense[];
  deposits: BusinessDeposit[];
};

export default function SettingsPage() {
  const [data, setData] = useState<BackupData>({
    properties: [],
    rooms: [],
    tenants: [],
    contracts: [],
    rentPayments: [],
    expenses: [],
    deposits: []
  });
  const [lastBackupAt, setLastBackupAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    async function load() {
      const properties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const rooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(properties));
      const tenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(properties, rooms));
      const contracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const rentPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(properties, rooms, tenants));
      const expenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(properties));
      const deposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setData({ properties, rooms, tenants, contracts, rentPayments, expenses, deposits });
      await loadLastBackupTime();
      setLoading(false);
    }
    load().catch((error) => {
      setLoading(false);
      window.alert(`加载设置数据失败：${error.message || error}`);
    });
  }, []);

  const settlement = useMemo(() => buildSettlementRows(data), [data]);

  async function loadLastBackupTime() {
    if (!isSupabaseConfigured || !supabase) {
      setLastBackupAt(window.localStorage.getItem("last-system-backup-at") || "");
      return;
    }
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session) return;
    const { data: files, error } = await supabase.storage
      .from(backupBucket)
      .list(session.user.id, { limit: 1, sortBy: { column: "created_at", order: "desc" } });
    if (error) {
      setLastBackupAt(window.localStorage.getItem("last-system-backup-at") || "");
      return;
    }
    const file = files?.[0];
    setLastBackupAt(file?.created_at || window.localStorage.getItem("last-system-backup-at") || "");
  }

  async function backupNow() {
    setWorking(true);
    try {
      const exportedAt = new Date().toISOString();
      const payload = JSON.stringify({ exportedAt, version: 1, data, settlement }, null, 2);
      if (!isSupabaseConfigured || !supabase) {
        downloadBlob(`分租管理备份-${stamp(exportedAt)}.json`, payload, "application/json;charset=utf-8");
        window.localStorage.setItem("last-system-backup-at", exportedAt);
        setLastBackupAt(exportedAt);
        return;
      }
      const {
        data: { session }
      } = await supabase.auth.getSession();
      if (!session) throw new Error("请先登录后再备份。");
      const path = `${session.user.id}/backup-${stamp(exportedAt)}.json`;
      const { error } = await supabase.storage
        .from(backupBucket)
        .upload(path, new Blob([payload], { type: "application/json" }), { upsert: true, contentType: "application/json" });
      if (error) {
        throw new Error("备份存储未初始化，请先执行 system-backups Storage SQL。");
      }
      window.localStorage.setItem("last-system-backup-at", exportedAt);
      setLastBackupAt(exportedAt);
      window.alert("备份完成，已保存到 Supabase Storage。");
    } catch (error: any) {
      window.alert(error.message || "备份失败，请稍后重试。");
    } finally {
      setWorking(false);
    }
  }

  function exportCsv() {
    downloadBlob(`分租管理数据-${stamp(new Date().toISOString())}.csv`, buildCsvExport(data, settlement), "text/csv;charset=utf-8");
  }

  function exportExcel() {
    downloadBlob(`分租管理数据-${stamp(new Date().toISOString())}.xls`, buildExcelExport(data, settlement), "application/vnd.ms-excel;charset=utf-8");
  }

  return (
    <AppLayout title="设置" description="数据备份、导出和系统参数。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">数据安全</h2>
            <p className="muted">先做备份和导出；恢复功能后续再加。</p>
          </div>
        </div>
        <div className="settings-actions">
          <button className="btn primary" disabled={loading || working} onClick={backupNow} type="button">
            <HardDriveDownload size={17} /> 立即备份
          </button>
          <button className="btn" disabled={loading || working} onClick={exportExcel} type="button">
            <Download size={17} /> 导出Excel
          </button>
          <button className="btn" disabled={loading || working} onClick={exportCsv} type="button">
            <Download size={17} /> 导出CSV
          </button>
        </div>
        <div className="detail-grid">
          <div className="detail-field"><span>最近备份时间</span><strong>{lastBackupAt ? formatDateTime(lastBackupAt) : "暂无备份"}</strong></div>
          <div className="detail-field"><span>导出内容</span><strong>房源、房间、租客、收租、支出、合同、A/B归属、合伙结算</strong></div>
        </div>
      </section>

      <section className="card panel">
        <h2 className="panel-title">后续设置项</h2>
        <div className="settings-list">
          <span>合伙人管理 A/B/C/D</span>
          <span>默认货币</span>
          <span>默认押金月数</span>
          <span>默认租金收款日</span>
          <span>数据恢复</span>
        </div>
      </section>
    </AppLayout>
  );
}

function buildSettlementRows(data: BackupData) {
  const totalIncome = data.rentPayments.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
  const totalExpense = data.expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const byPartner = ["A", "B"].map((partner) => {
    const collected = data.rentPayments.filter((item) => normalizePartner(item.receivedBy) === partner).reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
    const advanced = data.expenses.filter((item) => normalizePartner(item.paidBy) === partner).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { partner, collected, advanced, actualCash: collected - advanced };
  });
  return { totalIncome, totalExpense, netProfit: totalIncome - totalExpense, byPartner };
}

function buildCsvExport(data: BackupData, settlement: ReturnType<typeof buildSettlementRows>) {
  return [
    csvSection("房源", ["id", "名称", "城市", "地址", "房东", "允许分租", "备注"], data.properties.map((item) => [item.id, item.name, item.city, item.address, item.landlordName || "", item.subletAllowed ? "是" : "否", item.notes || ""])),
    csvSection("房间", ["id", "房源ID", "房间", "编号", "月租", "押金", "状态", "备注"], data.rooms.map((item) => [item.id, item.propertyId, item.name, item.roomNumber, item.monthlyRent, item.depositAmount, item.status, item.notes || ""])),
    csvSection("租客", ["id", "房源ID", "房间ID", "姓名", "电话", "微信", "来源", "月租", "押金", "状态", "备注"], data.tenants.map((item) => [item.id, item.propertyId, item.roomId, item.name, item.phone, item.wechat, item.source, item.monthlyRent, item.depositAmount, item.status, item.notes || ""])),
    csvSection("收租", ["id", "月份", "租客ID", "应收", "已收", "未收", "付款方式", "收款归属", "欠费", "备注"], data.rentPayments.map((item) => [item.id, item.rentMonth, item.tenantId, item.amountDue, item.amountPaid, item.amountUnpaid, item.paymentMethod, item.receivedBy || "A", item.isOverdue ? "是" : "否", item.notes || ""])),
    csvSection("支出", ["id", "日期", "房源ID", "房间ID", "类型", "金额", "付款方式", "付款归属", "已支付", "备注"], data.expenses.map((item) => [item.id, item.paymentDate, item.propertyId, item.roomId || "", item.category, item.amount, item.paymentMethod || "", item.paidBy || "A", item.isPaid ? "是" : "否", item.notes || ""])),
    csvSection("合同", ["id", "租客ID", "房源ID", "房间ID", "开始日期", "结束日期", "月租", "押金", "状态", "备注"], data.contracts.map((item) => [item.id, item.tenantId, item.propertyId, item.roomId, item.startDate, item.endDate, item.monthlyRent, item.depositAmount, item.status, item.notes || ""])),
    csvSection("合伙结算", ["项目", "数值"], [["总收入", settlement.totalIncome], ["总支出", settlement.totalExpense], ["净利润", settlement.netProfit], ...settlement.byPartner.flatMap((item) => [[`${item.partner}代收`, item.collected], [`${item.partner}垫付`, item.advanced], [`${item.partner}实际留存`, item.actualCash]])])
  ].join("\n\n");
}

function buildExcelExport(data: BackupData, settlement: ReturnType<typeof buildSettlementRows>) {
  const sections = buildCsvExport(data, settlement).split("\n\n").map((section) => {
    const rows = section.split("\n").map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "").replace(/""/g, "\"")));
    return `<h2>${escapeHtml(rows[0][0])}</h2><table border="1">${rows.slice(1).map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</table>`;
  });
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body>${sections.join("<br/>")}</body></html>`;
}

function csvSection(title: string, headers: string[], rows: Array<Array<string | number | boolean>>) {
  return [[title], headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number | boolean) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, "\"\"")}"`;
}

function downloadBlob(fileName: string, content: string, type: string) {
  const blob = new Blob(["\uFEFF", content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function stamp(value: string) {
  return value.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function normalizePartner(value?: string) {
  const partner = (value || "A").trim().toUpperCase();
  return partner === "B" ? "B" : "A";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char] || char));
}
