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
import { noteSummary } from "@/lib/format";
import { Archive, Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

const sources = ["微信群", "华人街", "小红书", "Facebook", "朋友介绍", "其他"];
const tenantStatuses = ["在租", "预定入住", "已退租"];

export default function TenantsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [form, setForm] = useState<BusinessTenant>(emptyTenant);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");
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
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载租客失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return tenants;
    return tenants.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      return `${tenant.name} ${tenant.phone} ${tenant.wechat} ${property?.name || ""} ${room?.name || ""} ${tenant.status}`.toLowerCase().includes(keyword);
    });
  }, [properties, query, rooms, tenants]);
  const visibleTenants = pageRows(filteredTenants, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyTenant);
  }

  async function persistAll(next: {
    tenants?: BusinessTenant[];
    rooms?: BusinessRoom[];
    contracts?: BusinessContract[];
    deposits?: BusinessDeposit[];
  }) {
    setSaving(true);
    try {
      if (next.tenants) await saveBusinessData(tenantKey, next.tenants);
      if (next.rooms) await saveBusinessData(roomKey, next.rooms);
      if (next.contracts) await saveBusinessData(contractKey, next.contracts);
      if (next.deposits) await saveBusinessData(depositKey, next.deposits);
      if (next.tenants) setTenants(next.tenants);
      if (next.rooms) setRooms(next.rooms);
      if (next.contracts) setContracts(next.contracts);
      if (next.deposits) setDeposits(next.deposits);
    } catch (error: any) {
      window.alert(error.message || "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.name.trim()) return;
    const next = form.id
      ? tenants.map((tenant) => (tenant.id === form.id ? form : tenant))
      : [{ ...form, id: crypto.randomUUID() }, ...tenants];
    await persistAll({ tenants: next });
    close();
  }

  async function moveOut(tenant: BusinessTenant) {
    if (!window.confirm("确认办理退租/归档吗？\n将保留历史收租记录，并把房间设为空置、合同设为已结束。")) return;
    const depositStatus = window.prompt("押金状态请输入：已退 或 待退", "待退") === "已退" ? "已退" : "待退";
    await persistAll({
      tenants: tenants.map((item) => (item.id === tenant.id ? { ...item, status: "已退租" } : item)),
      rooms: rooms.map((room) => (room.id === tenant.roomId ? { ...room, status: "空置" } : room)),
      contracts: contracts.map((contract) => (contract.tenantId === tenant.id ? { ...contract, status: "已结束" } : contract)),
      deposits: deposits.map((deposit) => (deposit.tenantId === tenant.id ? { ...deposit, status: depositStatus } : deposit))
    });
  }

  async function permanentlyDelete(tenant: BusinessTenant) {
    if (tenantRelationCount(tenant.id) > 0) {
      window.alert("该租客已有合同、收租或押金记录，不能直接删除。你可以选择退租/归档租客。");
      return;
    }
    if (!window.confirm("确定要永久删除这个误填租客吗？\n删除后不可恢复。")) return;
    await persistAll({ tenants: tenants.filter((item) => item.id !== tenant.id) });
  }

  function tenantRelationCount(tenantId: string) {
    return (
      contracts.filter((item) => item.tenantId === tenantId).length +
      payments.filter((item) => item.tenantId === tenantId).length +
      deposits.filter((item) => item.tenantId === tenantId).length
    );
  }

  return (
    <AppLayout title="租客管理" description="租客必须关联房源和房间。有业务记录的租客只能退租/归档。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">租客列表</h2><p className="muted">支持姓名、电话、微信、房源、房间搜索。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增租客</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索姓名、电话、微信、房源、房间" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>姓名</th><th>电话</th><th>微信</th><th>房源</th><th>房间</th><th>来源</th><th>月租</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleTenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.name}</td>
                <td>{tenant.phone || "-"}</td>
                <td>{tenant.wechat || "-"}</td>
                <td>{properties.find((item) => item.id === tenant.propertyId)?.name || "-"}</td>
                <td>{rooms.find((item) => item.id === tenant.roomId)?.name || "-"}</td>
                <td>{tenant.source || "-"}</td>
                <td>€{tenant.monthlyRent}</td>
                <td><StatusBadge tone={tenant.status === "在租" ? "green" : tenant.status === "已退租" ? "red" : "amber"}>{tenant.status}</StatusBadge></td>
                <td title={tenant.notes || ""}>{noteSummary(tenant.notes)}</td>
                <td><TenantActions onDelete={() => permanentlyDelete(tenant)} onEdit={() => { setForm(tenant); setOpen(true); }} onMoveOut={() => moveOut(tenant)} saving={saving} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleTenants.map((tenant) => {
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const expanded = expandedNoteId === tenant.id;
            return (
              <article className="mobile-record-card" key={tenant.id}>
                <div className="mobile-record-title"><strong>{tenant.name}</strong><span>{property?.name || "-"} / {room?.name || "-"} · <StatusBadge tone={tenant.status === "在租" ? "green" : tenant.status === "已退租" ? "red" : "amber"}>{tenant.status}</StatusBadge></span></div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>电话</span><strong>{tenant.phone || "-"}</strong></div>
                  <div className="mobile-record-field"><span>微信</span><strong>{tenant.wechat || "-"}</strong></div>
                  <div className="mobile-record-field"><span>来源</span><strong>{tenant.source}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>€{tenant.monthlyRent}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? tenant.notes || "-" : noteSummary(tenant.notes)} {tenant.notes && tenant.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : tenant.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <TenantActions onDelete={() => permanentlyDelete(tenant)} onEdit={() => { setForm(tenant); setOpen(true); }} onMoveOut={() => moveOut(tenant)} saving={saving} />
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredTenants.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑租客" : "新增租客"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} placeholder="搜索房源名称、地址、城市" />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} placeholder="先选房源，再搜索房间名称、编号" />
              <TextField label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <TextField label="微信" value={form.wechat} onChange={(wechat) => setForm((current) => ({ ...current, wechat }))} />
              <SearchableSelect label="来源" value={form.source} options={sources.map((source) => ({ value: source, label: source }))} onChange={(source) => setForm((current) => ({ ...current, source }))} />
              <MoneyInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} />
              <MoneyInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function TenantActions({ onEdit, onMoveOut, onDelete, saving }: { onEdit: () => void; onMoveOut: () => void; onDelete: () => void; saving: boolean }) {
  return (
    <div className="top-actions">
      <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button>
      <button className="btn" disabled={saving} onClick={onMoveOut} type="button"><Archive size={15} /> 退租/归档</button>
      <button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button>
    </div>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
