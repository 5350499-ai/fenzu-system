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
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Archive, Edit3, Home, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const [expandedNoteId, setExpandedNoteId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

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
      return `${property?.name || ""} ${room.name} ${room.roomNumber} ${room.status} ${room.notes || ""}`.toLowerCase().includes(keyword);
    });
  }, [properties, query, rooms]);
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
    if (!window.confirm("确认把这个房间设为空置吗？历史租客、合同、收租记录会保留。")) return;
    await persist(rooms.map((item) => (item.id === room.id ? { ...item, status: "空置" } : item)));
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
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增房间</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间名称、房间编号、状态" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>所属房源</th><th>房间</th><th>编号</th><th>月租</th><th>押金</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleRooms.map((room) => (
              <tr key={room.id}>
                <td>{properties.find((item) => item.id === room.propertyId)?.name || "-"}</td>
                <td>{room.name}</td>
                <td>{room.roomNumber || "-"}</td>
                <td>€{room.monthlyRent}</td>
                <td>€{room.depositAmount}</td>
                <td><StatusBadge tone={roomTone(room.status)}>{room.status}</StatusBadge></td>
                <td title={room.notes || ""}>{noteSummary(room.notes)}</td>
                <td><RoomActions onArchive={() => archiveRoom(room)} onDelete={() => permanentlyDelete(room)} onEdit={() => { setForm(room); setOpen(true); }} onVacant={() => setVacant(room)} saving={saving} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleRooms.map((room) => {
            const property = properties.find((item) => item.id === room.propertyId);
            const expanded = expandedNoteId === room.id;
            return (
              <article className="mobile-record-card" key={room.id}>
                <div className="mobile-record-title">
                  <strong>{property?.name || "-"}</strong>
                  <span>{room.roomNumber || room.name} · <StatusBadge tone={roomTone(room.status)}>{room.status}</StatusBadge></span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room.name}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>€{room.monthlyRent}</strong></div>
                  <div className="mobile-record-field"><span>押金</span><strong>€{room.depositAmount}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? room.notes || "-" : noteSummary(room.notes)} {room.notes && room.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : room.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <RoomActions onArchive={() => archiveRoom(room)} onDelete={() => permanentlyDelete(room)} onEdit={() => { setForm(room); setOpen(true); }} onVacant={() => setVacant(room)} saving={saving} />
              </article>
            );
          })}
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

function RoomActions({ onEdit, onVacant, onArchive, onDelete, saving }: { onEdit: () => void; onVacant: () => void; onArchive: () => void; onDelete: () => void; saving: boolean }) {
  return (
    <div className="top-actions">
      <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button>
      <button className="btn" disabled={saving} onClick={onVacant} type="button"><Home size={15} /> 设为空置</button>
      <button className="btn" disabled={saving} onClick={onArchive} type="button"><Archive size={15} /> 归档</button>
      <button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button>
    </div>
  );
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
