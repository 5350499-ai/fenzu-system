"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessDeposit,
  BusinessProperty,
  BusinessRoom,
  BusinessTenant,
  depositKey,
  getInitialDeposits,
  getInitialProperties,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const emptyDeposit: BusinessDeposit = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  type: "收取",
  amount: 0,
  status: "已收",
  transactionDate: "",
  notes: ""
};

export default function DepositsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [form, setForm] = useState<BusinessDeposit>(emptyDeposit);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>("business-rooms", getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>("business-tenants", getInitialTenants(loadedProperties, loadedRooms));
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits(loadedProperties, loadedRooms, loadedTenants));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setDeposits(loadedDeposits);
      setLoaded(true);
    }
    load().catch(console.error);
  }, []);

  useEffect(() => {
    if (loaded) saveBusinessData(depositKey, deposits).catch(console.error);
  }, [deposits, loaded]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filteredDeposits = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return deposits;
    return deposits.filter((deposit) => {
      const property = properties.find((item) => item.id === deposit.propertyId);
      const room = rooms.find((item) => item.id === deposit.roomId);
      const tenant = tenants.find((item) => item.id === deposit.tenantId);
      return `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""} ${deposit.status} ${deposit.type}`.toLowerCase().includes(keyword);
    });
  }, [deposits, properties, query, rooms, tenants]);
  const visibleDeposits = pageRows(filteredDeposits, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyDeposit);
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    setForm((current) => ({ ...current, tenantId, amount: tenant?.depositAmount || current.amount }));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId || !form.roomId || !form.tenantId) return;
    if (form.id) {
      setDeposits((current) => current.map((deposit) => (deposit.id === form.id ? form : deposit)));
    } else {
      setDeposits((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  function remove(id: string) {
    if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
    setDeposits((current) => current.filter((deposit) => deposit.id !== id));
  }

  return (
    <AppLayout title="押金管理" description="记录押金收取、退还、扣除和状态。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">押金列表</h2><p className="muted">押金记录必须关联房源、房间、租客。</p></div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增押金记录</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间、租客、状态、类型" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>房源</th><th>房间</th><th>租客</th><th>类型</th><th>金额</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleDeposits.map((deposit) => (
              <tr key={deposit.id}>
                <td>{deposit.transactionDate || "-"}</td>
                <td>{properties.find((property) => property.id === deposit.propertyId)?.name || "-"}</td>
                <td>{rooms.find((room) => room.id === deposit.roomId)?.name || "-"}</td>
                <td>{tenants.find((tenant) => tenant.id === deposit.tenantId)?.name || "-"}</td>
                <td>{deposit.type}</td>
                <td>€{deposit.amount}</td>
                <td><StatusBadge tone={deposit.status === "已收" ? "green" : deposit.status === "待退" ? "amber" : deposit.status === "已退" ? "blue" : "red"}>{deposit.status}</StatusBadge></td>
                <td title={deposit.notes || ""}>{noteSummary(deposit.notes)}</td>
                <td><div className="top-actions"><button className="btn" onClick={() => { setForm(deposit); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button><button className="btn danger" onClick={() => remove(deposit.id)} type="button"><Trash2 size={15} /> 删除</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleDeposits.map((deposit) => {
            const tenant = tenants.find((item) => item.id === deposit.tenantId);
            const room = rooms.find((item) => item.id === deposit.roomId);
            const expanded = expandedNoteId === deposit.id;
            return (
              <article className="mobile-record-card" key={deposit.id}>
                <div className="mobile-record-title">
                  <strong>{tenant?.name || "-"}</strong>
                  <span><StatusBadge tone={deposit.status === "已收" ? "green" : deposit.status === "待退" ? "amber" : deposit.status === "已退" ? "blue" : "red"}>{deposit.status}</StatusBadge> · €{deposit.amount}</span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>类型</span><strong>{deposit.type}</strong></div>
                  <div className="mobile-record-field"><span>日期</span><strong>{deposit.transactionDate || "-"}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? deposit.notes || "-" : noteSummary(deposit.notes)} {deposit.notes && deposit.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : deposit.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(deposit); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => remove(deposit.id)} type="button"><Trash2 size={15} /> 删除</button>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredDeposits.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑押金记录" : "新增押金记录"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "" }))} />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId, tenantId: "" }))} />
              <SearchableSelect label="租客" value={form.tenantId} disabled={!form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }))} onChange={chooseTenant} />
              <SearchableSelect label="押金类型" value={form.type} options={["收取", "退还", "扣除"].map((type) => ({ value: type, label: type }))} onChange={(type) => setForm((current) => ({ ...current, type: type as BusinessDeposit["type"] }))} />
              <div className="field"><label>押金金额</label><input type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></div>
              <SearchableSelect label="押金状态" value={form.status} options={["已收", "待退", "已退", "部分扣除"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status: status as BusinessDeposit["status"] }))} />
              <div className="field"><label>操作日期</label><input type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
