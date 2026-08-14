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
  refreshBusinessData,
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
import { isCoverageExpired, isCurrentRentalRelationship, latestCoverageForTenant, monthEnd, monthStart, repairMissingTenantMonthlyRents } from "@/lib/rent-coverage";
import { getDebtCases, getTenantDebtCases, type DebtCase } from "@/lib/debt-case";
import { getTenantDebtDisplay, tenantRentRowLabel, tenantRentRowTone, type TenantDebtDisplay } from "@/lib/tenant-debt-display";
import { rentPeriodToday } from "@/lib/rent-period-state";
import { partnerClass, partnerLabel, usePartnerDirectory } from "@/lib/partner-settings";
import { buildActivePartnerOptions, getPartners } from "@/lib/partners";
import { countTenantGroups, isEndedTenantStatus, sortTenantsByRoomAndStatus, splitTenantGroups, TenantSortMode } from "@/lib/tenant-sorting";
import { buildTenantTimeline, calculateTenantPaymentPerformance } from "@/lib/tenant-timeline";
import { buildTenantMoveOutPlan, createMoveOutSubmissionGuard } from "@/lib/tenant-move-out";
import { getTenantStatusSlots } from "@/lib/tenant-status-slots";
import { isTenantDeleteConfirmed, tenantDeletePermissionMessage } from "@/lib/tenant-delete";
import { getValidSupabaseSession } from "@/lib/supabase";
import { archiveModeForTenantDeepLink, filterTenantsByArchiveMode, isArchivedTenantStatus } from "@/lib/tenant-archive";
import { planTenantDeepLink, tenantDeepLinkScrollTargetId } from "@/lib/tenant-deep-link";
import { resolveTenantNavigationContext } from "@/lib/reminder-navigation";
import { DebtRow } from "@/components/debt-row";
import { TenantMonthlyPaymentPanel } from "@/components/tenant-monthly-payment-panel";
import { PropertyMultiSelect } from "@/components/property-multi-select";
import { CompactDetailGrid, CompactDetailGroup, CompactDetailRow } from "@/components/ui";
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
  occupantCount: 1,
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
  receivedBy: "",
  paymentStatus: "已收",
  isOverdue: false,
  notes: ""
};

