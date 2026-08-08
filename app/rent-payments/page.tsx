"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { AttachmentAddControl } from "@/components/attachment-add-control";
import { AttachmentLoadState, AttachmentLoadStateNotice } from "@/components/attachment-load-state";
import { DateFilterPreset, DateRangeFilter, dateRangeForMonth, dateRangeForPreset, isDateInRange } from "@/components/date-range-filter";
import { MoneyInput } from "@/components/money-input";
import { OwnershipField } from "@/components/ownership-field";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { StatusBadge } from "@/components/status-badge";
import { CompactDetailGrid, CompactDetailGroup, CompactDetailRow } from "@/components/ui";
import {
  BusinessProperty,
  BusinessDeposit,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  getInitialDeposits,
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
import { buildActivePartnerOptions, buildPartnerDirectory, getPartners, preserveStoredPartnerOption } from "@/lib/partners";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import {
  deleteRentPaymentFile,
  downloadRentPaymentFile,
  formatFileSize,
  loadRentPaymentFiles,
  openRentPaymentFile,
  RentPaymentFile,
  uploadRentPaymentFile
} from "@/lib/rent-payment-files";
import { isCoverageExpired, isCurrentRentalRelationship, latestCoverageForTenant, monthEnd, monthStart, paymentCoverageEnd, paymentCoverageStart, repairMissingTenantMonthlyRents, todayString } from "@/lib/rent-coverage";
import { Ban, ChevronDown, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TapOption = {
  value: string;
  label: string;
  description?: string;
};

const emptyPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  incomeType: "房租收入",
  incomeItem: "",
  rentMonth: new Date().toISOString().slice(0, 7),
  paymentDate: new Date().toISOString().slice(0, 10),
  amountDue: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  coverageStartDate: monthStart(new Date().toISOString().slice(0, 7)),
  coverageEndDate: monthEnd(new Date().toISOString().slice(0, 7)),
  paymentMethod: "转账",
  receivedBy: "",
  paymentStatus: "已收",
  isOverdue: false,
  notes: ""
};

const paymentMethods = ["现金", "转账", "Bizum", "其他"];
const incomeTypes: NonNullable<BusinessRentPayment["incomeType"]>[] = ["房租收入", "续交房租", "赔偿收入", "其他收入"];

function defaultCoverageEnd(startDate: string) {
  return startDate ? monthEnd(startDate.slice(0, 7)) : "";
}

export default function RentPaymentsPage() {
  const access = useAccountAccess();
  const [partnerDirectory, setPartnerDirectory] = useState<Record<string, string>>({});
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [depositAmount, setDepositAmount] = useState(0);
  const [monthlyRentStandard, setMonthlyRentStandard] = useState<number | null>(null);
  const [files, setFiles] = useState<RentPaymentFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [filesLoadState, setFilesLoadState] = useState<AttachmentLoadState>("loading");
  const [filesLoadError, setFilesLoadError] = useState("");
  const [form, setForm] = useState<BusinessRentPayment>(emptyPayment);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [collectionPaymentId, setCollectionPaymentId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailPaymentId, setDetailPaymentId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [ownershipMode, setOwnershipMode] = useState<string>("");
  const [addingTenant, setAddingTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantPhone, setNewTenantPhone] = useState("");
  const filesRequestRef = useRef(0);
  const historicalOriginalRef = useRef<BusinessRentPayment | null>(null);

  const refreshPaymentFiles = useCallback(async (paymentIds: string[]) => {
    const ids = [...new Set(paymentIds.filter(Boolean))];
    const requestId = ++filesRequestRef.current;
    setFilesLoadState("loading");
    setFilesLoadError("");
    if (!ids.length) {
      setFilesLoadState("success");
      return;
    }
    try {
      const refreshedFiles = await loadRentPaymentFiles(ids);
      if (requestId !== filesRequestRef.current) return;
      setFiles((current) => [...refreshedFiles, ...current.filter((file) => !ids.includes(file.rentPaymentId))]);
      setFilesLoadState("success");
    } catch (error: any) {
      if (requestId !== filesRequestRef.current) return;
      setFilesLoadState("error");
      setFilesLoadError(error?.message || "附件加载失败。");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const range = dateRangeForMonth(params.get("month") || "");
    if (range) {
      setDatePreset("custom");
      setDateStart(range.startDate);
      setDateEnd(range.endDate);
    }
    setOverdueOnly(params.get("overdue") === "1");
  }, []);

  useEffect(() => {
    async function load() {
      const partnerData = access.isFreeSingle ? null : await getPartners();
      const nextDirectory = partnerData ? buildPartnerDirectory(partnerData) : {};
      const nextOptions = partnerData ? buildActivePartnerOptions(partnerData) : [];
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setPartnerDirectory(nextDirectory);
      setPartnerOptions(nextOptions);
      const repairedTenants = repairMissingTenantMonthlyRents(loadedTenants, loadedPayments);
      if (repairedTenants !== loadedTenants) await saveBusinessData(tenantKey, repairedTenants);
      setTenants(repairedTenants);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      const renewTenantId = new URLSearchParams(window.location.search).get("renewTenantId");
      const renewTenant = repairedTenants.find((tenant) => tenant.id === renewTenantId);
      if (renewTenant) {
        const latest = latestCoverageForTenant(renewTenant.id, loadedPayments);
        const coverageStartDate = latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : todayString();
        const receivedBy = nextOptions.some((option) => option.value === latest?.receivedBy)
          ? latest?.receivedBy || ""
          : nextOptions[0]?.value || "";
        const mode = ownershipChoice(receivedBy, nextOptions);
        setForm({
          ...emptyPayment,
          propertyId: renewTenant.propertyId,
          roomId: renewTenant.roomId,
          tenantId: renewTenant.id,
          incomeType: "续交房租",
          amountDue: Number(renewTenant.monthlyRent || 0),
          amountPaid: 0,
          coverageStartDate,
          coverageEndDate: defaultCoverageEnd(coverageStartDate),
          paymentMethod: latest?.paymentMethod || "转账",
          receivedBy
        });
        setOwnershipMode(mode);
        setMonthlyRentStandard(Number(renewTenant.monthlyRent || 0));
        setOpen(true);
      }
      const collectionId = new URLSearchParams(window.location.search).get("collectPayment");
      const collectionPayment = loadedPayments.find((payment) => payment.id === collectionId);
      if (collectionPayment) {
        const remaining = Math.max(Number(collectionPayment.amountDue || 0) - Number(collectionPayment.amountPaid || 0), Number(collectionPayment.amountUnpaid || 0));
        setCollectionPaymentId(collectionPayment.id);
        setForm({
          ...emptyPayment,
          propertyId: collectionPayment.propertyId,
          roomId: collectionPayment.roomId,
          tenantId: collectionPayment.tenantId,
          incomeType: "\u7eed\u4ea4\u623f\u79df",
          amountDue: remaining,
          amountPaid: 0,
          amountUnpaid: remaining,
          paymentDate: todayString(),
          rentMonth: todayString().slice(0, 7),
          coverageStartDate: collectionPayment.coverageStartDate,
          coverageEndDate: collectionPayment.coverageEndDate,
          paymentMethod: collectionPayment.paymentMethod,
          receivedBy: collectionPayment.receivedBy,
          notes: "欠租补交"
        });
        setMonthlyRentStandard(Number(repairedTenants.find((tenant) => tenant.id === collectionPayment.tenantId)?.monthlyRent || collectionPayment.amountDue || 0));
        setDepositAmount(0);
        setOpen(true);
      }
      await refreshPaymentFiles(loadedPayments.map((payment) => payment.id));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载收租记录失败：${error.message || error}`));
  }, [access.isFreeSingle]);

  useEffect(() => {
    if (!loaded || !detailPaymentId) return;
    void refreshPaymentFiles([detailPaymentId]);
  }, [detailPaymentId, loaded, refreshPaymentFiles]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filesByPayment = useMemo(() => files.reduce<Record<string, RentPaymentFile[]>>((map, file) => {
    map[file.rentPaymentId] = [...(map[file.rentPaymentId] || []), file];
    return map;
  }, {}), [files]);
  const ownershipOptions = useMemo(
    () => preserveStoredPartnerOption(partnerOptions, form.id ? form.receivedBy : "", partnerDirectory),
    [form.id, form.receivedBy, partnerDirectory, partnerOptions]
  );
  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const property = properties.find((item) => item.id === payment.propertyId);
      const room = rooms.find((item) => item.id === payment.roomId);
      const tenant = tenants.find((item) => item.id === payment.tenantId);
      const text = `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""} ${payment.incomeType || "房租收入"} ${payment.incomeItem || ""} ${payment.rentMonth} ${payment.notes || ""}`.toLowerCase();
      return (!keyword || text.includes(keyword)) &&
        (!propertyFilter || payment.propertyId === propertyFilter) &&
        isDateInRange(paymentAccountingDate(payment), { startDate: dateStart, endDate: dateEnd }) &&
        (!overdueOnly || isLatestExpiredPayment(payment, payments));
    });
  }, [dateEnd, dateStart, overdueOnly, payments, properties, propertyFilter, query, rooms, tenants]);
  const filteredPaymentTotal = useMemo(
    () => filteredPayments.reduce((total, payment) => total + paymentListAmount(payment), 0),
    [filteredPayments]
  );
  const visiblePayments = pageRows(filteredPayments, page, pageSize);
  const canEditHistorical = access.isOwner && access.can("rent_payments", "edit");

  function close() {
    setOpen(false);
    setForm(emptyPayment);
    historicalOriginalRef.current = null;
    setCollectionPaymentId("");
    setDepositAmount(0);
    setMonthlyRentStandard(null);
    setOwnershipMode("");
    setAddingTenant(false);
    setNewTenantName("");
    setNewTenantPhone("");
    setPendingFiles([]);
  }

  async function persist(next: BusinessRentPayment[]) {
    setSaving(true);
    try {
      await saveBusinessData(rentPaymentKey, next);
      setPayments(next);
    } catch (error: any) {
      window.alert(error.message || "保存收租记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function updateMoney(patch: Partial<BusinessRentPayment>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const amountUnpaid = next.paymentStatus === "未收" ? Number(next.amountDue || 0) : 0;
      return { ...next, amountUnpaid, isOverdue: isCoverageExpired(next) };
    });
  }

  function chooseTenant(tenantId: string) {
    if (!tenantId) {
      updateMoney({ tenantId: "" });
      return;
    }
    const tenant = tenants.find((item) => item.id === tenantId);
    const latest = latestCoverageForTenant(tenantId, payments);
    const nextStart = latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : todayString();
    const room = rooms.find((item) => item.id === (tenant?.roomId || form.roomId));
    const defaultRent = Number(tenant?.monthlyRent || room?.monthlyRent || 0);
    const defaultDeposit = tenant ? 0 : Number(room?.depositAmount || 0);
    updateMoney({
      tenantId,
      amountDue: defaultRent,
      coverageStartDate: nextStart,
      coverageEndDate: defaultCoverageEnd(nextStart),
      paymentMethod: form.incomeType === "续交房租" ? latest?.paymentMethod || form.paymentMethod : form.paymentMethod
    });
    setDepositAmount(defaultDeposit);
    setMonthlyRentStandard(defaultRent);
    if (form.incomeType === "续交房租" && latest?.receivedBy) {
      const mode = ownershipChoice(latest.receivedBy, partnerOptions);
      setOwnershipMode(mode);
    }
  }

  function chooseRoom(roomId: string) {
    setNewTenantName("");
    const room = rooms.find((item) => item.id === roomId);
    const roomTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === roomId && isCurrentRentalRelationship(tenant));
    const onlyTenant = roomTenants.length === 1 ? roomTenants[0] : null;
    const latest = onlyTenant ? latestCoverageForTenant(onlyTenant.id, payments) : null;
    const nextStart = latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : form.coverageStartDate || todayString();
    const defaultRent = Number(onlyTenant?.monthlyRent || room?.monthlyRent || 0);
    const defaultDeposit = onlyTenant ? 0 : Number(room?.depositAmount || 0);
    updateMoney({
      roomId,
      tenantId: onlyTenant?.id || "",
      amountDue: defaultRent,
      coverageStartDate: nextStart,
      coverageEndDate: defaultCoverageEnd(nextStart),
      paymentMethod: form.incomeType === "续交房租" && latest?.paymentMethod ? latest.paymentMethod : form.paymentMethod
    });
    setDepositAmount(defaultDeposit);
    setMonthlyRentStandard(defaultRent);
  }

  async function createTenantForPayment() {
    const name = newTenantName.trim();
    if (!form.propertyId || !form.roomId || !name) {
      window.alert("请先选择房源和房间，并填写新租客姓名。");
      return;
    }
    const room = rooms.find((item) => item.id === form.roomId);
    const tenant: BusinessTenant = {
      id: crypto.randomUUID(),
      propertyId: form.propertyId,
      roomId: form.roomId,
      name,
      phone: newTenantPhone.trim(),
      wechat: "",
      source: "其他",
      monthlyRent: Number(monthlyRentStandard || form.amountDue || room?.monthlyRent || 0),
      depositAmount: room?.depositAmount || 0,
      occupantCount: 1,
      paymentDay: 20,
      status: "在租",
      notes: ""
    };
    const nextTenants = [tenant, ...tenants];
    const nextRooms = rooms.map((item) => item.id === form.roomId ? { ...item, status: "已租" } : item);
    setSaving(true);
    try {
      await saveBusinessData(tenantKey, nextTenants);
      await saveBusinessData(roomKey, nextRooms);
      setTenants(nextTenants);
      setRooms(nextRooms);
      setAddingTenant(false);
      setNewTenantName("");
      setNewTenantPhone("");
      setMonthlyRentStandard(tenant.monthlyRent);
      const coverageStartDate = todayString();
      updateMoney({ tenantId: tenant.id, amountDue: tenant.monthlyRent || room?.monthlyRent || 0, coverageStartDate, coverageEndDate: defaultCoverageEnd(coverageStartDate) });
      setDepositAmount(form.incomeType === "续交房租" ? 0 : tenant.depositAmount || room?.depositAmount || 0);
    } catch (error: any) {
      window.alert(error.message || "新增租客失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function autoFill() {
    const tenant = tenants.find((item) => item.id === form.tenantId);
    if (!tenant) return;
    const latest = latestCoverageForTenant(tenant.id, payments.filter((payment) => payment.id !== form.id));
    setForm((current) => {
      const coverageStartDate = latest?.coverageEndDate ? addOneDay(latest.coverageEndDate) : todayString();
      return {
        ...current,
        paymentDate: current.paymentDate || todayString(),
        rentMonth: (current.paymentDate || todayString()).slice(0, 7),
        coverageStartDate,
        coverageEndDate: defaultCoverageEnd(coverageStartDate),
        paymentMethod: current.paymentMethod || "转账"
      };
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded) return;
    const incomeType = form.incomeType || "房租收入";
    const isRent = isRentPayment(form);
    const requiresBusinessLink = isRent;
    if (requiresBusinessLink && (!form.propertyId || !form.roomId)) {
      window.alert("房租收入需要选择房源和房间。租客可以选择已有租客，也可以直接输入姓名。");
      return;
    }
    if (isRent && (!form.coverageStartDate || !form.coverageEndDate)) {
      window.alert("请填写租金覆盖开始日期和结束日期。");
      return;
    }
    setSaving(true);
    let tenantId = form.tenantId;
    let tenantNameSnapshot = tenants.find((tenant) => tenant.id === form.tenantId)?.name || "";
    const typedTenantName = newTenantName.trim();
    if (isRent && !tenantId && typedTenantName) {
      const room = rooms.find((item) => item.id === form.roomId);
      const tenant: BusinessTenant = {
        id: crypto.randomUUID(),
        propertyId: form.propertyId,
        roomId: form.roomId,
        name: typedTenantName,
        phone: "",
        wechat: "",
        source: "其他",
        monthlyRent: Number(monthlyRentStandard || form.amountDue || room?.monthlyRent || 0),
        depositAmount: Number(depositAmount || 0),
        occupantCount: 1,
        paymentDay: 20,
        status: "在租",
        notes: "由收款登记自动创建"
      };
      const nextTenants = [tenant, ...tenants];
      const nextRooms = rooms.map((item) => item.id === form.roomId ? { ...item, status: "已租" } : item);
      try {
        await saveBusinessData(tenantKey, nextTenants);
        await saveBusinessData(roomKey, nextRooms);
      } catch (error: any) {
        window.alert(error.message || "自动创建租客失败，收款记录未保存。");
        setSaving(false);
        return;
      }
      setTenants(nextTenants);
      setRooms(nextRooms);
      tenantId = tenant.id;
      tenantNameSnapshot = tenant.name;
    }
    if (isRent && !tenantNameSnapshot) tenantNameSnapshot = typedTenantName || "未填写租客";
    const originalPayment = historicalOriginalRef.current;
    const isHistoricalEdit = Boolean(originalPayment?.id);
    const filesToUpload = !form.id ? pendingFiles : [];
    const paymentId = originalPayment?.id || form.id || crypto.randomUUID();
    const amountDue = isRent ? Number(form.amountDue || 0) : 0;
    const depositIncomeAmount = isRent ? Number(depositAmount || 0) : 0;
    const amountPaid = isRent
      ? isHistoricalEdit
        ? Number(form.amountPaid || 0)
        : collectionPaymentId
          ? Number(form.amountPaid || 0)
        : (form.paymentStatus === "未收" ? depositIncomeAmount : amountDue + depositIncomeAmount)
      : Number(form.amountPaid || 0);
    const amountUnpaid = isRent && (collectionPaymentId || form.paymentStatus === "未收") ? Math.max(amountDue - amountPaid, 0) : 0;
    const paymentDate = form.paymentDate || todayString();
    const rentMonth = paymentDate.slice(0, 7);
    const nextPayment = {
      ...form,
      id: paymentId,
      tenantId: isHistoricalEdit ? originalPayment?.tenantId || "" : tenantId,
      propertyId: isHistoricalEdit ? originalPayment?.propertyId || "" : form.propertyId,
      roomId: isHistoricalEdit ? originalPayment?.roomId || "" : form.roomId,
      paymentDate,
      rentMonth: isHistoricalEdit ? form.rentMonth : rentMonth,
      incomeType: isHistoricalEdit ? originalPayment?.incomeType : incomeType,
      incomeItem: isHistoricalEdit ? originalPayment?.incomeItem : (isRent ? tenantNameSnapshot : form.incomeItem?.trim() || ""),
      amountDue,
      amountPaid,
      amountUnpaid,
      coverageStartDate: isRent ? form.coverageStartDate : "",
      coverageEndDate: isRent ? form.coverageEndDate : "",
       receivedBy: access.isFreeSingle ? "" : (isHistoricalEdit ? originalPayment?.receivedBy : ownershipMode),
      paymentStatus: isHistoricalEdit ? originalPayment?.paymentStatus : isRent ? collectionPaymentId ? (amountPaid > 0 ? "已收" : "未收") : form.paymentStatus || (amountPaid > 0 ? "已收" : "未收") : "已收",
      paymentMethod: isHistoricalEdit ? originalPayment?.paymentMethod || form.paymentMethod : form.paymentMethod,
      createdAt: isHistoricalEdit ? originalPayment?.createdAt : form.createdAt || (form.id ? undefined : new Date().toISOString()),
      isOverdue: false
    };
    nextPayment.isOverdue = isCoverageExpired(nextPayment);
    const next = form.id
      ? payments.map((payment) => (payment.id === form.id ? nextPayment : payment))
      : [nextPayment, ...payments];
    const linkedDeposit = deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(paymentId)));
    const nextDeposits = isRent && depositIncomeAmount > 0
      ? linkedDeposit
        ? deposits.map((deposit) => deposit.id === linkedDeposit.id ? { ...deposit, amount: depositIncomeAmount, transactionDate: paymentDate, receivedBy: nextPayment.receivedBy } : deposit)
        : [{
            id: crypto.randomUUID(),
            propertyId: nextPayment.propertyId,
            roomId: nextPayment.roomId,
            tenantId: nextPayment.tenantId,
            type: "收取",
            amount: depositIncomeAmount,
            status: "已收",
            transactionDate: paymentDate,
            receivedBy: nextPayment.receivedBy,
            notes: depositPaymentMarker(paymentId)
          }, ...deposits]
      : deposits;
    const requestedMonthlyRent = Number(monthlyRentStandard || form.amountDue || 0);
    const currentTenant = tenants.find((tenant) => tenant.id === tenantId);
    const nextTenants = !isHistoricalEdit && !collectionPaymentId && isRent && currentTenant && currentTenant.monthlyRent !== requestedMonthlyRent
      ? tenants.map((tenant) => tenant.id === tenantId ? { ...tenant, monthlyRent: requestedMonthlyRent } : tenant)
      : null;
    try {
      await saveBusinessData(rentPaymentKey, next, { ownerOnly: isHistoricalEdit });
      if (JSON.stringify(deposits) !== JSON.stringify(nextDeposits)) {
        await saveBusinessData(depositKey, nextDeposits, { ownerOnly: isHistoricalEdit });
        setDeposits(nextDeposits);
      }
      if (nextTenants) {
        await saveBusinessData(tenantKey, nextTenants);
        setTenants(nextTenants);
      }
      setPayments(next);
      if (filesToUpload.length) {
        const uploadedFiles: RentPaymentFile[] = [];
        try {
          for (const file of filesToUpload) uploadedFiles.push(await uploadRentPaymentFile(paymentId, file));
          setFiles((current) => [...uploadedFiles, ...current]);
        } catch (error: any) {
          if (uploadedFiles.length) setFiles((current) => [...uploadedFiles, ...current]);
          window.alert(`收款已保存，但附件上传失败：${error?.message || error}`);
        }
      }
      close();
    } catch (error: any) {
      window.alert(error.message || "保存收租记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function voidPayment(payment: BusinessRentPayment) {
    if (!window.confirm("确认作废这条收租记录吗？作废后原始金额和历史信息仍会保留。")) return;
    await persist(payments.map((item) => (item.id === payment.id ? { ...item, notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(payment: BusinessRentPayment) {
    if (!window.confirm("确定要永久删除这条收租记录吗？\n真实发生过的财务记录建议使用“作废”，删除后不可恢复。")) return;
    const relatedFiles = filesByPayment[payment.id] || [];
    for (const file of relatedFiles) await deleteRentPaymentFile(file);
    await persist(payments.filter((item) => item.id !== payment.id));
    setFiles((current) => current.filter((file) => file.rentPaymentId !== payment.id));
    setDetailPaymentId("");
  }

  async function addPaymentFile(payment: BusinessRentPayment, file: File) {
    setSaving(true);
    try {
      const uploaded = await uploadRentPaymentFile(payment.id, file);
      setFiles((current) => [uploaded, ...current]);
      await refreshPaymentFiles([payment.id]);
    } catch (error: any) {
      throw new Error(error.message || "添加收款附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(file: RentPaymentFile) {
    if (!window.confirm("确定要删除这个收款附件吗？")) return;
    await deleteRentPaymentFile(file);
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  function resetFilters() {
    setQuery("");
    setPropertyFilter("");
    setDatePreset("all");
    setDateStart("");
    setDateEnd("");
    setOverdueOnly(false);
    setPage(1);
  }

  function updateDatePreset(preset: DateFilterPreset) {
    setDatePreset(preset);
    if (preset === "custom") {
      setDateStart("");
      setDateEnd("");
    } else {
      const range = dateRangeForPreset(preset);
      setDateStart(range.startDate);
      setDateEnd(range.endDate);
    }
    setPage(1);
  }

  function updateDateStart(value: string) {
    setDateStart(value);
    if (dateEnd && value && dateEnd < value) setDateEnd(value);
    setPage(1);
  }

  function updateDateEnd(value: string) {
    setDateEnd(value && dateStart && value < dateStart ? dateStart : value);
    setPage(1);
  }

  return (
    <AppLayout title="收款管理" description="登记房租、押金、赔偿和其他收入，点击一条记录查看完整信息。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">收款记录</h2><p className="muted">每次收款只生成一条流水，金额为房租与押金合计。</p></div>
          {access.can("rent_payments", "create") ? <button className="btn primary" disabled={!loaded || saving || (!access.isFreeSingle && !partnerOptions.length)} onClick={() => { const coverageStartDate = todayString(); historicalOriginalRef.current = null; const initialPartner = access.isFreeSingle ? "" : partnerOptions[0]?.value || ""; setForm({ ...emptyPayment, paymentDate: coverageStartDate, rentMonth: coverageStartDate.slice(0, 7), coverageStartDate, coverageEndDate: defaultCoverageEnd(coverageStartDate), receivedBy: initialPartner }); setPendingFiles([]); setDepositAmount(0); setMonthlyRentStandard(null); setOwnershipMode(initialPartner); setOpen(true); }} type="button"><Plus size={17} /> 登记收款</button> : null}
        </div>
        {storageWarning ? <div className="notice warning">{storageWarning}</div> : null}
        <div className="list-controls">
          <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setPage(1); }}><option value="">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.address ? `${property.name} · ${property.address}` : property.name}</option>)}</select>
          <label className="search-box"><input placeholder="搜索房源、房间、租客、电话、微信" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <DateRangeFilter preset={datePreset} startDate={dateStart} endDate={dateEnd} onPresetChange={updateDatePreset} onStartDateChange={updateDateStart} onEndDateChange={updateDateEnd} />
          <button className={`btn ${overdueOnly ? "primary" : ""}`} onClick={() => { setOverdueOnly((current) => !current); setPage(1); }} type="button">只看欠费</button>
          {(query || propertyFilter || datePreset !== "all" || overdueOnly) ? <button className="btn" onClick={resetFilters} type="button">清除筛选</button> : null}
        </div>
        <div className="filtered-total" aria-live="polite"><span>当前筛选收款合计</span><strong>{euro(filteredPaymentTotal)}</strong></div>

        <div className="finance-list">
          {visiblePayments.map((payment) => {
            const property = properties.find((item) => item.id === payment.propertyId);
            const room = rooms.find((item) => item.id === payment.roomId);
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            const linkedDeposit = deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(payment.id)));
            const expanded = detailPaymentId === payment.id;
            return (
              <article className="finance-list-item" key={payment.id}>
                <button className="finance-line rent-finance-line" onClick={() => setDetailPaymentId(expanded ? "" : payment.id)} type="button">
                  <span>{payment.paymentDate || payment.rentMonth}</span>
                  {!access.isFreeSingle ? <span className={`partner-tag ${partnerClass(payment.receivedBy)}`}>{partnerLabel(payment.receivedBy, partnerDirectory)}</span> : null}
                  <span>{isRentPayment(payment) ? `${room?.roomNumber || room?.name || "-"}/${tenant?.name || payment.incomeItem || "未填写租客"}` : payment.incomeItem || payment.incomeType || "其他收入"}</span>
                  <strong>{euro(paymentListAmount(payment))}</strong>
                  <StatusBadge tone={isVoided(payment.notes) ? "red" : "green"}>{isVoided(payment.notes) ? "已作废" : "已收取"}</StatusBadge>
                </button>
                {expanded ? (
                  <PaymentDetail
                    payment={payment}
                    partnerDirectory={partnerDirectory}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    tenantName={tenant?.name || payment.incomeItem || "未填写租客"}
                    depositAmount={paymentDepositAmount(payment, linkedDeposit?.amount)}
                    files={filesByPayment[payment.id] || []}
                    attachmentLoadState={filesLoadState}
                    attachmentLoadError={filesLoadError}
                    onRetryFiles={() => void refreshPaymentFiles([payment.id])}
                    onEdit={() => {
                      historicalOriginalRef.current = payment;
                      const mode = ownershipChoice(payment.receivedBy, partnerOptions);
                      const linkedDeposit = deposits.find((deposit) => deposit.notes?.includes(depositPaymentMarker(payment.id)))?.amount;
                      const rentAmount = Number(payment.amountDue || 0);
                      setForm({ ...payment, amountDue: rentAmount });
                      setMonthlyRentStandard(tenant?.monthlyRent ?? null);
                      setOwnershipMode(mode);
                      setNewTenantName(!payment.tenantId && isRentPayment(payment) ? payment.incomeItem || "" : "");
                      setPendingFiles([]);
                      setDepositAmount(paymentDepositAmount(payment, linkedDeposit));
                      setOpen(true);
                    }}
                    onVoid={() => voidPayment(payment)}
                    onDelete={() => permanentlyDelete(payment)}
                    onAddFile={(file) => addPaymentFile(payment, file)}
                    onFileDelete={removeFile}
                    saving={saving}
                    canEdit={canEditHistorical}
                    canArchive={access.can("rent_payments", "archive")}
                    canDelete={access.can("rent_payments", "delete")}
                    canViewFiles={access.can("attachments") && access.canSensitive("canViewRentFiles")}
                    canUploadFiles={access.can("attachments", "create") && access.canSensitive("canUploadFiles")}
                    canDownloadFiles={access.canSensitive("canDownloadFiles")}
                    canDeleteFiles={access.can("attachments", "delete") && access.canSensitive("canDeleteFiles")}
                    showOwnership={!access.isFreeSingle}
                  />
                ) : null}
              </article>
            );
          })}
          {!visiblePayments.length ? <p className="muted">暂无收租记录。</p> : null}
        </div>

        <PaginationControls page={page} pageSize={pageSize} total={filteredPayments.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑收款" : "登记收款"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid rent-payment-form-grid" onSubmit={submit}>
              <TapSelect className="rent-form-wide" label="收款类型" value={form.incomeType || "房租收入"} disabled={Boolean(form.id)} options={incomeTypes.map((type) => ({ value: type, label: type }))} onChange={(incomeType) => {
                const nextType = incomeType as BusinessRentPayment["incomeType"];
                const nextIsRent = nextType === "房租收入" || nextType === "续交房租";
                setForm((current) => ({ ...current, incomeType: nextType, incomeItem: "", amountDue: nextIsRent ? current.amountDue : 0, amountUnpaid: 0, coverageStartDate: nextIsRent ? current.coverageStartDate : "", coverageEndDate: nextIsRent ? current.coverageEndDate : "", paymentStatus: "已收" }));
                if (!nextIsRent) setDepositAmount(0);
              }} />
              <TapSelect className="rent-form-wide" label={isRentPayment(form) ? "房源" : "房源（可选）"} value={form.propertyId} disabled={Boolean(form.id)} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city || "-"} · ${property.address || "-"}` }))} onChange={(propertyId) => { setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "", amountDue: 0 })); setDepositAmount(0); setMonthlyRentStandard(null); setNewTenantName(""); }} placeholder={isRentPayment(form) ? "点这里选择房源" : "不关联房源"} allowEmpty={!isRentPayment(form)} />
              <TapSelect className="rent-form-wide" label={isRentPayment(form) ? "房间" : "房间（可选）"} value={form.roomId} disabled={Boolean(form.id) || !form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `月租 ${euro(room.monthlyRent || 0)} · 押金 ${euro(room.depositAmount || 0)} · ${room.status}` }))} onChange={chooseRoom} placeholder={form.propertyId ? "点这里选择房间" : "先选择房源"} allowEmpty={!isRentPayment(form)} />
              <TapSelect label={isRentPayment(form) ? "租客" : "租客（可选）"} value={form.tenantId} disabled={Boolean(form.id) || !form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone || "无电话"} · 月租 ${euro(tenant.monthlyRent || 0)} · 押金 ${euro(tenant.depositAmount || 0)}` }))} onChange={(tenantId) => { chooseTenant(tenantId); setNewTenantName(""); }} placeholder={form.roomId ? "点这里选择租客" : "先选择房间"} allowEmpty />
              {isRentPayment(form) && !form.id ? <div className="field"><label>租客姓名（可直接输入）</label><input disabled={!form.roomId} maxLength={80} placeholder={form.roomId ? "没有租客时直接输入，例如 01、李、临时租客" : "先选择房间"} value={newTenantName} onChange={(event) => { setNewTenantName(event.target.value); if (event.target.value.trim()) setForm((current) => ({ ...current, tenantId: "" })); }} /></div> : null}
              {isRentPayment(form) && !form.id ? <MoneyInput label="当前月租标准" value={monthlyRentStandard ?? tenants.find((tenant) => tenant.id === form.tenantId)?.monthlyRent ?? rooms.find((room) => room.id === form.roomId)?.monthlyRent ?? 0} onChange={setMonthlyRentStandard} /> : null}
              {isRentPayment(form) ? <MoneyInput readOnly={Boolean(collectionPaymentId)} label={collectionPaymentId ? "本次剩余欠租" : "本次实收房租"} value={form.amountDue} onChange={(amountDue) => { if (!collectionPaymentId) { updateMoney({ amountDue }); if (!form.tenantId && (monthlyRentStandard == null || monthlyRentStandard === 0)) setMonthlyRentStandard(amountDue); } }} /> : <MoneyInput label="金额" value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} />}
              {isRentPayment(form) ? <MoneyInput label="本次新增押金" value={depositAmount} onChange={setDepositAmount} /> : null}
              {isRentPayment(form) && (form.id || collectionPaymentId) ? <MoneyInput label="本次实际收款" value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} /> : null}
              {isRentPayment(form) ? <div className="field rent-total-field"><label>本次合计收入</label><input readOnly value={euro(Number(form.amountDue || 0) + Number(depositAmount || 0))} /></div> : null}
              {form.incomeType === "赔偿收入" || form.incomeType === "其他收入" ? <div className="field"><label>{form.incomeType === "赔偿收入" ? "赔偿项目/说明（可选）" : "收入项目/说明（可选）"}</label><input maxLength={100} placeholder={form.incomeType === "赔偿收入" ? "例如：床架损坏赔偿" : "可直接留空"} value={form.incomeItem || ""} onChange={(event) => setForm((current) => ({ ...current, incomeItem: event.target.value }))} /></div> : null}
              <div className="field rent-payment-date-field"><label>收款日期 / 交费日期</label><input required type="date" value={form.paymentDate || ""} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value, rentMonth: event.target.value.slice(0, 7) }))} /></div>
              {isRentPayment(form) ? <div className="field"><label>租金覆盖开始日期</label><input required type="date" value={form.coverageStartDate || ""} onChange={(event) => { const coverageStartDate = event.target.value; setForm((current) => ({ ...current, coverageStartDate, coverageEndDate: !current.coverageEndDate || current.coverageEndDate < coverageStartDate ? defaultCoverageEnd(coverageStartDate) : current.coverageEndDate })); }} /></div> : null}
              {isRentPayment(form) ? <div className="field"><label>租金覆盖结束日期</label><input required type="date" min={form.coverageStartDate || undefined} value={form.coverageEndDate || ""} onChange={(event) => setForm((current) => ({ ...current, coverageEndDate: event.target.value }))} /></div> : null}
              <TapSelect label="付款方式" value={form.paymentMethod} options={paymentMethods.map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
               {!access.isFreeSingle ? <OwnershipField options={ownershipOptions} mode={ownershipMode} onModeChange={setOwnershipMode} /> : null}
              <TapSelect label="账目状态" value={isVoided(form.notes) ? "已作废" : "已收取"} options={["已收取", "已作废"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, notes: status === "已作废" ? markVoided(current.notes) : cleanVoidNote(current.notes) }))} />
              {!form.id && !access.isFreeSingle ? <div className="field rent-new-attachments" style={{ gridColumn: "1 / -1" }}><label>附件（可选）</label><input type="file" multiple onChange={(event) => setPendingFiles(Array.from(event.target.files || []))} /><span className="muted">可先选择文件，保存收款后自动上传。</span></div> : null}
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">{!form.id && pendingFiles.length ? "保存并上传附件" : "保存"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function TapSelect({
  label,
  value,
  options,
  className,
  placeholder = "点这里选择",
  disabled,
  allowEmpty,
  onChange
}: {
  label: string;
  value: string;
  options: TapOption[];
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value);
  const resolvedClassName = className || (label.startsWith("房源") || label.startsWith("房间") || label.startsWith("租客") || label === "收款类型" ? "rent-form-wide" : "rent-form-half");

  useEffect(() => {
    if (!open) return;

    function closeOnOutside(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  function openMenu(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) setOpen(true);
  }

  return (
    <div className={`field tap-select-field ${resolvedClassName}`} ref={rootRef}>
      <label>{label}</label>
      <div className={`tap-select ${open ? "open" : ""} ${disabled ? "disabled" : ""}`}>
        <button className="tap-select-trigger" disabled={disabled} onPointerDown={openMenu} type="button">
          <span>
            <strong>{selected?.label || placeholder}</strong>
            {selected?.description ? <small>{selected.description}</small> : null}
          </span>
          <ChevronDown size={18} />
        </button>
        {open && !disabled ? (
          <div className="tap-select-menu">
            {allowEmpty ? <button className={!value ? "active" : ""} type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onChange(""); setOpen(false); }}><strong>不选择</strong><span>可直接留空</span></button> : null}
            {options.length ? options.map((option) => (
              <button className={option.value === value ? "active" : ""} key={option.value} type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); onChange(option.value); setOpen(false); }}>
                <strong>{option.label}</strong>
                {option.description ? <span>{option.description}</span> : null}
              </button>
            )) : <div className="tap-select-empty">暂无可选项</div>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PaymentDetail({
  payment,
  partnerDirectory,
  propertyName,
  roomName,
  tenantName,
  depositAmount,
  files,
  attachmentLoadState,
  attachmentLoadError,
  onRetryFiles,
  onEdit,
  onVoid,
  onDelete,
  onAddFile,
  onFileDelete,
  saving,
  canEdit,
  canArchive,
  canDelete,
  canViewFiles,
  canUploadFiles,
  canDownloadFiles,
  canDeleteFiles,
  showOwnership
}: {
  payment: BusinessRentPayment;
  partnerDirectory: Record<string, string>;
  propertyName: string;
  roomName: string;
  tenantName: string;
  depositAmount: number;
  files: RentPaymentFile[];
  attachmentLoadState: AttachmentLoadState;
  attachmentLoadError: string;
  onRetryFiles: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onAddFile: (file: File) => Promise<void>;
  onFileDelete: (file: RentPaymentFile) => void;
  saving: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canViewFiles: boolean;
  canUploadFiles: boolean;
  canDownloadFiles: boolean;
  canDeleteFiles: boolean;
  showOwnership: boolean;
}) {
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  return (
    <div className="record-detail-panel">
      <CompactDetailGroup className="record-core-detail-group">
        <CompactDetailGrid className="payment-core-detail-grid">
        <DetailField className="payment-property-field" label="房源" value={propertyName} />
        <DetailField className="payment-room-field" label="房间" value={roomName} />
        <DetailField className="payment-tenant-field" label="租客" value={tenantName} />
        <DetailField className="payment-type-field" label="收款类型" value={payment.incomeType || "房租收入"} />
        {isRentPayment(payment) ? <DetailField className="payment-rent-field" label="房租金额" value={euro(Number(payment.amountPaid || 0) > 0 ? Math.max(Number(payment.amountPaid || 0) - depositAmount, 0) : Number(payment.amountDue || 0))} /> : null}
        <DetailField className="payment-date-field" label="收款日期" value={payment.paymentDate || "-"} />
        {isRentPayment(payment) && depositAmount > 0 ? <DetailField className="payment-deposit-field" label="押金金额" value={euro(depositAmount)} /> : null}
        {isRentPayment(payment) ? <DetailField className="payment-coverage-start-field" label="覆盖开始" value={paymentCoverageStart(payment) || "-"} /> : null}
        {isRentPayment(payment) ? <DetailField className="payment-coverage-end-field" label="覆盖结束" value={paymentCoverageEnd(payment) || "-"} /> : null}
        <DetailField className="payment-total-field" label="本次合计收入" value={euro(payment.amountPaid)} />
        <DetailField className="payment-status-field" label="账目状态" value={isVoided(payment.notes) ? "已作废" : "已收取"} />
        <DetailField className="payment-method-field" label="付款方式" value={payment.paymentMethod || "-"} />
        {showOwnership ? <DetailField className="payment-owner-field" label="收款归属" value={partnerLabel(payment.receivedBy, partnerDirectory)} /> : null}
        <DetailField className="payment-note-field" label="备注" value={cleanVoidNote(payment.notes) || "-"} />
        </CompactDetailGrid>
      </CompactDetailGroup>
      {canViewFiles ? <div className={`attachment-panel rent-attachment-panel${attachmentsOpen ? " attachments-open" : ""}`}>
        <button className="attachment-toggle" type="button" aria-expanded={attachmentsOpen} onClick={() => setAttachmentsOpen((current) => !current)}>
          <span>收款附件（{files.length}个）</span>
          <span>{attachmentsOpen ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        {attachmentsOpen ? <>
          <RentPaymentAttachmentActions files={files} loadState={attachmentLoadState} loadError={attachmentLoadError} onRetry={onRetryFiles} onDelete={onFileDelete} canDownload={canDownloadFiles} canDelete={canDeleteFiles} />
          {canUploadFiles ? <AttachmentAddControl label="收款附件" disabled={saving} onAdd={onAddFile} /> : null}
        </> : null}
      </div> : null}
      <div className="expense-detail-actions">
        {canEdit ? <button className="btn expense-detail-action" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑收款</button> : <span aria-hidden="true" />}
        {canArchive ? <button className="btn expense-detail-action" disabled={saving} type="button" onClick={onVoid}><Ban size={15} /> 作废</button> : <span aria-hidden="true" />}
        {canDelete ? <button className="btn danger expense-detail-action" type="button" onClick={onDelete}><Trash2 size={15} /> 永久删除</button> : <span aria-hidden="true" />}
      </div>
    </div>
  );
}

function DetailField({ label, value, className }: { label: string; value: string; className?: string }) {
  return <CompactDetailRow className={className} label={label} value={value} />;
}

function paymentDepositAmount(payment: BusinessRentPayment, legacyLinkedDeposit?: number) {
  if (legacyLinkedDeposit !== undefined) return Number(legacyLinkedDeposit || 0);
  return Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0);
}

function RentPaymentAttachmentActions({ files, loadState, loadError, onRetry, onDelete, canDownload = true, canDelete = true }: { files: RentPaymentFile[]; loadState: AttachmentLoadState; loadError: string; onRetry: () => void; onDelete: (file: RentPaymentFile) => void; canDownload?: boolean; canDelete?: boolean }) {
  if (loadState !== "success" || !files.length) {
    return <AttachmentLoadStateNotice state={loadState} error={loadError} onRetry={onRetry} emptyLabel="暂无附件" hasFiles={files.length > 0} />;
  }
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment-preview attachment-file-card" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} · {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openRentPaymentFile(file)}><Eye size={15} /> 查看</button>
          {canDownload ? <button className="btn" type="button" onClick={() => downloadRentPaymentFile(file)}><Download size={15} /> 下载</button> : null}
          {canDelete ? <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button> : null}
        </div>
      ))}
    </div>
  );
}

function markVoided(notes?: string) {
  const clean = cleanVoidNote(notes);
  return clean ? `[已作废] ${clean}` : "[已作废]";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}

function cleanVoidNote(notes?: string) {
  return (notes || "").replace("[已作废]", "").replace("[宸蹭綔搴焆", "").trim();
}

function isLatestExpiredPayment(payment: BusinessRentPayment, payments: BusinessRentPayment[]) {
  const latest = latestCoverageForTenant(payment.tenantId, payments);
  return latest?.id === payment.id && isCoverageExpired(latest);
}

function isRentPayment(payment: BusinessRentPayment) {
  return !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
}

function paymentListAmount(payment: BusinessRentPayment) {
  return Number(payment.amountPaid || 0);
}

function paymentAccountingDate(payment: BusinessRentPayment) {
  // Legacy rows without a receipt date retain their stored accounting month.
  return payment.paymentDate || (payment.rentMonth ? payment.rentMonth + "-01" : "");
}

function paymentItemLabel(payment: BusinessRentPayment, roomName: string, hasLinkedDeposit: boolean) {
  if (isRentPayment(payment)) return `${roomName}房租${hasLinkedDeposit ? "+押金" : ""}`;
  if (payment.incomeType === "押金收入") return `${roomName}押金收入`;
  return payment.incomeItem || payment.incomeType || "其他收入";
}

function addOneDay(value: string) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function depositPaymentMarker(paymentId: string) {
  return `[收租押金:${paymentId}]`;
}

function ownershipChoice(value?: string, options: Array<{ value: string }> = []) {
  const raw = (value || "").trim();
  if (options.some((option) => option.value === raw)) return raw;
  return raw || options[0]?.value || "";
}
