"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  rentPaymentKey,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const emptyPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  rentMonth: "2026-06",
  amountDue: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  paymentMethod: "转账",
  isOverdue: false,
  notes: ""
};

export default function RentPaymentsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [form, setForm] = useState<BusinessRentPayment>(emptyPayment);
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
    setPayments(getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
  }, []);

  useEffect(() => {
    if (payments.length) saveBusinessData(rentPaymentKey, payments);
  }, [payments]);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return payments;
    return payments.filter((payment) => {
      const property = properties.find((item) => item.id === payment.propertyId);
      const room = rooms.find((item) => item.id === payment.roomId);
      const tenant = tenants.find((item) => item.id === payment.tenantId);
      return `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""}`
        .toLowerCase()
        .includes(keyword);
    });
  }, [payments, properties, query, rooms, tenants]);
  const visiblePayments = pageRows(filteredPayments, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyPayment);
  }

  function updateMoney(patch: Partial<BusinessRentPayment>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - Number(next.amountPaid || 0), 0);
      return { ...next, amountUnpaid, isOverdue: amountUnpaid > 0 };
    });
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    updateMoney({ tenantId, amountDue: tenant?.monthlyRent || 0, amountPaid: 0 });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId || !form.roomId || !form.tenantId) return;
    if (form.id) {
      setPayments((current) => current.map((payment) => (payment.id === form.id ? form : payment)));
    } else {
      setPayments((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  return (
    <AppLayout title="收租管理" description="收款必须关联房源、房间、租客。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">收租记录</h2><p className="muted">新增收款必须按房源 → 房间 → 租客选择。</p></div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button"><Plus size={17} /> 登记收款</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间、租客姓名、电话、微信" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>月份</th><th>房源</th><th>房间</th><th>租客</th><th>应收</th><th>已收</th><th>未收</th><th>付款方式</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>
              {visiblePayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.rentMonth}</td>
                  <td>{properties.find((item) => item.id === payment.propertyId)?.name || "-"}</td>
                  <td>{rooms.find((item) => item.id === payment.roomId)?.name || "-"}</td>
                  <td>{tenants.find((item) => item.id === payment.tenantId)?.name || "-"}</td>
                  <td>€{payment.amountDue}</td>
                  <td>€{payment.amountPaid}</td>
                  <td>€{payment.amountUnpaid}</td>
                  <td>{payment.paymentMethod}</td>
                  <td><StatusBadge tone={payment.isOverdue ? "red" : "green"}>{payment.isOverdue ? "欠费" : "已结清"}</StatusBadge></td>
                  <td title={payment.notes || ""}>{noteSummary(payment.notes)}</td>
                  <td><div className="top-actions"><button className="btn" onClick={() => { setForm(payment); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button><button className="btn danger" onClick={() => {
                    if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
                    setPayments((current) => current.filter((item) => item.id !== payment.id));
                  }} type="button"><Trash2 size={15} /> 删除</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visiblePayments.map((payment) => {
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            const room = rooms.find((item) => item.id === payment.roomId);
            const expanded = expandedNoteId === payment.id;
            return (
              <article className="mobile-record-card" key={payment.id}>
                <div className="mobile-record-title">
                  <strong>{tenant?.name || "-"}</strong>
                  <span>{payment.rentMonth} · <StatusBadge tone={payment.isOverdue ? "red" : "green"}>{payment.isOverdue ? "欠费" : "已结清"}</StatusBadge> · 欠 €{payment.amountUnpaid}</span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>应收</span><strong>€{payment.amountDue}</strong></div>
                  <div className="mobile-record-field"><span>已收</span><strong>€{payment.amountPaid}</strong></div>
                  <div className="mobile-record-field"><span>方式</span><strong>{payment.paymentMethod}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? payment.notes || "-" : noteSummary(payment.notes)} {payment.notes && payment.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : payment.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(payment); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => { if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return; setPayments((current) => current.filter((item) => item.id !== payment.id)); }} type="button"><Trash2 size={15} /> 删除</button>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredPayments.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑收款" : "登记收款"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "" }))} placeholder="搜索房源名称、地址、城市" />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId, tenantId: "" }))} placeholder="先选房源，再搜索房间名称、编号" />
              <SearchableSelect label="租客" value={form.tenantId} disabled={!form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }))} onChange={chooseTenant} placeholder="先选房间，再搜索租客姓名、电话、微信" />
              <div className="field"><label>月份</label><input required value={form.rentMonth} onChange={(event) => setForm((current) => ({ ...current, rentMonth: event.target.value }))} placeholder="例如 2026-06" /></div>
              <div className="field"><label>应收金额</label><input type="number" value={form.amountDue} onChange={(event) => updateMoney({ amountDue: Number(event.target.value) })} /></div>
              <div className="field"><label>已收金额</label><input type="number" value={form.amountPaid} onChange={(event) => updateMoney({ amountPaid: Number(event.target.value) })} /></div>
              <div className="field"><label>未收金额</label><input readOnly value={form.amountUnpaid} /></div>
              <SearchableSelect label="付款方式" value={form.paymentMethod} options={["现金", "转账", "Bizum", "其他"].map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod: paymentMethod as BusinessRentPayment["paymentMethod"] }))} />
              <div className="field"><label>欠费状态</label><input readOnly value={form.isOverdue ? "欠费" : "已结清"} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
