"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  rentPaymentKey,
  roomKey,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import {
  ContractFile,
  deleteContractFile,
  downloadContractFile,
  formatFileSize,
  loadContractFiles,
  openContractFile,
  uploadContractFile
} from "@/lib/contract-files";
import { euro } from "@/lib/format";
import { deleteRentPaymentFile, loadRentPaymentFiles, uploadRentPaymentFile } from "@/lib/rent-payment-files";
import { coverageLabel, isCoverageExpired, latestCoverageForTenant, monthEnd, monthStart } from "@/lib/rent-coverage";
import { supabase } from "@/lib/supabase";
import { Archive, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const tenantStatuses = ["在租", "空置"];
const partnerOptions = ["A", "B"];
const maxAttachmentSize = 5 * 1024 * 1024;
type TenantSortKey = "expiry" | "rent" | "property" | "status";

const emptyTenant: BusinessTenant = {
  id: "",
  propertyId: "",
  roomId: "",
  name: "",
  phone: "",
  wechat: "",
  source: "其他",
  monthlyRent: 0,
  depositAmount: 0,
  status: "在租",
  notes: ""
};

const currentMonth = new Date().toISOString().slice(0, 7);
const emptyTenantPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  rentMonth: currentMonth,
  paymentDate: today(),
  amountDue: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  coverageStartDate: today(),
  coverageEndDate: monthEnd(currentMonth),
  paymentMethod: "转账",
  receivedBy: "A",
  paymentStatus: "已收",
  isOverdue: false,
  notes: ""
};

