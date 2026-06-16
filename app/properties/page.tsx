"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  expenseKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialExpenses,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  rentPaymentKey,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Archive, Edit3, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const emptyProperty: BusinessProperty = {
  id: "",
  name: "",
  address: "",
  city: "",
  landlordName: "",
  subletAllowed: true,
  notes: ""
};

export default function PropertiesPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [form, setForm] = useState<BusinessProperty>(emptyProperty);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>("business-rooms", getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>("business-tenants", getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses());
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setExpenses(loadedExpenses);
      setDeposits(loadedDeposits);
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载房源失败：${error.message || error}`));
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return properties;
    return properties.filter((property) =>
      `${property.name} ${property.address} ${property.city} ${property.landlordName} ${property.notes || ""}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [properties, query]);
  const visible = pageRows(filtered, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyProperty);
  }

  async function persist(next: BusinessProperty[]) {
    setSaving(true);
    try {
      await saveBusinessData(propertyKey, next);
      setProperties(next);
    } catch (error: any) {
      window.alert(error.message || "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.name.trim()) return;
    const next = form.id
      ? properties.map((property) => (property.id === form.id ? form : property))
      : [{ ...form, id: crypto.randomUUID() }, ...properties];
    await persist(next);
    close();
  }

  async function archiveProperty(property: BusinessProperty) {
    if (!window.confirm("确认归档该房源吗？归档后历史业务数据仍会保留。")) return;
    await persist(properties.map((item) => (item.id === property.id ? { ...item, notes: markArchived(item.notes) } : item)));
  }

  async function permanentlyDelete(property: BusinessProperty) {
    const related = propertyRelationCount(property.id);
    if (related > 0) {
      window.alert("该房源已有业务数据，不能直接删除。你可以选择归档该房源。");
      return;
    }
    if (!window.confirm("确定要永久删除这个空房源吗？\n删除后不可恢复。")) return;
    await persist(properties.filter((item) => item.id !== property.id));
  }

  function propertyRelationCount(propertyId: string) {
    return (
      rooms.filter((item) => item.propertyId === propertyId).length +
      tenants.filter((item) => item.propertyId === propertyId).length +
      contracts.filter((item) => item.propertyId === propertyId).length +
      payments.filter((item) => item.propertyId === propertyId).length +
      deposits.filter((item) => item.propertyId === propertyId).length +
      expenses.filter((item) => item.propertyId === propertyId).length
    );
  }

  return (
    <AppLayout title="房源管理" description="管理每一套分租房源。已有业务数据的房源不能直接删除，只能归档。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">房源列表</h2>
            <p className="muted">点击房源名称进入集中管理。</p>
          </div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button">
            <Plus size={17} /> 新增房源
          </button>
        </div>
        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索房源名称、地址、城市、房东" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>房源名称</th>
                <th>地址</th>
                <th>城市</th>
                <th>房东</th>
                <th>分租</th>
                <th>状态</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((property) => (
                <tr key={property.id}>
                  <td><Link className="table-link" href={`/properties/${property.id}`}>{property.name || "-"}</Link></td>
                  <td>{property.address || "-"}</td>
                  <td>{property.city || "-"}</td>
                  <td>{property.landlordName || "-"}</td>
                  <td><StatusBadge tone={property.subletAllowed ? "green" : "red"}>{property.subletAllowed ? "允许" : "不允许"}</StatusBadge></td>
                  <td><StatusBadge tone={isArchived(property.notes) ? "amber" : "green"}>{isArchived(property.notes) ? "已归档" : "正常"}</StatusBadge></td>
                  <td title={property.notes || ""}>{noteSummary(cleanArchiveNote(property.notes))}</td>
                  <td><ActionButtons onArchive={() => archiveProperty(property)} onDelete={() => permanentlyDelete(property)} onEdit={() => { setForm(property); setOpen(true); }} saving={saving} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visible.map((property) => (
            <article className="mobile-record-card" key={property.id}>
              <div className="mobile-record-title">
                <strong>{property.name}</strong>
                <StatusBadge tone={isArchived(property.notes) ? "amber" : "green"}>{isArchived(property.notes) ? "已归档" : "正常"}</StatusBadge>
              </div>
              <div className="mobile-record-fields">
                <div className="mobile-record-field"><span>地址</span><strong>{property.address || "-"}</strong></div>
                <div className="mobile-record-field"><span>城市</span><strong>{property.city || "-"}</strong></div>
                <div className="mobile-record-field"><span>房东</span><strong>{property.landlordName || "-"}</strong></div>
                <div className="mobile-record-field"><span>备注</span><strong>{noteSummary(cleanArchiveNote(property.notes))}</strong></div>
              </div>
              <ActionButtons onArchive={() => archiveProperty(property)} onDelete={() => permanentlyDelete(property)} onEdit={() => { setForm(property); setOpen(true); }} saving={saving} />
              <Link className="btn" href={`/properties/${property.id}`}>进入管理</Link>
            </article>
          ))}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">{form.id ? "编辑房源" : "新增房源"}</h2>
              <button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <TextField label="房源名称" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="地址" value={form.address} onChange={(address) => setForm((current) => ({ ...current, address }))} />
              <TextField label="城市" value={form.city} onChange={(city) => setForm((current) => ({ ...current, city }))} />
              <TextField label="房东姓名" value={form.landlordName || ""} onChange={(landlordName) => setForm((current) => ({ ...current, landlordName }))} />
              <div className="field">
                <label>是否允许分租</label>
                <select value={form.subletAllowed ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, subletAllowed: event.target.value === "yes" }))}>
                  <option value="yes">允许</option>
                  <option value="no">不允许</option>
                </select>
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>备注</label>
                <textarea value={cleanArchiveNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={close} type="button">取消</button>
                <button className="btn primary" disabled={saving} type="submit">保存</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function ActionButtons({ onEdit, onArchive, onDelete, saving }: { onEdit: () => void; onArchive: () => void; onDelete: () => void; saving: boolean }) {
  return (
    <div className="top-actions">
      <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button>
      <button className="btn" disabled={saving} onClick={onArchive} type="button"><Archive size={15} /> 归档</button>
      <button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button>
    </div>
  );
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function markArchived(notes?: string) {
  const clean = cleanArchiveNote(notes);
  return clean ? `[已归档] ${clean}` : "[已归档]";
}

function isArchived(notes?: string) {
  return Boolean(notes?.includes("[已归档]"));
}

function cleanArchiveNote(notes?: string) {
  return (notes || "").replace("[已归档]", "").trim();
}
