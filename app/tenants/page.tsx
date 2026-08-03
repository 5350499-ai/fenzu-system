"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { AttachmentAddControl } from "@/components/attachment-add-control";
import { AttachmentLoadState, AttachmentLoadStateNotice } from "@/components/attachment-load-state";
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
import { isValidCalendarDate, localToday } from "@/lib/actual-move-out-date";
import { isActualMoveOutDateEnabled } from "@/lib/actual-move-out-feature";
import { deleteRentPaymentFile, loadRentPaymentFiles } from "@/lib/rent-payment-files";
import { coverageLabel, fixedCoverageExpiryInfo, isCoverageExpired, latestCoverageForTenant, monthEnd, monthStart, repairMissingTenantMonthlyRents, strictCurrentRentalTenant } from "@/lib/rent-coverage";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import { countTenantGroups, isEndedTenantStatus, sortTenantsByRoomAndStatus, TenantSortMode } from "@/lib/tenant-sorting";
import { buildTenantTimeline, calculateTenantPaymentPerformance } from "@/lib/tenant-timeline";
import { TenantMonthlyPaymentPanel } from "@/components/tenant-monthly-payment-panel";
import { Archive, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

const tenantStatuses = ["在租", "空置"];
type TenantSortKey = TenantSortMode;

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
  const actualMoveOutDateEnabled = isActualMoveOutDateEnabled();
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [contractFilesLoadState, setContractFilesLoadState] = useState<AttachmentLoadState>("loading");
  const [contractFilesLoadError, setContractFilesLoadError] = useState("");
  const [form, setForm] = useState<BusinessTenant>(emptyTenant);
  const [contractForm, setContractForm] = useState({ startDate: today(), endDate: "" });
  const [paymentForm, setPaymentForm] = useState<BusinessRentPayment>(emptyTenantPayment);
  const [newPaymentDepositAmount, setNewPaymentDepositAmount] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [propertyFilterId, setPropertyFilterId] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const [sortKey, setSortKey] = useState<TenantSortKey>("room");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailTenantId, setDetailTenantId] = useState("");
  const [retiredExpanded, setRetiredExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ownershipMode, setOwnershipMode] = useState<"A" | "B" | "自定义">("A");
  const [customReceivedBy, setCustomReceivedBy] = useState("");
  const contractFilesRequestRef = useRef(0);
  const [moveOutTenant, setMoveOutTenant] = useState<BusinessTenant | null>(null);
  const [moveOutDate, setMoveOutDate] = useState(localToday());
  const [moveOutDateTenant, setMoveOutDateTenant] = useState<BusinessTenant | null>(null);
  const [moveOutDateValue, setMoveOutDateValue] = useState("");
  const [moveOutDepositStatus, setMoveOutDepositStatus] = useState<"待退" | "已退">("待退");
  const [depositStatusTenant, setDepositStatusTenant] = useState<BusinessTenant | null>(null);
  const [depositStatusValue, setDepositStatusValue] = useState<"待退" | "已退">("待退");
  const [createDepositTenant, setCreateDepositTenant] = useState<BusinessTenant | null>(null);
  const [createDepositAmount, setCreateDepositAmount] = useState(0);
  const [createDepositStatus, setCreateDepositStatus] = useState<"待退" | "已退">("待退");

  const refreshContractFiles = useCallback(async (contractIds: string[], tenantIds: string[] = []) => {
    const ids = [...new Set(contractIds.filter(Boolean))];
    const tenantsToLoad = [...new Set(tenantIds.filter(Boolean))];
    const requestId = ++contractFilesRequestRef.current;
    setContractFilesLoadState("loading");
    setContractFilesLoadError("");

    if (!ids.length && !tenantsToLoad.length) {
      setContractFilesLoadState("success");
      return;
    }

    try {
      const refreshedFiles = await loadContractFiles(ids, tenantsToLoad);
      if (requestId !== contractFilesRequestRef.current) return;
      setContractFiles((current) => [
        ...refreshedFiles,
        ...current.filter((file) => !ids.includes(file.contractId || "") && !tenantsToLoad.includes(file.tenantId || ""))
      ]);
      setContractFilesLoadState("success");
    } catch (error: any) {
      if (requestId !== contractFilesRequestRef.current) return;
      setContractFilesLoadState("error");
      setContractFilesLoadError(error?.message || "附件加载失败。");
    }
  }, []);

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
      await refreshContractFiles(loadedContracts.map((contract) => contract.id), loadedTenants.map((tenant) => tenant.id));
      const requestedTenantId = new URLSearchParams(window.location.search).get("tenantId") || "";
      if (requestedTenantId && repairedTenants.some((tenant) => tenant.id === requestedTenantId)) {
        setDetailTenantId(requestedTenantId);
      }
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载租客失败：${error.message || error}`));
  }, []);

  useEffect(() => {
    if (!loaded || !detailTenantId) return;
    void refreshContractFiles(contracts.filter((contract) => contract.tenantId === detailTenantId).map((contract) => contract.id), [detailTenantId]);
  }, [contracts, detailTenantId, loaded, refreshContractFiles]);

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

  useEffect(() => {
    setRetiredExpanded(false);
  }, [propertyFilterId, query, showArchived]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filesByContract = useMemo(() => contractFiles.reduce<Record<string, ContractFile[]>>((map, file) => {
    const key = file.contractId || "";
    map[key] = [...(map[key] || []), file];
  return map;
  }, {}), [contractFiles]);
  const filesByTenant = useMemo(() => contractFiles.reduce<Record<string, ContractFile[]>>((map, file) => {
    if (file.tenantId) map[file.tenantId] = [...(map[file.tenantId] || []), file];
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
      const fileNames = getTenantFiles(tenant.id, contracts, filesByContract, filesByTenant).map((file) => file.fileName).join(" ");
      const displayStatus = tenantDisplayStatus(tenant, payments);
      return [tenant.name, tenant.phone, tenant.wechat, property?.name || "", room?.name || "", room?.roomNumber || "", tenant.status, displayStatus, fileNames].join(" ").toLowerCase().includes(keyword);
    });
  }, [contracts, filesByContract, filesByTenant, payments, properties, propertyFilterId, query, rooms, showArchived, tenants]);

  const tenantPaymentPerformanceById = useMemo(() => new Map(
    tenants.map((tenant) => [
      tenant.id,
      calculateTenantPaymentPerformance(
        tenant,
        payments.filter((payment) => payment.tenantId === tenant.id),
        localToday()
      )
    ])
  ), [payments, tenants]);

  const sortedTenants = useMemo(() => {
    return sortTenantsByRoomAndStatus(filteredTenants, rooms, {
      mode: sortKey,
      direction: sortDirection,
      getProperty: (tenant) => properties.find((item) => item.id === tenant.propertyId)?.name || "",
      getExpiry: (tenant) => latestCoverageForTenant(tenant.id, payments)?.coverageEndDate || "",
      getStatusRank: (tenant) => tenantStatusRank(tenant, fixedCoverageExpiryInfo(tenant, latestCoverageForTenant(tenant.id, payments)))
    });
  }, [filteredTenants, payments, properties, rooms, sortDirection, sortKey]);

  const visibleTenants = pageRows(sortedTenants, page, pageSize);
  const explicitTenantFilter = Boolean(query.trim() || propertyFilterId);
  const retiredVisible = visibleTenants.filter((tenant) => isEndedTenantStatus(tenant.status));
  const currentVisible = visibleTenants.filter((tenant) => !isEndedTenantStatus(tenant.status));
  const { current: currentCount, retired: retiredCount } = countTenantGroups(sortedTenants);
  const showRetiredExpanded = retiredExpanded || (explicitTenantFilter && retiredVisible.length > 0 && currentVisible.length === 0);

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
    setNewPaymentDepositAmount(0);
    setOwnershipMode("A");
    setCustomReceivedBy("");
  }

  function openTenantForm(tenant?: BusinessTenant) {
    if (!tenant) {
      setForm(emptyTenant);
      setContractForm({ startDate: today(), endDate: "" });
      setPaymentForm(emptyTenantPayment);
      setNewPaymentDepositAmount(0);
      setOwnershipMode("A");
      setCustomReceivedBy("");
      setOpen(true);
      return;
    }
    const contract = latestContractForTenant(tenant.id, contracts);
    setForm(tenant);
    setContractForm({ startDate: contract?.startDate || today(), endDate: contract?.endDate || "" });
    setPaymentForm({
      ...emptyTenantPayment,
      propertyId: tenant.propertyId,
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amountDue: 0
    });
    setNewPaymentDepositAmount(0);
    setOwnershipMode("A");
    setCustomReceivedBy("");
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
  }, failureMessage = "保存失败，请稍后重试。") {
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
      window.alert(error.message || failureMessage);
      return false;
    } finally {
      setSaving(false);
    }
    return true;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.name.trim()) return;
    if (form.paymentDay != null && (!Number.isInteger(form.paymentDay) || form.paymentDay < 1 || form.paymentDay > 31)) {
      window.alert("每月缴费日请输入1到31，或留空表示不设置。");
      return;
    }
    if (!form.id && ownershipMode === "自定义" && !customReceivedBy.trim()) {
      window.alert("请填写自定义归属名称。");
      return;
    }
    try {
      const previousTenant = form.id ? tenants.find((tenant) => tenant.id === form.id) || null : null;
      if (form.id) {
        if (!previousTenant) throw new Error("租客不存在，请刷新后重试。");
        setSaving(true);
        try {
          const nextTenants = tenants.map((tenant) => tenant.id === form.id ? form : tenant);
          const nextRooms = syncRoomsAfterTenantChange(rooms, nextTenants, previousTenant, form);
          const tenantChanged = JSON.stringify(previousTenant) !== JSON.stringify(form);
          const roomsChanged = JSON.stringify(rooms) !== JSON.stringify(nextRooms);
          if (tenantChanged) {
            const savedTenantIds = await saveBusinessData(tenantKey, nextTenants);
            if (!savedTenantIds.includes(form.id)) throw new Error("租客资料保存失败");
          }
          if (roomsChanged) await saveBusinessData(roomKey, nextRooms);
          const currentContract = latestContractForTenant(form.id, contracts);
          if (currentContract) {
            const nextContract = {
              ...currentContract,
              startDate: contractForm.startDate,
              endDate: contractForm.endDate,
              monthlyRent: form.monthlyRent,
              depositAmount: form.depositAmount,
              notes: form.notes || currentContract.notes || ""
            };
            const nextContracts = contracts.map((contract) => contract.id === currentContract.id ? nextContract : contract);
            if (JSON.stringify(contracts) !== JSON.stringify(nextContracts)) {
              const savedContractIds = await saveBusinessData(contractKey, nextContracts);
              if (!savedContractIds.includes(currentContract.id)) throw new Error("租客资料保存失败");
            }
          }
          const [loadedTenants, loadedRooms, loadedContracts] = await Promise.all([
            loadBusinessData<BusinessTenant>(tenantKey, tenants),
            loadBusinessData<BusinessRoom>(roomKey, rooms),
            loadBusinessData<BusinessContract>(contractKey, contracts)
          ]);
          setTenants(loadedTenants);
          setRooms(loadedRooms);
          setContracts(loadedContracts);
          setTenants(nextTenants);
          setRooms(nextRooms);
        } catch {
          throw new Error("租客资料保存失败");
        }

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
      const nextPayment = buildTenantPayment(nextTenant, { ...paymentForm, receivedBy: ownershipMode === "自定义" ? customReceivedBy.trim() : ownershipMode }, newPaymentDepositAmount);
      const nextPayments = nextPayment.id && payments.some((payment) => payment.id === nextPayment.id)
        ? payments.map((payment) => (payment.id === nextPayment.id ? nextPayment : payment))
        : [nextPayment, ...payments];
      const nextDeposits = newPaymentDepositAmount > 0
        ? [{
            id: crypto.randomUUID(),
            propertyId: nextTenant.propertyId,
            roomId: nextTenant.roomId,
            tenantId: nextTenant.id,
            type: "收取",
            amount: newPaymentDepositAmount,
            status: "已收",
            transactionDate: nextPayment.paymentDate || today(),
            receivedBy: nextPayment.receivedBy,
            notes: `[收租押金:${nextPayment.id}]`
          }, ...deposits]
        : deposits;
      await persistAll({ tenants: next, rooms: nextRooms, contracts: nextContracts, deposits: nextDeposits, payments: nextPayments }, "租客和首次收款保存失败");
    } catch (error: any) {
      window.alert(error.message || "保存租客、收款或附件失败，请稍后重试。");
      return;
    } finally {
      setSaving(false);
    }
    close();
  }

  async function moveOut(tenant: BusinessTenant, depositStatus: "待退" | "已退", actualMoveOutDate: string) {
    if (actualMoveOutDateEnabled && !isValidCalendarDate(actualMoveOutDate)) {
      window.alert("请输入有效的实际退租日期。");
      return;
    }
    if (!window.confirm("确认办理退租吗？\n会保留历史收租、押金、利润和合同附件，并把房间设为空置、合同设为已结束。")) return;
    const nextTenants = tenants.map((item) => (item.id === tenant.id ? {
      ...item,
      status: "已退租",
      ...(actualMoveOutDateEnabled ? { actualMoveOutDate } : {})
    } : item));
    const saved = await persistAll({
      tenants: nextTenants,
      rooms: syncRoomsAfterTenantRemoval(rooms, nextTenants, tenant.roomId),
      contracts: contracts.map((contract) => (contract.tenantId === tenant.id ? { ...contract, status: "已结束" } : contract)),
      deposits: deposits.map((deposit) => (deposit.tenantId === tenant.id && !isVoidedDeposit(deposit) ? { ...deposit, status: depositStatus } : deposit))
    }, "退租保存失败，请重新进入租客详情确认押金状态。");
    if (!saved) return;
    try {
      const refreshedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, deposits);
      setDeposits(refreshedDeposits);
      setMoveOutTenant(null);
    } catch {
      window.alert("退租已提交，但押金状态无法确认，请重新进入租客详情确认。");
    }
  }

  function openMoveOutDialog(tenant: BusinessTenant) {
    setMoveOutTenant(tenant);
    setMoveOutDate(tenant.actualMoveOutDate || localToday());
    setMoveOutDepositStatus("待退");
  }

  function openMoveOutDateDialog(tenant: BusinessTenant) {
    if (!actualMoveOutDateEnabled || !tenant.status.includes("已退租")) return;
    setMoveOutDateTenant(tenant);
    setMoveOutDateValue(tenant.actualMoveOutDate || "");
  }

  async function saveMoveOutDate(tenant: BusinessTenant, value: string) {
    if (!actualMoveOutDateEnabled) return;
    if (!isValidCalendarDate(value)) {
      window.alert("请输入有效的实际退租日期。");
      return;
    }
    if (!window.confirm("确认保存实际退租日期吗？只会更新该日期，不会修改其他业务数据。")) return;
    const nextTenants = tenants.map((item) => (item.id === tenant.id ? { ...item, actualMoveOutDate: value } : item));
    if (await persistAll({ tenants: nextTenants }, "实际退租日期保存失败，请稍后重试。")) {
      setMoveOutDateTenant(null);
      setMoveOutDateValue("");
    }
  }

  function openDepositStatusDialog(tenant: BusinessTenant) {
    if (!deposits.some((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit))) return;
    setDepositStatusTenant(tenant);
    setDepositStatusValue(tenantDepositStorageStatus(tenant, deposits));
  }

  function openCreateDepositDialog(tenant: BusinessTenant) {
    if (deposits.some((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit))) return;
    const reference = depositReferenceForTenant(tenant.id, payments);
    setCreateDepositTenant(tenant);
    setCreateDepositAmount(reference.amount || 0);
    setCreateDepositStatus("待退");
  }

  async function createDepositRecord(tenant: BusinessTenant, amount: number, status: "待退" | "已退") {
    if (!Number.isFinite(amount) || amount <= 0) {
      window.alert("请输入大于 0 的押金金额。");
      return;
    }
    setSaving(true);
    try {
      const latestDeposits = await loadBusinessData<BusinessDeposit>(depositKey, deposits);
      if (latestDeposits.some((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit))) {
        window.alert("该租客已存在押金管理记录，请刷新页面后查看。");
        setDeposits(latestDeposits);
        setCreateDepositTenant(null);
        return;
      }
      const nextDeposit: BusinessDeposit = {
        id: crypto.randomUUID(),
        propertyId: tenant.propertyId,
        roomId: tenant.roomId,
        tenantId: tenant.id,
        type: "收取",
        amount,
        status,
        transactionDate: today(),
        receivedBy: "A",
        paidBy: "A",
        notes: `[收租押金:历史人工建立:${tenant.id}]`
      };
      await saveBusinessData(depositKey, [nextDeposit, ...latestDeposits]);
      const refreshedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, latestDeposits);
      if (!refreshedDeposits.some((deposit) => deposit.id === nextDeposit.id)) throw new Error("押金管理记录保存后未能确认，请刷新页面后重试。");
      setDeposits(refreshedDeposits);
      setCreateDepositTenant(null);
    } catch (error: any) {
      window.alert(error.message || "建立押金管理记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function updateDepositStatus(tenant: BusinessTenant, status: "待退" | "已退") {
    const targetDeposits = deposits.filter((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit));
    if (!targetDeposits.length) {
      window.alert("未找到该租客的有效押金记录，状态未修改。");
      return;
    }
    const targetIds = targetDeposits.map((deposit) => deposit.id);
    const nextDeposits = deposits.map((deposit) => (targetIds.includes(deposit.id) ? { ...deposit, status } : deposit));
    console.info("[deposit-status] submit", { tenantId: tenant.id, status, targetIds });
    let updatedIds: string[] = [];
    try {
      updatedIds = await saveBusinessData(depositKey, nextDeposits);
    } catch (error) {
      console.error("[deposit-status] update failed", { tenantId: tenant.id, status, targetIds, error });
      window.alert(error instanceof Error ? error.message : "押金状态保存失败，请重新进入租客详情确认状态。");
      return;
    }
    console.info("[deposit-status] update result", { tenantId: tenant.id, status, targetIds, updatedIds });
    if (!targetIds.every((id) => updatedIds.includes(id))) {
      window.alert("押金状态未确认写入，请重新进入租客详情确认状态。");
      return;
    }
    try {
      const refreshedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, deposits);
      const refreshedTargetDeposits = refreshedDeposits.filter((deposit) => targetIds.includes(deposit.id));
      const confirmed = refreshedTargetDeposits.length === targetIds.length && refreshedTargetDeposits.every((deposit) => deposit.status === status);
      console.info("[deposit-status] reload result", { tenantId: tenant.id, status, targetIds, confirmed });
      if (!confirmed) {
        window.alert("押金状态保存后未能确认最终状态，请重新进入租客详情确认。");
        return;
      }
      setDeposits(refreshedDeposits);
      setDepositStatusTenant(null);
    } catch (error) {
      console.error("[deposit-status] reload failed", { tenantId: tenant.id, status, targetIds, error });
      window.alert("押金状态已提交，但无法确认最终状态，请重新进入租客详情确认。");
    }
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
      const contractFilesToDelete = contractFiles.filter((file) => file.tenantId === tenant.id || tenantContractIds.includes(file.contractId || ""));
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
      setContractFiles((current) => current.filter((file) => file.tenantId !== tenant.id && !tenantContractIds.includes(file.contractId || "")));
      setDetailTenantId("");
    } catch (error: any) {
      window.alert(error.message || "永久删除租客失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function addTenantFile(uploadContext: { tenantId: string; contractId: string | null }, file: File) {
    setSaving(true);
    try {
      const uploaded = await uploadContractFile(uploadContext.tenantId, uploadContext.contractId, file);
      setContractFiles((current) => [uploaded, ...current]);
      await refreshContractFiles(uploadContext.contractId ? [uploadContext.contractId] : [], [uploadContext.tenantId]);
    } catch (error: any) {
      throw new Error(error.message || "添加租客附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
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
            <SortButton active={sortKey === "room"} direction={sortDirection} label="房间" onClick={() => toggleSort("room")} />
            <SortButton active={sortKey === "expiry"} direction={sortDirection} label="到期日" onClick={() => toggleSort("expiry")} />
            <SortButton active={sortKey === "rent"} direction={sortDirection} label="月租" onClick={() => toggleSort("rent")} />
            <SortButton active={sortKey === "property"} direction={sortDirection} label="房源" onClick={() => toggleSort("property")} />
            <SortButton active={sortKey === "status"} direction={sortDirection} label="状态" onClick={() => toggleSort("status")} />
          </div>
        </div>

        <div className="finance-list tenant-compact-list">
          {visibleTenants.map((tenant, index, pageTenants) => {
            const retired = isEndedTenantStatus(tenant.status);
            const previousRetired = index > 0 && isEndedTenantStatus(pageTenants[index - 1].status);
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const files = getTenantFiles(tenant.id, contracts, filesByContract, filesByTenant);
            const contract = latestContractForTenant(tenant.id, contracts);
            const displayStatus = tenantDisplayStatus(tenant, payments);
            const depositStatus = tenantDepositStatus(tenant, deposits);
            const expiryInfo = fixedCoverageExpiryInfo(tenant, latestCoverageForTenant(tenant.id, payments));
            const latestReceivedPayment = latestReceivedPaymentForTenant(tenant.id, payments);
            const paymentPerformance = tenantPaymentPerformanceById.get(tenant.id);
            const paymentPerformanceHasPeriods = Boolean(paymentPerformance?.periods.length);
            const paymentPerformanceLabel = paymentPerformanceHasPeriods
              ? `按时${Math.round(paymentPerformance?.onTimeRate || 0)}%`
              : "暂无记录";
            const paymentPerformanceTone = paymentPerformanceHasPeriods
              ? paymentPerformance?.onTimeRate === 100
                ? "green"
                : (paymentPerformance?.onTimeRate || 0) >= 80 ? "blue" : "orange"
              : "neutral";
            const expanded = detailTenantId === tenant.id;
            return (
              <Fragment key={tenant.id}>
                {index === 0 && !retired ? <div className="tenant-status-group-title">当前租客（{currentCount}组）</div> : null}
                {retired && !previousRetired ? <div className="tenant-status-group-title tenant-retired-group-title"><button className="tenant-status-group-toggle" type="button" onClick={() => setRetiredExpanded((current) => !current)} aria-expanded={showRetiredExpanded}>已退租租客（{retiredCount}组） <span>{showRetiredExpanded ? "收起" : "展开"}</span></button></div> : null}
                {!retired || showRetiredExpanded ? <article className={`finance-list-item${expanded ? " tenant-card-expanded" : ""}`}>
                <button aria-expanded={expanded} className="tenant-card-toggle" onClick={() => setDetailTenantId(expanded ? "" : tenant.id)} type="button">
                  <span className="finance-line tenant-finance-line">
                  <span className="tenant-name">{tenant.name || "-"}</span>
                  <span className="tenant-property-short" title={property?.name || "-"}>{compactPropertyName(property?.name)}</span>
                  <span className="tenant-room-short" title={room?.name || room?.roomNumber || "-"}>{compactRoomName(room)}</span>
                  <strong className="tenant-rent tenant-received" title={latestReceivedPayment ? `最近一次实收 ${euro(latestReceivedPayment.amountPaid)}` : "暂无实收"}>
                    {latestReceivedPayment ? `实收 ${euro(latestReceivedPayment.amountPaid)}` : "暂无实收"}
                  </strong>
                  <span className="tenant-toggle-control" onClick={(event) => event.stopPropagation()}><StatusBadge tone={tenantTone(displayStatus)}>{displayStatus}</StatusBadge></span>
                  <span className="tenant-toggle-control" onClick={(event) => event.stopPropagation()}><StatusBadge tone={depositStatus === "押金已处理" ? "green" : depositStatus === "押金待处理" ? "amber" : ""}>{depositStatus}</StatusBadge></span>
                  <span className="tenant-payment-performance" title="付款表现"><StatusBadge tone={paymentPerformanceTone}>{paymentPerformanceLabel}</StatusBadge></span>
                  </span>
                <span className="tenant-mobile-meta">
                  <strong className="tenant-mobile-received">{latestReceivedPayment ? `实收 ${euro(latestReceivedPayment.amountPaid)}` : "暂无实收"}</strong>
                  {expiryInfo.label ? <strong className={`tenant-mobile-reminder ${expiryInfo.level}`}>{expiryInfo.label}</strong> : null}
                  <span className="tenant-mobile-coverage">{expiryInfo.endDate ? `覆盖至 ${expiryInfo.endDate}` : "无覆盖日期"}</span>
                  <span className="tenant-toggle-control" onClick={(event) => event.stopPropagation()}><StatusBadge tone={depositStatus === "押金已处理" ? "green" : depositStatus === "押金待处理" ? "amber" : ""}>{depositStatus}</StatusBadge></span>
                </span>
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
                    attachmentLoadState={contractFilesLoadState}
                    attachmentLoadError={contractFilesLoadError}
                    onRetryFiles={() => void refreshContractFiles(contracts.filter((item) => item.tenantId === tenant.id).map((item) => item.id), [tenant.id])}
                    isAdmin={access.can("tenants", "delete")}
                    canEdit={access.can("tenants", "edit")}
                    canArchive={access.can("tenants", "archive")}
                    canCollectRent={access.can("rent_payments", "create") && strictCurrentRentalTenant(tenant)}
                    canViewFiles={access.can("attachments") && access.canSensitive("canViewContractFiles")}
                    canDownloadFiles={access.canSensitive("canDownloadFiles")}
                    canUploadFiles={access.can("attachments", "create") && access.canSensitive("canUploadFiles")}
                    canDeleteFiles={access.can("attachments", "delete") && access.canSensitive("canDeleteFiles")}
                    onDeleteFile={removeContractFile}
                    onArchive={() => archiveTenant(tenant)}
                    onPermanentDelete={() => permanentlyDeleteTenant(tenant)}
                    onEdit={() => {
                      openTenantForm(tenant);
                    }}
                    onMoveOut={() => openMoveOutDialog(tenant)}
                    onEditMoveOutDate={() => openMoveOutDateDialog(tenant)}
                    onEditDepositStatus={() => openDepositStatusDialog(tenant)}
                    onCreateDeposit={() => openCreateDepositDialog(tenant)}
                    onAddFile={(context, file) => addTenantFile(context, file)}
                    onRestore={() => restoreTenant(tenant)}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    saving={saving}
                    tenant={tenant}
                    depositStatus={depositStatus}
                  />
                ) : null}
                </article> : null}
              </Fragment>
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
                  if (!form.id) setNewPaymentDepositAmount(room?.depositAmount || 0);
                }}
                placeholder="先选房源，再搜索房间名称、编号"
              />
              <TextField label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="电话（可选）" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <MoneyInput label="当前月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} />
              <MoneyInput label="押金标准 / 应收押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              {!form.id ? <>
                <MoneyInput label="本次房租金额" value={paymentForm.amountDue} onChange={(amountDue) => updatePaymentMoney({ amountDue, paymentStatus: amountDue > 0 ? "已收" : paymentForm.paymentStatus })} />
                <MoneyInput label="本次新增押金" value={newPaymentDepositAmount} onChange={setNewPaymentDepositAmount} />
                <div className="field"><label>本次合计收入</label><input readOnly value={euro(Number(paymentForm.amountDue || 0) + Number(newPaymentDepositAmount || 0))} /></div>
              </> : null}
              <div className="field"><label>每月缴费日（可选）</label><input inputMode="numeric" max="31" min="1" placeholder="不设置可留空" type="number" value={form.paymentDay ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentDay: event.target.value === "" ? undefined : Number(event.target.value) }))} /></div>
              {!form.id ? <>
                <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={paymentForm.coverageStartDate || ""} onChange={(event) => updatePaymentMoney({ coverageStartDate: event.target.value, rentMonth: event.target.value.slice(0, 7) })} /></div>
                <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={paymentForm.coverageEndDate || ""} onChange={(event) => updatePaymentMoney({ coverageEndDate: event.target.value })} /></div>
                <OwnershipField mode={ownershipMode} customName={customReceivedBy} onModeChange={(mode) => {
                  setOwnershipMode(mode);
                  if (mode !== "自定义") setCustomReceivedBy("");
                }} onCustomNameChange={setCustomReceivedBy} />
              </> : null}
              <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>备注</label>
                <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <p className="muted" style={{ gridColumn: "1 / -1" }}>请先保存租客和合同字段；保存后在租客详情中可逐个添加合同附件。收款附件请在对应收款记录详情中添加。</p>
              <div className="modal-actions">
                <button className="btn" onClick={close} type="button">取消</button>
                <button className="btn primary" disabled={saving} type="submit">保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {moveOutTenant ? (
        <div className="modal-backdrop" onMouseDown={() => setMoveOutTenant(null)}>
          <section className="card modal-card deposit-status-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">办理退租</h2>
              <button className="btn" onClick={() => setMoveOutTenant(null)} type="button"><X size={17} /> 关闭</button>
            </div>
            <p className="muted">这里结束租赁关系并记录押金处理状态，不会自动新增退押金支出，也不会修改任何金额。</p>
            <div className="field">
              <label htmlFor="move-out-deposit-status">押金处理状态</label>
              <select id="move-out-deposit-status" value={moveOutDepositStatus} onChange={(event) => setMoveOutDepositStatus(event.target.value as "待退" | "已退")}>
                <option value="待退">押金待处理</option>
                <option value="已退">押金已处理</option>
              </select>
            </div>
            {actualMoveOutDateEnabled ? <div className="field">
              <label htmlFor="move-out-date">实际退租日期</label>
              <input id="move-out-date" type="date" value={moveOutDate} onChange={(event) => setMoveOutDate(event.target.value)} required />
            </div> : null}
            <div className="modal-actions">
              <button className="btn" onClick={() => setMoveOutTenant(null)} type="button">取消</button>
              <button className="btn primary" disabled={saving} onClick={() => void moveOut(moveOutTenant, moveOutDepositStatus, moveOutDate)} type="button">确认退租</button>
            </div>
          </section>
        </div>
      ) : null}

      {actualMoveOutDateEnabled && moveOutDateTenant ? (
        <div className="modal-backdrop" onMouseDown={() => setMoveOutDateTenant(null)}>
          <section className="card modal-card deposit-status-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">实际退租日期</h2>
              <button className="btn" onClick={() => setMoveOutDateTenant(null)} type="button"><X size={17} /> 关闭</button>
            </div>
            <p className="muted">只更新实际退租日期，不会修改收款、支出、押金或其他业务数据。</p>
            <div className="field">
              <label htmlFor="edit-move-out-date">实际退租日期</label>
              <input id="edit-move-out-date" type="date" value={moveOutDateValue} onChange={(event) => setMoveOutDateValue(event.target.value)} required />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMoveOutDateTenant(null)} type="button">取消</button>
              <button className="btn primary" disabled={saving} onClick={() => void saveMoveOutDate(moveOutDateTenant, moveOutDateValue)} type="button">保存日期</button>
            </div>
          </section>
        </div>
      ) : null}

      {depositStatusTenant ? (
        <div className="modal-backdrop" onMouseDown={() => setDepositStatusTenant(null)}>
          <section className="card modal-card deposit-status-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">修改押金状态</h2>
              <button className="btn" onClick={() => setDepositStatusTenant(null)} type="button"><X size={17} /> 关闭</button>
            </div>
            <p className="muted">这里只记录押金处理进度，不会新增支出或修改任何金额。</p>
            <div className="field">
              <label htmlFor="deposit-status-value">押金处理状态</label>
              <select id="deposit-status-value" value={depositStatusValue} onChange={(event) => setDepositStatusValue(event.target.value as "待退" | "已退")}>
                <option value="待退">押金待处理</option>
                <option value="已退">押金已处理</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setDepositStatusTenant(null)} type="button">取消</button>
              <button className="btn primary" disabled={saving} onClick={() => void updateDepositStatus(depositStatusTenant, depositStatusValue)} type="button">保存状态</button>
            </div>
          </section>
        </div>
      ) : null}

      {createDepositTenant ? (
        <div className="modal-backdrop" onMouseDown={() => setCreateDepositTenant(null)}>
          <section className="card modal-card deposit-status-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">建立押金管理记录</h2>
              <button className="btn" onClick={() => setCreateDepositTenant(null)} type="button"><X size={17} /> 关闭</button>
            </div>
            <div className="detail-grid">
              <DetailField label="租客" value={createDepositTenant.name || "-"} />
              <DetailField label="房源 / 房间" value={`${properties.find((item) => item.id === createDepositTenant.propertyId)?.name || "-"} / ${rooms.find((item) => item.id === createDepositTenant.roomId)?.name || "-"}`} />
            </div>
            {depositReferenceForTenant(createDepositTenant.id, payments).label ? <p className="muted">{depositReferenceForTenant(createDepositTenant.id, payments).label}</p> : null}
            <MoneyInput label="押金金额" value={createDepositAmount} onChange={setCreateDepositAmount} />
            <div className="field">
              <label htmlFor="create-deposit-status">押金处理状态</label>
              <select id="create-deposit-status" value={createDepositStatus} onChange={(event) => setCreateDepositStatus(event.target.value as "待退" | "已退")}>
                <option value="待退">押金待处理</option>
                <option value="已退">押金已处理</option>
              </select>
            </div>
            <p className="muted">这里只建立押金管理记录，不会新增收款或支出，也不会修改原收款金额。</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setCreateDepositTenant(null)} type="button">取消</button>
              <button className="btn primary" disabled={saving} onClick={() => void createDepositRecord(createDepositTenant, createDepositAmount, createDepositStatus)} type="button">确认建立</button>
            </div>
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
  attachmentLoadState,
  attachmentLoadError,
  onRetryFiles,
  isAdmin,
  canEdit,
  canArchive,
  canCollectRent,
  canViewFiles,
  canDownloadFiles,
  canUploadFiles,
  canDeleteFiles,
  onArchive,
  saving,
  onDeleteFile,
  onEdit,
  onMoveOut,
  onEditMoveOutDate,
  onEditDepositStatus,
  onCreateDeposit,
  onPermanentDelete,
  onAddFile,
  onRestore,
  depositStatus
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
  attachmentLoadState: AttachmentLoadState;
  attachmentLoadError: string;
  onRetryFiles: () => void;
  isAdmin: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canCollectRent: boolean;
  canViewFiles: boolean;
  canDownloadFiles: boolean;
  canUploadFiles: boolean;
  canDeleteFiles: boolean;
  saving: boolean;
  onArchive: () => void;
  onDeleteFile: (file: ContractFile) => void;
  onEdit: () => void;
  onMoveOut: () => void;
  onEditMoveOutDate: () => void;
  onEditDepositStatus: () => void;
  onCreateDeposit: () => void;
  onPermanentDelete: () => void;
  onAddFile: (context: { tenantId: string; contractId: string | null }, file: File) => Promise<void>;
  onRestore: () => void;
  depositStatus: string;
}) {
  const archived = isArchivedTenant(tenant);
  const movedOut = tenant.status.includes("已退租");
  const receivedDeposit = collectedDepositForTenant(payments, deposits);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const attachmentUploadContext = useMemo(() => ({ tenantId: tenant.id, contractId: contract?.id || null }), [tenant.id, contract?.id]);
  const addAttachment = useCallback((file: File) => onAddFile(attachmentUploadContext, file), [attachmentUploadContext, onAddFile]);
  const performance = calculateTenantPaymentPerformance(tenant, payments, localToday());
  const paymentRateHasPeriods = performance.periods.length > 0;
  const paymentRateLabel = paymentRateHasPeriods ? `${performance.onTimeRate?.toFixed(0)}%` : "暂无记录";
  const paymentRateTone = paymentRateHasPeriods
    ? performance.onTimeRate === 100 ? "green" : (performance.onTimeRate || 0) >= 80 ? "blue" : "orange"
    : "neutral";
  const timeline = buildTenantTimeline(tenant, contract, payments, deposits, localToday());
  const latestReceived = latestCoverageForTenant(tenant.id, payments)?.amountPaid || 0;
  return (
    <div className="record-detail-panel tenant-detail-panel">
      <div className="detail-grid">
        {coverageExpiry ? <DetailField label={"\u8ddd\u79bb\u79df\u91d1\u5230\u671f"} value={coverageExpiry} /> : null}
        <DetailField label="房源/房间" value={`${propertyName} / ${roomName}`} />
        <div className="tenant-amount-grid">
          <DetailField label="月租标准" value={euro(tenant.monthlyRent)} />
          <DetailField label="最近一次实收" value={euro(latestReceived)} />
          <DetailField label="押金标准" value={euro(tenant.depositAmount)} />
          <DetailField label="已收押金" value={euro(receivedDeposit)} />
        </div>
        <DetailField label="每月缴费日" value={tenant.paymentDay ? `每月${tenant.paymentDay}号` : "未设置"} />
        <DetailField label="租金已覆盖至" value={coverageEnd} />
        <DetailField label="备注" value={tenant.notes || "-"} />
        <div className="tenant-details-toggle-row">
          <button className="tenant-details-toggle" type="button" onClick={() => setDetailsOpen((current) => !current)} aria-expanded={detailsOpen}>
            {detailsOpen ? "收起详情" : "详细资料"}
          </button>
        </div>
        {detailsOpen ? <>
          <DetailField label="电话" value={tenant.phone || "-"} />
          <DetailField label="WhatsApp / 微信" value={tenant.wechat || "-"} />
          <DetailField label="入住日期" value={contract?.startDate || "-"} />
          <DetailField label="合同到期" value={contract?.endDate || "-"} />
          <DetailField label="来源" value={tenant.source || "-"} />
        </> : null}
      </div>

      {depositStatus === "未建立押金管理记录" ? (
        <div className="deposit-status-detail">
          <div>
            <span className="muted">押金状态</span>
            <StatusBadge>未建立押金管理记录</StatusBadge>
            <span className="muted">该租客只有收款记录中的押金金额，尚未建立独立押金管理记录。</span>
          </div>
          <button className="btn" disabled={saving} type="button" onClick={onCreateDeposit}>建立押金管理记录</button>
        </div>
      ) : null}

      {movedOut && depositStatus !== "未建立押金管理记录" ? (
        <div className="deposit-status-detail">
          <div>
            <span className="muted">押金状态</span>
            <StatusBadge tone={depositStatus === "押金已处理" ? "green" : "amber"}>{depositStatus}</StatusBadge>
          </div>
          <button className="btn" disabled={saving} type="button" onClick={onEditDepositStatus}>修改押金状态</button>
        </div>
      ) : null}

      {movedOut && isActualMoveOutDateEnabled() ? (
        <div className="deposit-status-detail">
          <div>
            <span className="muted">实际退租日期</span>
            <strong>{tenant.actualMoveOutDate || "未录入"}</strong>
          </div>
          <button className="btn" disabled={saving} type="button" onClick={onEditMoveOutDate}>{tenant.actualMoveOutDate ? "修改实际退租日期" : "补录实际退租日期"}</button>
        </div>
      ) : null}

      <section className="tenant-performance-section">
        <div className="detail-section-title">付款摘要</div>
        <div className="tenant-performance-summary">
          <span>累计迟交{performance.lateCount}次</span><span aria-hidden="true">｜</span>
          <span>平均迟交{performance.averageLateDays?.toFixed(0) || "-"}天</span><span aria-hidden="true">｜</span>
          <span>最长迟交{performance.longestLateDays ?? "-"}天</span><span aria-hidden="true">｜</span>
          <span>按时付款率<span className={`tenant-payment-rate ${paymentRateTone}`}>{paymentRateLabel}</span></span>
        </div>
        {performance.periods.length === 0 ? (
          <div className="tenant-performance-empty">
            <strong>暂无足够数据</strong>
            <span>完成下一次完整自然月房租收款后，系统将开始生成迟交趋势和付款统计。</span>
            {performance.excludedCount ? <span>另有{performance.excludedCount}条历史记录因首月、非完整月份或日期不足，未纳入统计。</span> : null}
          </div>
        ) : null}
        {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 10 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
      </section>

      <section className="tenant-timeline-section">
        <TenantMonthlyPaymentPanel tenant={tenant} payments={payments} events={timeline} performance={performance} today={localToday()} />
      </section>

      <div className="attachment-panel payment-history-panel">
        <button type="button" className="payment-history-toggle" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen}>查看原始收款记录（{payments.length}笔） <span>{historyOpen ? "收起" : "展开"}</span></button>
        {historyOpen ? <div className="settlement-detail-list">
          {[...payments]
            .sort((a, b) => (b.paymentDate || b.coverageEndDate || b.rentMonth).localeCompare(a.paymentDate || a.coverageEndDate || a.rentMonth))
            .map((payment) => {
              const legacyDeposit = linkedDepositAmount(payment.id, deposits);
              const rentPayment = isTenantRentPayment(payment);
              const deposit = rentPayment ? legacyDeposit || Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0) : 0;
              const rent = Number(payment.amountDue || 0);
              return (
                <div className="payment-history-line" key={payment.id}>
                  <div className="payment-history-left">
                    <span>{payment.paymentDate || payment.rentMonth}</span>
                    <span>押金 {euro(deposit)}</span>
                  </div>
                  <div className="payment-history-right">
                    <span><b className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy)}</b></span>
                    <span>{rentPayment ? "房租" : payment.incomeItem || payment.incomeType || "收入"} {euro(rent)}</span>
                    <strong>实收 {euro(payment.amountPaid)}</strong>
                  </div>
                </div>
              );
            })}
          {!payments.length ? <span className="muted">暂无收款记录</span> : null}
        </div> : null}
      </div>

      {canViewFiles ? <div className={`attachment-panel contract-attachments-panel${attachmentsOpen ? " attachments-open" : ""}`}>
        <button className="attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)} aria-expanded={attachmentsOpen}>{`租客附件（${files.length}个）`} {attachmentsOpen ? "收起" : "展开"}</button>
        <div className="detail-section-title">租客附件</div>
        <TenantAttachmentActions files={files} loadState={attachmentLoadState} loadError={attachmentLoadError} onRetry={onRetryFiles} onDelete={onDeleteFile} canDownload={canDownloadFiles} canDelete={canDeleteFiles} />
        {canUploadFiles ? <AttachmentAddControl label="添加附件" disabled={saving} onAdd={addAttachment} /> : null}
      </div> : null}

      <div className="top-actions detail-actions">
        {canCollectRent ? <a className="btn primary" href={`/rent-payments?renewTenantId=${tenant.id}`}>续交房租</a> : null}
        {canEdit ? <button className="btn" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑</button> : null}
        {canArchive && archived ? (
          <button className="btn" disabled={saving} type="button" onClick={onRestore}><Archive size={15} /> 恢复</button>
        ) : canArchive ? (
          <>
            {!movedOut ? <button className="btn" disabled={saving} type="button" onClick={onMoveOut}><Archive size={15} /> 退租</button> : null}
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

function TenantAttachmentActions({ files, loadState, loadError, onRetry, onDelete, canDownload = true, canDelete = true }: { files: ContractFile[]; loadState: AttachmentLoadState; loadError: string; onRetry: () => void; onDelete: (file: ContractFile) => void; canDownload?: boolean; canDelete?: boolean }) {
  if (loadState !== "success" || !files.length) {
    return <AttachmentLoadStateNotice state={loadState} error={loadError} onRetry={onRetry} emptyLabel="暂无租客附件" hasFiles={files.length > 0} />;
  }
  return (
    <div className="attachment-list compact-attachment-list">
      {files.map((file) => (
        <div className="attachment-preview attachment-file-card" key={file.id}>
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

function latestReceivedPaymentForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  return latestCoverageForTenant(tenantId, payments);
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

function getTenantFiles(tenantId: string, contracts: BusinessContract[], filesByContract: Record<string, ContractFile[]>, filesByTenant: Record<string, ContractFile[]>) {
  if (!tenantId) return [];
  const tenantFiles = filesByTenant[tenantId] || [];
  const contractFiles = contracts
    .filter((contract) => contract.tenantId === tenantId)
    .flatMap((contract) => filesByContract[contract.id] || []);
  return [...new Map([...tenantFiles, ...contractFiles].map((file) => [file.id, file])).values()];
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
  if (!deposits.some((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit))) return "未建立押金管理记录";
  return tenantDepositStorageStatus(tenant, deposits) === "已退" ? "押金已处理" : "押金待处理";
}

function depositReferenceForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  const amounts = payments
    .filter((payment) => payment.tenantId === tenantId && !payment.notes?.includes("[已作废]"))
    .sort((left, right) => (right.paymentDate || right.createdAt || "").localeCompare(left.paymentDate || left.createdAt || ""))
    .map((payment) => Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0))
    .filter((amount) => amount > 0);
  if (!amounts.length) return { amount: 0, label: "" };
  const latest = amounts[0];
  if (amounts.length === 1) return { amount: latest, label: `收款记录中的押金参考金额：${euro(latest)}` };
  return { amount: latest, label: `收款记录中发现 ${amounts.length} 笔押金差额，最近一笔参考金额：${euro(latest)}；请自行确认最终押金金额。` };
}

function tenantDepositStorageStatus(tenant: BusinessTenant, deposits: BusinessDeposit[]): "待退" | "已退" {
  const tenantDeposits = deposits.filter((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit));
  return tenantDeposits.some((deposit) => deposit.status === "已退") ? "已退" : "待退";
}

function isVoidedDeposit(deposit: BusinessDeposit) {
  return deposit.notes?.includes("[已作废]") || deposit.status === "已作废";
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
  return value ? value.slice(0, 12) + (value.length > 12 ? "..." : "") : "-";
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

function buildTenantPayment(tenant: BusinessTenant, draft: BusinessRentPayment, newDepositAmount: number): BusinessRentPayment {
  const rentMonth = (draft.coverageStartDate || today()).slice(0, 7);
  const rentAmount = Number(draft.amountDue || 0);
  const depositIncome = Number(newDepositAmount || 0);
  const amountPaid = draft.paymentStatus === "未收" ? depositIncome : rentAmount + depositIncome;
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
