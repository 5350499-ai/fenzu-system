"use client";

import { AppLayout } from "@/components/app-layout";
import { AttachmentAddControl } from "@/components/attachment-add-control";
import { useAccountAccess } from "@/components/account-access";
import type { AccountModuleKey } from "@/lib/account-permissions";
import { MoneyInput } from "@/components/money-input";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
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
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import { euro } from "@/lib/format";
import { partnerLabel, usePartnerDirectory } from "@/lib/partner-settings";
import { calculatePropertyProfit, getDateRange, monthlyProfitRows } from "@/lib/profit";
import { isValidOccupancyDate, resolvePropertyOccupancyStart } from "@/lib/room-occupancy";
import { sumOccupants } from "@/lib/tenant-occupancy";
import { Archive, ChevronDown, Download, Edit3, Eye, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { deletePropertyFile, downloadPropertyFile, formatFileSize as formatPropertyFileSize, loadPropertyFiles, openPropertyFile, PropertyFile, uploadPropertyFile } from "@/lib/property-files";
import { useParams } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type Tab = "overview" | "rooms" | "tenants" | "contracts" | "payments" | "deposits" | "expenses" | "profit" | "attachments" | "notes";
type Editor = "room" | "tenant" | "contract" | "payment" | "deposit" | "expense" | null;

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "概览" },
  { id: "rooms", label: "房间" },
  { id: "tenants", label: "租客" },
  { id: "contracts", label: "合同" },
  { id: "payments", label: "收租" },
  { id: "deposits", label: "押金" },
  { id: "expenses", label: "支出" },
  { id: "profit", label: "利润" },
  { id: "attachments", label: "附件" },
  { id: "notes", label: "备注" }
];
const ScopedModuleContext = createContext<AccountModuleKey>("properties");

