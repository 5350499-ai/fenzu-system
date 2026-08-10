"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type PropertyChoice = { id: string; name: string; createdAt?: string };

export function PropertyMultiSelect({
  properties,
  selectedIds,
  onChange,
  label = "房源范围"
}: {
  properties: PropertyChoice[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
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

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow
    };

    // Render outside scroll/transform ancestors and preserve the page position
    // while the viewport dialog owns touch scrolling.
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  const allIds = orderedProperties.map((property) => property.id);
  const allSelected = allIds.length > 0 && pendingIds.length === allIds.length && allIds.every((id) => pendingIds.includes(id));
  const summary = selectedIds.length === allIds.length && allIds.length > 0
    ? "全部房源"
    : selectedIds.length === 0
      ? "未选择房源"
      : selectedIds.length === 1
        ? orderedProperties.find((property) => property.id === selectedIds[0])?.name || "已选 1 套房源"
        : `已选 ${selectedIds.length} 套房源`;

  function toggle(id: string) {
    setPendingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <div className="field property-multi-select">
    <label>{label}</label>
    <button className="btn property-multi-select-trigger" type="button" onClick={() => setOpen(true)}>{summary}</button>
    {open ? createPortal(<div className="modal-backdrop property-multi-select-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="card modal-card property-multi-select-modal" role="dialog" aria-modal="true" aria-label="选择房源范围" onPointerDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2 className="panel-title">选择房源范围</h2><button className="btn compact" type="button" onClick={() => setOpen(false)}>取消</button></div>
        <div className="property-multi-select-all">
          <label className="partner-participant"><input type="checkbox" checked={allSelected} onChange={() => setPendingIds(allSelected ? [] : allIds)} /><span>全部房源</span></label>
        </div>
        <div className="property-multi-select-options">
          {orderedProperties.map((property) => <label className="partner-participant" key={property.id}><input type="checkbox" checked={pendingIds.includes(property.id)} onChange={() => toggle(property.id)} /><span>{property.name}</span></label>)}
        </div>
        <div className="modal-actions"><button className="btn" type="button" onClick={() => setPendingIds([])}>全部取消</button><button className="btn primary" type="button" onClick={() => { if (!pendingIds.length) { window.alert("请至少选择一个房源"); return; } onChange([...new Set(pendingIds)]); setOpen(false); }}>确认</button></div>
      </section>
    </div>, document.body) : null}
  </div>;
}