export default function TenantsPage() {
  const actualMoveOutDateEnabled = isActualMoveOutDateEnabled();
  const access = useAccountAccess();
  const partnerDirectory = usePartnerDirectory();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [waivedPaymentIds, setWaivedPaymentIds] = useState<Set<string>>(new Set());
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
  const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<TenantSortKey>("room");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showArchived, setShowArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailTenantId, setDetailTenantId] = useState("");
  const [deepLinkTenantId, setDeepLinkTenantId] = useState("");
  const [focusedTenantId, setFocusedTenantId] = useState("");
  const [debtFocusPaymentId, setDebtFocusPaymentId] = useState("");
  const [contractExpiringDays, setContractExpiringDays] = useState<number | null>(null);
  const [retiredExpanded, setRetiredExpanded] = useState(false);
  const [currentExpanded, setCurrentExpanded] = useState(false);
  const [deleteTenantTarget, setDeleteTenantTarget] = useState<BusinessTenant | null>(null);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waivingDebtPaymentId, setWaivingDebtPaymentId] = useState("");
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [ownershipMode, setOwnershipMode] = useState<string>("");
  const contractFilesRequestRef = useRef(0);
  const tenantRowRefs = useRef(new Map<string, HTMLElement>());
  const moveOutSubmissionGuardRef = useRef(createMoveOutSubmissionGuard());
  const [moveOutTenant, setMoveOutTenant] = useState<BusinessTenant | null>(null);
  const [moveOutDate, setMoveOutDate] = useState(localToday());
  const [moveOutDateTenant, setMoveOutDateTenant] = useState<BusinessTenant | null>(null);
  const [moveOutDateValue, setMoveOutDateValue] = useState("");
  const [moveOutDepositStatus, setMoveOutDepositStatus] = useState<"待退" | "已退">("待退");
  const businessToday = rentPeriodToday();
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
      const activePartnerOptions = buildActivePartnerOptions(await getPartners());
      // The rent-status list and Reminder Engine must derive from the same
      // authoritative snapshot. A cache-first payment set can otherwise show a
      // different current period from the debt reminder for the same tenant.
      const loadedProperties = await refreshBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await refreshBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await refreshBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await refreshBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await refreshBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedDeposits = await refreshBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
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
       const session = await getValidSupabaseSession();
       if (session) {
         const response = await fetch("/api/rent-collection", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
         if (response.ok) {
           const payload = await response.json() as { actions?: Array<{ rentPaymentId?: string }> };
           setWaivedPaymentIds(new Set((payload.actions || []).map((action) => action.rentPaymentId).filter(Boolean) as string[]));
         }
       }
       setPayments(loadedPayments);
       setDeposits(loadedDeposits);
      setPartnerOptions(activePartnerOptions);
      setPartnersLoading(false);
      if (!access.isFreeSingle) await refreshContractFiles(loadedContracts.map((contract) => contract.id), loadedTenants.map((tenant) => tenant.id));
       const requestedNavigation = resolveTenantNavigationContext(`${window.location.pathname}${window.location.search}`);
       const requestedTenantId = requestedNavigation?.tenantId || "";
      const requestedContractExpiring = new URLSearchParams(window.location.search).get("contractExpiring");
      setContractExpiringDays(requestedContractExpiring === "30" ? 30 : null);
      if (requestedTenantId && repairedTenants.some((tenant) => tenant.id === requestedTenantId)) {
        setDeepLinkTenantId(requestedTenantId);
        setDebtFocusPaymentId(requestedNavigation?.focus === "debt" ? requestedNavigation.paymentId : "");
        setShowArchived(archiveModeForTenantDeepLink(repairedTenants, requestedTenantId) === true);
        setDetailTenantId(requestedTenantId);
      }
      setLoaded(true);
    }
    load().catch((error) => {
      setPartnersLoading(false);
      window.alert(`加载租客失败：${error.message || error}`);
    });
  }, [access.isFreeSingle, refreshContractFiles]);

  useEffect(() => {
    if (access.isFreeSingle || !loaded || !detailTenantId) return;
    void refreshContractFiles(contracts.filter((contract) => contract.tenantId === detailTenantId).map((contract) => contract.id), [detailTenantId]);
  }, [access.isFreeSingle, contracts, detailTenantId, loaded, refreshContractFiles]);

  useEffect(() => {
    if (loaded && properties.length && !selectedPropertyIds.length) setSelectedPropertyIds(properties.map((property) => property.id));
  }, [loaded, properties, selectedPropertyIds.length]);
  useEffect(() => {
    setPage(1);
  }, [query, selectedPropertyIds]);
  useEffect(() => {
    setRetiredExpanded(false);
    setCurrentExpanded(false);
  }, [query, selectedPropertyIds, showArchived, sortDirection, sortKey, contractExpiringDays]);

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

  // A reminder deep link may arrive while a user preference would otherwise
  // hide its subject. Keep that preference intact, but temporarily make the
  // exact tenant visible until the user next changes a list control.
  const activeDeepLinkTenantId = deepLinkTenantId || focusedTenantId;
  const activeDeepLinkTenant = activeDeepLinkTenantId ? tenants.find((tenant) => tenant.id === activeDeepLinkTenantId) || null : null;
  const effectiveShowArchived = activeDeepLinkTenant ? isArchivedTenantStatus(activeDeepLinkTenant.status || "") : showArchived;
  const effectivePropertyIds = activeDeepLinkTenant?.propertyId && !selectedPropertyIds.includes(activeDeepLinkTenant.propertyId)
    ? [...selectedPropertyIds, activeDeepLinkTenant.propertyId]
    : selectedPropertyIds;
  const effectiveQuery = activeDeepLinkTenant ? "" : query;
  const effectiveContractExpiringDays = activeDeepLinkTenant ? null : contractExpiringDays;
  const debtCases = useMemo(() => getDebtCases({ properties, rooms, tenants, rentPayments: payments, waivedPaymentIds, today: businessToday }), [businessToday, payments, properties, rooms, tenants, waivedPaymentIds]);

  const filteredTenants = useMemo(() => {
    const keyword = effectiveQuery.trim().toLowerCase();
    const visible = filterTenantsByArchiveMode(tenants, effectiveShowArchived);
    const propertyVisible = effectivePropertyIds.length
      ? visible.filter((tenant) => effectivePropertyIds.includes(tenant.propertyId))
      : [];
    const contractVisible = effectiveContractExpiringDays === null
      ? propertyVisible
      : propertyVisible.filter((tenant) => contracts.some((contract) => contract.tenantId === tenant.id && isContractExpiringWithin(contract, effectiveContractExpiringDays)));
    if (!keyword) return contractVisible;
    return contractVisible.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      const fileNames = getTenantFiles(tenant.id, contracts, filesByContract, filesByTenant).map((file) => file.fileName).join(" ");
      const displayStatus = getTenantDebtDisplay({
        tenant,
        payments: payments.filter((payment) => payment.tenantId === tenant.id),
        debtCases: getTenantDebtCases(tenant.id, debtCases),
        waivedPaymentIds,
        today: businessToday
      }).displayStatus;
      return [tenant.name, tenant.phone, tenant.wechat, property?.name || "", room?.name || "", room?.roomNumber || "", tenant.status, displayStatus, fileNames].join(" ").toLowerCase().includes(keyword);
    });
  }, [businessToday, contracts, debtCases, effectiveContractExpiringDays, effectivePropertyIds, effectiveQuery, effectiveShowArchived, filesByContract, filesByTenant, payments, properties, rooms, tenants, waivedPaymentIds]);

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

  const tenantRentDisplayById = useMemo(() => new Map(
    tenants.map((tenant) => [tenant.id, getTenantDebtDisplay({
      tenant,
      payments: payments.filter((payment) => payment.tenantId === tenant.id),
      debtCases: getTenantDebtCases(tenant.id, debtCases),
      waivedPaymentIds,
      today: businessToday
    })])
  ), [businessToday, debtCases, payments, tenants, waivedPaymentIds]);

  const sortedTenants = useMemo(() => {
    return sortTenantsByRoomAndStatus(filteredTenants, rooms, {
      mode: sortKey,
      direction: sortDirection,
      getProperty: (tenant) => properties.find((item) => item.id === tenant.propertyId)?.name || "",
      getExpiry: (tenant) => tenantRentDisplayById.get(tenant.id)?.expiry.endDate || "",
      getStatusRank: (tenant) => tenantStatusRank(tenant, tenantRentDisplayById.get(tenant.id)?.expiry)
    });
  }, [filteredTenants, properties, rooms, sortDirection, sortKey, tenantRentDisplayById]);

  const pagedTenants = pageRows(sortedTenants, page, pageSize);
  const visibleTenantGroups = splitTenantGroups(pagedTenants);
  const retiredVisible = effectiveShowArchived ? [] : visibleTenantGroups.retired;
  const currentVisible = visibleTenantGroups.current;
  const { current: currentCount, retired: retiredCount } = countTenantGroups(sortedTenants);
  const showRetiredExpanded = retiredExpanded;
  const visibleCurrentTenants = currentExpanded ? currentVisible : currentVisible.slice(0, 8);
  const visibleTenants = effectiveShowArchived ? pagedTenants : [...visibleCurrentTenants, ...(showRetiredExpanded ? retiredVisible : [])];

  useEffect(() => {
    if (!loaded || !deepLinkTenantId) return;
    const plan = planTenantDeepLink({ tenantId: deepLinkTenantId, tenants, sortedTenants, pageSize });
    if (!plan) return;
    if (showArchived !== plan.showArchived) {
      setShowArchived(plan.showArchived);
      return;
    }
    if (page !== plan.page) {
      setPage(plan.page);
      return;
    }
    if (plan.expandCurrent) setCurrentExpanded(true);
    if (plan.expandRetired) setRetiredExpanded(true);
    setDetailTenantId(plan.tenant.id);
    setFocusedTenantId(plan.tenant.id);
    setDeepLinkTenantId("");
  }, [deepLinkTenantId, loaded, page, pageSize, showArchived, sortedTenants, tenants]);

  useEffect(() => {
    if (!focusedTenantId || detailTenantId !== focusedTenantId || !visibleTenants.some((tenant) => tenant.id === focusedTenantId)) return;
    tenantRowRefs.current.get(focusedTenantId)?.scrollIntoView({ behavior: "auto", block: "start", inline: "nearest" });
  }, [detailTenantId, focusedTenantId, visibleTenants]);

  function updateTenantSearch(value: string) {
    setFocusedTenantId("");
    setQuery(value);
  }

  function clearTenantSearch() {
    setFocusedTenantId("");
    setQuery("");
  }

  async function waiveDebtCase(debtCase: DebtCase) {
    if (waivingDebtPaymentId === debtCase.paymentId) return;
    if (!window.confirm("确认放弃追缴这笔欠费吗？不会生成收入或支出，历史记录将保留。")) return;
    setWaivingDebtPaymentId(debtCase.paymentId);
    try {
      const session = await getValidSupabaseSession();
      if (!session) {
        window.alert("登录已失效，请重新登录。");
        return;
      }
      const response = await fetch("/api/rent-collection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ action: "waive", rentPaymentId: debtCase.paymentId, reason: "" })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(payload.error || "放弃追缴失败。");
        return;
      }
      setWaivedPaymentIds((current) => new Set([...current, debtCase.paymentId]));
      setDebtFocusPaymentId("");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "放弃追缴失败。");
    } finally {
      setWaivingDebtPaymentId("");
    }
  }

  function close() {
    setOpen(false);
    setForm(emptyTenant);
    setContractForm({ startDate: today(), endDate: "" });
    setPaymentForm(emptyTenantPayment);
    setNewPaymentDepositAmount(0);
    setOwnershipMode(partnerOptions[0]?.value || "");
  }

  function openTenantForm(tenant?: BusinessTenant) {
    if (!tenant) {
      setForm(emptyTenant);
      setContractForm({ startDate: today(), endDate: "" });
      setPaymentForm(emptyTenantPayment);
      setNewPaymentDepositAmount(0);
      setOwnershipMode(partnerOptions[0]?.value || "");
      setOpen(true);
      return;
    }
    const contract = latestContractForTenant(tenant.id, contracts);
    const currentCoverage = latestCoverageForTenant(tenant.id, payments);
    setForm(tenant);
    setContractForm({ startDate: contract?.startDate || today(), endDate: contract?.endDate || "" });
    setPaymentForm({
      ...emptyTenantPayment,
      propertyId: tenant.propertyId,
      roomId: tenant.roomId,
      tenantId: tenant.id,
      amountDue: 0,
      coverageStartDate: currentCoverage?.coverageStartDate || "",
      coverageEndDate: currentCoverage?.coverageEndDate || ""
    });
    setNewPaymentDepositAmount(0);
    setOwnershipMode(partnerOptions[0]?.value || "");
    setOpen(true);
  }

  function toggleSort(nextKey: TenantSortKey) {
    setFocusedTenantId("");
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
    if (!form.id && !ownershipMode) {
      window.alert("请先选择收款归属。");
      return;
    }
    if (!Number.isInteger(form.occupantCount) || form.occupantCount < 1) {
      window.alert("入住人数请输入1或更大的正整数。");
      return;
    }
    try {
      const previousTenant = form.id ? tenants.find((tenant) => tenant.id === form.id) || null : null;
      if (form.id) {
        if (!previousTenant) throw new Error("租客不存在，请刷新后重试。");
        const currentCoverage = latestCoverageForTenant(form.id, payments);
        const coverageStartDate = paymentForm.coverageStartDate || "";
        const coverageEndDate = paymentForm.coverageEndDate || "";
        if (currentCoverage && (!coverageStartDate || !coverageEndDate || coverageStartDate > coverageEndDate)) {
          window.alert("请填写有效的当前租金覆盖起止日期。");
          return;
        }
        if (!currentCoverage && (coverageStartDate || coverageEndDate)) {
          window.alert("当前租客没有可编辑的租金覆盖记录。");
          return;
        }
        const nextPayments = currentCoverage
          ? payments.map((payment) => payment.id === currentCoverage.id
            ? { ...payment, coverageStartDate, coverageEndDate, isOverdue: isCoverageExpired({ ...payment, coverageStartDate, coverageEndDate }) }
            : payment)
          : payments;
        setSaving(true);
        try {
          const nextTenants = tenants.map((tenant) => tenant.id === form.id ? form : tenant);
          const nextRooms = syncRoomsAfterTenantChange(rooms, nextTenants, previousTenant, form);
          const nextDeposits = syncTenantDepositRecord(form, deposits, partnerOptions[0]?.value || "");
          const tenantChanged = JSON.stringify(previousTenant) !== JSON.stringify(form);
          const roomsChanged = JSON.stringify(rooms) !== JSON.stringify(nextRooms);
          if (tenantChanged) {
            const savedTenantIds = await saveBusinessData(tenantKey, nextTenants);
            if (!savedTenantIds.includes(form.id)) throw new Error("租客资料保存失败");
          }
          if (roomsChanged) await saveBusinessData(roomKey, nextRooms);
          if (JSON.stringify(deposits) !== JSON.stringify(nextDeposits)) await saveBusinessData(depositKey, nextDeposits);
          if (JSON.stringify(payments) !== JSON.stringify(nextPayments)) {
            const savedPaymentIds = await saveBusinessData(rentPaymentKey, nextPayments);
            if (!savedPaymentIds.includes(currentCoverage!.id)) throw new Error("租金覆盖日期保存失败");
          }
          const currentContract = latestContractForTenant(form.id, contracts);
          if (currentContract) {
            const nextContract = {
              ...currentContract,
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
          setDeposits(nextDeposits);
          setTenants(nextTenants);
          setRooms(nextRooms);
          setPayments(nextPayments);
        } catch {
          throw new Error("租客资料保存失败");
        }

        close();
        return;
      }

      const nextTenant = form.id ? form : { ...form, id: crypto.randomUUID(), depositAmount: newPaymentDepositAmount };
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
      const nextPayment = buildTenantPayment(nextTenant, { ...paymentForm, receivedBy: ownershipMode }, newPaymentDepositAmount);
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
      const saved = await persistAll({ tenants: next, rooms: nextRooms, contracts: nextContracts, deposits: nextDeposits, payments: nextPayments }, "租客和首次收款保存失败");
      // New rows receive their immutable created_at on the server. Re-read it
      // instead of inventing a client time so the explicit 时间 sort is correct
      // immediately after a successful tenant creation.
      if (saved) {
        try {
          setTenants(await refreshBusinessData<BusinessTenant>(tenantKey, next));
        } catch {
          // The successful optimistic list remains visible; a later route
          // load will still obtain the authoritative server creation time.
        }
      }
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
    let plan: { tenants: BusinessTenant[]; rooms: BusinessRoom[]; contracts: BusinessContract[]; deposits: BusinessDeposit[] };
    try {
      plan = buildTenantMoveOutPlan({
        tenant, tenants, rooms, contracts, deposits, depositStatus, actualMoveOutDate,
        actualMoveOutDateEnabled, isCurrentRelationship: isCurrentRentalRelationship, isVoidedDeposit
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "退租资料校验失败，请刷新后重试。");
      return;
    }
    await moveOutSubmissionGuardRef.current.run(async () => {
      const saved = await persistAll(plan, "退租保存失败，请重新进入租客详情确认押金状态。");
      if (!saved) return false;
      try {
        const refreshedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, plan.deposits);
        setDeposits(refreshedDeposits);
        setMoveOutTenant(null);
        window.alert("退租办理成功。房间、租客、合同和押金状态已更新。");
        return true;
      } catch {
        window.alert("退租已提交，但押金状态无法确认，请重新进入租客详情确认。");
        return false;
      }
    });
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
    if (!Number.isFinite(amount) || amount < 0) {
      window.alert("请输入不小于 0 的押金金额。");
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
      const defaultPartner = partnerOptions[0]?.value || "";
      if (!defaultPartner) throw new Error("没有可用的合伙人归属，请刷新后重试。");
      const nextDeposit: BusinessDeposit = {
        id: crypto.randomUUID(),
        propertyId: tenant.propertyId,
        roomId: tenant.roomId,
        tenantId: tenant.id,
        type: "收取",
        amount,
        status,
        transactionDate: today(),
        receivedBy: defaultPartner,
        paidBy: defaultPartner,
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
    if (!window.confirm("确认归档该租客吗？\n归档后默认隐藏，历史收租、押金、利润和租客附件都会保留。")) return;
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
    const permissionMessage = tenantDeletePermissionMessage(access.can("tenants", "delete"));
    if (permissionMessage) {
      window.alert(permissionMessage);
      return;
    }
    setSaving(true);
    try {
      // Deletion must be based on an authoritative, current snapshot. The
      // generic business writer computes deletes from its remote-id snapshot;
      // using a stale page/cache snapshot can leave a child row behind and
      // make the later tenant delete fail at the FK boundary.
      const freshTenants = await refreshBusinessData<BusinessTenant>(tenantKey, tenants);
      const freshTenant = freshTenants.find((item) => item.id === tenant.id);
      if (!freshTenant) throw new Error("租客记录已不存在，请刷新页面。" );
      const nextTenants = freshTenants.filter((item) => item.id !== tenant.id);
      // The server checks every tenant relation again. An allowed delete only
      // removes the empty tenant shell; historical child data is never deleted.
      await saveBusinessData(tenantKey, nextTenants);

      setTenants(nextTenants);
      setDetailTenantId("");
    } catch (error: any) {
      window.alert(error.message || "永久删除租客失败，请稍后重试。");
    } finally {
      setSaving(false);
      setDeleteTenantTarget(null);
      setDeleteConfirmation("");
    }
  }

  async function requestPermanentDelete(tenant: BusinessTenant) {
    const permissionMessage = tenantDeletePermissionMessage(access.can("tenants", "delete"));
    if (permissionMessage) {
      window.alert(permissionMessage);
      return;
    }
    setSaving(true);
    setDeleteBlockedMessage("");
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录状态已失效，请重新登录。");
      const response = await fetch("/api/business-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ key: "business-tenants", dryRun: true, operations: [{ action: "delete", id: tenant.id }] })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "暂时无法确认该租客是否可以永久删除，请稍后重试。");
      setDeleteConfirmation("");
      setDeleteTenantTarget(tenant);
    } catch (error) {
      setDeleteBlockedMessage(error instanceof Error ? error.message : "暂时无法确认该租客是否可以永久删除，请稍后重试。");
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
    if (!window.confirm("确定要删除这个租客附件吗？")) return;
    setSaving(true);
    try {
      await deleteContractFile(file);
      setContractFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error: any) {
      window.alert(error.message || "删除租客附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="租客管理" description={access.isFreeSingle ? "默认显示核心信息，点击租客后直接查看完整资料。" : "默认显示核心信息，点击租客后直接查看和管理租客附件。"}>
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">租客列表</h2>
            <p className="muted">{access.isFreeSingle ? "默认只显示一行核心信息，点击后展开详情。" : "默认只显示一行核心信息，点击后展开详情和租客附件。"}</p>
          </div>
          <div className="top-actions tenant-top-actions">
            {access.can("tenants", "create") ? <button className="btn primary" disabled={!loaded || saving} onClick={() => openTenantForm()} type="button">
              <Plus size={17} /> 新增租客
            </button> : null}
            <button className="btn" onClick={() => { setFocusedTenantId(""); setShowArchived((current) => !current); setPage(1); setDetailTenantId(""); setRetiredExpanded(false); setCurrentExpanded(false); }} type="button">
              {showArchived ? "返回租客" : "显示归档"}
            </button>
          </div>
        </div>

        <div className="list-controls">
          <div className="tenant-search-box search-box">
            <input
              autoComplete="off"
              onChange={(event) => updateTenantSearch(event.target.value)}
              placeholder={access.isFreeSingle ? "搜索姓名、电话、联系方式、房源、房间" : "搜索姓名、电话、联系方式、房源、房间、租客附件"}
              value={query}
            />
            {query ? (
              <button aria-label="清除搜索和房源筛选" className="icon-button" onClick={clearTenantSearch} type="button">
                <X size={15} />
              </button>
            ) : null}
          </div>
          <PropertyMultiSelect properties={properties} selectedIds={selectedPropertyIds} onChange={(ids) => { setFocusedTenantId(""); setSelectedPropertyIds(ids); setPage(1); }} />
          <div className="sort-pills">
            <SortButton active={sortKey === "room"} direction={sortDirection} label="房间" onClick={() => toggleSort("room")} />
            <SortButton active={sortKey === "expiry"} direction={sortDirection} label="到期日" onClick={() => toggleSort("expiry")} />
            <SortButton active={sortKey === "rent"} direction={sortDirection} label="月租" onClick={() => toggleSort("rent")} />
            <SortButton active={sortKey === "property"} direction={sortDirection} label="房源" onClick={() => toggleSort("property")} />
            <SortButton active={sortKey === "time"} direction={sortDirection} label="时间" onClick={() => toggleSort("time")} />
          </div>
        </div>

        <div className="finance-list tenant-compact-list">
          {showArchived && sortedTenants.length ? <div className="tenant-status-group-title">归档租客（{sortedTenants.length}组）</div> : null}
          {currentVisible.length ? <div className="tenant-status-group-title">当前租客（{currentCount}组）</div> : null}
          {visibleTenants.map((tenant, index, pageTenants) => {
            const retired = !showArchived && isEndedTenantStatus(tenant.status);
            const previousRetired = !showArchived && index > 0 && isEndedTenantStatus(pageTenants[index - 1].status);
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const files = getTenantFiles(tenant.id, contracts, filesByContract, filesByTenant);
            const contract = latestContractForTenant(tenant.id, contracts);
            const rentDisplay = tenantRentDisplayById.get(tenant.id) || getTenantDebtDisplay({ tenant, payments: [], debtCases: [] });
            const displayStatus = rentDisplay.displayStatus;
            const depositStatus = tenantDepositStatus(tenant, deposits);
            const expiryInfo = rentDisplay.expiry;
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
            const statusSlots = getTenantStatusSlots({
              lifecycleLabel: tenant.status || "在租",
              lifecycleTone: tenantTone(tenant.status || "在租"),
              hasCurrentDebt: displayStatus === "欠租",
              hasHistoricalDebt: rentDisplay.hasHistoricalOpenDebt,
              paymentPerformanceLabel,
              paymentPerformanceTone,
              depositStatus,
              depositTone: depositStatus === "押金已处理" ? "green" : depositStatus === "押金待处理" ? "amber" : ""
            });
            const expanded = detailTenantId === tenant.id;
            const tenantDebtCases = getTenantDebtCases(tenant.id, debtCases);
            return (
              <Fragment key={tenant.id}>
                {retired && !previousRetired ? <div className="tenant-status-group-title tenant-retired-group-title"><button className="tenant-status-group-toggle" type="button" onClick={() => setRetiredExpanded((current) => !current)} aria-expanded={showRetiredExpanded}>已退租租客（{retiredCount}组） <span>{showRetiredExpanded ? "收起" : "展开"}</span></button></div> : null}
                {!retired || showRetiredExpanded ? <article
                  className={`finance-list-item${expanded ? " tenant-card-expanded" : ""}${focusedTenantId === tenant.id ? " tenant-deep-link-target" : ""}`}
                  id={tenantDeepLinkScrollTargetId(tenant.id)}
                  ref={(node) => {
                    if (node) tenantRowRefs.current.set(tenant.id, node);
                    else tenantRowRefs.current.delete(tenant.id);
                  }}
                >
                <button aria-expanded={expanded} className="tenant-card-toggle" onClick={() => { setDebtFocusPaymentId(""); setDetailTenantId(expanded ? "" : tenant.id); }} type="button">
                  <span className="finance-line tenant-finance-line tenant-list-row-stack">
                    <span className="tenant-list-row tenant-list-identity-row">
                      <span className="tenant-name">{tenant.name || "-"}</span>
                      <span className="tenant-property-short" title={property?.name || "-"}>{compactPropertyName(property?.name)}</span>
                      <span className="tenant-list-room" title={room?.name || room?.roomNumber || "-"}>{room?.name || room?.roomNumber || "-"}</span>
                    </span>
                    <span className="tenant-list-row tenant-list-rent-row">
                      <strong className="tenant-list-received" title={latestReceivedPayment ? `最近一次实收 ${euro(latestReceivedPayment.amountPaid)}` : "暂无实收"}>{latestReceivedPayment ? `实收 ${euro(latestReceivedPayment.amountPaid)}` : "暂无实收"}</strong>
                      <strong className={`tenant-list-rent-status ${tenantRentRowTone(expiryInfo)}`}>{tenantRentRowLabel(expiryInfo)}</strong>
                      <span className="tenant-list-coverage">{expiryInfo.endDate ? `覆盖至 ${expiryInfo.endDate}` : "无覆盖日期"}</span>
                    </span>
                    <span className="tenant-list-row tenant-status-row" onClick={(event) => event.stopPropagation()}>
                      {statusSlots.map((slot, index) => <span className={`tenant-status-item tenant-status-slot tenant-status-slot-${index + 1}${index === 3 ? " tenant-payment-performance" : ""}${index === 4 ? " tenant-deposit-badge" : ""}`} key={index} aria-hidden={!slot}>
                        {slot ? <StatusBadge tone={slot.tone}>{slot.label}</StatusBadge> : null}
                      </span>)}
                    </span>
                  </span>
                </button>
                {expiryInfo.label ? (
                  <div className={`tenant-expiry-row ${expiryInfo.level}`}>
                    <span className="tenant-expiry-dot" aria-hidden="true" />
                    <strong>{expiryInfo.label}</strong>
                    <span className="tenant-expiry-date">覆盖至 {expiryInfo.endDate}</span>
                  </div>
                ) : null}
                {expanded ? <>
                  <TenantDetail
                    contract={contract}
                    coverageEnd={rentDisplay.state.coverageEndDate || "-"}
                    coverageExpiry={expiryInfo.label}
                    payments={payments.filter((payment) => payment.tenantId === tenant.id)}
                    deposits={deposits.filter((deposit) => deposit.tenantId === tenant.id)}
                    debtCases={tenantDebtCases}
                    focusedDebtPaymentId={debtFocusPaymentId}
                    onWaiveDebt={waiveDebtCase}
                    files={files}
                    attachmentLoadState={contractFilesLoadState}
                    attachmentLoadError={contractFilesLoadError}
                    onRetryFiles={() => void refreshContractFiles(contracts.filter((item) => item.tenantId === tenant.id).map((item) => item.id), [tenant.id])}
                    isAdmin={access.can("tenants", "delete")}
                    canEdit={access.can("tenants", "edit")}
                    canArchive={access.can("tenants", "archive")}
                    canCollectRent={access.can("rent_payments", "create") && isCurrentRentalRelationship(tenant) && tenantDebtCases.length === 0}
                    canViewFiles={access.can("attachments") && access.canSensitive("canViewContractFiles")}
                    canDownloadFiles={access.canSensitive("canDownloadFiles")}
                    canUploadFiles={access.can("attachments", "create") && access.canSensitive("canUploadFiles")}
                    canDeleteFiles={access.can("attachments", "delete") && access.canSensitive("canDeleteFiles")}
                    onDeleteFile={removeContractFile}
                    onArchive={() => archiveTenant(tenant)}
                    onPermanentDelete={() => requestPermanentDelete(tenant)}
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
                    waivingDebtPaymentId={waivingDebtPaymentId}
                    tenant={tenant}
                    depositStatus={depositStatus}
                    partnerDirectory={partnerDirectory}
                  />
                </> : null}
                </article> : null}
              </Fragment>
            );
          })}
          {retiredVisible.length > 0 && !showRetiredExpanded ? <div className="tenant-status-group-title tenant-retired-group-title"><button className="tenant-status-group-toggle" type="button" onClick={() => setRetiredExpanded(true)} aria-expanded={false}>已退租租客（{retiredCount}组） <span>展开</span></button></div> : null}
          {currentVisible.length > 8 ? <div className="tenant-list-group-actions"><button className="btn compact" type="button" onClick={() => setCurrentExpanded((current) => !current)}>{currentExpanded ? "收起当前租客" : `展开更多（还有 ${currentVisible.length - 8} 条）`}</button></div> : null}
        </div>

        <PaginationControls page={page} pageSize={pageSize} total={filteredTenants.length} onPageChange={(nextPage) => { setFocusedTenantId(""); setPage(nextPage); }} onPageSizeChange={(size) => { setFocusedTenantId(""); setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">{form.id ? "编辑租客" : "新增租客"}</h2>
              <button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button>
            </div>
            <form className={`form-grid tenant-form-grid ${form.id ? "tenant-edit-form" : ""}`} onSubmit={submit}>
              <SearchableSelect
                className="tenant-form-wide"
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
                className="tenant-form-wide"
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
              <TextField className="tenant-edit-name" label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField className="tenant-edit-phone" label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <TextField className="tenant-form-wide tenant-edit-wechat" label="WhatsApp / 其他" value={form.wechat} onChange={(wechat) => setForm((current) => ({ ...current, wechat }))} />
              {form.id ? <MoneyInput className="tenant-edit-monthly" label="当前月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} /> : <MoneyInput label="本次房租金额" value={paymentForm.amountDue} onChange={(amountDue) => updatePaymentMoney({ amountDue, paymentStatus: amountDue > 0 ? "已收" : paymentForm.paymentStatus })} />}
              <div className="field tenant-edit-occupant"><label>入住人数</label><input inputMode="numeric" min="1" step="1" type="number" value={form.occupantCount || ""} onChange={(event) => setForm((current) => ({ ...current, occupantCount: Number(event.target.value) }))} /></div>
              {form.id ? <MoneyInput className="tenant-edit-deposit" label="押金标准 / 应收押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} /> : <MoneyInput label="押金" value={newPaymentDepositAmount} onChange={setNewPaymentDepositAmount} />}
              {!form.id ? <div className="field"><label>本次合计收入</label><input readOnly value={euro(Number(paymentForm.amountDue || 0) + Number(newPaymentDepositAmount || 0))} /></div> : null}
              {form.id ? <>
                <div className="field tenant-edit-coverage-start"><label>租金覆盖开始日期</label><input required type="date" value={paymentForm.coverageStartDate || ""} onChange={(event) => updatePaymentMoney({ coverageStartDate: event.target.value })} /></div>
                <div className="field tenant-edit-coverage-end"><label>租金覆盖结束日期</label><input required type="date" min={paymentForm.coverageStartDate || undefined} value={paymentForm.coverageEndDate || ""} onChange={(event) => updatePaymentMoney({ coverageEndDate: event.target.value })} /></div>
              </> : null}
              {!form.id ? <>
                <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={paymentForm.coverageStartDate || ""} onChange={(event) => updatePaymentMoney({ coverageStartDate: event.target.value, rentMonth: event.target.value.slice(0, 7) })} /></div>
                <div className="field"><label>租金覆盖结束日期</label><input required type="date" value={paymentForm.coverageEndDate || ""} onChange={(event) => updatePaymentMoney({ coverageEndDate: event.target.value })} /></div>
              </> : null}
              <div className={`field ${form.id ? "tenant-edit-payment-day" : ""}`}><label>每月缴费日</label><input inputMode="numeric" max="31" min="1" placeholder="不设置可留空" type="number" value={form.paymentDay ?? ""} onChange={(event) => setForm((current) => ({ ...current, paymentDay: event.target.value === "" ? undefined : Number(event.target.value) }))} /></div>
              {!form.id ? <OwnershipField options={partnerOptions} optionsLoading={partnersLoading} mode={ownershipMode} onModeChange={setOwnershipMode} /> : null}
              {form.id ? <SearchableSelect className="tenant-edit-status" label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} /> : null}
              {!form.id ? <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} /> : null}
              <TextField className={form.id ? "tenant-edit-source" : undefined} label="来源" value={form.source} onChange={(source) => setForm((current) => ({ ...current, source }))} />
              <div className="field tenant-form-wide tenant-edit-note">
                <label>备注</label>
                <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              {!access.isFreeSingle ? <p className="muted" style={{ gridColumn: "1 / -1" }}>请先保存租客和合同字段；保存后在租客详情中可逐个添加租客附件。收入附件请在对应收款记录详情中添加。</p> : null}
              <div className="modal-actions">
                <button className="btn" onClick={close} type="button">取消</button>
                <button className="btn primary" disabled={saving} type="submit">保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {moveOutTenant ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoveOutTenant(null); }}>
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
              <button className="btn primary" disabled={saving} onClick={() => void moveOut(moveOutTenant, moveOutDepositStatus, moveOutDate)} type="button" aria-busy={saving}>{saving ? "办理中…" : "确认退租"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {actualMoveOutDateEnabled && moveOutDateTenant ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setMoveOutDateTenant(null); }}>
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
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDepositStatusTenant(null); }}>
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
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateDepositTenant(null); }}>
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

      {deleteBlockedMessage ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteBlockedMessage(""); }}>
          <section className="card modal-card deposit-status-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-delete-blocked-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title" id="tenant-delete-blocked-title">无法永久删除</h2><button className="btn" onClick={() => setDeleteBlockedMessage("")} type="button"><X size={17} /> 关闭</button></div>
            <p className="muted">{deleteBlockedMessage}</p>
            <div className="modal-actions"><button className="btn primary" onClick={() => setDeleteBlockedMessage("")} type="button">知道了</button></div>
          </section>
        </div>
      ) : null}

      {deleteTenantTarget ? (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setDeleteTenantTarget(null); setDeleteConfirmation(""); } }}>
          <section className="card modal-card deposit-status-modal" role="dialog" aria-modal="true" aria-labelledby="tenant-delete-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title" id="tenant-delete-title">永久删除租客</h2>
              <button className="btn" onClick={() => { setDeleteTenantTarget(null); setDeleteConfirmation(""); }} type="button"><X size={17} /> 关闭</button>
            </div>
            <p className="muted">仅允许删除完全没有业务数据的空壳租客。历史合同、收款、押金、结算和附件绝不会因删除租客而被清理。</p>
            <div className="field">
              <label htmlFor="tenant-delete-confirmation">确认文字</label>
              <input id="tenant-delete-confirmation" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" autoCapitalize="characters" />
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { setDeleteTenantTarget(null); setDeleteConfirmation(""); }} type="button">取消</button>
              <button className="btn danger" disabled={saving || !isTenantDeleteConfirmed(deleteConfirmation)} onClick={() => void permanentlyDeleteTenant(deleteTenantTarget)} type="button">确认永久删除</button>
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
  debtCases,
  focusedDebtPaymentId,
  onWaiveDebt,
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
  waivingDebtPaymentId,
  onDeleteFile,
  onEdit,
  onMoveOut,
  onEditMoveOutDate,
  onEditDepositStatus,
  onCreateDeposit,
  onPermanentDelete,
  onAddFile,
  onRestore,
  depositStatus,
  partnerDirectory
}: {
  tenant: BusinessTenant;
  contract?: BusinessContract | null;
  coverageEnd: string;
  coverageExpiry: string;
  payments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  debtCases: readonly DebtCase[];
  focusedDebtPaymentId: string;
  onWaiveDebt: (debtCase: DebtCase) => void;
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
  waivingDebtPaymentId: string;
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
  partnerDirectory: Record<string, string>;
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
  const primaryDebtCase = debtCases[0] || null;
  return (
    <div className="record-detail-panel tenant-detail-panel">
      {coverageExpiry ? <div className="tenant-detail-expiry-summary"><span>距离租金到期</span><strong>{coverageExpiry}</strong></div> : null}
      <TenantDetailActions
        tenant={tenant}
        debtCases={debtCases}
        focusedDebtPaymentId={focusedDebtPaymentId}
        onWaiveDebt={onWaiveDebt}
        canCollectRent={canCollectRent}
        canEdit={canEdit}
        canArchive={canArchive}
        isAdmin={isAdmin}
        archived={archived}
        saving={saving}
        waivingDebtPaymentId={waivingDebtPaymentId}
        onMoveOut={onMoveOut}
        onRestore={onRestore}
        onArchive={onArchive}
        onEdit={onEdit}
        onPermanentDelete={onPermanentDelete}
      />

      <CompactDetailGroup className="tenant-core-detail-group">
        <CompactDetailGrid className="tenant-core-detail-grid">
        <div className="tenant-detail-pair-row">
          <DetailField className="tenant-detail-property" label="房源" value={propertyName} />
          <DetailField className="tenant-detail-room" label="房间" value={roomName} />
        </div>
        <div className="tenant-detail-pair-row">
          <DetailField label="入住人数" value={`${tenant.occupantCount}人`} />
          <DetailField label="每月缴费日" value={tenant.paymentDay ? `每月${tenant.paymentDay}号` : "未设置"} />
        </div>
        <div className="tenant-detail-pair-row">
          <DetailField label="月租标准" value={euro(tenant.monthlyRent)} />
          <DetailField label="最近一次实收" value={`${euro(latestReceived)}${primaryDebtCase ? ` · 已逾期${primaryDebtCase.daysOverdue}天` : ""}`} />
        </div>
        <div className="tenant-detail-pair-row">
          <DetailField label="押金标准" value={euro(tenant.depositAmount)} />
          <DetailField label="已收押金" value={euro(receivedDeposit)} />
        </div>
        <div className="tenant-detail-wide-row tenant-coverage-field">
          <DetailField label="租金覆盖至" value={coverageEnd} />
        </div>
        <div className="tenant-detail-wide-row tenant-note-field">
          <DetailField label="备注" value={tenant.notes || "-"} />
        </div>
        <div className="tenant-details-toggle-row">
          <button className="tenant-details-toggle" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setDetailsOpen((current) => !current); }} aria-expanded={detailsOpen}>
            <span className="tenant-details-toggle-content">
              <span>{detailsOpen ? "收起详情" : "详细资料"}</span>
              <span className="tenant-details-chevron" aria-hidden="true">{detailsOpen ? "⌃" : "⌄"}</span>
            </span>
          </button>
        </div>
        {detailsOpen ? <>
          <DetailField label="电话" value={tenant.phone || "-"} />
          <DetailField label="WhatsApp / 其他" value={tenant.wechat || "-"} />
          <DetailField label="入住日期" value={contract?.startDate || "-"} />
          <DetailField label="合同到期" value={contract?.endDate || "-"} />
          <DetailField label="来源" value={tenant.source || "-"} />
        </> : null}
        </CompactDetailGrid>
      </CompactDetailGroup>

      {movedOut || depositStatus === "未建立押金管理记录" ? (
        <div className="tenant-lifecycle-status-area">
          <div className="deposit-status-detail">
          <div>
            <span className="muted">押金状态</span>
            <StatusBadge tone={depositStatus === "押金已处理" ? "green" : depositStatus === "押金待处理" ? "amber" : ""}>{depositStatus}</StatusBadge>
            {depositStatus === "未建立押金管理记录" ? <span className="muted">该租客只有收款记录中的押金金额，尚未建立独立押金管理记录。</span> : null}
          </div>
          {depositStatus === "未建立押金管理记录" ? <button className="btn" disabled={saving} type="button" onClick={onCreateDeposit}>建立押金管理记录</button> : <button className="btn" disabled={saving} type="button" onClick={onEditDepositStatus}>修改押金状态</button>}
          </div>
          {movedOut && isActualMoveOutDateEnabled() ? (
            <div className="deposit-status-detail">
              <div>
                <span className="muted">实际退租日期</span>
                <strong>{tenant.actualMoveOutDate || "未录入"}</strong>
              </div>
              <button className="btn" disabled={saving} type="button" onClick={onEditMoveOutDate}>{tenant.actualMoveOutDate ? "修改实际退租日期" : "补录实际退租日期"}</button>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="tenant-performance-section">
        <div className="detail-section-title">付款摘要</div>
        <div className="tenant-performance-summary">
          <span className="tenant-performance-metric">累计迟交<strong>{performance.lateCount}次</strong></span>
          <span className="tenant-performance-metric">平均迟交<strong>{performance.averageLateDays?.toFixed(0) || "-"}天</strong></span>
          <span className="tenant-performance-metric">最长迟交<strong>{performance.longestLateDays ?? "-"}天</strong></span>
          <span className="tenant-performance-metric">按时付款率<strong className={`tenant-payment-rate ${paymentRateTone}`}>{paymentRateLabel}</strong></span>
        </div>
        {performance.currentOverdueDays != null ? <div className={`tenant-current-overdue ${performance.currentOverdueDays >= 10 ? "red" : "yellow"}`}>当前逾期 {performance.currentOverdueDays} 天</div> : null}
      </section>

      <section className="tenant-timeline-section">
        <TenantMonthlyPaymentPanel tenant={tenant} payments={payments} events={timeline} performance={performance} today={localToday()} />
      </section>

      <div className="attachment-panel payment-history-panel">
        <button type="button" className="payment-history-toggle" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen}><span className="tenant-collapse-label">查看原始收款记录（{payments.length}笔）</span><span className="tenant-collapse-action">{historyOpen ? "收起" : "展开"}</span></button>
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
                    <span><b className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy, partnerDirectory)}</b></span>
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
        <button className="attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)} aria-expanded={attachmentsOpen}><span className="tenant-collapse-label">{`租客附件（${files.length}个）`}</span><span className="tenant-collapse-action">{attachmentsOpen ? "收起" : "展开"}</span></button>
        <div className="detail-section-title">租客附件</div>
        <TenantAttachmentActions files={files} loadState={attachmentLoadState} loadError={attachmentLoadError} onRetry={onRetryFiles} onDelete={onDeleteFile} canDownload={canDownloadFiles} canDelete={canDeleteFiles} />
        {canUploadFiles ? <AttachmentAddControl label="添加附件" disabled={saving} onAdd={addAttachment} /> : null}
      </div> : null}

    </div>
  );
}

