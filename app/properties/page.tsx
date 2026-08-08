"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessProperty,
  BusinessRoom,
  BusinessTenant,
  getInitialProperties,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  propertyKey,
  saveBusinessData
} from "@/lib/business-data";
import { Plus, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccountAccess } from "@/components/account-access";
import { sumOccupants } from "@/lib/tenant-occupancy";
import { isCurrentRentalRelationship } from "@/lib/rent-coverage";

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
  const access = useAccountAccess();
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
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
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
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
  const activePropertyCount = useMemo(() => properties.filter((property) => !isArchived(property.notes)).length, [properties]);
  const freePropertyLimitReached = access.isFreeSingle && activePropertyCount >= 5;

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

  return (
    <AppLayout title="房源管理" description="查看房源概况，并进入单个房源集中管理。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">房源列表</h2>
            <p className="muted">点击房源名称进入集中管理。</p>
          </div>
          {access.can("properties", "create") ? <button className="btn primary" disabled={!loaded || saving || freePropertyLimitReached} onClick={() => { setForm(emptyProperty); setOpen(true); }} type="button">
            <Plus size={17} /> 新增房源
          </button> : null}
        </div>
        {freePropertyLimitReached ? <p className="muted">免费版最多可管理 5 套房源；归档房源不占用额度。</p> : null}
        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索房源名称、地址" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="property-card-list">
          {visible.map((property) => (
            <article className="property-list-card" key={property.id}>
              <div className="property-list-card-heading">
                <strong>{property.name || "-"}</strong>
                <StatusBadge tone={isArchived(property.notes) ? "amber" : "green"}>{isArchived(property.notes) ? "已归档" : "正常"}</StatusBadge>
              </div>
              <div className="property-list-meta">
                <span>{shortPropertyAddress(property)}</span>
                <span>{rooms.filter((room) => room.propertyId === property.id).length} 间房间</span>
                <span>{sumOccupants(tenants.filter((tenant) => tenant.propertyId === property.id && isCurrentRentalRelationship(tenant)))} 人在租</span>
              </div>
              <Link className="btn property-manage-link" href={`/properties/${property.id}`}>进入管理</Link>
            </article>
          ))}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">新增房源</h2>
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

function shortPropertyAddress(property: BusinessProperty) {
  return property.address || property.city || "-";
}
