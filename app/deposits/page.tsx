"use client";

import { MoneyInput } from "@/components/money-input";
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
import { euro, noteSummary } from "@/lib/format";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import { Ban, Edit3, Plus, Trash2, X } from "lucide-react";
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
  receivedBy: "A",
  paidBy: "A",
  notes: ""
};

const depositTypes = ["收取", "退还", "扣除"];
const depositStatuses = ["已收", "待退", "已退", "部分扣除", "已作废"];
const partnerOptions = ["A", "B"];

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
  const [saving, setSaving] = useState(false);

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
    load().catch((error) => window.alert(`加载押金记录失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filteredDeposits = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return deposits;
    return deposits.filter((deposit) => {
      const property = properties.find((item) => item.id === deposit.propertyId);
      const room = rooms.find((item) => item.id === deposit.roomId);
      const tenant = tenants.find((item) => item.id === deposit.tenantId);
      return `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${tenant?.phone || ""} ${tenant?.wechat || ""} ${deposit.status} ${deposit.type} ${deposit.receivedBy || ""} ${deposit.paidBy || ""}`.toLowerCase().includes(keyword);
    });
  }, [deposits, properties, query, rooms, tenants]);
  const visibleDeposits = pageRows(filteredDeposits, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyDeposit);
  }

  async function persist(next: BusinessDeposit[]) {
    setSaving(true);
    try {
      await saveBusinessData(depositKey, next);
      setDeposits(next);
    } catch (error: any) {
      window.alert(error.message || "保存押金记录失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    setForm((current) => ({ ...current, tenantId, amount: tenant?.depositAmount || current.amount }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.tenantId) return;
    const nextForm = normalizeDepositPartner(form);
    const next = form.id
      ? deposits.map((deposit) => (deposit.id === form.id ? nextForm : deposit))
      : [{ ...nextForm, id: crypto.randomUUID() }, ...deposits];
    await persist(next);
    close();
  }

  async function voidDeposit(deposit: BusinessDeposit) {
    if (!window.confirm("确认作废这条押金记录吗？作废后历史记录仍保留。")) return;
    await persist(deposits.map((item) => (item.id === deposit.id ? { ...item, status: "已作废", notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(deposit: BusinessDeposit) {
    if (!window.confirm("确定要永久删除这条押金记录吗？\n真实发生过的押金记录建议使用“作废”，删除后不可恢复。")) return;
    await persist(deposits.filter((item) => item.id !== deposit.id));
  }

  return (
    <AppLayout title="押金管理" description="记录押金收取、退还、扣除和状态。真实押金记录建议作废，不建议删除。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">押金列表</h2><p className="muted">押金记录必须关联房源、房间、租客。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增押金记录</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索房源、房间、租客、状态、类型" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>房间</th><th>租客</th><th>归属</th><th>金额</th><th>状态</th><th>类型</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleDeposits.map((deposit) => {
              const room = rooms.find((item) => item.id === deposit.roomId);
              const tenant = tenants.find((item) => item.id === deposit.tenantId);
              return (
                <tr key={deposit.id}>
                  <td>{deposit.transactionDate || "-"}</td>
                  <td>{room?.name || "-"}</td>
                  <td>{tenant?.name || "-"}</td>
                  <td><PartnerTag deposit={deposit} /></td>
                  <td>{euro(deposit.amount)}</td>
                  <td><StatusBadge tone={depositTone(deposit.status)}>{deposit.status}</StatusBadge></td>
                  <td>{depositTypeLabel(deposit.type)}</td>
                  <td title={deposit.notes || ""}>{noteSummary(cleanVoidNote(deposit.notes))}</td>
                  <td><DepositActions onDelete={() => permanentlyDelete(deposit)} onEdit={() => { setForm(deposit); setOpen(true); }} onVoid={() => voidDeposit(deposit)} saving={saving} /></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleDeposits.map((deposit) => {
            const tenant = tenants.find((item) => item.id === deposit.tenantId);
            const room = rooms.find((item) => item.id === deposit.roomId);
            const expanded = expandedNoteId === deposit.id;
            return (
              <article className="mobile-record-card" key={deposit.id}>
                <div className="mobile-record-title"><strong>{tenant?.name || "-"}</strong><span><PartnerTag deposit={deposit} /> · <StatusBadge tone={depositTone(deposit.status)}>{deposit.status}</StatusBadge> · {euro(deposit.amount)}</span></div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>类型</span><strong>{depositTypeLabel(deposit.type)}</strong></div>
                  <div className="mobile-record-field"><span>日期</span><strong>{deposit.transactionDate || "-"}</strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? cleanVoidNote(deposit.notes) || "-" : noteSummary(cleanVoidNote(deposit.notes))} {cleanVoidNote(deposit.notes).length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : deposit.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <DepositActions onDelete={() => permanentlyDelete(deposit)} onEdit={() => { setForm(deposit); setOpen(true); }} onVoid={() => voidDeposit(deposit)} saving={saving} />
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
              <SearchableSelect label="押金类型" value={form.type} options={depositTypes.map((type) => ({ value: type, label: depositTypeLabel(type) }))} onChange={(type) => setForm((current) => ({ ...current, type }))} />
              <MoneyInput label="押金金额" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
              <SearchableSelect label="押金状态" value={form.status} options={depositStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <SearchableSelect label={form.type === "退还" ? "付款归属" : "收款归属"} value={depositPartnerValue(form)} options={partnerOptions.map((partner) => ({ value: partner, label: partner }))} onChange={(partner) => setForm((current) => setDepositPartner(current, partner))} />
              <div className="field"><label>日期</label><input type="date" value={form.transactionDate} onChange={(event) => setForm((current) => ({ ...current, transactionDate: event.target.value }))} /></div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function DepositActions({ onEdit, onVoid, onDelete, saving }: { onEdit: () => void; onVoid: () => void; onDelete: () => void; saving: boolean }) {
  return <div className="top-actions"><button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button><button className="btn" disabled={saving} onClick={onVoid} type="button"><Ban size={15} /> 作废</button><button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button></div>;
}

function PartnerTag({ deposit }: { deposit: BusinessDeposit }) {
  const partner = depositPartnerValue(deposit);
  return <span className={`partner-tag ${partnerClass(partner)}`}>{partnerLabel(partner)}</span>;
}

function depositPartnerValue(deposit: BusinessDeposit) {
  return normalizePartner(deposit.type === "退还" ? deposit.paidBy : deposit.receivedBy);
}

function setDepositPartner(deposit: BusinessDeposit, partner: string) {
  const normalized = normalizePartner(partner);
  return deposit.type === "退还"
    ? { ...deposit, paidBy: normalized }
    : { ...deposit, receivedBy: normalized };
}

function normalizeDepositPartner(deposit: BusinessDeposit) {
  const partner = depositPartnerValue(deposit);
  return deposit.type === "退还"
    ? { ...deposit, paidBy: partner, receivedBy: normalizePartner(deposit.receivedBy) }
    : { ...deposit, receivedBy: partner, paidBy: normalizePartner(deposit.paidBy) };
}

function normalizePartner(value?: string) {
  const partner = (value || "A").trim();
  const fixedCode = partner.toUpperCase();
  return fixedCode === "A" || fixedCode === "B" ? fixedCode : partner || "A";
}

function depositTone(status: string) {
  if (status === "已收" || status === "已退") return "green";
  if (status === "待退") return "amber";
  return "red";
}

function depositTypeLabel(type: string) {
  if (type === "收取") return "押金收入";
  if (type === "退还") return "押金退还";
  if (type === "扣除") return "押金扣除";
  return type;
}

function markVoided(notes?: string) {
  const clean = cleanVoidNote(notes);
  return clean ? `[已作废] ${clean}` : "[已作废]";
}

function cleanVoidNote(notes?: string) {
  return (notes || "").replace("[已作废]", "").trim();
}