function TenantDetailActions({ tenant, debtCases, focusedDebtPaymentId, onWaiveDebt, canCollectRent, canEdit, canArchive, isAdmin, archived, saving, waivingDebtPaymentId, onMoveOut, onRestore, onArchive, onEdit, onPermanentDelete }: { tenant: BusinessTenant; debtCases: readonly DebtCase[]; focusedDebtPaymentId: string; onWaiveDebt: (debtCase: DebtCase) => void; canCollectRent: boolean; canEdit: boolean; canArchive: boolean; isAdmin: boolean; archived: boolean; saving: boolean; waivingDebtPaymentId: string; onMoveOut: () => void; onRestore: () => void; onArchive: () => void; onEdit: () => void; onPermanentDelete: () => void }) {
  const movedOut = tenant.status.includes("已退租");
  const primaryDebtCase = debtCases[0] || null;
  return <div className="compact-action-grid tenant-detail-actions">
    {primaryDebtCase?.canCollect ? <a className="btn tenant-detail-action-button" href={`/rent-payments?collectPayment=${encodeURIComponent(primaryDebtCase.paymentId)}&overdue=1`}>续交房租</a> : canCollectRent ? <a className="btn tenant-detail-action-button" href={`/rent-payments?renewTenantId=${tenant.id}`}>续交房租</a> : null}
    {!movedOut && canArchive ? <button className="btn tenant-detail-action-button" disabled={saving} type="button" onClick={onMoveOut}><Archive size={15} /> 退租</button> : null}
    {canEdit ? <button className="btn tenant-detail-action-button" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑</button> : null}
    {canArchive && archived ? <button className="btn tenant-detail-action-button" disabled={saving} type="button" onClick={onRestore}><Archive size={15} /> 恢复</button> : canArchive ? <button className="btn tenant-detail-action-button" disabled={saving} type="button" onClick={onArchive}><Archive size={15} /> 归档</button> : null}
    {isAdmin ? <button className="btn danger tenant-detail-action-button" disabled={saving} type="button" onClick={onPermanentDelete}><Trash2 size={15} /> 永久删除</button> : null}
    {primaryDebtCase?.canWaive ? <button className="btn warning tenant-detail-action-button" disabled={saving || waivingDebtPaymentId === primaryDebtCase.paymentId} type="button" onClick={() => onWaiveDebt(primaryDebtCase)}>{waivingDebtPaymentId === primaryDebtCase.paymentId ? "处理中…" : "放弃追缴"}</button> : null}
    {debtCases.slice(1).map((debtCase) => <div className={`tenant-detail-debt-extra-row${debtCase.paymentId === focusedDebtPaymentId ? " tenant-detail-debt-extra-row-focused" : ""}`} data-payment-id={debtCase.paymentId} key={debtCase.debtCaseId}>
      <span className="tenant-debt-action-status">已逾期{debtCase.daysOverdue}天</span>
      <span className="tenant-debt-action-buttons">
        {debtCase.canCollect ? <a className="btn tenant-detail-action-button" href={`/rent-payments?collectPayment=${encodeURIComponent(debtCase.paymentId)}&overdue=1`}>续交房租</a> : null}
        {debtCase.canWaive ? <button className="btn warning tenant-detail-action-button" disabled={saving || waivingDebtPaymentId === debtCase.paymentId} type="button" onClick={() => onWaiveDebt(debtCase)}>{waivingDebtPaymentId === debtCase.paymentId ? "处理中…" : "放弃追缴"}</button> : null}
      </span>
    </div>)}
  </div>;
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

function DetailField({ label, value, className }: { label: string; value: string; className?: string }) {
  return <CompactDetailRow className={className} label={label} value={value} />;
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
    .filter((payment) => isTenantRentPayment(payment) && !payment.notes?.includes("[已作废]") && !payment.notes?.includes("[宸蹭綔搴焆"))
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
  leftExpiry: TenantDebtDisplay["expiry"],
  rightExpiry: TenantDebtDisplay["expiry"],
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
  leftExpiry: TenantDebtDisplay["expiry"],
  rightExpiry: TenantDebtDisplay["expiry"],
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

function tenantStatusRank(tenant: BusinessTenant, expiry?: TenantDebtDisplay["expiry"]) {
  if (!isCurrentRentalRelationship(tenant)) return isArchivedTenant(tenant) ? 4 : 3;
  if (!expiry) return 2;
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


function syncTenantDepositRecord(tenant: BusinessTenant, deposits: BusinessDeposit[], attribution: string): BusinessDeposit[] {
  const amount = Number(tenant.depositAmount || 0);
  if (amount <= 0) return deposits;
  const active = deposits.filter((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit));
  if (active.some((deposit) => Number(deposit.amount || 0) > 0)) return deposits;
  if (active.length) {
    const target = active[0];
    return deposits.map((deposit) => deposit.id === target.id ? { ...deposit, amount, receivedBy: deposit.receivedBy || attribution, paidBy: deposit.paidBy || attribution } : deposit);
  }
  return [{
    id: crypto.randomUUID(), propertyId: tenant.propertyId, roomId: tenant.roomId, tenantId: tenant.id,
    type: "收取", amount, status: "待退", transactionDate: today(), receivedBy: attribution, paidBy: attribution,
    notes: `[租客押金:资料同步:${tenant.id}]`
  }, ...deposits];
}

function tenantDepositStatus(tenant: BusinessTenant, deposits: BusinessDeposit[]) {
  if (!deposits.some((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit))) {
    return Number(tenant.depositAmount || 0) === 0 ? "无押金" : "未建立押金管理记录";
  }
  return tenantDepositStorageStatus(tenant, deposits) === "已退" ? "押金已处理" : "押金待处理";
}

function depositReferenceForTenant(tenantId: string, payments: BusinessRentPayment[]) {
  const amounts = payments
    .filter((payment) => payment.tenantId === tenantId && !payment.notes?.includes("[已作废]") && !payment.notes?.includes("[宸蹭綔搴焆"))
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
    const hasActiveTenant = tenants.some((tenant) => tenant.roomId === room.id && isCurrentRentalRelationship(tenant));
    if (hasActiveTenant) return { ...room, status: "已租" };
    if (["已租", "预订中", "即将退租"].includes(room.status)) return { ...room, status: "空置" };
    return room;
  });
}

function syncRoomsAfterTenantRemoval(rooms: BusinessRoom[], tenants: BusinessTenant[], roomId: string) {
  return rooms.map((room) => {
    if (room.id !== roomId) return room;
    const hasActiveTenant = tenants.some((tenant) => tenant.roomId === room.id && isCurrentRentalRelationship(tenant));
    if (hasActiveTenant) return { ...room, status: "已租" };
    if (["已租", "预订中", "即将退租"].includes(room.status)) return { ...room, status: "空置" };
    return room;
  });
}

function isArchivedTenant(tenant: BusinessTenant) {
  return isArchivedTenantStatus(tenant.status);
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
    receivedBy: draft.receivedBy,
    paymentStatus: draft.paymentStatus || (amountPaid > 0 ? "已收" : "未收"),
    isOverdue: false,
    notes: draft.notes || tenant.notes || ""
  };
  return { ...next, isOverdue: isCoverageExpired(next) };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function TextField({ label, value, onChange, required, className }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean; className?: string }) {
  return <div className={`field${className ? ` ${className}` : ""}`}><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}

function isContractExpiringWithin(contract: BusinessContract, days: number) {
  if (!contract.endDate || isEndedContract(contract)) return false;
  const remaining = daysBetween(today(), contract.endDate);
  return remaining >= 0 && remaining <= days;
}

function isEndedContract(contract: BusinessContract) {
  const status = (contract.status || "").toLowerCase();
  return ["已结束", "已归档", "已退租", "已作废", "作废", "ended", "archived", "void"].some((marker) => status.includes(marker.toLowerCase()));
}
