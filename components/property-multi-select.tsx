"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalPortal } from "@/components/modal-portal";
import { allPaymentPropertyScopeIds, allPropertyIds, isAllPropertyScope, UNLINKED_PROPERTY_SCOPE, togglePropertyScope } from "@/lib/property-scope";

export type PropertyChoice = { id: string; name: string; createdAt?: string };

export function PropertyMultiSelect({
  properties,
  selectedIds,
  onChange,
  label = "房源范围",
  includeUnlinked = false
}: {
  properties: PropertyChoice[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  includeUnlinked?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>(selectedIds);

  const orderedProperties = useMemo(() => properties
    .map((property, index) => ({ property, index }))
    .sort((a, b) => {
      const aTime = a.property.createdAt ? Date.parse(a.property.createdAt) : Number.NaN;
      const bTime = b.property.createdAt ? Date.parse(b.property.createdAt) : Number.NaN;
      if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) return aTime - bTime;
      if (Number.isFinite(aTime) !== Number.isFinite(bTime)) return Number.isFinite(aTime) ? -1 : 1;
      return a.index - b.index;
    })
    .map(({ property }) => property), [properties]);

  useEffect(() => {
    if (!open) setPendingIds(selectedIds);
  }, [open, selectedIds]);

  const allIds = includeUnlinked ? allPaymentPropertyScopeIds(orderedProperties) : allPropertyIds(orderedProperties);
  const allSelected = isAllPropertyScope(pendingIds, orderedProperties, includeUnlinked);
  const selectedUnlinked = includeUnlinked && selectedIds.includes(UNLINKED_PROPERTY_SCOPE);
  const summary = allSelected
    ? "全部房源"
    : selectedIds.length === 0
      ? "未选择房源"
      : selectedUnlinked && selectedIds.length === 1
        ? "未关联房源"
      : selectedIds.length === 1
        ? orderedProperties.find((property) => property.id === selectedIds[0])?.name || "已选 1 套房源"
        : `已选 ${selectedIds.length} 套房源`;

  function toggle(id: string) {
    setPendingIds((current) => togglePropertyScope(current, id));
  }

  return <div className="field property-multi-select">
    <label>{label}</label>
    <button className="btn property-multi-select-trigger" type="button" onClick={() => setOpen(true)}>{summary}</button>
    {open ? <ModalPortal><div className="modal-backdrop property-multi-select-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="card modal-card property-multi-select-modal" role="dialog" aria-modal="true" aria-label="选择房源范围" onPointerDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2 className="panel-title">选择房源范围</h2><button className="btn compact" type="button" onClick={() => setOpen(false)}>取消</button></div>
        <div className="property-multi-select-all">
          <label className="partner-participant"><input type="checkbox" checked={allSelected} onChange={() => setPendingIds(allSelected ? [] : allIds)} /><span>全部房源</span></label>
        </div>
        <div className="property-multi-select-options">
          {orderedProperties.map((property) => <label className="partner-participant" key={property.id}><input type="checkbox" checked={pendingIds.includes(property.id)} onChange={() => toggle(property.id)} /><span>{property.name}</span></label>)}
          {includeUnlinked ? <label className="partner-participant" key={UNLINKED_PROPERTY_SCOPE}><input type="checkbox" checked={pendingIds.includes(UNLINKED_PROPERTY_SCOPE)} onChange={() => toggle(UNLINKED_PROPERTY_SCOPE)} /><span>未关联房源</span></label> : null}
        </div>
        <div className="modal-actions"><button className="btn" type="button" onClick={() => setPendingIds([])}>全部取消</button><button className="btn primary" type="button" onClick={() => { if (!pendingIds.length) { window.alert("请至少选择一个房源"); return; } onChange([...new Set(pendingIds)]); setOpen(false); }}>确认</button></div>
      </section>
    </div></ModalPortal> : null}
  </div>;
}
