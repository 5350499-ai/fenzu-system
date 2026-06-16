"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessProperty,
  BusinessRoom,
  getInitialProperties,
  getInitialRooms,
  loadBusinessData,
  roomKey,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

const statuses: BusinessRoom["status"][] = ["空置", "已租", "预订中", "即将退租", "维修中", "暂停出租"];

export default function RoomsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [form, setForm] = useState<BusinessRoom>(emptyRoom);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setLoaded(true);
    }
    load().catch(console.error);
  }, []);

  useEffect(() => {
    if (loaded) saveBusinessData(roomKey, rooms).catch(console.error);
  }, [loaded, rooms]);

  const filteredRooms = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rooms;
    return rooms.filter((room) => {
      const property = properties.find((item) => item.id === room.propertyId);
      return `${property?.name || ""} ${room.name} ${room.roomNumber} ${room.status}`.toLowerCase().includes(keyword);
    });
  }, [properties, query, rooms]);
  const visibleRooms = pageRows(filteredRooms, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyRoom);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId) return;
    if (form.id) {
      setRooms((current) => current.map((room) => (room.id === form.id ? form : room)));
    } else {
      setRooms((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  return (
    <AppLayout title="房间管理" description="房间必须关联所属房源，可新增、编辑、删除。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">房间列表</h2>
            <p className="muted">先选房源，再管理该房源下的房间。</p>
          </div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button">
            <Plus size={17} />
            新增房间
          </button>
        </div>
        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索房源、房间名称、房间编号、状态" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>所属房源</th>
                <th>房间</th>
                <th>编号</th>
                <th>月租</th>
                <th>押金</th>
                <th>状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRooms.map((room) => (
                <tr key={room.id}>
                  <td>{properties.find((item) => item.id === room.propertyId)?.name || "-"}</td>
                  <td>{room.name}</td>
                  <td>{room.roomNumber}</td>
                  <td>€{room.monthlyRent}</td>
                  <td>€{room.depositAmount}</td>
                  <td>
                    <StatusBadge tone={room.status === "已租" ? "green" : room.status === "空置" ? "blue" : "amber"}>
                      {room.status}
                    </StatusBadge>
                  </td>
                  <td title={room.notes || ""}>{noteSummary(room.notes)}</td>
                  <td>
                    <div className="top-actions">
                      <button className="btn" onClick={() => { setForm(room); setOpen(true); }} type="button">
                        <Edit3 size={15} /> 编辑
                      </button>
                      <button className="btn danger" onClick={() => {
                        if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
                        setRooms((current) => current.filter((item) => item.id !== room.id));
                      }} type="button">
                        <Trash2 size={15} /> 删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
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
                  <span>{room.roomNumber} · <StatusBadge tone={room.status === "已租" ? "green" : room.status === "空置" ? "blue" : "amber"}>{room.status}</StatusBadge></span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room.name}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>€{room.monthlyRent}</strong></div>
                  <div className="mobile-record-field"><span>押金</span><strong>€{room.depositAmount}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? room.notes || "-" : noteSummary(room.notes)} {room.notes && room.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : room.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(room); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => { if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return; setRooms((current) => current.filter((item) => item.id !== room.id)); }} type="button"><Trash2 size={15} /> 删除</button>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredRooms.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">{form.id ? "编辑房间" : "新增房间"}</h2>
              <button className="btn" onClick={close} type="button">
                <X size={17} /> 关闭
              </button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect
                label="所属房源"
                value={form.propertyId}
                options={properties.map((property) => ({
                  value: property.id,
                  label: property.name,
                  description: `${property.city} · ${property.address}`,
                  keywords: `${property.address} ${property.city}`
                }))}
                onChange={(propertyId) => setForm((current) => ({ ...current, propertyId }))}
                placeholder="搜索房源名称、地址、城市"
              />
              <div className="field">
                <label>房间名称</label>
                <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
              </div>
              <div className="field">
                <label>房间编号</label>
                <input value={form.roomNumber} onChange={(event) => setForm((current) => ({ ...current, roomNumber: event.target.value }))} />
              </div>
              <div className="field">
                <label>月租</label>
                <input type="number" value={form.monthlyRent} onChange={(event) => setForm((current) => ({ ...current, monthlyRent: Number(event.target.value) }))} />
              </div>
              <div className="field">
                <label>押金</label>
                <input type="number" value={form.depositAmount} onChange={(event) => setForm((current) => ({ ...current, depositAmount: Number(event.target.value) }))} />
              </div>
              <SearchableSelect
                label="房间状态"
                value={form.status}
                options={statuses.map((status) => ({ value: status, label: status }))}
                onChange={(status) => setForm((current) => ({ ...current, status: status as BusinessRoom["status"] }))}
                placeholder="搜索房间状态"
              />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>备注</label>
                <textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={close} type="button">取消</button>
                <button className="btn primary" type="submit">保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