function compareNaturalRoomName(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function sortRoomsByName(rooms: BusinessRoom[]) {
  const originalOrder = new Map(rooms.map((room, index) => [room.id, index]));
  return [...rooms].sort((left, right) => {
    const result = compareNaturalRoomName(left.name || left.roomNumber || "", right.name || right.roomNumber || "");
    return result || (originalOrder.get(left.id) || 0) - (originalOrder.get(right.id) || 0);
  });
}

function sortByRoomName<T extends { id: string; roomId?: string }>(items: T[], rooms: BusinessRoom[]) {
  const roomNames = new Map(rooms.map((room) => [room.id, room.name || room.roomNumber || ""]));
  const originalOrder = new Map(items.map((item, index) => [item.id, index]));
  return [...items].sort((left, right) => {
    const leftName = left.roomId ? roomNames.get(left.roomId) || "" : "";
    const rightName = right.roomId ? roomNames.get(right.roomId) || "" : "";
    if (!leftName && rightName) return 1;
    if (leftName && !rightName) return -1;
    const result = compareNaturalRoomName(leftName, rightName);
    return result || (originalOrder.get(left.id) || 0) - (originalOrder.get(right.id) || 0);
  });
}

export default function PropertyDetailPage() {
  const access = useAccountAccess();
  const partnerDirectory = usePartnerDirectory();
  const params = useParams<{ id: string }>();
  const propertyId = params.id;
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [propertyFiles, setPropertyFiles] = useState<PropertyFile[]>([]);
  const [propertyFilesLoading, setPropertyFilesLoading] = useState(false);
  const [propertyFilesError, setPropertyFilesError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [editor, setEditor] = useState<Editor>(null);
  const [roomForm, setRoomForm] = useState<BusinessRoom>(emptyRoom(propertyId));
  const [tenantForm, setTenantForm] = useState<BusinessTenant>(emptyTenant(propertyId));
  const [contractForm, setContractForm] = useState<BusinessContract>(emptyContract(propertyId));
  const [paymentForm, setPaymentForm] = useState<BusinessRentPayment>(emptyPayment(propertyId));
  const [depositForm, setDepositForm] = useState<BusinessDeposit>(emptyDeposit(propertyId));
  const [expenseForm, setExpenseForm] = useState<BusinessExpense>(emptyExpense(propertyId));
  const [loaded, setLoaded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [propertyEditorOpen, setPropertyEditorOpen] = useState(false);
  const [propertyForm, setPropertyForm] = useState<BusinessProperty>(emptyProperty());
  const [propertySaving, setPropertySaving] = useState(false);
  const [expandedTenantNoteIds, setExpandedTenantNoteIds] = useState<Set<string>>(new Set());
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!access.ready) return;
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = access.can("rooms")
        ? await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties))
        : [];
      const loadedTenants = access.can("tenants")
        ? await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms))
        : [];
      const loadedContracts = access.can("tenants")
        ? await loadBusinessData<BusinessContract>(contractKey, getInitialContracts(loadedProperties, loadedRooms, loadedTenants))
        : [];
      const loadedPayments = access.can("rent_payments")
        ? await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants))
        : [];
      const loadedDeposits = access.can("deposits")
        ? await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants))
        : [];
      const loadedExpenses = access.can("expenses")
        ? await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties))
        : [];
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setExpenses(loadedExpenses);
      setLoaded(true);
    }
    load().catch(console.error);
  }, [access.ready]);

  useEffect(() => {
    if (!access.ready || !propertyId || !access.can("attachments")) return;
    setPropertyFilesLoading(true);
    setPropertyFilesError("");
    loadPropertyFiles([propertyId]).then(setPropertyFiles).catch((error) => setPropertyFilesError(error instanceof Error ? error.message : "房源附件加载失败，请稍后重试。")).finally(() => setPropertyFilesLoading(false));
  }, [access.ready, access, propertyId]);

  const property = properties.find((item) => item.id === propertyId);
  const scopedRooms = sortRoomsByName(rooms.filter((item) => item.propertyId === propertyId));
  const scopedTenants = sortByRoomName(tenants.filter((item) => item.propertyId === propertyId), scopedRooms);
  const scopedContracts = sortByRoomName(contracts.filter((item) => item.propertyId === propertyId), scopedRooms);
  const scopedPayments = sortByRoomName(payments.filter((item) => item.propertyId === propertyId), scopedRooms);
  const scopedDeposits = sortByRoomName(deposits.filter((item) => item.propertyId === propertyId && !item.notes?.includes("[收租押金:")), scopedRooms);
  const scopedExpenses = sortByRoomName(expenses.filter((item) => item.propertyId === propertyId), scopedRooms);
  const currentTenantCount = sumOccupants(scopedTenants.filter((item) => item.status === "在租"));
  const hasOverdue = scopedPayments.some((item) => item.isOverdue);
  const calculatedMonthProfit = property ? calculatePropertyProfit(property, rooms, tenants, payments, expenses, deposits, getDateRange("thisMonth")) : null;
  const monthProfit = calculatedMonthProfit ? {
    ...calculatedMonthProfit,
    payments: sortByRoomName(calculatedMonthProfit.payments, scopedRooms),
    expenses: sortByRoomName(calculatedMonthProfit.expenses, scopedRooms)
  } : null;
  const monthlyIncome = monthProfit?.income || 0;
  const threeMonthProfit = property ? calculatePropertyProfit(property, rooms, tenants, payments, expenses, deposits, getDateRange("last3Months")) : null;
  const twelveMonthProfit = property ? calculatePropertyProfit(property, rooms, tenants, payments, expenses, deposits, getDateRange("last12Months")) : null;
  const monthlyRows = property ? monthlyProfitRows(property.id, payments, expenses, deposits, 12) : [];
  const visibleTabs = tabs.filter((item) => item.id === "overview" || item.id === "notes" || item.id === "attachments" && access.can("attachments") || item.id === "rooms" && access.can("rooms") || (item.id === "tenants" || item.id === "contracts") && access.can("tenants") || item.id === "payments" && access.can("rent_payments") || item.id === "deposits" && access.can("deposits") || item.id === "expenses" && access.can("expenses") || item.id === "profit" && access.can("profits") && access.canSensitive("canViewProfits"));

  const roomOptions = scopedRooms.map((room) => ({
    value: room.id,
    label: room.name,
    description: `编号 ${room.roomNumber} · ${room.status}`,
    keywords: room.roomNumber
  }));
  const tenantOptions = scopedTenants
    .filter((tenant) => !tenantForm.roomId || tenant.roomId === tenantForm.roomId)
    .map((tenant) => ({
      value: tenant.id,
      label: tenant.name,
      description: `${tenant.phone} · ${tenant.wechat || "无微信"}`,
      keywords: `${tenant.phone} ${tenant.wechat}`
    }));

  function remove<T extends { id: string }>(id: string, setter: (updater: (current: T[]) => T[]) => void) {
    window.alert("为避免误删真实业务数据，请到对应管理页面使用归档、退租、作废或永久删除。");
  }

  function closeEditor() {
    setEditor(null);
    setRoomForm(emptyRoom(propertyId));
    setTenantForm(emptyTenant(propertyId));
    setContractForm(emptyContract(propertyId));
    setPaymentForm(emptyPayment(propertyId));
    setDepositForm(emptyDeposit(propertyId));
    setExpenseForm(emptyExpense(propertyId));
  }

  function savePropertyNotes(notes: string) {
    if (!access.can("properties", "edit")) return;
    const next = properties.map((item) => (item.id === propertyId ? { ...item, notes } : item));
    setProperties(next);
    saveBusinessData(propertyKey, next).catch(console.error);
  }

  function openPropertyEditor() {
    if (!access.can("properties", "edit")) return;
    const current = property || emptyProperty();
    setPropertyForm({ ...current, occupancyTrackingStartDate: current.occupancyTrackingStartDate || resolvePropertyOccupancyStart(current, scopedTenants, scopedContracts, scopedPayments) || undefined });
    setPropertyEditorOpen(true);
  }

  async function saveProperty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!propertyForm.name.trim() || !access.can("properties", "edit")) return;
    setPropertySaving(true);
    const occupancyStart = propertyForm.occupancyTrackingStartDate || "";
    if (occupancyStart && (!isValidOccupancyDate(occupancyStart) || occupancyStart > new Date().toISOString().slice(0, 10))) {
      window.alert("出租率统计起始日不能晚于今天，且必须是完整日期。");
      setPropertySaving(false);
      return;
    }
    const next = properties.map((item) => item.id === propertyId ? { ...propertyForm, occupancyTrackingStartDate: occupancyStart || undefined } : item);
    try {
      await saveBusinessData(propertyKey, next);
      setProperties(next);
      setPropertyEditorOpen(false);
    } catch (error: any) {
      window.alert(error.message || "房源资料保存失败，请稍后重试。");
    } finally {
      setPropertySaving(false);
    }
  }

  async function updatePropertyNotes(nextNotes: string) {
    const next = properties.map((item) => item.id === propertyId ? { ...item, notes: nextNotes } : item);
    await saveBusinessData(propertyKey, next);
    setProperties(next);
  }

  async function archiveProperty() {
    if (!access.can("properties", "archive")) return;
    if (!window.confirm("确认归档该房源吗？归档后历史业务数据仍会保留。")) return;
    try {
      await updatePropertyNotes(markArchived(property?.notes));
    } catch (error: any) {
      window.alert(error.message || "房源归档失败，请稍后重试。");
    }
  }

  async function restoreProperty() {
    if (!access.can("properties", "archive")) return;
    try {
      await updatePropertyNotes(cleanArchiveNote(property?.notes));
    } catch (error: any) {
      window.alert(error.message || "房源恢复失败，请稍后重试。");
    }
  }

  async function permanentlyDeleteProperty() {
    if (!access.can("properties", "delete")) return;
    const related = scopedRooms.length + scopedTenants.length + scopedContracts.length + scopedPayments.length + scopedDeposits.length + scopedExpenses.length;
    if (related > 0) {
      window.alert("该房源已有业务数据，不能直接删除。你可以选择归档该房源。");
      return;
    }
    if (!window.confirm("确定要永久删除这个空房源吗？\n删除后不可恢复。")) return;
    try {
      await saveBusinessData(propertyKey, properties.filter((item) => item.id !== propertyId));
      window.location.href = "/properties";
    } catch (error: any) {
      window.alert(error.message || "房源删除失败，请稍后重试。");
    }
  }

  useEffect(() => { if (loaded) saveBusinessData(roomKey, rooms).catch(console.error); }, [loaded, rooms]);
  useEffect(() => { if (loaded) saveBusinessData(tenantKey, tenants).catch(console.error); }, [loaded, tenants]);
  useEffect(() => { if (loaded) saveBusinessData(contractKey, contracts).catch(console.error); }, [contracts, loaded]);
  useEffect(() => { if (loaded) saveBusinessData(rentPaymentKey, payments).catch(console.error); }, [loaded, payments]);
  useEffect(() => { if (loaded) saveBusinessData(depositKey, deposits).catch(console.error); }, [deposits, loaded]);
  useEffect(() => { if (loaded) saveBusinessData(expenseKey, expenses).catch(console.error); }, [expenses, loaded]);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [tab]);

  if (!property) {
    return (
      <AppLayout title="房源详情" description="未找到该房源。">
        <section className="card panel">房源不存在或已被删除。</section>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={property.name} description="查看房源摘要并管理相关业务。">
      <section className="card property-detail-header">
        <div className="property-detail-heading">
          <p title={property.address || property.city || ""}>{shortPropertyAddress(property)}</p>
          <StatusBadge tone={isArchived(property.notes) ? "amber" : "green"}>{isArchived(property.notes) ? "已归档" : "正常"}</StatusBadge>
        </div>
        <div className="property-summary-grid">
          <CompactSummary label="房间数量" value={`${scopedRooms.length} 间`} />
          <CompactSummary label="当前在租人数" value={`${currentTenantCount} 人`} />
          <CompactSummary label="本月收款" value={euro(monthlyIncome)} />
          <CompactSummary label="欠费状态" value={hasOverdue ? "有欠费" : "无欠费"} tone={hasOverdue ? "red" : "green"} />
        </div>
        <button className="property-details-toggle" type="button" aria-expanded={detailsOpen} onClick={(event) => { event.stopPropagation(); setDetailsOpen((current) => !current); }}>
          <span>{detailsOpen ? "收起详情" : "详细资料"}</span><ChevronDown size={16} className={detailsOpen ? "open" : ""} />
        </button>
        {detailsOpen ? <div className="property-details-grid">
          <DetailField label="城市" value={property.city || "-"} />
          <DetailField label="房东" value={property.landlordName || "-"} />
          <DetailField className="wide" label="完整地址" value={property.address || "-"} />
          <DetailField className="wide" label="房源备注" value={cleanArchiveNote(property.notes) || "-"} />
          <DetailField label="分租" value={property.subletAllowed ? "允许" : "不允许"} />
          <DetailField label="出租率统计起始日" value={property.occupancyTrackingStartDate || resolvePropertyOccupancyStart(property, scopedTenants, scopedContracts, scopedPayments) || "尚无入住记录"} />
        </div> : null}
        <div className="property-management-actions">
          {access.can("properties", "edit") ? <button className="btn property-management-action" type="button" onClick={openPropertyEditor}><Edit3 size={15} /> 编辑房源</button> : <span aria-hidden="true" />}
          {access.can("properties", "archive") ? (isArchived(property.notes)
            ? <button className="btn property-management-action" type="button" onClick={() => void restoreProperty()}><RotateCcw size={15} /> 恢复</button>
            : <button className="btn property-management-action" type="button" onClick={() => void archiveProperty()}><Archive size={15} /> 归档</button>) : <span aria-hidden="true" />}
          {access.can("properties", "delete") ? <button className="btn danger property-management-action" type="button" onClick={() => void permanentlyDeleteProperty()}><Trash2 size={15} /> 永久删除</button> : <span aria-hidden="true" />}
        </div>
      </section>

      <div className="tabs">
        <div className="tab-row tab-row-five">
          {visibleTabs.slice(0, 5).map((item) => <button className={`tab-button ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} ref={tab === item.id ? activeTabRef : null} type="button">{item.label}</button>)}
        </div>
        <div className="tab-row tab-row-five">
          {visibleTabs.slice(5).map((item) => <button className={`tab-button ${tab === item.id ? "active" : ""}`} key={item.id} onClick={() => setTab(item.id)} ref={tab === item.id ? activeTabRef : null} type="button">{item.label}</button>)}
        </div>
      </div>

      {tab === "overview" ? (
        <section className="card panel">
          <h2 className="panel-title">概览</h2>
          <div className="property-overview-list">
            <div className="list-item"><span>空置房间</span><strong>{scopedRooms.filter((room) => room.status === "空置").length} 间</strong></div>
            <div className="list-item"><span>即将到期合同</span><strong>{scopedContracts.filter((contract) => contract.status === "即将到期").length} 份</strong></div>
            <div className="list-item"><span>押金待处理</span><strong>{scopedDeposits.filter((deposit) => deposit.status === "待退").length} 笔</strong></div>
            <div className="list-item"><span>当前欠费租客</span><strong className={hasOverdue ? "danger-text" : "profit"}>{hasOverdue ? "有欠费" : "无欠费"}</strong></div>
            {monthProfit ? <div className="list-item"><span>本月支出</span><strong>{euro(monthProfit.expense)}</strong></div> : null}
            {monthProfit ? <div className="list-item"><span>本月利润</span><strong className={monthProfit.netProfit < 0 ? "danger-text" : "profit"}>{euro(monthProfit.netProfit)}</strong></div> : null}
          </div>
        </section>
      ) : null}

      {tab === "rooms" ? (
        <ScopedCardList title="房间" action="新增房间" onAdd={() => { setRoomForm(emptyRoom(propertyId)); setEditor("room"); }}>
          {scopedRooms.map((room) => <CompactRecordCard key={room.id} title={room.name || room.roomNumber || "未命名房间"} status={room.status} tone={room.status === "已租" ? "green" : room.status === "空置" ? "blue" : "amber"} note={room.notes} onEdit={() => { setRoomForm(room); setEditor("room"); }} onDelete={() => remove<BusinessRoom>(room.id, setRooms)}>
            <CardField label="编号" value={room.roomNumber} />
            <CardField label="月租" value={euro(room.monthlyRent)} />
            <CardField label="押金" value={euro(room.depositAmount)} />
            {scopedTenants.find((tenant) => tenant.roomId === room.id && tenant.status === "在租") ? <CardField label="当前租客" value={scopedTenants.find((tenant) => tenant.roomId === room.id && tenant.status === "在租")?.name || ""} /> : null}
          </CompactRecordCard>)}
        </ScopedCardList>
      ) : null}

      {tab === "tenants" ? (
        <ScopedCardList title="租客" action="新增租客" onAdd={() => { setTenantForm(emptyTenant(propertyId)); setEditor("tenant"); }}>
          {scopedTenants.map((tenant) => {
            const latestPayment = scopedPayments.filter((payment) => payment.tenantId === tenant.id).sort((a, b) => (b.paymentDate || b.rentMonth || "").localeCompare(a.paymentDate || a.rentMonth || ""))[0];
            return <CompactRecordCard key={tenant.id} title={tenant.name || "未命名租客"} status={tenant.status} tone={tenant.status === "在租" ? "green" : "amber"} note={tenant.notes} noteExpanded={expandedTenantNoteIds.has(tenant.id)} onToggleNote={() => setExpandedTenantNoteIds((current) => { const next = new Set(current); if (next.has(tenant.id)) next.delete(tenant.id); else next.add(tenant.id); return next; })} onEdit={() => { setTenantForm(tenant); setEditor("tenant"); }} onDelete={() => remove<BusinessTenant>(tenant.id, setTenants)}>
              <CardField label="房间" value={scopedRooms.find((room) => room.id === tenant.roomId)?.name || ""} />
              <CardField label="当前月租" value={euro(tenant.monthlyRent)} />
              {tenant.moveInDate ? <CardField label="入住日期" value={tenant.moveInDate} /> : null}
              {latestPayment ? <CardField label="最近实收" value={euro(latestPayment.amountPaid)} /> : null}
            </CompactRecordCard>;
          })}
        </ScopedCardList>
      ) : null}

      {tab === "contracts" ? (
        <ScopedCardList title="合同" action="新增合同" onAdd={() => { setContractForm(emptyContract(propertyId)); setEditor("contract"); }}>
          {scopedContracts.map((contract) => <CompactRecordCard key={contract.id} title={`${scopedRooms.find((room) => room.id === contract.roomId)?.name || ""}${scopedTenants.find((tenant) => tenant.id === contract.tenantId)?.name ? ` / ${scopedTenants.find((tenant) => tenant.id === contract.tenantId)?.name}` : ""}` || "未命名合同"} status={contract.status} tone={contract.status === "有效" ? "green" : contract.status === "即将到期" ? "amber" : "red"} note={contract.notes} onEdit={() => { setContractForm(contract); setEditor("contract"); }} onDelete={() => remove<BusinessContract>(contract.id, setContracts)}>
            <CardField label="开始日期" value={contract.startDate} />
            <CardField label="到期日期" value={contract.endDate} />
            <CardField label="月租" value={euro(contract.monthlyRent)} />
            <CardField label="押金" value={euro(contract.depositAmount)} />
          </CompactRecordCard>)}
        </ScopedCardList>
      ) : null}

      {tab === "payments" ? (
        <ScopedCardList title="收租" action="登记收款" onAdd={() => { setPaymentForm(emptyPayment(propertyId)); setEditor("payment"); }}>
          {scopedPayments.map((payment) => <CompactRecordCard key={payment.id} title={payment.rentMonth || payment.paymentDate || "未标注月份"} status={payment.isOverdue ? "欠费" : "已结清"} tone={payment.isOverdue ? "red" : "green"} note={payment.notes} onEdit={() => { setPaymentForm(payment); setEditor("payment"); }} onDelete={() => remove<BusinessRentPayment>(payment.id, setPayments)}>
            <CardField label="房间 / 租客" value={`${scopedRooms.find((room) => room.id === payment.roomId)?.name || ""}${scopedTenants.find((tenant) => tenant.id === payment.tenantId)?.name ? ` / ${scopedTenants.find((tenant) => tenant.id === payment.tenantId)?.name}` : ""}`} />
            <CardField label="应收" value={euro(payment.amountDue)} />
            <CardField label="实收" value={euro(payment.amountPaid)} />
            <CardField label="欠费" value={euro(payment.amountUnpaid)} tone={payment.amountUnpaid > 0 ? "danger" : "profit"} />
          </CompactRecordCard>)}
        </ScopedCardList>
      ) : null}

      {tab === "deposits" ? (
        <ScopedCardList title="押金" action="新增押金记录" onAdd={() => { setDepositForm(emptyDeposit(propertyId)); setEditor("deposit"); }}>
          {scopedDeposits.map((deposit) => <CompactRecordCard key={deposit.id} title={deposit.transactionDate || "未标注日期"} status={deposit.status} tone={deposit.status === "已收" ? "green" : deposit.status === "待退" ? "amber" : "blue"} note={deposit.notes} onEdit={() => { setDepositForm(deposit); setEditor("deposit"); }} onDelete={() => remove<BusinessDeposit>(deposit.id, setDeposits)}>
            <CardField label="房间" value={scopedRooms.find((room) => room.id === deposit.roomId)?.name || ""} />
            <CardField label="租客" value={scopedTenants.find((tenant) => tenant.id === deposit.tenantId)?.name || ""} />
            <CardField label="类型" value={deposit.type} />
            <CardField label="金额" value={euro(deposit.amount)} />
          </CompactRecordCard>)}
        </ScopedCardList>
      ) : null}

      {tab === "expenses" ? (
        <ScopedCardList title="支出" action="新增支出" onAdd={() => { setExpenseForm(emptyExpense(propertyId)); setEditor("expense"); }}>
          {scopedExpenses.map((expense) => <CompactRecordCard key={expense.id} title={expense.paymentDate || "未标注日期"} status={expense.isPaid ? "已支出" : "已作废"} tone={expense.isPaid ? "green" : "red"} note={expense.notes} onEdit={() => { setExpenseForm(expense); setEditor("expense"); }} onDelete={() => remove<BusinessExpense>(expense.id, setExpenses)}>
            <CardField label="项目" value={expense.category} />
            <CardField label="金额" value={euro(expense.amount)} />
            {expense.roomId ? <CardField label="房间" value={scopedRooms.find((room) => room.id === expense.roomId)?.name || ""} /> : null}
            {expense.paidBy ? <CardField label="付款归属" value={partnerLabel(expense.paidBy, partnerDirectory)} /> : null}
          </CompactRecordCard>)}
        </ScopedCardList>
      ) : null}

      {tab === "profit" && monthProfit && threeMonthProfit && twelveMonthProfit ? (
        <>
          <section className="grid property-profit-metrics">
            <Summary label="本月收款" value={euro(monthProfit.income)} />
            <Summary label="本月支出" value={euro(monthProfit.expense)} />
            <Summary label="本月净利润" value={euro(monthProfit.netProfit)} tone={monthProfit.netProfit < 0 ? "red" : "green"} />
            <Summary label="最近3个月利润" value={euro(threeMonthProfit.netProfit)} tone={threeMonthProfit.netProfit < 0 ? "red" : "green"} />
            <Summary label="最近12个月利润" value={euro(twelveMonthProfit.netProfit)} tone={twelveMonthProfit.netProfit < 0 ? "red" : "green"} />
            <Summary label="欠租金额" value={euro(monthProfit.unpaid)} tone={monthProfit.unpaid > 0 ? "red" : "green"} />
            <Summary label="入住率" value={`${monthProfit.occupancy}%`} />
            <Summary label="空置房间" value={`${monthProfit.vacantRooms} 间`} />
          </section>
          <div className="grid dashboard-panels">
            <section className="card panel">
              <h2 className="panel-title">按月收入/支出/利润</h2>
              <div className="property-monthly-list">
                {monthlyRows.map((row) => <div className="property-monthly-row" key={row.month}>
                  <strong>{row.month}</strong>
                  <div className="property-monthly-values">
                    <span>收入 <b>{euro(row.income)}</b></span>
                    <span>支出 <b>{euro(row.expense)}</b></span>
                    <span className={row.netProfit < 0 ? "danger-text" : "profit"}>利润 <b>{euro(row.netProfit)}</b></span>
                  </div>
                </div>)}
              </div>
            </section>
            <section className="card panel">
              <h2 className="panel-title">欠租与空置情况</h2>
              <div className="list" style={{ marginTop: 14 }}>
                <div className="list-item"><span>欠租金额</span><strong className={monthProfit.unpaid > 0 ? "danger-text" : ""}>{euro(monthProfit.unpaid)}</strong></div>
                <div className="list-item"><span>空置房间数</span><strong>{monthProfit.vacantRooms} 间</strong></div>
                <div className="list-item"><span>入住率</span><strong>{monthProfit.occupancy}%</strong></div>
              </div>
            </section>
          </div>
          <div className="grid dashboard-panels">
            <ScopedReadOnlyTable title="收租明细">
              <thead><tr><th>月份</th><th>房间</th><th>租客</th><th>应收</th><th>已收</th><th>未收</th><th>状态</th></tr></thead>
              <tbody>{monthProfit.payments.map((payment) => <tr key={payment.id}><td>{payment.rentMonth}</td><td>{scopedRooms.find((room) => room.id === payment.roomId)?.name || ""}</td><td>{scopedTenants.find((tenant) => tenant.id === payment.tenantId)?.name || ""}</td><td>{euro(payment.amountDue)}</td><td>{euro(payment.amountPaid)}</td><td>{euro(payment.amountUnpaid)}</td><td><StatusBadge tone={payment.amountUnpaid > 0 ? "red" : "green"}>{payment.amountUnpaid > 0 ? "欠费" : "已收清"}</StatusBadge></td></tr>)}</tbody>
            </ScopedReadOnlyTable>
            <ScopedReadOnlyTable title="支出明细">
              <thead><tr><th>付款日期</th><th>类别</th><th>金额</th><th>状态</th></tr></thead>
              <tbody>{monthProfit.expenses.map((expense) => <tr key={expense.id}><td>{expense.paymentDate || ""}</td><td>{expense.category}</td><td>{euro(expense.amount)}</td><td><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td></tr>)}</tbody>
            </ScopedReadOnlyTable>
          </div>
        </>
      ) : null}

      {tab === "attachments" ? (
        <section className="card panel property-attachments-panel">
          <div className="panel-header"><div><h2 className="panel-title">房源附件</h2><p className="muted">保存整套房源相关的合同、保险、证明和其它资料。</p></div><FileText size={22} /></div>
          {access.can("attachments", "create") && access.canSensitive("canUploadFiles") ? <AttachmentAddControl label="房源附件" onAdd={async (file) => { const uploaded = await uploadPropertyFile(propertyId, file); setPropertyFiles((current) => [uploaded, ...current]); }} /> : null}
          {propertyFilesLoading ? <p className="muted">正在加载房源附件…</p> : null}
          {propertyFilesError ? <p className="error-text">{propertyFilesError}</p> : null}
          {!propertyFilesLoading && !propertyFiles.length ? <p className="muted">暂无房源附件。</p> : null}
          <div className="attachment-list">
            {propertyFiles.map((file) => <div className="attachment-preview attachment-file-card" key={file.id}>
              <FileText size={16} /><span>{file.fileName} · {file.fileSize ? formatPropertyFileSize(file.fileSize) : ""}</span>
              <button className="btn" type="button" onClick={() => void openPropertyFile(file)}><Eye size={15} /> 查看</button>
              {access.canSensitive("canDownloadFiles") ? <button className="btn" type="button" onClick={() => void downloadPropertyFile(file)}><Download size={15} /> 下载</button> : null}
              {access.can("attachments", "delete") && access.canSensitive("canDeleteFiles") ? <button className="btn danger" type="button" onClick={() => { if (!window.confirm("确定要删除这个房源附件吗？")) return; void deletePropertyFile(file).then(() => setPropertyFiles((current) => current.filter((item) => item.id !== file.id))).catch((error) => window.alert(error instanceof Error ? error.message : "删除房源附件失败，请稍后重试。")); }}><Trash2 size={15} /> 删除</button> : null}
            </div>)}
          </div>
        </section>
      ) : null}

      {tab === "notes" ? (
        <section className="card panel property-notes-panel">
          <h2 className="panel-title">房源备注</h2>
          <textarea className="notes-editor" value={property.notes || ""} readOnly={!access.can("properties", "edit")} onChange={(event) => savePropertyNotes(event.target.value)} placeholder="记录这套房子的特殊情况、房东沟通、维修注意事项等。" />
        </section>
      ) : null}

      {propertyEditorOpen ? <div className="modal-backdrop" onMouseDown={() => setPropertyEditorOpen(false)}>
        <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
          <div className="panel-header"><h2 className="panel-title">编辑房源</h2><button className="btn" type="button" onClick={() => setPropertyEditorOpen(false)}><X size={17} /> 关闭</button></div>
          <form className="form-grid" onSubmit={saveProperty}>
            <Text label="房源名称" value={propertyForm.name} onChange={(name) => setPropertyForm((current) => ({ ...current, name }))} />
            <Text label="地址" value={propertyForm.address} onChange={(address) => setPropertyForm((current) => ({ ...current, address }))} />
            <Text label="城市" value={propertyForm.city} onChange={(city) => setPropertyForm((current) => ({ ...current, city }))} />
            <Text label="房东姓名" value={propertyForm.landlordName || ""} onChange={(landlordName) => setPropertyForm((current) => ({ ...current, landlordName }))} />
            <div className="field"><label>是否允许分租</label><select value={propertyForm.subletAllowed ? "yes" : "no"} onChange={(event) => setPropertyForm((current) => ({ ...current, subletAllowed: event.target.value === "yes" }))}><option value="yes">允许</option><option value="no">不允许</option></select></div>
            <div className="field"><label>出租率统计起始日</label><input type="date" max={new Date().toISOString().slice(0, 10)} value={propertyForm.occupancyTrackingStartDate || ""} onChange={(event) => setPropertyForm((current) => ({ ...current, occupancyTrackingStartDate: event.target.value || undefined }))} /><span className="muted">{property?.occupancyTrackingStartDate ? "已保存的房源起算日。" : resolvePropertyOccupancyStart(property || emptyProperty(), scopedTenants, scopedContracts, scopedPayments) ? "系统默认：从本房源首次入住月份的1号开始计算。可根据实际开始出租日期修改；该房源全部房间统一使用此日期。" : "尚无入住记录，可手动设置开始日期。"}</span></div>
            <Note value={cleanArchiveNote(propertyForm.notes)} onChange={(notes) => setPropertyForm((current) => ({ ...current, notes }))} />
            <div className="modal-actions"><button className="btn" type="button" onClick={() => setPropertyEditorOpen(false)}>取消</button><button className="btn primary" disabled={propertySaving} type="submit">保存</button></div>
          </form>
        </section>
      </div> : null}

      {editor ? (
        <PropertyEditor
          editor={editor}
          roomForm={roomForm}
          setRoomForm={setRoomForm}
          tenantForm={tenantForm}
          setTenantForm={setTenantForm}
          contractForm={contractForm}
          setContractForm={setContractForm}
          paymentForm={paymentForm}
          setPaymentForm={setPaymentForm}
          depositForm={depositForm}
          setDepositForm={setDepositForm}
          expenseForm={expenseForm}
          setExpenseForm={setExpenseForm}
          rooms={scopedRooms}
          tenants={scopedTenants}
          onClose={closeEditor}
          onSave={() => {
            if (editor === "room") upsert(roomForm, setRooms);
            if (editor === "tenant") {
              const previousTenant = tenantForm.id ? tenants.find((tenant) => tenant.id === tenantForm.id) || null : null;
              const nextTenant = tenantForm.id ? tenantForm : { ...tenantForm, id: crypto.randomUUID() };
              const nextTenants = tenantForm.id
                ? tenants.map((tenant) => (tenant.id === tenantForm.id ? nextTenant : tenant))
                : [nextTenant, ...tenants];
              setTenants(nextTenants);
              setRooms(syncRoomsAfterTenantChange(rooms, nextTenants, previousTenant, nextTenant));
            }
            if (editor === "contract") upsert(contractForm, setContracts);
            if (editor === "payment") upsert(paymentForm, setPayments);
            if (editor === "deposit") upsert(depositForm, setDeposits);
            if (editor === "expense") upsert(expenseForm, setExpenses);
            closeEditor();
          }}
        />
      ) : null}
    </AppLayout>
  );
}

function PropertyEditor(props: any) {
  const activeRoomId =
    props.editor === "tenant"
      ? props.tenantForm.roomId
      : props.editor === "contract"
        ? props.contractForm.roomId
        : props.editor === "payment"
          ? props.paymentForm.roomId
          : props.editor === "deposit"
            ? props.depositForm.roomId
            : "";
  const tenantOptions = props.tenants
    .filter((tenant: BusinessTenant) => !activeRoomId || tenant.roomId === activeRoomId)
    .map((tenant: BusinessTenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }));
  const roomOptions = props.rooms.map((room: BusinessRoom) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }));
  const editorTitles: Record<string, string> = { room: "房间", tenant: "租客", contract: "合同", payment: "收租", deposit: "押金", expense: "支出" };

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (props.editor === "tenant" && (!Number.isInteger(props.tenantForm.occupantCount) || props.tenantForm.occupantCount < 1)) {
      window.alert("入住人数请输入1或更大的正整数。");
      return;
    }
    props.onSave();
  }

  return (
    <div className="modal-backdrop" onMouseDown={props.onClose}>
      <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header">
          <h2 className="panel-title">编辑{editorTitles[props.editor]}</h2>
          <button className="btn" onClick={props.onClose} type="button"><X size={17} /> 关闭</button>
        </div>
        <form className="form-grid" onSubmit={save}>
          {props.editor === "room" ? <RoomFields form={props.roomForm} setForm={props.setRoomForm} /> : null}
          {props.editor === "tenant" ? <TenantFields form={props.tenantForm} setForm={props.setTenantForm} roomOptions={roomOptions} /> : null}
          {props.editor === "contract" ? <ContractFields form={props.contractForm} setForm={props.setContractForm} roomOptions={roomOptions} tenantOptions={tenantOptions} /> : null}
          {props.editor === "payment" ? <PaymentFields form={props.paymentForm} setForm={props.setPaymentForm} roomOptions={roomOptions} tenantOptions={tenantOptions} tenants={props.tenants} /> : null}
          {props.editor === "deposit" ? <DepositFields form={props.depositForm} setForm={props.setDepositForm} roomOptions={roomOptions} tenantOptions={tenantOptions} tenants={props.tenants} /> : null}
          {props.editor === "expense" ? <ExpenseFields form={props.expenseForm} setForm={props.setExpenseForm} /> : null}
          <div className="modal-actions"><button className="btn" onClick={props.onClose} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
        </form>
      </section>
    </div>
  );
}

function RoomFields({ form, setForm }: { form: BusinessRoom; setForm: (updater: (current: BusinessRoom) => BusinessRoom) => void }) {
  return <><Text label="房间名称" value={form.name} onChange={(name) => setForm((c) => ({ ...c, name }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c) => ({ ...c, depositAmount }))} /><SearchableSelect label="状态" value={form.status} options={["空置", "已租", "预订中", "即将退租", "维修中", "暂停出租"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c) => ({ ...c, status: status as BusinessRoom["status"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c) => ({ ...c, notes }))} /></>;
}

function TenantFields({ form, setForm, roomOptions }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessTenant) => ({ ...c, roomId }))} /><Text label="姓名" value={form.name} onChange={(name) => setForm((c: BusinessTenant) => ({ ...c, name }))} /><Text label="电话" value={form.phone} onChange={(phone) => setForm((c: BusinessTenant) => ({ ...c, phone }))} /><Text label="微信" value={form.wechat} onChange={(wechat) => setForm((c: BusinessTenant) => ({ ...c, wechat }))} /><div className="field"><label>入住人数</label><input inputMode="numeric" min="1" step="1" type="number" value={form.occupantCount} onChange={(event) => setForm((c: BusinessTenant) => ({ ...c, occupantCount: event.target.value === "" ? 1 : Number(event.target.value) }))} /></div><SearchableSelect label="状态" value={form.status} options={["在租", "预定入住", "已退房"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessTenant) => ({ ...c, status: status as BusinessTenant["status"] }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c: BusinessTenant) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c: BusinessTenant) => ({ ...c, depositAmount }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessTenant) => ({ ...c, notes }))} /></>;
}

function ContractFields({ form, setForm, roomOptions, tenantOptions }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessContract) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => setForm((c: BusinessContract) => ({ ...c, tenantId }))} /><Text label="开始日期" type="date" value={form.startDate} onChange={(startDate) => setForm((c: BusinessContract) => ({ ...c, startDate }))} /><Text label="结束日期" type="date" value={form.endDate} onChange={(endDate) => setForm((c: BusinessContract) => ({ ...c, endDate }))} /><NumberInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((c: BusinessContract) => ({ ...c, monthlyRent }))} /><NumberInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((c: BusinessContract) => ({ ...c, depositAmount }))} /><SearchableSelect label="状态" value={form.status} options={["有效", "即将到期", "已结束"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessContract) => ({ ...c, status: status as BusinessContract["status"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessContract) => ({ ...c, notes }))} /></>;
}

function PaymentFields({ form, setForm, roomOptions, tenantOptions, tenants }: any) {
  function updateMoney(patch: Partial<BusinessRentPayment>) {
    setForm((current: BusinessRentPayment) => {
      const next = { ...current, ...patch };
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - Number(next.amountPaid || 0), 0);
      return { ...next, amountUnpaid, isOverdue: amountUnpaid > 0 };
    });
  }
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessRentPayment) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => { const tenant = tenants.find((t: BusinessTenant) => t.id === tenantId); updateMoney({ tenantId, amountDue: tenant?.monthlyRent || form.amountDue, amountPaid: 0 }); }} /><Text label="月份" value={form.rentMonth} onChange={(rentMonth) => setForm((c: BusinessRentPayment) => ({ ...c, rentMonth }))} /><NumberInput label="应收金额" value={form.amountDue} onChange={(amountDue) => updateMoney({ amountDue })} /><NumberInput label="已收金额" value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} /><Text label="未收金额" value={String(form.amountUnpaid)} readOnly onChange={() => {}} /><SearchableSelect label="付款方式" value={form.paymentMethod} options={["现金", "转账", "Bizum", "其他"].map((v) => ({ value: v, label: v }))} onChange={(paymentMethod) => setForm((c: BusinessRentPayment) => ({ ...c, paymentMethod: paymentMethod as BusinessRentPayment["paymentMethod"] }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessRentPayment) => ({ ...c, notes }))} /></>;
}

function DepositFields({ form, setForm, roomOptions, tenantOptions, tenants }: any) {
  return <><SearchableSelect label="房间" value={form.roomId} options={roomOptions} onChange={(roomId) => setForm((c: BusinessDeposit) => ({ ...c, roomId, tenantId: "" }))} /><SearchableSelect label="租客" value={form.tenantId} options={tenantOptions} onChange={(tenantId) => { const tenant = tenants.find((t: BusinessTenant) => t.id === tenantId); setForm((c: BusinessDeposit) => ({ ...c, tenantId, amount: tenant?.depositAmount || c.amount })); }} /><SearchableSelect label="类型" value={form.type} options={["收取", "退还", "扣除"].map((v) => ({ value: v, label: v }))} onChange={(type) => setForm((c: BusinessDeposit) => ({ ...c, type: type as BusinessDeposit["type"] }))} /><NumberInput label="金额" value={form.amount} onChange={(amount) => setForm((c: BusinessDeposit) => ({ ...c, amount }))} /><SearchableSelect label="状态" value={form.status} options={["已收", "待退", "已退", "部分扣除"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessDeposit) => ({ ...c, status: status as BusinessDeposit["status"] }))} /><Text label="日期" type="date" value={form.transactionDate} onChange={(transactionDate) => setForm((c: BusinessDeposit) => ({ ...c, transactionDate }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessDeposit) => ({ ...c, notes }))} /></>;
}

function ExpenseFields({ form, setForm }: any) {
  return <><Text label="月份" value={form.expenseMonth} onChange={(expenseMonth) => setForm((c: BusinessExpense) => ({ ...c, expenseMonth }))} /><SearchableSelect label="类别" value={form.category} options={["房东租金", "维修", "清洁", "家具", "日用品", "税费", "杂费", "其他"].map((v) => ({ value: v, label: v }))} onChange={(category) => setForm((c: BusinessExpense) => ({ ...c, category }))} /><NumberInput label="金额" value={form.amount} onChange={(amount) => setForm((c: BusinessExpense) => ({ ...c, amount }))} /><Text label="付款日期" type="date" value={form.paymentDate} onChange={(paymentDate) => setForm((c: BusinessExpense) => ({ ...c, paymentDate }))} /><SearchableSelect label="状态" value={form.isPaid ? "已支付" : "未支付"} options={["已支付", "未支付"].map((v) => ({ value: v, label: v }))} onChange={(status) => setForm((c: BusinessExpense) => ({ ...c, isPaid: status === "已支付" }))} /><Note value={form.notes} onChange={(notes) => setForm((c: BusinessExpense) => ({ ...c, notes }))} /></>;
}

function ScopedCardList({ title, action, onAdd, children }: { title: string; action: string; onAdd: () => void; children: React.ReactNode }) {
  const access = useAccountAccess();
  const moduleKey: AccountModuleKey = title === "房间" ? "rooms" : title === "租客" || title === "合同" ? "tenants" : title === "收租" ? "rent_payments" : title === "押金" ? "deposits" : "expenses";
  return <ScopedModuleContext.Provider value={moduleKey}><section className="card panel compact-card-section"><div className="panel-header"><h2 className="panel-title">{title}</h2>{access.can(moduleKey, "create") ? <button className="btn primary" onClick={onAdd} type="button"><Plus size={17} /> {action}</button> : null}</div><div className="compact-card-list">{children}</div></section></ScopedModuleContext.Provider>;
}

function CompactRecordCard({ title, status, tone, note, noteExpanded = false, onToggleNote, onEdit, onDelete, children }: { title: string; status: string; tone?: string; note?: string; noteExpanded?: boolean; onToggleNote?: () => void; onEdit: () => void; onDelete: () => void; children: React.ReactNode }) {
  return <article className="compact-record-card">
    <div className="compact-record-heading"><strong>{title}</strong><StatusBadge tone={tone === "danger" ? "red" : tone === "profit" ? "green" : tone as any}>{status}</StatusBadge></div>
    <div className="compact-record-grid">{children}</div>
    {note?.trim() ? note.length > 60 && onToggleNote ? <button className={`compact-record-note-toggle${noteExpanded ? " is-expanded" : ""}`} aria-expanded={noteExpanded} aria-label={noteExpanded ? "收起完整备注" : "展开完整备注"} onClick={(event) => { event.stopPropagation(); onToggleNote(); }} type="button"><span>{note}</span><small>{noteExpanded ? "收起" : "展开"}</small></button> : <p className="compact-record-note" title={note}>{note}</p> : null}
    <RowActions onEdit={onEdit} onDelete={onDelete} />
  </article>;
}

function CardField({ label, value, tone }: { label: string; value?: string; tone?: string }) {
  if (!value?.trim()) return null;
  return <div className="compact-record-field"><span>{label}</span><strong className={tone === "danger" ? "danger-text" : tone === "profit" ? "profit" : ""}>{value}</strong></div>;
}

function ScopedReadOnlyTable({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card panel"><h2 className="panel-title">{title}</h2><div className="table-wrap"><table>{children}</table></div></section>;
}

function RowActions({ onEdit, onDelete, canEdit = true, canDelete = true }: { onEdit: () => void; onDelete: () => void; canEdit?: boolean; canDelete?: boolean }) {
  const access = useAccountAccess();
  const moduleKey = useContext(ScopedModuleContext);
  const showEdit = canEdit && access.can(moduleKey, "edit");
  const showDelete = canDelete && access.can(moduleKey, "delete");
  if (!showEdit && !showDelete) return null;
  return <div className="top-actions">{showEdit ? <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button> : null}{showDelete ? <button className="btn danger" onClick={onDelete} type="button"><Trash2 size={15} /> 删除</button> : null}</div>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <section className="card metric-card"><div className="metric-label">{label}</div><div className={`metric-value ${tone === "red" ? "danger-text" : tone === "green" ? "profit" : ""}`}>{value}</div></section>;
}

function CompactSummary({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="property-summary-item"><span>{label}</span><strong className={tone === "red" ? "danger-text" : tone === "green" ? "profit" : ""}>{value}</strong></div>;
}

function DetailField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  if (!value || value === "-") return null;
  return <div className={`property-detail-field ${className}`}><span>{label}</span><strong>{value}</strong></div>;
}

function Text({ label, value, onChange, type = "text", readOnly }: { label: string; value: string; onChange: (value: string) => void; type?: string; readOnly?: boolean }) {
  return <div className="field"><label>{label}</label><input readOnly={readOnly} type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <MoneyInput label={label} value={value} onChange={onChange} />;
}

function Note({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  return <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}

function emptyProperty(): BusinessProperty {
  return { id: "", name: "", address: "", city: "", landlordName: "", subletAllowed: true, notes: "", occupancyTrackingStartDate: undefined };
}

function markArchived(notes?: string) {
  const clean = cleanArchiveNote(notes);
  return clean ? `[已归档] ${clean}` : "[已归档]";
}

function isArchived(notes?: string) {
  return Boolean(notes?.includes("[已归档]"));
}

function cleanArchiveNote(notes?: string) {
  return (notes || "").replace("[已归档]", "").trim();
}

function shortPropertyAddress(property: BusinessProperty) {
  return property.address || property.city || "-";
}

function upsert<T extends { id: string }>(record: T, setter: (updater: (current: T[]) => T[]) => void) {
  setter((current) => record.id ? current.map((item) => item.id === record.id ? record : item) : [{ ...record, id: crypto.randomUUID() }, ...current]);
}

function syncRoomsAfterTenantChange(
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  previousTenant: BusinessTenant | null,
  nextTenant: BusinessTenant
) {
  const touchedRoomIds = new Set([previousTenant?.roomId, nextTenant.roomId].filter(Boolean));
  return rooms.map((room) => {
    if (!touchedRoomIds.has(room.id)) return room;
    const hasActiveTenant = tenants.some((tenant) => tenant.roomId === room.id && isActiveTenant(tenant));
    if (hasActiveTenant) return { ...room, status: "已租" };
    if (["已租", "预订中", "即将退租"].includes(room.status)) return { ...room, status: "空置" };
    return room;
  });
}

function isActiveTenant(tenant: BusinessTenant) {
  return !["已退租", "空置", "已归档"].some((status) => tenant.status?.includes(status));
}

function emptyRoom(propertyId: string): BusinessRoom { return { id: "", propertyId, name: "", roomNumber: "", monthlyRent: 0, depositAmount: 0, status: "空置", notes: "" }; }
function emptyTenant(propertyId: string): BusinessTenant { return { id: "", propertyId, roomId: "", name: "", phone: "", wechat: "", source: "其他", monthlyRent: 0, depositAmount: 0, occupantCount: 1, status: "在租", notes: "" }; }
function emptyContract(propertyId: string): BusinessContract { return { id: "", propertyId, roomId: "", tenantId: "", startDate: "", endDate: "", monthlyRent: 0, depositAmount: 0, status: "有效", notes: "" }; }
function emptyPayment(propertyId: string): BusinessRentPayment { return { id: "", propertyId, roomId: "", tenantId: "", incomeType: "房租收入", incomeItem: "", rentMonth: new Date().toISOString().slice(0, 7), amountDue: 0, amountPaid: 0, amountUnpaid: 0, paymentMethod: "转账", receivedBy: "", isOverdue: false, notes: "" }; }
function emptyDeposit(propertyId: string): BusinessDeposit { return { id: "", propertyId, roomId: "", tenantId: "", type: "收取", amount: 0, status: "已收", transactionDate: "", receivedBy: "", paidBy: "", notes: "" }; }
function emptyExpense(propertyId: string): BusinessExpense { return { id: "", propertyId, expenseMonth: "2026-06", category: "房东租金", amount: 0, paymentDate: "", paidBy: "", isPaid: true, notes: "" }; }
