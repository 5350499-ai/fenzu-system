"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
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
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  roomKey,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import { euro, noteSummary } from "@/lib/format";
import { Ban, Edit3, Plus, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

const emptyPayment: BusinessRentPayment = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  rentMonth: new Date().toISOString().slice(0, 7),
  amountDue: 0,
  amountPaid: 0,
  amountUnpaid: 0,
  paymentMethod: "转账",
  isOverdue: false,
  notes: ""
};

const paymentMethods = ["现金", "转账", "Bizum", "其他"];

export default function RentPaymentsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [form, setForm] = useState<BusinessRentPayment>(emptyPayment);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailPaymentId, setDetailPaymentId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setMonthFilter(params.get("month") || "");
    setOverdueOnly(params.get("overdue") === "1");
  }, []);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments(loadedProperties, loadedRooms, loadedTenants));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setPayments(loadedPayments);
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载收租记录失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filteredPayments = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return payments.filter((payment) => {
      const property = properties.find((item) => item.id === payment.propertyId);
      const room = rooms.find((item) => item.id === payment.roomId);
      const tenant = tenants.find((item) => item.id === payment.tenantId);
      const text = `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""} ${payment.rentMonth} ${payment.notes || ""}`.toLowerCase();
      return (!keyword || text.includes(keyword)) &&
        (!monthFilter || payment.rentMonth.includes(monthFilter)) &&
        (!overdueOnly || payment.isOverdue || Number(payment.amountUnpaid || 0) > 0);
    });
  }, [monthFilter, overdueOnly, payments, properties, query, rooms, tenants]);
  const visiblePayments = pageRows(filteredPayments, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyPayment);
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
      const amountUnpaid = Math.max(Number(next.amountDue || 0) - Number(next.amountPaid || 0), 0);
      return { ...next, amountUnpaid, isOverdue: amountUnpaid > 0 };
    });
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    updateMoney({ tenantId, amountDue: tenant?.monthlyRent || 0, amountPaid: 0 });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.tenantId) return;
    const nextPayment = {
      ...form,
      amountDue: Number(form.amountDue || 0),
      amountPaid: Number(form.amountPaid || 0),
      amountUnpaid: Math.max(Number(form.amountDue || 0) - Number(form.amountPaid || 0), 0)
    };
    nextPayment.isOverdue = nextPayment.amountUnpaid > 0;
    const next = form.id
      ? payments.map((payment) => (payment.id === form.id ? nextPayment : payment))
      : [{ ...nextPayment, id: crypto.randomUUID() }, ...payments];
    await persist(next);
    close();
  }

  async function voidPayment(payment: BusinessRentPayment) {
    if (!window.confirm("确认作废这条收租记录吗？作废后金额会变为 0，但历史记录仍保留。")) return;
    await persist(payments.map((item) => (item.id === payment.id ? { ...item, amountDue: 0, amountPaid: 0, amountUnpaid: 0, isOverdue: false, notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(payment: BusinessRentPayment) {
    if (!window.confirm("确定要永久删除这条收租记录吗？\n真实发生过的财务记录建议使用“作废”，删除后不可恢复。")) return;
    await persist(payments.filter((item) => item.id !== payment.id));
    setDetailPaymentId("");
  }

  function resetFilters() {
    setQuery("");
    setMonthFilter("");
    setOverdueOnly(false);
    setPage(1);
  }

  return (
    <AppLayout title="收租管理" description="收款必须关联房源、房间、租客。真实财务记录建议作废，不建议删除。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">收租记录</h2><p className="muted">一行一条，点击记录展开详情。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 登记收款</button>
        </div>
        <div className="list-controls">
          <label className="search-box"><input placeholder="搜索房源、房间、租客、电话、微信、月份" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label className="search-box"><input placeholder="筛选月份，例如 2026-06" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
          <button className={`btn ${overdueOnly ? "primary" : ""}`} onClick={() => setOverdueOnly((current) => !current)} type="button">只看欠费</button>
          {(query || monthFilter || overdueOnly) ? <button className="btn" onClick={resetFilters} type="button">清除筛选</button> : null}
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>收租明细</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visiblePayments.map((payment) => {
              const property = properties.find((item) => item.id === payment.propertyId);
              const room = rooms.find((item) => item.id === payment.roomId);
              const tenant = tenants.find((item) => item.id === payment.tenantId);
              const expanded = detailPaymentId === payment.id;
              return (
                <Fragment key={payment.id}>
                  <tr className="compact-row" onClick={() => setDetailPaymentId(expanded ? "" : payment.id)}>
                    <td><strong>{payment.rentMonth}</strong>｜{tenant?.name || "-"}｜已收 {euro(payment.amountPaid)}｜欠费 {euro(payment.amountUnpaid)}</td>
                    <td><StatusBadge tone={isVoided(payment.notes) ? "red" : payment.isOverdue ? "red" : "green"}>{isVoided(payment.notes) ? "已作废" : payment.isOverdue ? "欠费" : "已结清"}</StatusBadge></td>
                    <td title={payment.notes || ""}>{noteSummary(cleanVoidNote(payment.notes))}</td>
                    <td><PaymentActions onEdit={() => { setForm(payment); setOpen(true); }} onVoid={() => voidPayment(payment)} saving={saving} /></td>
                  </tr>
                  {expanded ? (
                    <tr className="detail-row">
                      <td colSpan={4}>
                        <PaymentDetail
                          payment={payment}
                          propertyName={property?.name || "-"}
                          roomName={room?.name || "-"}
                          tenantName={tenant?.name || "-"}
                          onDelete={() => permanentlyDelete(payment)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visiblePayments.map((payment) => {
            const property = properties.find((item) => item.id === payment.propertyId);
            const room = rooms.find((item) => item.id === payment.roomId);
            const tenant = tenants.find((item) => item.id === payment.tenantId);
            const expanded = detailPaymentId === payment.id;
            return (
              <article className="mobile-record-card compact-record-card" key={payment.id}>
                <button className="compact-record-button" onClick={() => setDetailPaymentId(expanded ? "" : payment.id)} type="button">
                  <strong>{tenant?.name || "-"}</strong>
                  <span>{payment.rentMonth} · 欠费 {euro(payment.amountUnpaid)}</span>
                  <small>{room?.name || "-"} · {isVoided(payment.notes) ? "已作废" : payment.isOverdue ? "欠费" : "已结清"}</small>
                </button>
                <PaymentActions onEdit={() => { setForm(payment); setOpen(true); }} onVoid={() => voidPayment(payment)} saving={saving} />
                {expanded ? (
                  <PaymentDetail
                    payment={payment}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    tenantName={tenant?.name || "-"}
                    onDelete={() => permanentlyDelete(payment)}
                  />
                ) : null}
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
              <MoneyInput label="应收金额" value={form.amountDue} onChange={(amountDue) => updateMoney({ amountDue })} />
              <MoneyInput label="已收金额" value={form.amountPaid} onChange={(amountPaid) => updateMoney({ amountPaid })} />
              <MoneyInput label="未收金额" readOnly value={form.amountUnpaid} onChange={() => undefined} />
              <SearchableSelect label="付款方式" value={form.paymentMethod} options={paymentMethods.map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
              <div className="field"><label>收款状态</label><input readOnly value={form.isOverdue ? "欠费" : "已结清"} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function PaymentDetail({
  payment,
  propertyName,
  roomName,
  tenantName,
  onDelete
}: {
  payment: BusinessRentPayment;
  propertyName: string;
  roomName: string;
  tenantName: string;
  onDelete: () => void;
}) {
  return (
    <div className="record-detail-panel">
      <div className="detail-grid">
        <DetailField label="房源" value={propertyName} />
        <DetailField label="房间" value={roomName} />
        <DetailField label="租客" value={tenantName} />
        <DetailField label="应收" value={euro(payment.amountDue)} />
        <DetailField label="已收" value={euro(payment.amountPaid)} />
        <DetailField label="欠费" value={euro(payment.amountUnpaid)} />
        <DetailField label="付款方式" value={payment.paymentMethod || "-"} />
        <DetailField label="备注" value={cleanVoidNote(payment.notes) || "-"} />
      </div>
      <div className="top-actions detail-actions">
        <button className="btn danger" type="button" onClick={onDelete}><Trash2 size={15} /> 永久删除</button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function PaymentActions({ onEdit, onVoid, saving }: { onEdit: () => void; onVoid: () => void; saving: boolean }) {
  return (
    <div className="top-actions compact-actions" onClick={(event) => event.stopPropagation()}>
      <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button>
      <button className="btn" disabled={saving} onClick={onVoid} type="button"><Ban size={15} /> 作废</button>
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
