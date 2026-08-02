"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { localToday } from "@/lib/actual-move-out-date";
import { formatAppointmentLocation, formatManagementAppointmentDateTime, resolveAppointmentLocation } from "@/lib/viewing-appointments";
import { BusinessProperty, BusinessRoom, BusinessViewingAppointment, getInitialProperties, getInitialRooms, loadBusinessData, propertyKey, roomKey, saveBusinessData, viewingAppointmentKey } from "@/lib/business-data";
import { CalendarCheck, Edit3, LogIn, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statuses = ["待看房", "已看房", "已改期", "已成交", "已取消"];
const customStatus = "其他…";
const statusOrder = ["待看房", "已看房", "已改期", "已成交", "已取消"];
const today = () => localToday();
const emptyAppointment: BusinessViewingAppointment = {
  id: "",
  appointmentDate: today(),
  appointmentTime: "10:00",
  status: "待看房",
  notes: ""
};

function contactLabel(item: BusinessViewingAppointment) {
  return item.contactName || item.contactWhatsapp || item.contactPhone || "未填写联系人";
}

function statusTone(status: string) {
  if (status === "待看房") return "pending";
  if (status === "已看房") return "viewed";
  if (status === "已改期" || status === "改期") return "rescheduled";
  if (status === "已成交" || status === "已转租客") return "converted";
  if (status === "已取消") return "cancelled";
  return "custom";
}

export default function ViewingAppointmentsPage() {
  const access = useAccountAccess();
  const [appointments, setAppointments] = useState<BusinessViewingAppointment[]>([]);
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [form, setForm] = useState<BusinessViewingAppointment>(emptyAppointment);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMode, setStatusMode] = useState("待看房");
  const [customStatusValue, setCustomStatusValue] = useState("");

  useEffect(() => {
    if (!access.authenticated) return;
    Promise.all([
      loadBusinessData<BusinessViewingAppointment>(viewingAppointmentKey, []),
      loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties()),
      loadBusinessData<BusinessRoom>(roomKey, getInitialRooms())
    ]).then(([items, loadedProperties, loadedRooms]) => {
      setAppointments(items);
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setLoaded(true);
    }).catch((error) => window.alert(error instanceof Error ? error.message : "加载看房预约失败。"));
  }, [access.authenticated]);

  useEffect(() => {
    if (loaded && new URLSearchParams(window.location.search).get("new") === "1") openForm();
  }, [loaded]);

  const grouped = useMemo(() => {
    const keyFor = (item: BusinessViewingAppointment) => item.status === "已转租客" ? "已成交" : item.status === "改期" ? "已改期" : item.status;
    return [...appointments].sort((a, b) => {
      const groupA = statusOrder.indexOf(keyFor(a));
      const groupB = statusOrder.indexOf(keyFor(b));
      const rankA = groupA === -1 ? statusOrder.length : groupA;
      const rankB = groupB === -1 ? statusOrder.length : groupB;
      if (rankA !== rankB) return rankA - rankB;
      const locationA = resolveAppointmentLocation(a, properties, rooms);
      const locationB = resolveAppointmentLocation(b, properties, rooms);
      const propertyA = locationA.code || "未选房源";
      const propertyB = locationB.code || "未选房源";
      if (propertyA !== propertyB) {
        if (!locationA.code) return 1;
        if (!locationB.code) return -1;
        const propertyOrder = propertyA.localeCompare(propertyB, undefined, { numeric: true, sensitivity: "base" });
        if (propertyOrder !== 0) return propertyOrder;
      }
      return `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`);
    });
  }, [appointments, properties, rooms]);
  const groupedSections = useMemo(() => {
    const keyFor = (item: BusinessViewingAppointment) => item.status === "已转租客" ? "已成交" : item.status === "改期" ? "已改期" : item.status;
    return [...statusOrder, customStatus].map((status) => ({
      status,
      items: grouped.filter((item) => status === customStatus ? !statusOrder.includes(keyFor(item)) : keyFor(item) === status)
    })).filter((section) => section.items.length > 0);
  }, [grouped]);
  const roomOptions = rooms.filter((room) => !form.propertyId || room.propertyId === form.propertyId);

  function openForm(item?: BusinessViewingAppointment) {
    const next = item ? { ...item } : { ...emptyAppointment, appointmentDate: today() };
    const knownStatus = statuses.includes(next.status);
    setForm(next);
    setStatusMode(knownStatus ? next.status : customStatus);
    setCustomStatusValue(knownStatus ? "" : next.status);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setForm(emptyAppointment);
    setStatusMode("待看房");
    setCustomStatusValue("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.appointmentDate || !form.appointmentTime) return;
    if (!form.contactName?.trim() && !form.contactWhatsapp?.trim() && !form.contactPhone?.trim()) {
      window.alert("请至少填写姓名、WhatsApp或电话之一。");
      return;
    }
    const finalStatus = statusMode === customStatus ? customStatusValue.trim() : statusMode;
    if (!finalStatus) {
      window.alert("请输入自定义状态。");
      return;
    }
    setSaving(true);
    const nextItem = { ...form, id: form.id || crypto.randomUUID(), status: finalStatus };
    const next = form.id ? appointments.map((item) => item.id === form.id ? nextItem : item) : [nextItem, ...appointments];
    try {
      await saveBusinessData(viewingAppointmentKey, next);
      setAppointments(next);
      close();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "保存看房预约失败。");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: BusinessViewingAppointment) {
    if (!window.confirm("确认删除这条看房预约吗？")) return;
    setSaving(true);
    try {
      const next = appointments.filter((current) => current.id !== item.id);
      await saveBusinessData(viewingAppointmentKey, next);
      setAppointments(next);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "删除看房预约失败。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout title="看房预约" description="记录和管理潜在租客的看房时间。">
      <section className="card panel">
        <div className="toolbar">
          <div><h2 className="panel-title">看房预约</h2><p className="muted">按预约时间升序排列，V1不自动发送提醒。</p></div>
          <button className="btn primary" type="button" onClick={() => openForm()}><Plus size={17} /> 新增预约</button>
        </div>
        {!loaded ? <p className="muted">正在加载预约...</p> : grouped.length ? <div className="appointment-sections">{groupedSections.map((section) => <section className="appointment-section" key={section.status}><h3>{section.status}</h3><div className="appointment-list">{section.items.map((item) => {
          const room = rooms.find((current) => current.id === item.roomId);
          const property = properties.find((current) => current.id === item.propertyId);
          const location = resolveAppointmentLocation(item, properties, rooms);
          if (location) return <article className="appointment-row" key={item.id}>
            <div className="appointment-main-line"><strong>{formatManagementAppointmentDateTime(item.appointmentDate, item.appointmentTime)}</strong><span>{contactLabel(item)}</span><small className={`appointment-status status-${statusTone(item.status)}`}><i className={`appointment-status-dot ${statusTone(item.status)}`} aria-hidden="true" />{item.status}</small></div>
            <div className="appointment-meta-line"><span className={`property-code property-tone-${location.tone}`}>{location.code || "未选房源"}</span><span> · {location.roomLabel}</span>{item.notes ? <small className="appointment-note">{item.notes}</small> : null}</div>
            <div className="appointment-actions"><button className="icon-button" type="button" aria-label="编辑预约" onClick={() => openForm(item)}><Edit3 size={16} /></button>{statusTone(item.status) === "converted" ? <button className="icon-button" type="button" aria-label="一键入住" onClick={() => { const params = new URLSearchParams({ fromViewing: "1", propertyId: item.propertyId || "", roomId: item.roomId || "", tenantName: item.contactName || "", phone: item.contactPhone || item.contactWhatsapp || "", notes: item.notes || "" }); window.location.href = `/check-in?${params.toString()}`; }}><LogIn size={16} /></button> : null}<button className="icon-button danger" type="button" aria-label="删除预约" onClick={() => void remove(item)} disabled={saving}><Trash2 size={16} /></button></div>
          </article>;
          return <article className="appointment-row" key={item.id}>
            <div className="appointment-main-line"><strong>{formatManagementAppointmentDateTime(item.appointmentDate, item.appointmentTime)}</strong><span>{formatAppointmentLocation(property?.name, room?.roomNumber || room?.name)}</span><span>{contactLabel(item)}</span></div>
            <div className="appointment-meta-line"><small className={`appointment-status status-${statusTone(item.status)}`}>{item.status}</small>{item.notes ? <small className="appointment-note">{item.notes}</small> : null}</div>
            <div className="appointment-actions"><button className="icon-button" type="button" aria-label="编辑预约" onClick={() => openForm(item)}><Edit3 size={16} /></button>{statusTone(item.status) === "converted" ? <button className="icon-button" type="button" aria-label="一键入住" onClick={() => { const params = new URLSearchParams({ fromViewing: "1", propertyId: item.propertyId || "", roomId: item.roomId || "", tenantName: item.contactName || "", phone: item.contactPhone || item.contactWhatsapp || "", notes: item.notes || "" }); window.location.href = `/check-in?${params.toString()}`; }}><LogIn size={16} /></button> : null}<button className="icon-button danger" type="button" aria-label="删除预约" onClick={() => void remove(item)} disabled={saving}><Trash2 size={16} /></button></div>
          </article>;
        })}</div></section>)}</div> : <p className="muted">暂无看房预约</p>}
      </section>

      {open ? <div className="modal-backdrop" onMouseDown={close}><section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑预约" : "新增预约"}</h2><button className="btn" type="button" onClick={close}><X size={17} /> 关闭</button></div>
        <form className="form-grid" onSubmit={submit}>
          <div className="field"><label>预约日期</label><input required type="date" value={form.appointmentDate} onChange={(event) => setForm((current) => ({ ...current, appointmentDate: event.target.value }))} /></div>
          <div className="field"><label>预约时间</label><input required type="time" value={form.appointmentTime} onChange={(event) => setForm((current) => ({ ...current, appointmentTime: event.target.value }))} /></div>
          <div className="field"><label>姓名</label><input value={form.contactName || ""} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /></div>
          <div className="field"><label>WhatsApp</label><input value={form.contactWhatsapp || ""} onChange={(event) => setForm((current) => ({ ...current, contactWhatsapp: event.target.value }))} /></div>
          <div className="field"><label>电话</label><input value={form.contactPhone || ""} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} /></div>
          <div className="field"><label>状态</label><select value={statusMode} onChange={(event) => { const value = event.target.value; setStatusMode(value); if (value !== customStatus) setForm((current) => ({ ...current, status: value })); }}><option value="待看房">待看房</option><option value="已看房">已看房</option><option value="已改期">已改期</option><option value="已成交">已成交</option><option value="已取消">已取消</option><option value={customStatus}>{customStatus}</option></select>{statusMode === customStatus ? <input className="custom-status-input" value={customStatusValue} placeholder="输入自定义状态" onChange={(event) => setCustomStatusValue(event.target.value)} /> : null}</div>
          <div className="field"><label>房源</label><select value={form.propertyId || ""} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value, roomId: "" }))}><option value="">未选择</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
          <div className="field"><label>房间</label><select value={form.roomId || ""} onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))}><option value="">未选择</option>{roomOptions.map((room) => <option key={room.id} value={room.id}>{room.roomNumber || room.name}</option>)}</select></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <div className="modal-actions"><button className="btn" type="button" onClick={close}>取消</button>{statusMode === "已成交" ? <button className="btn" type="button" onClick={() => { const params = new URLSearchParams({ fromViewing: "1", propertyId: form.propertyId || "", roomId: form.roomId || "", tenantName: form.contactName || "", phone: form.contactPhone || form.contactWhatsapp || "", notes: form.notes || "" }); window.location.href = `/check-in?${params.toString()}`; }}>一键入住</button> : null}<button className="btn primary" type="submit" disabled={saving}>{saving ? "保存中..." : "保存预约"}</button></div>
        </form>
      </section></div> : null}
    </AppLayout>
  );
}
