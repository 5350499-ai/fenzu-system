"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessProperty,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  getInitialContracts,
  getInitialProperties,
  getInitialRooms,
  getInitialTenants,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const emptyContract: BusinessContract = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  startDate: "",
  endDate: "",
  monthlyRent: 0,
  depositAmount: 0,
  status: "有效",
  notes: ""
};

export default function ContractsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [form, setForm] = useState<BusinessContract>(emptyContract);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");

  useEffect(() => {
    const loadedProperties = getInitialProperties();
    const loadedRooms = getInitialRooms(loadedProperties);
    const loadedTenants = getInitialTenants(loadedProperties, loadedRooms);
    setProperties(loadedProperties);
    setRooms(loadedRooms);
    setTenants(loadedTenants);
    setContracts(getInitialContracts(loadedProperties, loadedRooms, loadedTenants));
  }, []);

  useEffect(() => {
    if (contracts.length) saveBusinessData(contractKey, contracts);
  }, [contracts]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filteredContracts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return contracts;
    return contracts.filter((contract) => {
      const property = properties.find((item) => item.id === contract.propertyId);
      const room = rooms.find((item) => item.id === contract.roomId);
      const tenant = tenants.find((item) => item.id === contract.tenantId);
      return `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${contract.status}`.toLowerCase().includes(keyword);
    });
  }, [contracts, properties, query, rooms, tenants]);
  const visibleContracts = pageRows(filteredContracts, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyContract);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId || !form.roomId || !form.tenantId) return;
    if (form.id) {
      setContracts((current) => current.map((contract) => (contract.id === form.id ? form : contract)));
    } else {
      setContracts((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    setForm((current) => ({
      ...current,
      tenantId,
      monthlyRent: tenant?.monthlyRent || current.monthlyRent,
      depositAmount: tenant?.depositAmount || current.depositAmount
    }));
  }

  return (
    <AppLayout title="合同管理" description="合同必须关联房源、房间、租客。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">合同列表</h2><p className="muted">支持按房源、房间、租客搜索。</p></div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增合同</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间、租客、状态" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>房源</th><th>房间</th><th>租客</th><th>开始日期</th><th>结束日期</th><th>月租</th><th>押金</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              {visibleContracts.map((contract) => (
                <tr key={contract.id}>
                  <td>{properties.find((item) => item.id === contract.propertyId)?.name || "-"}</td>
                  <td>{rooms.find((item) => item.id === contract.roomId)?.name || "-"}</td>
                  <td>{tenants.find((item) => item.id === contract.tenantId)?.name || "-"}</td>
                  <td>{contract.startDate}</td>
                  <td>{contract.endDate}</td>
                  <td>€{contract.monthlyRent}</td>
                  <td>€{contract.depositAmount}</td>
                  <td><StatusBadge tone={contract.status === "有效" ? "green" : contract.status === "即将到期" ? "amber" : "red"}>{contract.status}</StatusBadge></td>
                  <td title={contract.notes || ""}>{noteSummary(contract.notes)}</td>
                  <td><div className="top-actions"><button className="btn" onClick={() => { setForm(contract); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button><button className="btn danger" onClick={() => {
                    if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
                    setContracts((current) => current.filter((item) => item.id !== contract.id));
                  }} type="button"><Trash2 size={15} /> 删除</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleContracts.map((contract) => {
            const tenant = tenants.find((item) => item.id === contract.tenantId);
            const room = rooms.find((item) => item.id === contract.roomId);
            const expanded = expandedNoteId === contract.id;
            return (
              <article className="mobile-record-card" key={contract.id}>
                <div className="mobile-record-title">
                  <strong>{tenant?.name || "-"}</strong>
                  <span>{contract.endDate} · <StatusBadge tone={contract.status === "有效" ? "green" : contract.status === "即将到期" ? "amber" : "red"}>{contract.status}</StatusBadge></span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>开始</span><strong>{contract.startDate}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>€{contract.monthlyRent}</strong></div>
                  <div className="mobile-record-field"><span>押金</span><strong>€{contract.depositAmount}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? contract.notes || "-" : noteSummary(contract.notes)} {contract.notes && contract.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : contract.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(contract); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => { if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return; setContracts((current) => current.filter((item) => item.id !== contract.id)); }} type="button"><Trash2 size={15} /> 删除</button>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredContracts.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑合同" : "新增合同"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "" }))} placeholder="搜索房源名称、地址、城市" />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId, tenantId: "" }))} placeholder="先选房源，再搜索房间名称、编号" />
              <SearchableSelect label="租客" value={form.tenantId} disabled={!form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }))} onChange={chooseTenant} placeholder="先选房间，再搜索租客姓名、电话、微信" />
              <div className="field"><label>开始日期</label><input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
              <div className="field"><label>结束日期</label><input required type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
              <div className="field"><label>月租</label><input type="number" value={form.monthlyRent} onChange={(event) => setForm((current) => ({ ...current, monthlyRent: Number(event.target.value) }))} /></div>
              <div className="field"><label>押金</label><input type="number" value={form.depositAmount} onChange={(event) => setForm((current) => ({ ...current, depositAmount: Number(event.target.value) }))} /></div>
              <SearchableSelect label="状态" value={form.status} options={["有效", "即将到期", "已结束"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status: status as BusinessContract["status"] }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
