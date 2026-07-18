"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { MoneyInput } from "@/components/money-input";
import { OwnershipField } from "@/components/ownership-field";
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
import { coverageLabel, fixedCoverageExpiryInfo, isCoverageExpired, latestCoverageForTenant, monthEnd, monthStart, repairMissingTenantMonthlyRents, strictCurrentRentalTenant } from "@/lib/rent-coverage";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import { updateTenantCurrentAssignment } from "@/lib/tenant-room-move";
import { Archive, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const tenantStatuses = ["在租", "空置"];
const maxAttachmentSize = 5 * 1024 * 1024;
type TenantSortKey = "priority" | "expiry" | "rent" | "property" | "status";

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
  paymentDay: 20,
  status: "在租",
  notes: ""
};

const currentMonth = new Date().toISOString().slice(0, 7);
const emptyTenantPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  incomeType: "房租收入",
  incomeItem: "",
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
  const access = useAccountAccess();
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
  const [propertyFilterId, setPropertyFilterId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<TenantSortKey>("priority");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailTenantId, setDetailTenantId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState<"A" | "B" | "自定义">("A");
  const [customReceivedBy, setCustomReceivedBy] = useState("");

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
      const repairedTenants = repairMissingTenantMonthlyRents(loadedTenants, loadedPayments);
      if (repairedTenants !== loadedTenants) {
        try {
          await saveBusinessData(tenantKey, repairedTenants);
        } catch (error: any) {
          throw new Error(`月租标准修复写回失败：${error.message || error}`);
        }
      }
      setTenants(repairedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setContractFiles(await loadContractFiles(loadedContracts.map((contract) => contract.id)));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载租客失败：${error.message || error}`));
  }, []);

  useEffect(() => {
    if (!searchOpen) return;

    function closeSearchOnOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && searchBoxRef.current?.contains(target)) return;
      setSearchOpen(false);
    }

    document.addEventListener("pointerdown", closeSearchOnOutside);
    return () => document.removeEventListener("pointerdown", closeSearchOnOutside);
  }, [searchOpen]);

  useEffect(() => {
    setPage(1);
  }, [propertyFilterId, query]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filesByContract = useMemo(() => contractFiles.reduce<Record<string, ContractFile[]>>((map, file) => {
    map[file.contractId] = [...(map[file.contractId] || []), file];
    return map;
  }, {}), [contractFiles]);

  const propertyOptions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return properties.filter((property) => {
      if (!keyword) return true;
      return [property.name, property.address, property.city].join(" ").toLowerCase().includes(keyword);
    });
  }, [properties, query]);

  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const visible = tenants.filter((tenant) => showArchived || !isArchivedTenant(tenant));
    const propertyVisible = propertyFilterId
      ? visible.filter((tenant) => tenant.propertyId === propertyFilterId)
      : visible;
    if (!keyword) return propertyVisible;
    return propertyVisible.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      const fileNames = getTenantFiles(tenant.id, contracts, filesByContract).map((file) => file.fileName).join(" ");
      const displayStatus = tenantDisplayStatus(tenant, payments);
      return [tenant.name, tenant.phone, tenant.wechat, property?.name || "", room?.name || "", room?.roomNumber || "", tenant.status, displayStatus, fileNames].join(" ").toLowerCase().includes(keyword);
    });
  }, [contracts, filesByContract, payments, properties, propertyFilterId, query, rooms, showArchived, tenants]);


  const sortedTenants = useMemo(() => {
    return [...filteredTenants].sort((left, right) => {
      const leftProperty = properties.find((item) => item.id === left.propertyId)?.name || "";
      const rightProperty = properties.find((item) => item.id === right.propertyId)?.name || "";
      const leftCoverage = latestCoverageForTenant(left.id, payments);
      const rightCoverage = latestCoverageForTenant(right.id, payments);
      const leftExpiry = fixedCoverageExpiryInfo(left, leftCoverage);
      const rightExpiry = fixedCoverageExpiryInfo(right, rightCoverage);
      const direction = sortDirection === "asc" ? 1 : -1;
      if (sortKey === "priority") return compareTenantPriority(left, right, leftExpiry, rightExpiry, leftProperty, rightProperty, rooms) * direction;
      if (sortKey === "rent") return (left.monthlyRent - right.monthlyRent) * direction;
      if (sortKey === "property") return compareTenantProperty(left, right, leftProperty, rightProperty, rooms) * direction;
      if (sortKey === "status") return compareTenantStatus(left, right, leftExpiry, rightExpiry, payments) * direction;
      return compareExpiryDates(leftCoverage?.coverageEndDate, rightCoverage?.coverageEndDate, direction);
    });
  }, [filteredTenants, payments, properties, rooms, sortDirection, sortKey]);

  const visibleTenants = pageRows(sortedTenants, page, pageSize);

  function selectPropertyFilter(property: BusinessProperty) {
    setPropertyFilterId(property.id);
    setQuery(property.name);
    setSearchOpen(false);
  }

  function updateTenantSearch(value: string) {
    setQuery(value);
    if (propertyFilterId) {
      const selected = properties.find((property) => property.id === propertyFilterId);
      if (value !== selected?.name) setPropertyFilterId("");
    }
    setSearchOpen(true);
  }

  function clearTenantSearch() {
    setQuery("");
    setPropertyFilterId("");
    setSearchOpen(false);
  }

  function close() {
    setOpen(false);
    setForm(emptyTenant);
    setContractForm({ startDate: today(), endDate: "" });
    setPaymentForm(emptyTenantPayment);
    setOwnershipMode("A");
    setCustomReceivedBy("");
    setPendingContractFile(null);
    setPendingPaymentFile(null);
    setAttachmentsOpen(false);
  }

  function openTenantForm(tenant?: BusinessTenant) {
    if (!tenant) {
      setForm(emptyTenant);
      setContractForm({ startDate: today(), endDate: "" });
      setPaymentForm(emptyTenantPayment);
      setOwnershipMode("A");
      setCustomReceivedBy("");
      setPendingContractFile(null);
      setPendingPaymentFile(null);
      setAttachmentsOpen(false);
      setOpen(true);
      return;
    }
    const contract = latestContractForTenant(tenant.id, contracts);
    const latestPayment = latestCoverageForTenant(tenant.id, payments);
    const legacyDeposit = latestPayment ? linkedDepositAmount(latestPayment.id, deposits) : 0;
    const latestDeposit = latestPayment ? legacyDeposit || Math.max(Number(latestPayment.amountPaid || 0) - Number(latestPayment.amountDue || 0), 0) : 0;
    const mode = ownershipChoice(latestPayment?.receivedBy);
    setForm(tenant);
    setContractForm({ startDate: contract?.startDate || today(), endDate: contract?.endDate || "" });
    setPaymentForm(latestPayment ? { ...latestPayment, amountDue: Math.max(Number(latestPayment.amountPaid || 0) - latestDeposit, 0) } : {
      ...emptyTenantPayment,
      propertyId: tenant.propertyId,
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amountDue: 0
    });
    setOwnershipMode(mode);
    setCustomReceivedBy(mode === "自定义" ? customOwnershipName(latestPayment?.receivedBy) : "");
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
    if (form.paymentDay != null && (!Number.isInteger(form.paymentDay) || form.paymentDay < 1 || form.paymentDay > 31)) {
      window.alert("每月缴费日请输入1到31，或留空表示不设置。");
      return;
    }
    if (ownershipMode === "自定义" && !customReceivedBy.trim()) {
      window.alert("请填写自定义归属名称。");
      return;
    }
    try {
      const previousTenant = form.id ? tenants.find((tenant) => tenant.id === form.id) || null : null;
      if (form.id) {
        if (!previousTenant) throw new Error("租客不存在，请刷新后重试。");
        setSaving(true);
        await updateTenantCurrentAssignment(form);
        const [loadedTenants, loadedRooms] = await Promise.all([
          loadBusinessData<BusinessTenant>(tenantKey, tenants),
          loadBusinessData<BusinessRoom>(roomKey, rooms)
        ]);
        setTenants(loadedTenants);
        setRooms(loadedRooms);

        const currentContract = latestContractForTenant(form.id, contracts);
        if (pendingContractFile && currentContract) {
          const uploaded = await uploadContractFile(currentContract.id, pendingContractFile);
          setContractFiles((current) => [uploaded, ...current.filter((file) => file.contractId !== currentContract.id)]);
        }
        if (pendingPaymentFile && paymentForm.id) await uploadRentPaymentFile(paymentForm.id, pendingPaymentFile);
        close();
        return;
      }

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
      const nextPayment = buildTenantPayment(nextTenant, { ...paymentForm, receivedBy: ownershipMode === "自定义" ? customReceivedBy.trim() : ownershipMode }, nextTenant.depositAmount);
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
    } finally {
      setSaving(false);
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
    if (!access.can("tenants", "delete")) return;
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

      // Delete child records before deleting the tenant row, otherwise FK rules block the tenant delete.
      await saveBusinessData(rentPaymentKey, nextPayments);
      await saveBusinessData(depositKey, nextDeposits);
      await saveBusinessData(contractKey, nextContracts);
      await saveBusinessData(tenantKey, nextTenants);
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
      const amountUnpaid = next.paymentStatus === "未收" ? Number(next.amountDue || 0) : 0;
      return { ...next, amountUnpaid, isOverdue: isCoverageExpired(next) };
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
            {access.can("tenants", "create") ? <button className="btn primary" disabled={!loaded || saving} onClick={() => openTenantForm()} type="button">
              <Plus size={17} /> 新增租客
            </button> : null}
          </div>
        </div>

        <div className="list-controls">
          <div className="tenant-search-box search-box" ref={searchBoxRef}>
            <input
              autoComplete="off"
              onChange={(event) => updateTenantSearch(event.target.value)}
              onFocus={() => setSearchOpen(true)}
              placeholder="搜索姓名、电话、微信、房源、房间、合同附件"
              value={query}
            />
            {query ? (
              <button aria-label="清除搜索和房源筛选" className="icon-button" onClick={clearTenantSearch} type="button">
                <X size={15} />
              </button>
            ) : null}
            {searchOpen ? (
              <div className="tenant-property-menu" role="listbox">
                {propertyOptions.length ? (
                  propertyOptions.map((property) => (
                    <button
                      className="tenant-property-option"
                      key={property.id}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectPropertyFilter(property);
                      }}
                      type="button"
                    >
                      <strong title={property.name}>{compactPropertyName(property.name)}</strong>
                      <span title={property.address || property.city || "-"}>{property.address || property.city || "-"}</span>
                    </button>
                  ))
                ) : (
                  <div className="tenant-property-empty">没有匹配的房源</div>
                )}
              </div>
            ) : null}
          </div>
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
            const displayStatus = tenantDisplayStatus(tenant, payments);
            const depositStatus = tenantDepositStatus(tenant, deposits);
            const expiryInfo = fixedCoverageExpiryInfo(tenant, latestCoverageForTenant(tenant.id, payments));
            const expanded = detailTenantId === tenant.id;
            return (
              <article className="finance-list-item" key={tenant.id}>
                <button className="finance-line tenant-finance-line" onClick={() => setDetailTenantId(expanded ? "" : tenant.id)} type="button">
                  <span className="tenant-name">{tenant.name || "-"}</span>
                  <span className="tenant-property-short" title={property?.name || "-"}>{compactPropertyName(property?.name)}</span>
                  <span className="tenant-room-short" title={room?.name || room?.roomNumber || "-"}>{compactRoomName(room)}</span>
                  <strong className="tenant-rent">{euro(tenant.monthlyRent || 0)}</strong>
                  <StatusBadge tone={tenantTone(displayStatus)}>{displayStatus}</StatusBadge>
                  <StatusBadge tone={depositStatus.includes("已退") ? "green" : "amber"}>{depositStatus}</StatusBadge>
                </button>
                {expiryInfo.label ? (
                  <div className={`tenant-expiry-row ${expiryInfo.level}`}>
                    <span className="tenant-expiry-dot" aria-hidden="true" />
                    <strong>{expiryInfo.label}</strong>
                    <span className="tenant-expiry-date">覆盖至 {expiryInfo.endDate}</span>
                  </div>
                ) : null}
                {expanded ? (
                  <TenantDetail
                    contract={contract}
                    coverageEnd={coverageLabel(latestCoverageForTenant(tenant.id, payments))}
                    coverageExpiry={expiryInfo.label}
                    payments={payments.filter((payment) => payment.tenantId === tenant.id)}
                    deposits={deposits.filter((deposit) => deposit.tenantId === tenant.id)}
                    files={files}
                    isAdmin={access.can("tenants", "delete")}
                    canEdit={access.can("tenants", "edit")}
                    canArchive={access.can("tenants", "archive")}
                    canCollectRent={access.can("rent_payments", "create")}
                    canViewFiles={access.can("attachments") && access.canSensitive("canViewContractFiles")}
                    canDownloadFiles={access.canSensitive("canDownloadFiles")}
                    canReplaceFiles={access.can("attachments", "edit") && access.canSensitive("canReplaceFiles")}
                    canDeleteFiles={access.can("attachments", "delete") && access.canSensitive("canDeleteFiles")}
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
                onChange={(roomId) => {
                  const room = rooms.find((item) => item.id === roomId);
                  setForm((current) => current.id
                    ? { ...current, roomId }
                    : { ...current, roomId, monthlyRent: room?.monthlyRent || 0, depositAmount: room?.depositAmount || current.depositAmount });
                }}
                placeholder="先选房源，再搜索房间名称、编号"
              />
              <TextField label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="电话（可选）" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <div className="field"><label>房间月租（只读）</label><input readOnly value={euro(form.monthlyRent)} /></div>
              <MoneyInput label="本次房租金额" value={paymentForm.amountDue} onChange={(amountDue) => updatePaymentMoney({ amountDue, paymentStatus: amountDue > 0 ? "已收" : paymentForm.paymentStatus })} />
              <MoneyInput label="押金金额" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <div className="field"><label>本次合计收入</label><input readOnly value={euro(Number(paymentForm.amountDue || 0) + Number(form.depositAmount || 0))} /></div>
              <div className="field"><label>每月缴费日（可选）</label><input inputMode="numeric" max="31" min="1" placeholder="不设置可留空" type="number" value={form.paymentDay ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentDay: event.target.value === "" ? undefined : Number(event.target.value) }))} /></div>
              <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={paymentForm.coverageStartDate || ""} onChange={(event) => updatePaymentMoney({ coverageStartDate: event.target.value, rentMonth: event.target.value.slice(0, 7) })} /></div>
              <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={paymentForm.coverageEndDate || ""} onChange={(event) => updatePaymentMoney({ coverageEndDate: event.target.value })} /></div>
              <OwnershipField mode={ownershipMode} customName={customReceivedBy} onModeChange={(mode) => {
                setOwnershipMode(mode);
                if (mode !== "自定义") setCustomReceivedBy("");
              }} onCustomNameChange={setCustomReceivedBy} />
              <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>备注</label>
                <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              {access.can("attachments", form.id ? "edit" : "create") && access.canSensitive(form.id ? "canReplaceFiles" : "canUploadFiles") ? <div className="field collapsible-attachments" style={{ gridColumn: "1 / -1" }}>
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
              </div> : null}
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
  coverageExpiry,
  payments,
  deposits,
  propertyName,
  roomName,
  files,
  isAdmin,
  canEdit,
  canArchive,
  canCollectRent,
  canViewFiles,
  canDownloadFiles,
  canReplaceFiles,
  canDeleteFiles,
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
  coverageExpiry: string;
  payments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  propertyName: string;
  roomName: string;
  files: ContractFile[];
  isAdmin: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canCollectRent: boolean;
  canViewFiles: boolean;
  canDownloadFiles: boolean;
  canReplaceFiles: boolean;
  canDeleteFiles: boolean;
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
  const receivedDeposit = collectedDepositForTenant(payments, deposits);
  return (
    <div className="record-detail-panel tenant-detail-panel">
      <div className="detail-grid">
        {coverageExpiry ? <DetailField label={"\u8ddd\u79bb\u79df\u91d1\u5230\u671f"} value={coverageExpiry} /> : null}
        <DetailField label="房源/房间" value={`${propertyName} / ${roomName}`} />
        <DetailField label="电话" value={tenant.phone || "-"} />
        <DetailField label="微信" value={tenant.wechat || "-"} />
        <DetailField label="月租标准" value={euro(tenant.monthlyRent)} />
        <DetailField label="押金标准 / 应收押金" value={euro(tenant.depositAmount)} />
        <DetailField label="已收押金" value={euro(receivedDeposit)} />
        <DetailField label="每月缴费日" value={tenant.paymentDay ? `每月${tenant.paymentDay}号` : "未设置"} />
        <DetailField label="入住日期" value={contract?.startDate || "-"} />
        <DetailField label="合同到期" value={contract?.endDate || "-"} />
        <DetailField label="租金已覆盖至" value={coverageEnd} />
        <DetailField label="最近一次实收" value={euro(latestCoverageForTenant(tenant.id, payments)?.amountPaid || 0)} />
        <DetailField label="来源" value={tenant.source || "-"} />
        <DetailField label="备注" value={tenant.notes || "-"} />
      </div>

      <div className="attachment-panel">
        <div className="detail-section-title">完整收款历史（{payments.length}笔）</div>
        <div className="settlement-detail-list">
          {[...payments]
            .sort((a, b) => (b.paymentDate || b.coverageEndDate || b.rentMonth).localeCompare(a.paymentDate || a.coverageEndDate || a.rentMonth))
            .map((payment) => {
              const legacyDeposit = linkedDepositAmount(payment.id, deposits);
              const rentPayment = isTenantRentPayment(payment);
              const deposit = rentPayment ? legacyDeposit || Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0) : 0;
              const rent = Number(payment.amountDue || 0);
              return (
                <div className="payment-history-line" key={payment.id}>
                  <span>{payment.paymentDate || payment.rentMonth}</span>
                  <b className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy)}</b>
                  <span>{rentPayment ? "房租" : payment.incomeItem || payment.incomeType || "收入"} {euro(rent)}</span>
                  <span>押金 {euro(deposit)}</span>
                  <strong>实收 {euro(payment.amountPaid)}</strong>
                </div>
              );
            })}
          {!payments.length ? <span className="muted">暂无收款记录</span> : null}
        </div>
      </div>

      {canViewFiles ? <div className="attachment-panel">
        <div className="detail-section-title">合同附件</div>
        <TenantAttachmentActions files={files} onDelete={onDeleteFile} canDownload={canDownloadFiles} canDelete={canDeleteFiles} />
        {canReplaceFiles ? <label className="btn file-action-button">
          <FileUp size={15} /> 替换合同
          <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => onReplaceFile(event.target.files?.[0])} />
        </label> : null}
        <p className="muted">支持 PDF、JPG、PNG，单个文件不超过 5MB。</p>
      </div> : null}

      <div className="top-actions detail-actions">
        {canCollectRent ? <a className="btn primary" href={`/rent-payments?renewTenantId=${tenant.id}`}>续交房租</a> : null}
        {canEdit ? <button className="btn" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑</button> : null}
        {canArchive && archived ? (
          <button className="btn" disabled={saving} type="button" onClick={onRestore}><Archive size={15} /> 恢复</button>
        ) : canArchive ? (
          <>
            <button className="btn" disabled={saving} type="button" onClick={onMoveOut}><Archive size={15} /> 退租</button>
            <button className="btn" disabled={saving} type="button" onClick={onArchive}><Archive size={15} /> 归档</button>
          </>
        ) : null}
        {isAdmin ? (
          <button className="btn danger" disabled={saving} type="button" onClick={onPermanentDelete}><Trash2 size={15} /> 永久删除</button>
        ) : null}
      </div>
    </div>
  );
}

function TenantAttachmentActions({ files, onDelete, canDownload = true, canDelete = true }: { files: ContractFile[]; onDelete: (file: ContractFile) => void; canDownload?: boolean; canDelete?: boolean }) {
  if (!files.length) return <span className="muted">暂无合同附件</span>;
  return (
    <div className="attachment-list compact-attachment-list">
      {files.map((file) => (
        <div className="attachment-preview" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} ｜ {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openContractFile(file)}><Eye size={15} /> 查看</button>
          {canDownload ? <button className="btn" type="button" onClick={() => downloadContractFile(file)}><Download size={15} /> 下载</button> : null}
          {canDelete ? <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button> : null}
        </div>
      ))}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function linkedDepositAmount(paymentId: string, deposits: BusinessDeposit[]) {
  return Number(deposits.find((deposit) => deposit.notes?.includes(`[收租押金:${paymentId}]`))?.amount || 0);
}

function isTenantRentPayment(payment: BusinessRentPayment) {
  return !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
}

function collectedDepositForTenant(payments: BusinessRentPayment[], deposits: BusinessDeposit[]) {
  return payments
    .filter((payment) => isTenantRentPayment(payment) && !payment.notes?.includes("[已作废]"))
    .reduce((total, payment) => {
      const legacyDeposit = linkedDepositAmount(payment.id, deposits);
      const deposit = legacyDeposit || Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0);
      return total + deposit;
    }, 0);
}

function SortButton({ active, direction, label, onClick }: { active: boolean; direction: "asc" | "desc"; label: string; onClick: () => void }) {
  return (
    <button className={`sort-pill ${active ? "active" : ""}`} onClick={onClick} type="button">
      {label}{active ? direction === "asc" ? " ↑" : " ↓" : ""}
    </button>
  );
}

function compareTenantPriority(
  left: BusinessTenant,
  right: BusinessTenant,
  leftExpiry: ReturnType<typeof fixedCoverageExpiryInfo>,
  rightExpiry: ReturnType<typeof fixedCoverageExpiryInfo>,
  leftProperty: string,
  rightProperty: string,
  rooms: BusinessRoom[]
) {
  const groupDifference = leftExpiry.sortGroup - rightExpiry.sortGroup;
  if (groupDifference) return groupDifference;
  const leftEnd = leftExpiry.endDate || "9999-12-31";
  const rightEnd = rightExpiry.endDate || "9999-12-31";
  const endDifference = leftEnd.localeCompare(rightEnd);
  if (endDifference) return endDifference;
  return compareTenantProperty(left, right, leftProperty, rightProperty, rooms) || left.name.localeCompare(right.name, "zh-Hans-CN");
}

function compareTenantProperty(left: BusinessTenant, right: BusinessTenant, leftProperty: string, rightProperty: string, rooms: BusinessRoom[]) {
  const propertyDifference = leftProperty.localeCompare(rightProperty, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  if (propertyDifference) return propertyDifference;
  const leftRoom = rooms.find((room) => room.id === left.roomId);
  const rightRoom = rooms.find((room) => room.id === right.roomId);
  const leftRoomValue = leftRoom?.roomNumber || leftRoom?.name || "";
  const rightRoomValue = rightRoom?.roomNumber || rightRoom?.name || "";
  return leftRoomValue.localeCompare(rightRoomValue, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function compareTenantStatus(
  left: BusinessTenant,
  right: BusinessTenant,
  leftExpiry: ReturnType<typeof fixedCoverageExpiryInfo>,
  rightExpiry: ReturnType<typeof fixedCoverageExpiryInfo>,
  payments: BusinessRentPayment[]
) {
  const leftRank = tenantStatusRank(left, leftExpiry);
  const rightRank = tenantStatusRank(right, rightExpiry);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftPayment = latestCoverageForTenant(left.id, payments);
  const rightPayment = latestCoverageForTenant(right.id, payments);
  const leftEnd = leftPayment?.coverageEndDate || "9999-12-31";
  const rightEnd = rightPayment?.coverageEndDate || "9999-12-31";
  return leftEnd.localeCompare(rightEnd);
}

function tenantStatusRank(tenant: BusinessTenant, expiry: ReturnType<typeof fixedCoverageExpiryInfo>) {
  if (!strictCurrentRentalTenant(tenant)) return isArchivedTenant(tenant) ? 4 : 3;
  if (expiry.level === "red") return 0;
  if (expiry.level === "orange" || expiry.level === "yellow") return 1;
  return 2;
}

function compareExpiryDates(leftEnd?: string, rightEnd?: string, direction = 1) {
  if (!leftEnd && !rightEnd) return 0;
  if (!leftEnd) return 1;
  if (!rightEnd) return -1;
  return leftEnd.localeCompare(rightEnd) * direction;
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
  if (status.includes("无")) return "blue";
  return "green";
}

function tenantDisplayStatus(tenant: BusinessTenant, payments: BusinessRentPayment[]) {
  if (tenant.status.includes("退") || tenant.status.includes("归档")) return tenant.status;
  const latestPayment = latestCoverageForTenant(tenant.id, payments);
  if (!latestPayment) return "无收款";
  if (isCoverageExpired(latestPayment)) return "欠租";
  return tenant.status || "在租";
}

function tenantDepositStatus(tenant: BusinessTenant, deposits: BusinessDeposit[]) {
  const tenantDeposits = deposits.filter((deposit) => deposit.tenantId === tenant.id && !deposit.notes?.includes("[已作废]"));
  if (tenantDeposits.some((deposit) => deposit.status === "已退")) return "押金已退";
  return "押金待退";
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

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function compactPropertyName(name?: string) {
  const value = (name || "").replace(/\s+/g, "").trim();
  return value ? value.slice(0, 7) + (value.length > 7 ? "..." : "") : "-";
}

function compactRoomName(room?: BusinessRoom) {
  const value = (room?.name || room?.roomNumber || "").trim();
  if (!value) return "-";
  const number = room?.roomNumber?.trim() || value.match(/^\d{1,4}/)?.[0] || "";
  if (!number) return value.slice(0, 8) + (value.length > 8 ? "..." : "");
  const description = value.slice(value.indexOf(number) + number.length).trim();
  const compact = description ? number + " " + description.slice(0, 5) : number;
  return compact.slice(0, 9) + (compact.length > 9 ? "..." : "");
}

function buildTenantPayment(tenant: BusinessTenant, draft: BusinessRentPayment, depositAmount: number): BusinessRentPayment {
  const rentMonth = (draft.coverageStartDate || today()).slice(0, 7);
  const rentAmount = Number(draft.amountDue || 0);
  const amountPaid = draft.paymentStatus === "未收" ? 0 : rentAmount + Number(depositAmount || 0);
  const next: BusinessRentPayment = {
    ...draft,
    id: draft.id || crypto.randomUUID(),
    propertyId: tenant.propertyId,
    roomId: tenant.roomId,
    tenantId: tenant.id,
    incomeType: "房租收入",
    incomeItem: "",
    rentMonth,
    paymentDate: draft.paymentDate || today(),
    amountDue: rentAmount,
    amountPaid,
    amountUnpaid: draft.paymentStatus === "未收" ? rentAmount : 0,
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

function ownershipChoice(value?: string): "A" | "B" | "自定义" {
  const normalized = (value || "A").trim().toUpperCase();
  return normalized === "A" || normalized === "B" ? normalized : "自定义";
}

function customOwnershipName(value?: string) {
  const name = (value || "").trim();
  return name === "自定义" ? "" : name;
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