export default function TenantsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [form, setForm] = useState<BusinessTenant>(emptyTenant);
  const [contractForm, setContractForm] = useState({ startDate: today(), endDate: "" });
  const [paymentForm, setPaymentForm] = useState<BusinessRentPayment>(emptyTenantPayment);
  const [pendingContractFile, setPendingContractFile] = useState<File | null>(null);
  const [pendingPaymentFile, setPendingPaymentFile] = useState<File | null>(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<TenantSortKey>("expiry");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailTenantId, setDetailTenantId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setContractFiles(await loadContractFiles(loadedContracts.map((contract) => contract.id)));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载租客失败：${error.message || error}`));
  }, []);

  useEffect(() => {
    async function loadAdmin() {
      const { data } = await supabase?.auth.getUser() || { data: { user: null } };
      const email = data.user?.email?.toLowerCase() || "";
      const admins = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "5350499@qq.com")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
      setIsAdmin(Boolean(email && admins.includes(email)));
    }
    loadAdmin().catch(() => setIsAdmin(false));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filesByContract = useMemo(() => contractFiles.reduce<Record<string, ContractFile[]>>((map, file) => {
    map[file.contractId] = [...(map[file.contractId] || []), file];
    return map;
  }, {}), [contractFiles]);

  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const visible = tenants.filter((tenant) => showArchived || !isArchivedTenant(tenant));
    if (!keyword) return visible;
    return visible.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      const fileNames = getTenantFiles(tenant.id, contracts, filesByContract).map((file) => file.fileName).join(" ");
      const displayStatus = tenantDisplayStatus(tenant, payments);
      return `${tenant.name} ${tenant.phone} ${tenant.wechat} ${property?.name || ""} ${room?.name || ""} ${tenant.status} ${displayStatus} ${fileNames}`.toLowerCase().includes(keyword);
    });
  }, [contracts, filesByContract, payments, properties, query, rooms, showArchived, tenants]);

  const sortedTenants = useMemo(() => {
    return [...filteredTenants].sort((left, right) => {
      const leftProperty = properties.find((item) => item.id === left.propertyId)?.name || "";
      const rightProperty = properties.find((item) => item.id === right.propertyId)?.name || "";
      const leftContract = latestContractForTenant(left.id, contracts);
      const rightContract = latestContractForTenant(right.id, contracts);
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "rent") return (left.monthlyRent - right.monthlyRent) * direction;
      if (sortKey === "property") return leftProperty.localeCompare(rightProperty, "zh-Hans-CN") * direction;
      if (sortKey === "status") return tenantDisplayStatus(left, payments).localeCompare(tenantDisplayStatus(right, payments), "zh-Hans-CN") * direction;
      return (expirySortValue(leftContract?.endDate) - expirySortValue(rightContract?.endDate)) * direction;
    });
  }, [contracts, filteredTenants, payments, properties, sortDirection, sortKey]);

  const visibleTenants = pageRows(sortedTenants, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyTenant);
    setContractForm({ startDate: today(), endDate: "" });
    setPaymentForm(emptyTenantPayment);
    setPendingContractFile(null);
    setPendingPaymentFile(null);
    setAttachmentsOpen(false);
  }

  function openTenantForm(tenant?: BusinessTenant) {
    if (!tenant) {
      setForm(emptyTenant);
      setContractForm({ startDate: today(), endDate: "" });
      setPaymentForm(emptyTenantPayment);
      setPendingContractFile(null);
      setPendingPaymentFile(null);
      setAttachmentsOpen(false);
      setOpen(true);
      return;
    }
    const contract = latestContractForTenant(tenant.id, contracts);
    const latestPayment = latestCoverageForTenant(tenant.id, payments);
    setForm(tenant);
    setContractForm({ startDate: contract?.startDate || today(), endDate: contract?.endDate || "" });
    setPaymentForm(latestPayment ? { ...latestPayment } : {
      ...emptyTenantPayment,
      propertyId: tenant.propertyId,
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amountDue: tenant.monthlyRent
    });
    setPendingContractFile(null);
    setPendingPaymentFile(null);
    setAttachmentsOpen(false);
    setOpen(true);
  }

  function toggleSort(nextKey: TenantSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDirection("asc");
    }
    setPage(1);
  }

  async function persistAll(next: {
    tenants?: BusinessTenant[];
    rooms?: BusinessRoom[];
    contracts?: BusinessContract[];
    deposits?: BusinessDeposit[];
    payments?: BusinessRentPayment[];
  }) {
    setSaving(true);
    try {
      if (next.tenants) await saveBusinessData(tenantKey, next.tenants);
      if (next.rooms) await saveBusinessData(roomKey, next.rooms);
      if (next.contracts) await saveBusinessData(contractKey, next.contracts);
      if (next.deposits) await saveBusinessData(depositKey, next.deposits);
      if (next.payments) await saveBusinessData(rentPaymentKey, next.payments);
      if (next.tenants) setTenants(next.tenants);
      if (next.rooms) setRooms(next.rooms);
      if (next.contracts) setContracts(next.contracts);
      if (next.deposits) setDeposits(next.deposits);
      if (next.payments) setPayments(next.payments);
    } catch (error: any) {
      window.alert(error.message || "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.name.trim()) return;
    try {
      const previousTenant = form.id ? tenants.find((tenant) => tenant.id === form.id) || null : null;
      const nextTenant = form.id ? form : { ...form, id: crypto.randomUUID() };
      const next = form.id
        ? tenants.map((tenant) => (tenant.id === form.id ? nextTenant : tenant))
        : [nextTenant, ...tenants];
      const nextRooms = syncRoomsAfterTenantChange(rooms, next, previousTenant, nextTenant);
      const currentContract = latestContractForTenant(nextTenant.id, contracts);
      const nextContract: BusinessContract = currentContract
        ? {
            ...currentContract,
            propertyId: nextTenant.propertyId,
            roomId: nextTenant.roomId,
            tenantId: nextTenant.id,
            startDate: contractForm.startDate,
            endDate: contractForm.endDate,
            monthlyRent: nextTenant.monthlyRent,
            depositAmount: nextTenant.depositAmount,
            status: currentContract.status || "有效",
            notes: nextTenant.notes || currentContract.notes || ""
          }
        : {
            id: crypto.randomUUID(),
            propertyId: nextTenant.propertyId,
            roomId: nextTenant.roomId,
            tenantId: nextTenant.id,
            startDate: contractForm.startDate,
            endDate: contractForm.endDate,
            monthlyRent: nextTenant.monthlyRent,
            depositAmount: nextTenant.depositAmount,
            status: "有效",
            notes: nextTenant.notes || ""
          };
      const nextContracts = currentContract
        ? contracts.map((contract) => (contract.id === currentContract.id ? nextContract : contract))
        : [nextContract, ...contracts];
      const nextPayment = buildTenantPayment(nextTenant, paymentForm);
      const nextPayments = nextPayment.id && payments.some((payment) => payment.id === nextPayment.id)
        ? payments.map((payment) => (payment.id === nextPayment.id ? nextPayment : payment))
        : [nextPayment, ...payments];
      await persistAll({ tenants: next, rooms: nextRooms, contracts: nextContracts, payments: nextPayments });
      if (pendingContractFile) {
        const uploaded = await uploadContractFile(nextContract.id, pendingContractFile);
        setContractFiles((current) => [uploaded, ...current.filter((file) => file.contractId !== nextContract.id)]);
      }
      if (pendingPaymentFile) await uploadRentPaymentFile(nextPayment.id, pendingPaymentFile);
    } catch (error: any) {
      window.alert(error.message || "保存租客、收款或附件失败，请稍后重试。");
      return;
    }
    close();
  }

  async function moveOut(tenant: BusinessTenant) {
    if (!window.confirm("确认办理退租吗？\n会保留历史收租、押金、利润和合同附件，并把房间设为空置、合同设为已结束。")) return;
    const depositStatus = window.prompt("押金状态请输入：已退 或 待退", "待退") === "已退" ? "已退" : "待退";
    const nextTenants = tenants.map((item) => (item.id === tenant.id ? { ...item, status: "已退租" } : item));
    await persistAll({
      tenants: nextTenants,
      rooms: syncRoomsAfterTenantRemoval(rooms, nextTenants, tenant.roomId),
      contracts: contracts.map((contract) => (contract.tenantId === tenant.id ? { ...contract, status: "已结束" } : contract)),
      deposits: deposits.map((deposit) => (deposit.tenantId === tenant.id ? { ...deposit, status: depositStatus } : deposit))
    });
  }

  async function archiveTenant(tenant: BusinessTenant) {
    if (!window.confirm("确认归档该租客吗？\n归档后默认隐藏，历史收租、押金、利润和合同附件都会保留。")) return;
    await persistAll({
      tenants: tenants.map((item) => (item.id === tenant.id ? { ...item, status: "已归档" } : item))
    });
    setDetailTenantId("");
  }

  async function restoreTenant(tenant: BusinessTenant) {
    const restoredTenant = { ...tenant, status: "在租" };
    const nextTenants = tenants.map((item) => (item.id === tenant.id ? restoredTenant : item));
    await persistAll({
      tenants: nextTenants,
      rooms: syncRoomsAfterTenantChange(rooms, nextTenants, tenant, restoredTenant)
    });
  }

  async function permanentlyDeleteTenant(tenant: BusinessTenant) {
    if (!isAdmin) return;
    const confirmText = window.prompt(
      "⚠️ 此操作不可恢复\n\n将删除：\n- 租客资料\n- 收租记录\n- 押金记录\n- 合同记录\n- 合同附件\n- 收款附件\n\n请输入 DELETE 确认永久删除。"
    );
    if (confirmText !== "DELETE") return;
    setSaving(true);
    try {
      const tenantContracts = contracts.filter((contract) => contract.tenantId === tenant.id);
      const tenantContractIds = tenantContracts.map((contract) => contract.id);
      const tenantPayments = payments.filter((payment) => payment.tenantId === tenant.id);
      const tenantPaymentIds = tenantPayments.map((payment) => payment.id);
      const contractFilesToDelete = contractFiles.filter((file) => tenantContractIds.includes(file.contractId));
      let paymentFilesToDelete: Awaited<ReturnType<typeof loadRentPaymentFiles>> = [];
      try {
        paymentFilesToDelete = await loadRentPaymentFiles(tenantPaymentIds);
      } catch {
        paymentFilesToDelete = [];
      }

      for (const file of contractFilesToDelete) await deleteContractFile(file);
      for (const file of paymentFilesToDelete) await deleteRentPaymentFile(file);

      const nextTenants = tenants.filter((item) => item.id !== tenant.id);
      const nextContracts = contracts.filter((contract) => contract.tenantId !== tenant.id);
      const nextPayments = payments.filter((payment) => payment.tenantId !== tenant.id);
      const nextDeposits = deposits.filter((deposit) => deposit.tenantId !== tenant.id);
      const nextRooms = syncRoomsAfterTenantRemoval(rooms, nextTenants, tenant.roomId);

      await saveBusinessData(tenantKey, nextTenants);
      await saveBusinessData(contractKey, nextContracts);
      await saveBusinessData(rentPaymentKey, nextPayments);
      await saveBusinessData(depositKey, nextDeposits);
      await saveBusinessData(roomKey, nextRooms);

      setTenants(nextTenants);
      setContracts(nextContracts);
      setPayments(nextPayments);
      setDeposits(nextDeposits);
      setRooms(nextRooms);
      setContractFiles((current) => current.filter((file) => !tenantContractIds.includes(file.contractId)));
      setDetailTenantId("");
    } catch (error: any) {
      window.alert(error.message || "永久删除租客失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function replaceTenantContractFile(tenant: BusinessTenant, file?: File) {
    if (!file) return;
    const contract = latestContractForTenant(tenant.id, contracts);
    if (!contract) {
      window.alert("该租客还没有合同记录，请先通过一键入住创建合同后再上传合同附件。");
      return;
    }
    if (!validateContractFile(file)) return;
    setSaving(true);
    try {
      const existing = filesByContract[contract.id] || [];
      for (const item of existing) await deleteContractFile(item);
      const uploaded = await uploadContractFile(contract.id, file);
      setContractFiles((current) => [uploaded, ...current.filter((item) => item.contractId !== contract.id)]);
    } catch (error: any) {
      window.alert(error.message || "替换合同附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function chooseContractFile(file?: File) {
    if (!file || !validateContractFile(file)) return;
    setPendingContractFile(file);
  }

  function choosePaymentFile(file?: File) {
    if (!file || !validateContractFile(file)) return;
    setPendingPaymentFile(file);
  }

  function updatePaymentMoney(patch: Partial<BusinessRentPayment>) {
    setPaymentForm((current) => {
      const next = { ...current, ...patch };
      const amountPaid = next.paymentStatus === "未收" ? 0 : Number(next.amountPaid || 0);
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - amountPaid, 0);
      return { ...next, amountPaid, amountUnpaid, isOverdue: isCoverageExpired(next) };
    });
  }

  async function removeContractFile(file: ContractFile) {
    if (!window.confirm("确定要删除这个合同附件吗？")) return;
    setSaving(true);
    try {
      await deleteContractFile(file);
      setContractFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error: any) {
      window.alert(error.message || "删除合同附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="租客管理" description="默认显示核心信息，点击租客后直接查看和管理合同附件。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">租客列表</h2>
            <p className="muted">默认只显示一行核心信息，点击后展开详情和合同附件。</p>
          </div>
          <div className="top-actions">
            <button className="btn" onClick={() => setShowArchived((current) => !current)} type="button">
              {showArchived ? "隐藏归档" : "显示归档"}
            </button>
            <button className="btn primary" disabled={!loaded || saving} onClick={() => openTenantForm()} type="button">
              <Plus size={17} /> 新增租客
            </button>
          </div>
        </div>

        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索姓名、电话、微信、房源、房间、合同附件" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="sort-pills">
            <SortButton active={sortKey === "expiry"} direction={sortDirection} label="到期日" onClick={() => toggleSort("expiry")} />
            <SortButton active={sortKey === "rent"} direction={sortDirection} label="月租" onClick={() => toggleSort("rent")} />
            <SortButton active={sortKey === "property"} direction={sortDirection} label="房源" onClick={() => toggleSort("property")} />
            <SortButton active={sortKey === "status"} direction={sortDirection} label="状态" onClick={() => toggleSort("status")} />
          </div>
        </div>

        <div className="finance-list tenant-compact-list">
          {visibleTenants.map((tenant) => {
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const files = getTenantFiles(tenant.id, contracts, filesByContract);
            const contract = latestContractForTenant(tenant.id, contracts);
            const expiry = getExpiryInfo(contract?.endDate);
            const coveragePayment = latestCoverageForTenant(tenant.id, payments);
            const displayStatus = tenantDisplayStatus(tenant, payments);
            const expanded = detailTenantId === tenant.id;
            return (
              <article className="finance-list-item" key={tenant.id}>
                <button className="finance-line tenant-finance-line" onClick={() => setDetailTenantId(expanded ? "" : tenant.id)} type="button">
                  <span>{tenant.name || "-"}</span>
                  <span>{property?.name || "-"}-{room?.name || "-"}</span>
                  <strong>{euro(tenant.monthlyRent)}</strong>
                  <StatusBadge tone={tenantTone(displayStatus)}>{displayStatus}</StatusBadge>
                  <StatusBadge tone={expiry.tone}>{expiry.label}</StatusBadge>
                </button>
                {expanded ? (
                  <TenantDetail
                    contract={contract}
                    coverageEnd={coverageLabel(coveragePayment)}
                    payments={payments.filter((payment) => payment.tenantId === tenant.id)}
                    files={files}
                    isAdmin={isAdmin}
                    onDeleteFile={removeContractFile}
                    onArchive={() => archiveTenant(tenant)}
                    onPermanentDelete={() => permanentlyDeleteTenant(tenant)}
                    onEdit={() => {
                      openTenantForm(tenant);
                    }}
                    onMoveOut={() => moveOut(tenant)}
                    onReplaceFile={(file) => replaceTenantContractFile(tenant, file)}
                    onRestore={() => restoreTenant(tenant)}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    saving={saving}
                    tenant={tenant}
                  />
                ) : null}
              </article>
            );
          })}
        </div>

        <PaginationControls page={page} pageSize={pageSize} total={filteredTenants.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">{form.id ? "编辑租客" : "新增租客"}</h2>
              <button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect
                label="房源"
                value={form.propertyId}
                options={properties.map((property) => ({
                  value: property.id,
                  label: property.name,
                  description: `${property.city} ｜ ${property.address}`,
                  keywords: `${property.address} ${property.city}`
                }))}
                onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))}
                placeholder="搜索房源名称、地址、城市"
              />
              <SearchableSelect
                label="房间"
                value={form.roomId}
                disabled={!form.propertyId}
                options={availableRooms.map((room) => ({
                  value: room.id,
                  label: room.name,
                  description: `编号 ${room.roomNumber} ｜ ${room.status}`,
                  keywords: room.roomNumber
                }))}
                onChange={(roomId) => setForm((current) => ({ ...current, roomId }))}
                placeholder="先选房源，再搜索房间名称、编号"
              />
              <TextField label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="电话（可选）" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <MoneyInput label="月租金额" value={form.monthlyRent} onChange={(monthlyRent) => {
                setForm((current) => ({ ...current, monthlyRent }));
                updatePaymentMoney({ amountDue: monthlyRent });
              }} />
              <MoneyInput label="本次实收金额" value={paymentForm.amountPaid} onChange={(amountPaid) => updatePaymentMoney({ amountPaid, paymentStatus: amountPaid > 0 ? "已收" : "未收" })} />
              <MoneyInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={paymentForm.coverageStartDate || ""} onChange={(event) => updatePaymentMoney({ coverageStartDate: event.target.value, rentMonth: event.target.value.slice(0, 7) })} /></div>
              <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={paymentForm.coverageEndDate || ""} onChange={(event) => updatePaymentMoney({ coverageEndDate: event.target.value })} /></div>
              <SearchableSelect label="收款归属" value={paymentForm.receivedBy || "A"} options={partnerOptions.map((partner) => ({ value: partner, label: partner }))} onChange={(receivedBy) => updatePaymentMoney({ receivedBy })} />
              <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>备注</label>
                <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
                <button className="btn soft attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)}>
                  <span><FileUp size={16} /> 附件管理</span>
                  <span className="muted">{attachmentsOpen ? "收起" : "展开"}</span>
                </button>
                {attachmentsOpen ? (
                  <div className="attachment-sections">
                    <div className="attachment-subsection">
                      <label>合同附件 PDF/JPG/PNG</label>
                      <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseContractFile(event.target.files?.[0])} />
                      {pendingContractFile ? (
                        <div className="attachment-preview">
                          <FileUp size={16} />
                          <span>{pendingContractFile.name} ｜ {formatFileSize(pendingContractFile.size)}</span>
                          <button className="btn danger" type="button" onClick={() => setPendingContractFile(null)}>移除</button>
                        </div>
                      ) : <p className="muted">保存后可在租客展开详情里查看、下载、替换或删除合同。</p>}
                    </div>
                    <div className="attachment-subsection">
                      <label>收款附件 PDF/JPG/PNG</label>
                      <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => choosePaymentFile(event.target.files?.[0])} />
                      {pendingPaymentFile ? (
                        <div className="attachment-preview">
                          <FileUp size={16} />
                          <span>{pendingPaymentFile.name} ｜ {formatFileSize(pendingPaymentFile.size)}</span>
                          <button className="btn danger" type="button" onClick={() => setPendingPaymentFile(null)}>移除</button>
                        </div>
                      ) : <p className="muted">这笔收款凭证会绑定到租客的收款记录。</p>}
                    </div>
                  </div>
                ) : (
                  <p className="muted">合同和收款凭证默认隐藏，需要时再展开上传。</p>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={close} type="button">取消</button>
                <button className="btn primary" disabled={saving} type="submit">保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function TenantDetail({
  tenant,
  contract,
  coverageEnd,
  payments,
  propertyName,
  roomName,
  files,
  isAdmin,
  onArchive,
  saving,
  onDeleteFile,
  onEdit,
  onMoveOut,
  onPermanentDelete,
  onReplaceFile,
  onRestore
}: {
  tenant: BusinessTenant;
  contract?: BusinessContract | null;
  coverageEnd: string;
  payments: BusinessRentPayment[];
  propertyName: string;
  roomName: string;
  files: ContractFile[];
  isAdmin: boolean;
  saving: boolean;
  onArchive: () => void;
  onDeleteFile: (file: ContractFile) => void;
  onEdit: () => void;
  onMoveOut: () => void;
  onPermanentDelete: () => void;
  onReplaceFile: (file?: File) => void;
  onRestore: () => void;
}) {
  const archived = isArchivedTenant(tenant);
  return (
    <div className="record-detail-panel tenant-detail-panel">
      <div className="detail-grid">
        <DetailField label="房源/房间" value={`${propertyName} / ${roomName}`} />
        <DetailField label="电话" value={tenant.phone || "-"} />
        <DetailField label="微信" value={tenant.wechat || "-"} />
        <DetailField label="月租标准" value={euro(tenant.monthlyRent)} />
        <DetailField label="押金" value={euro(tenant.depositAmount)} />
        <DetailField label="入住日期" value={contract?.startDate || "-"} />
        <DetailField label="合同到期" value={contract?.endDate || "-"} />
        <DetailField label="租金已覆盖至" value={coverageEnd} />
        <DetailField label="最近一次实收" value={euro(latestCoverageForTenant(tenant.id, payments)?.amountPaid || 0)} />
        <DetailField label="来源" value={tenant.source || "-"} />
        <DetailField label="备注" value={tenant.notes || "-"} />
      </div>

      <div className="attachment-panel">
        <div className="detail-section-title">收款记录</div>
        <div className="settlement-detail-list">
          {[...payments]
            .sort((a, b) => (b.coverageEndDate || b.rentMonth).localeCompare(a.coverageEndDate || a.rentMonth))
            .slice(0, 5)
            .map((payment) => (
              <div className="settlement-detail-line readonly" key={payment.id}>
                <span>{payment.paymentDate || payment.rentMonth}</span>
                <b className={`partner-tag partner-${(payment.receivedBy || "A").toLowerCase()}`}>{payment.receivedBy || "A"}</b>
                <span>至 {payment.coverageEndDate || payment.rentMonth}</span>
                <strong>{euro(payment.amountPaid)}</strong>
              </div>
            ))}
          {!payments.length ? <span className="muted">暂无收款记录</span> : null}
        </div>
      </div>

      <div className="attachment-panel">
        <div className="detail-section-title">合同附件</div>
        <TenantAttachmentActions files={files} onDelete={onDeleteFile} />
        <label className="btn file-action-button">
          <FileUp size={15} /> 替换合同
          <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => onReplaceFile(event.target.files?.[0])} />
        </label>
        <p className="muted">支持 PDF、JPG、PNG，单个文件不超过 5MB。</p>
      </div>

      <div className="top-actions detail-actions">
        <button className="btn" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑</button>
        {archived ? (
          <button className="btn" disabled={saving} type="button" onClick={onRestore}><Archive size={15} /> 恢复</button>
        ) : (
          <>
            <button className="btn" disabled={saving} type="button" onClick={onMoveOut}><Archive size={15} /> 退租</button>
            <button className="btn" disabled={saving} type="button" onClick={onArchive}><Archive size={15} /> 归档</button>
          </>
        )}
        {isAdmin ? (
          <button className="btn danger" disabled={saving} type="button" onClick={onPermanentDelete}><Trash2 size={15} /> 永久删除</button>
        ) : null}
      </div>
    </div>
  );
}

function TenantAttachmentActions({ files, onDelete }: { files: ContractFile[]; onDelete: (file: ContractFile) => void }) {
  if (!files.length) return <span className="muted">暂无合同附件</span>;
  return (
    <div className="attachment-list compact-attachment-list">
      {files.map((file) => (
        <div className="attachment-preview" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} ｜ {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openContractFile(file)}><Eye size={15} /> 查看</button>
          <button className="btn" type="button" onClick={() => downloadContractFile(file)}><Download size={15} /> 下载</button>
          <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button>
        </div>
      ))}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function SortButton({ active, direction, label, onClick }: { active: boolean; direction: "asc" | "desc"; label: string; onClick: () => void }) {
  return (
    <button className={`sort-pill ${active ? "active" : ""}`} onClick={onClick} type="button">
      {label}{active ? direction === "asc" ? " ↑" : " ↓" : ""}
    </button>
  );
}

function latestContractForTenant(tenantId: string, contracts: BusinessContract[]) {
  if (!tenantId) return null;
  return contracts
    .filter((contract) => contract.tenantId === tenantId)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0] || null;
}

function getTenantFiles(tenantId: string, contracts: BusinessContract[], filesByContract: Record<string, ContractFile[]>) {
  if (!tenantId) return [];
  return contracts
    .filter((contract) => contract.tenantId === tenantId)
    .flatMap((contract) => filesByContract[contract.id] || []);
}

function tenantTone(status: string) {
  if (status.includes("欠")) return "red";
  if (status.includes("退")) return "red";
  if (status.includes("预")) return "amber";
  return "green";
}

function tenantDisplayStatus(tenant: BusinessTenant, payments: BusinessRentPayment[]) {
  const hasDebt = isCoverageExpired(latestCoverageForTenant(tenant.id, payments));
  if (hasDebt) return "欠租";
  return tenant.status || "在租";
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

function syncRoomsAfterTenantRemoval(rooms: BusinessRoom[], tenants: BusinessTenant[], roomId: string) {
  return rooms.map((room) => {
    if (room.id !== roomId) return room;
    const hasActiveTenant = tenants.some((tenant) => tenant.roomId === room.id && isActiveTenant(tenant));
    if (hasActiveTenant) return { ...room, status: "已租" };
    if (["已租", "预订中", "即将退租"].includes(room.status)) return { ...room, status: "空置" };
    return room;
  });
}

function isActiveTenant(tenant: BusinessTenant) {
  return !["已退租", "空置", "已归档"].some((status) => tenant.status?.includes(status));
}

function isArchivedTenant(tenant: BusinessTenant) {
  return tenant.status === "已归档";
}

function getExpiryInfo(endDate?: string) {
  if (!endDate) return { label: "未设置", tone: "blue" as const };
  const diff = daysBetween(today(), endDate);
  if (diff < 0) return { label: `已到期${Math.abs(diff)}天`, tone: "red" as const };
  if (diff < 30) return { label: `${diff}天`, tone: "red" as const };
  if (diff <= 90) return { label: `${diff}天`, tone: "amber" as const };
  return { label: `${diff}天`, tone: "green" as const };
}

function expirySortValue(endDate?: string) {
  if (!endDate) return Number.MAX_SAFE_INTEGER;
  return daysBetween(today(), endDate);
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function buildTenantPayment(tenant: BusinessTenant, draft: BusinessRentPayment): BusinessRentPayment {
  const rentMonth = (draft.coverageStartDate || today()).slice(0, 7);
  const amountPaid = draft.paymentStatus === "未收" ? 0 : Number(draft.amountPaid || 0);
  const next: BusinessRentPayment = {
    ...draft,
    id: draft.id || crypto.randomUUID(),
    propertyId: tenant.propertyId,
    roomId: tenant.roomId,
    tenantId: tenant.id,
    rentMonth,
    paymentDate: draft.paymentDate || today(),
    amountDue: Number(draft.amountDue || tenant.monthlyRent || 0),
    amountPaid,
    amountUnpaid: Math.max(Number(draft.amountDue || tenant.monthlyRent || 0) - amountPaid, 0),
    coverageStartDate: draft.coverageStartDate || monthStart(rentMonth),
    coverageEndDate: draft.coverageEndDate || monthEnd(rentMonth),
    paymentMethod: draft.paymentMethod || "转账",
    receivedBy: draft.receivedBy || "A",
    paymentStatus: draft.paymentStatus || (amountPaid > 0 ? "已收" : "未收"),
    isOverdue: false,
    notes: draft.notes || tenant.notes || ""
  };
  return { ...next, isOverdue: isCoverageExpired(next) };
}

function validateContractFile(file: File) {
  if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
    window.alert("只支持 PDF、JPG、PNG 文件。");
    return false;
  }
  if (file.size > maxAttachmentSize) {
    window.alert("合同附件不能超过 5MB。");
    return false;
  }
  return true;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
