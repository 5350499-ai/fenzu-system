"use client";

import { useEffect, useState } from "react";

type PropertyChoice = { id: string; name: string };

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

  useEffect(() => {
    if (!open) setPendingIds(selectedIds);
  }, [open, selectedIds]);

  const allIds = properties.map((property) => property.id);
  const allSelected = allIds.length > 0 && pendingIds.length === allIds.length && allIds.every((id) => pendingIds.includes(id));
  const summary = selectedIds.length === allIds.length && allIds.length > 0
    ? "全部房源"
    : selectedIds.length === 0
      ? "未选择房源"
      : selectedIds.length === 1
        ? properties.find((property) => property.id === selectedIds[0])?.name || "已选 1 套房源"
        : `已选 ${selectedIds.length} 套房源`;

  function toggle(id: string) {
    setPendingIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return <div className="field property-multi-select">
    <label>{label}</label>
    <button className="btn property-multi-select-trigger" type="button" onClick={() => setOpen(true)}>{summary}</button>
    {open ? <div className="modal-backdrop property-multi-select-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="card modal-card property-multi-select-modal" role="dialog" aria-modal="true" aria-label="选择房源范围" onPointerDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2 className="panel-title">选择房源范围</h2><button className="btn compact" type="button" onClick={() => setOpen(false)}>取消</button></div>
        <div className="partner-participant-grid">
          <label className="partner-participant"><input type="checkbox" checked={allSelected} onChange={() => setPendingIds(allSelected ? [] : allIds)} /><span>全部房源</span></label>
          {properties.map((property) => <label className="partner-participant" key={property.id}><input type="checkbox" checked={pendingIds.includes(property.id)} onChange={() => toggle(property.id)} /><span>{property.name}</span></label>)}
        </div>
        <div className="modal-actions"><button className="btn" type="button" onClick={() => setPendingIds([])}>全部取消</button><button className="btn primary" type="button" onClick={() => { if (!pendingIds.length) { window.alert("请至少选择一个房源"); return; } onChange([...new Set(pendingIds)]); setOpen(false); }}>确认</button></div>
      </section>
    </div> : null}
  </div>;
}
