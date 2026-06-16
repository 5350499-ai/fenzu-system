"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessProperty,
  BusinessRoom,
  BusinessTenant,
  getInitialProperties,
  getInitialRooms,
  getInitialTenants,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
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

export default function TenantsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [form, setForm] = useState<BusinessTenant>(emptyTenant);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");

  useEffect(() => {
    const loadedProperties = getInitialProperties();
    const loadedRooms = getInitialRooms(loadedProperties);
    setProperties(loadedProperties);
    setRooms(loadedRooms);
    setTenants(getInitialTenants(loadedProperties, loadedRooms));
  }, []);

  useEffect(() => {
    if (tenants.length) saveBusinessData(tenantKey, tenants);
  }, [tenants]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return tenants;
    return tenants.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      return `${tenant.name} ${tenant.phone} ${tenant.wechat} ${property?.name || ""} ${room?.name || ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [properties, query, rooms, tenants]);
  const visibleTenants = pageRows(filteredTenants, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyTenant);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId || !form.roomId) return;
    if (form.id) {
      setTenants((current) => current.map((tenant) => (tenant.id === form.id ? form : tenant)));
    } else {
      setTenants((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  return (
    <AppLayout title="租客管理" description="租客必须关联房源和房间。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">租客列表</h2>
            <p className="muted">支持按姓名、电话、微信、房源、房间搜索。</p>
          </div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button">
            <Plus size={17} /> 新增租客
          </button>
        </div>
        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索姓名、电话、微信、房源、房间" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>姓名</th>
                <th>电话</th>
                <th>微信</th>
                <th>房源</th>
                <th>房间</th>
                <th>来源</th>
                <th>月租</th>
                <th>状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleTenants.map((tenant) => (
                <tr key={tenant.id}>
                  <td>{tenant.name}</td>
                  <td>{tenant.phone}</td>
                  <td>{tenant.wechat || "-"}</td>
                  <td>{properties.find((item) => item.id === tenant.propertyId)?.name || "-"}</td>
                  <td>{rooms.find((item) => item.id === tenant.roomId)?.name || "-"}</td>
                  <td>{tenant.source}</td>
                  <td>€{tenant.monthlyRent}</td>
                  <td><StatusBadge tone={tenant.status === "在租" ? "green" : "amber"}>{tenant.status}</StatusBadge></td>
                  <td title={tenant.notes || ""}>{noteSummary(tenant.notes)}</td>
                  <td>
                    <div className="top-actions">
                      <button className="btn" onClick={() => { setForm(tenant); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                      <button className="btn danger" onClick={() => {
                        if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
                        setTenants((current) => current.filter((item) => item.id !== tenant.id));
                      }} type="button"><Trash2 size={15} /> 删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleTenants.map((tenant) => {
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const expanded = expandedNoteId === tenant.id;
            return (
              <article className="mobile-record-card" key={tenant.id}>
                <div className="mobile-record-title">
                  <strong>{tenant.name}</strong>
                  <span>{property?.name || "-"} / {room?.name || "-"} · <StatusBadge tone={tenant.status === "在租" ? "green" : "amber"}>{tenant.status}</StatusBadge></span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>电话</span><strong>{tenant.phone}</strong></div>
                  <div className="mobile-record-field"><span>微信</span><strong>{tenant.wechat || "-"}</strong></div>
                  <div className="mobile-record-field"><span>来源</span><strong>{tenant.source}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>€{tenant.monthlyRent}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? tenant.notes || "-" : noteSummary(tenant.notes)} {tenant.notes && tenant.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : tenant.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(tenant); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => { if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return; setTenants((current) => current.filter((item) => item.id !== tenant.id)); }} type="button"><Trash2 size={15} /> 删除</button>
                </div>
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
                  description: `${property.city} · ${property.address}`,
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
                  description: `编号 ${room.roomNumber} · ${room.status}`,
                  keywords: room.roomNumber
                }))}
                onChange={(roomId) => setForm((current) => ({ ...current, roomId }))}
                placeholder="先选房源，再搜索房间名称、编号"
              />
              <div className="field"><label>姓名</label><input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></div>
              <div className="field"><label>电话</label><input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
              <div className="field"><label>微信</label><input value={form.wechat} onChange={(event) => setForm((current) => ({ ...current, wechat: event.target.value }))} /></div>
              <SearchableSelect label="来源" value={form.source} options={sources.map((source) => ({ value: source, label: source }))} onChange={(source) => setForm((current) => ({ ...current, source }))} />
              <div className="field"><label>月租</label><input type="number" value={form.monthlyRent} onChange={(event) => setForm((current) => ({ ...current, monthlyRent: Number(event.target.value) }))} /></div>
              <div className="field"><label>押金</label><input type="number" value={form.depositAmount} onChange={(event) => setForm((current) => ({ ...current, depositAmount: Number(event.target.value) }))} /></div>
              <SearchableSelect label="状态" value={form.status} options={["在租", "预定入住", "已退房"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status: status as BusinessTenant["status"] }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
