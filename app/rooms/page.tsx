"use client";

import { MoneyInput } from "@/components/money-input";
import { AppLayout } from "@/components/app-layout";
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
import { euro } from "@/lib/format";
import { coverageLabel, isCoverageExpired, latestCoverageForRoom, latestCoverageForTenant, overdueReferenceAmount, roomOccupancyStatus, strictCurrentRentalTenant } from "@/lib/rent-coverage";
import { Archive, Edit3, Home, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccountAccess } from "@/components/account-access";

const roomStatuses = ["空置", "已租", "预订中", "即将退租", "维修中", "暂停出租", "已归档"];
const emptyRoom: BusinessRoom = {
  id: "",
  propertyId: "",
  name: "",
  roomNumber: "",
  monthlyRent: 0,
  depositAmount: 0,
  status: "空置",
  notes: ""
};

export default function RoomsPage() {
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [form, setForm] = useState<BusinessRoom>(emptyRoom);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedRoomId, setExpandedRoomId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    if (status) setQuery(status);
  }, []);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>("business-tenants", getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载房间失败：${error.message || error}`));
  }, []);

  const filteredRooms = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rooms;
    return rooms.filter((room) => {
      const property = properties.find((item) => item.id === room.propertyId);
      const displayStatus = roomOccupancyStatus(room, tenants);
      return `${property?.name || ""} ${room.name} ${room.roomNumber} ${room.status} ${displayStatus} ${room.notes || ""}`.toLowerCase().includes(keyword);
    });
  }, [properties, query, rooms, tenants]);
  const visibleRooms = pageRows(filteredRooms, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyRoom);
  }

  async function persist(next: BusinessRoom[]) {
    setSaving(true);
    try {
      await saveBusinessData(roomKey, next);
      setRooms(next);
    } catch (error: any) {
      window.alert(error.message || "保存房间失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.name.trim()) return;
    const next = form.id
      ? rooms.map((room) => (room.id === form.id ? form : room))
      : [{ ...form, id: crypto.randomUUID() }, ...rooms];
    await persist(next);
    close();
  }

  async function setVacant(room: BusinessRoom) {
    if (!window.confirm("确认把这个房间设为空置吗？\n当前在租租客会标记为已退租，合同会标记为已结束，历史收租记录会保留。")) return;
    setSaving(true);
    const nextRooms = rooms.map((item) => (item.id === room.id ? { ...item, status: "空置" } : item));
    const nextTenants = tenants.map((tenant) => (tenant.roomId === room.id && isActiveTenant(tenant) ? { ...tenant, status: "已退租" } : tenant));
    const nextContracts = contracts.map((contract) => (contract.roomId === room.id && contract.status !== "已结束" ? { ...contract, status: "已结束" } : contract));
    try {
      await saveBusinessData(roomKey, nextRooms);
      await saveBusinessData(tenantKey, nextTenants);
      await saveBusinessData(contractKey, nextContracts);
      setRooms(nextRooms);
      setTenants(nextTenants);
      setContracts(nextContracts);
    } catch (error: any) {
      window.alert(error.message || "设为空置失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function archiveRoom(room: BusinessRoom) {
    if (!window.confirm("确认归档该房间吗？归档后历史业务数据仍会保留。")) return;
    await persist(rooms.map((item) => (item.id === room.id ? { ...item, status: "已归档" } : item)));
  }

  async function permanentlyDelete(room: BusinessRoom) {
    if (roomRelationCount(room.id) > 0) {
      window.alert("该房间已有租客、合同、收租或押金记录，不能直接删除。你可以选择设为空置或归档房间。");
      return;
    }
    if (!window.confirm("确定要永久删除这个空房间吗？\n删除后不可恢复。")) return;
    await persist(rooms.filter((item) => item.id !== room.id));
  }

  function roomRelationCount(roomId: string) {
    return (
      tenants.filter((item) => item.roomId === roomId).length +
      contracts.filter((item) => item.roomId === roomId).length +
      payments.filter((item) => item.roomId === roomId).length +
      deposits.filter((item) => item.roomId === roomId).length
    );
  }

  return (
    <AppLayout title="房间管理" description="房间必须关联所属房源。已有业务记录的房间不能直接删除。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">房间列表</h2>
            <p className="muted">有历史业务的房间可设为空置或归档，不直接删除。</p>
          </div>
          {access.can("rooms", "create") ? <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增房间</button> : null}
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间名称、房间编号、状态" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="finance-list room-compact-list">
          {visibleRooms.map((room) => {
            const property = properties.find((item) => item.id === room.propertyId);
            const currentTenants = tenants.filter((tenant) => tenant.roomId === room.id && strictCurrentRentalTenant(tenant));
            const currentTenantIds = new Set(currentTenants.map((tenant) => tenant.id));
            const currentContracts = contracts.filter((contract) => currentTenantIds.has(contract.tenantId) && isActiveContract(contract));
            const nearestContract = [...currentContracts].filter((contract) => contract.endDate).sort((a, b) => a.endDate.localeCompare(b.endDate))[0] || null;
            const displayStatus = roomOccupancyStatus(room, tenants);
            const expiry = displayStatus.includes("已租") || displayStatus.includes("即将退租") ? getRoomExpiryInfo(nearestContract?.endDate) : { label: "-", tone: "info" as const };
            const latestPayment = latestCoverageForRoom(room.id, payments);
            const currentMonthlyRent = currentTenants.length
              ? currentTenants.reduce((total, tenant) => total + Number(tenant.monthlyRent || 0), 0)
              : room.monthlyRent;
            const currentDepositAmount = currentTenants.reduce((total, tenant) => total + currentDepositForTenant(tenant, deposits), 0);
            const unpaid = displayStatus === "已租" ? roomUnpaidAmount(currentTenants, payments) : 0;
            const expanded = expandedRoomId === room.id;
            return (
              <article className="finance-list-item" key={room.id}>
                <button className="finance-line room-finance-line" onClick={() => setExpandedRoomId(expanded ? "" : room.id)} type="button">
                  <span className="room-property-name" title={property?.name || "-"}>{property?.name || "-"}</span>
                  <span className="room-display-name" title={room.roomNumber || room.name}>{room.roomNumber || room.name}</span>
                  <StatusBadge tone={roomTone(displayStatus)}>{displayStatus}</StatusBadge>
                  <strong>{euro(currentMonthlyRent)}</strong>
                  <strong className={unpaid > 0 ? "danger-text" : "muted"}>{unpaid > 0 ? `欠费${euro(unpaid)}` : "-"}</strong>
                  <StatusBadge tone={expiry.tone}>{expiry.label}</StatusBadge>
                </button>
                {expanded ? (
                  <RoomDetail
                    expiryLabel={expiry.label}
                    propertyName={property?.name || "-"}
                    room={room}
                    unpaid={unpaid}
                    currentTenants={currentTenants}
                    currentMonthlyRent={currentMonthlyRent}
                    currentDepositAmount={currentDepositAmount}
                    coverageEnd={coverageLabel(latestPayment)}
                    contractEndDate={nearestContract?.endDate || "-"}
                    contracts={contracts}
                    allPayments={payments}
                    allDeposits={deposits}
                    allTenants={tenants}
                    payments={payments.filter((payment) => payment.roomId === room.id)}
                    deposits={deposits.filter((deposit) => deposit.roomId === room.id)}
                    saving={saving}
                    canEdit={access.can("rooms", "edit")}
                    canArchive={access.can("rooms", "archive")}
                    canDelete={access.can("rooms", "delete")}
                    onArchive={() => archiveRoom(room)}
                    onDelete={() => permanentlyDelete(room)}
                    onEdit={() => { setForm(room); setOpen(true); }}
                    onVacant={() => setVacant(room)}
                  />
                ) : null}
              </article>
            );
          })}
          {!visibleRooms.length ? <p className="muted">暂无房间记录。</p> : null}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredRooms.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑房间" : "新增房间"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="所属房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId }))} placeholder="搜索房源名称、地址、城市" />
              <TextField label="房间名称" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="房间编号" value={form.roomNumber} onChange={(roomNumber) => setForm((current) => ({ ...current, roomNumber }))} />
              <MoneyInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} />
              <MoneyInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <SearchableSelect label="房间状态" value={form.status} options={roomStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function RoomActions({ onEdit, onVacant, onArchive, onDelete, saving, canEdit, canArchive, canDelete }: { onEdit: () => void; onVacant: () => void; onArchive: () => void; onDelete: () => void; saving: boolean; canEdit: boolean; canArchive: boolean; canDelete: boolean }) {
  if (!canEdit && !canArchive && !canDelete) return null;
  return (
    <div className="top-actions">
      {canEdit ? <><button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button><button className="btn" disabled={saving} onClick={onVacant} type="button"><Home size={15} /> 设为空置</button></> : null}
      {canArchive ? <button className="btn" disabled={saving} onClick={onArchive} type="button"><Archive size={15} /> 归档</button> : null}
      {canDelete ? <button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button> : null}
    </div>
  );
}

function RoomDetail({
  room,
  propertyName,
  expiryLabel,
  unpaid,
  currentTenants,
  currentMonthlyRent,
  currentDepositAmount,
  coverageEnd,
  contractEndDate,
  contracts,
  allPayments,
  allDeposits,
  allTenants,
  payments,
  deposits,
  saving,
  canEdit,
  canArchive,
  canDelete,
  onEdit,
  onVacant,
  onArchive,
  onDelete
}: {
  room: BusinessRoom;
  propertyName: string;
  expiryLabel: string;
  unpaid: number;
  currentTenants: BusinessTenant[];
  currentMonthlyRent: number;
  currentDepositAmount: number;
  coverageEnd: string;
  contractEndDate: string;
  contracts: BusinessContract[];
  allPayments: BusinessRentPayment[];
  allDeposits: BusinessDeposit[];
  allTenants: BusinessTenant[];
  payments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
  saving: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onVacant: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="record-detail-panel room-detail-panel">
      <div className="detail-grid">
        <DetailField label="房源" value={propertyName} />
        <DetailField label="房间名称" value={room.name || "-"} />
        <DetailField label="房间编号" value={room.roomNumber || "-"} />
        <DetailField label="当前在租租客" value={`${currentTenants.length}人`} />
        <DetailField label="当前月租合计" value={euro(currentMonthlyRent)} />
        <DetailField label="当前押金合计" value={euro(currentDepositAmount)} />
        <DetailField label="是否欠费" value={unpaid > 0 ? `欠费 ${euro(unpaid)}` : "否"} />
        <DetailField label="租金已覆盖至" value={coverageEnd} />
        <DetailField label="合同到期日期" value={contractEndDate} />
        <DetailField label="到期提醒" value={expiryLabel} />
        <DetailField label="备注" value={room.notes || "-"} />
      </div>
      <div className="room-current-tenants">
        <div className="detail-section-title">当前在租租客（{currentTenants.length}人）</div>
        {currentTenants.map((tenant) => {
          const payment = latestCoverageForTenant(tenant.id, allPayments);
          const contract = latestActiveContractForTenant(tenant.id, contracts);
          return (
            <Link className="room-current-tenant" href={`/tenants?tenantId=${tenant.id}`} key={tenant.id}>
              <strong>{tenant.name}</strong>
              <span>月租 {euro(tenant.monthlyRent)}</span>
              <span>押金 {euro(currentDepositForTenant(tenant, allDeposits))}</span>
              <span>入住 {contract?.startDate || "-"}</span>
              <span>覆盖至 {coverageLabel(payment)}</span>
              <StatusBadge tone="green">{tenant.status}</StatusBadge>
            </Link>
          );
        })}
        {!currentTenants.length ? <span className="muted">当前无在租租客</span> : null}
      </div>
      <div className="attachment-panel">
        <div className="detail-section-title">历史收款记录（{payments.length}笔）</div>
        <div className="settlement-detail-list">
          {[...payments]
            .sort((a, b) => (b.paymentDate || b.coverageEndDate || b.rentMonth).localeCompare(a.paymentDate || a.coverageEndDate || a.rentMonth))
            .map((payment) => {
              const deposit = paymentDepositAmount(payment, deposits);
              const rent = Number(payment.amountDue || 0);
              const rentPayment = !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
              const tenantName = allTenants.find((tenant) => tenant.id === payment.tenantId)?.name || "未填写租客";
              return <div className="payment-history-line room-payment-history-line" key={payment.id}><span>{payment.paymentDate || payment.rentMonth}</span><span>{tenantName}</span><span>{rentPayment ? "房租" : payment.incomeItem || payment.incomeType || "收入"} {euro(rent)}</span><span>押金 {euro(deposit)}</span><span>归属 {payment.receivedBy || "-"}</span><span>状态 {payment.paymentStatus || "-"}</span><strong>实收 {euro(payment.amountPaid)}</strong></div>;
            })}
          {!payments.length ? <span className="muted">暂无收款记录</span> : null}
        </div>
      </div>
      <RoomActions canArchive={canArchive} canDelete={canDelete} canEdit={canEdit} onArchive={onArchive} onDelete={onDelete} onEdit={onEdit} onVacant={onVacant} saving={saving} />
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function paymentDepositAmount(payment: BusinessRentPayment, deposits: BusinessDeposit[]) {
  const linkedDeposit = deposits.find((deposit) => deposit.notes?.includes(`[收租押金:${payment.id}]`));
  if (linkedDeposit) return Number(linkedDeposit.amount || 0);

  const matchingDeposit = deposits.find((deposit) => deposit.tenantId === payment.tenantId
    && deposit.roomId === payment.roomId
    && deposit.transactionDate === payment.paymentDate
    && isActiveDeposit(deposit));
  if (matchingDeposit) return Number(matchingDeposit.amount || 0);

  // Legacy receipts store rent in amount_due and the collected total in amount_paid.
  return Math.max(Number(payment.amountPaid || 0) - Number(payment.amountDue || 0), 0);
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}

function roomTone(status: string) {
  if (status === "已租") return "green";
  if (status === "空置") return "blue";
  if (status === "维修中" || status === "已归档") return "red";
  return "amber";
}

function latestContractForRoom(roomId: string, contracts: BusinessContract[]) {
  return contracts
    .filter((contract) => contract.roomId === roomId)
    .sort((a, b) => (b.endDate || "").localeCompare(a.endDate || ""))[0] || null;
}

function roomUnpaidAmount(tenants: BusinessTenant[], payments: BusinessRentPayment[]) {
  return tenants.reduce((total, tenant) => {
    const latest = latestCoverageForTenant(tenant.id, payments);
    return total + (isCoverageExpired(latest) ? overdueReferenceAmount(latest, tenant) : 0);
  }, 0);
}

function currentDepositForTenant(tenant: BusinessTenant, deposits: BusinessDeposit[]) {
  const active = deposits.filter((deposit) => deposit.tenantId === tenant.id && isActiveDeposit(deposit));
  return active.length ? active.reduce((total, deposit) => total + Number(deposit.amount || 0), 0) : Number(tenant.depositAmount || 0);
}

function isActiveDeposit(deposit: BusinessDeposit) {
  return deposit.type === "收取" && !["已退", "已退还", "已作废", "已归档"].includes(deposit.status) && !isVoided(deposit.notes);
}

function isActiveContract(contract: BusinessContract) {
  return !["已结束", "已归档", "已退租"].includes(contract.status) && (!contract.endDate || contract.endDate >= new Date().toISOString().slice(0, 10));
}

function latestActiveContractForTenant(tenantId: string, contracts: BusinessContract[]) {
  return [...contracts]
    .filter((contract) => contract.tenantId === tenantId && isActiveContract(contract))
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0] || null;
}

function isActiveTenant(tenant: BusinessTenant) {
  return !["已退租", "空置", "已归档"].some((status) => tenant.status?.includes(status));
}

function getRoomExpiryInfo(endDate?: string) {
  if (!endDate) return { label: "-", tone: "info" as const };
  const days = daysUntil(endDate);
  if (days < 0) return { label: `已到期${Math.abs(days)}天`, tone: "red" as const };
  if (days <= 30) return { label: `${days}天到期`, tone: "red" as const };
  if (days <= 90) return { label: `${days}天到期`, tone: "amber" as const };
  return { label: "-", tone: "info" as const };
}

function daysUntil(date: string) {
  const today = new Date();
  const start = new Date(today.toISOString().slice(0, 10) + "T00:00:00");
  const target = new Date(`${date}T00:00:00`);
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
