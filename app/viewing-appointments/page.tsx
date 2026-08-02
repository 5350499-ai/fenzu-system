"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { localToday } from "@/lib/actual-move-out-date";
import { BusinessProperty, BusinessRoom, BusinessViewingAppointment, getInitialProperties, getInitialRooms, loadBusinessData, propertyKey, roomKey, saveBusinessData, viewingAppointmentKey } from "@/lib/business-data";
import { CalendarCheck, Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const statuses = ["待看房", "改期", "已取消", "已转租客"];
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

export default function ViewingAppointmentsPage() {
  const access = useAccountAccess();
  const [appointments, setAppointments] = useState<BusinessViewingAppointment[]>([]);
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [form, setForm] = useState<BusinessViewingAppointment>(emptyAppointment);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const sorted = useMemo(() => [...appointments].sort((a, b) => `${a.appointmentDate}T${a.appointmentTime}`.localeCompare(`${b.appointmentDate}T${b.appointmentTime}`)), [appointments]);
  const roomOptions = rooms.filter((room) => !form.propertyId || room.propertyId === form.propertyId);

  function openForm(item?: BusinessViewingAppointment) {
    setForm(item ? { ...item } : { ...emptyAppointment, appointmentDate: today() });
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setForm(emptyAppointment);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.appointmentDate || !form.appointmentTime) return;
    if (!form.contactName?.trim() && !form.contactWhatsapp?.trim() && !form.contactPhone?.trim()) {
      window.alert("请至少填写姓名、WhatsApp或电话之一。");
      return;
    }
    setSaving(true);
    const nextItem = { ...form, id: form.id || crypto.randomUUID() };
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
        {!loaded ? <p className="muted">正在加载预约...</p> : sorted.length ? <div className="appointment-list">{sorted.map((item) => {
          const room = rooms.find((current) => current.id === item.roomId);
          const property = properties.find((current) => current.id === item.propertyId);
          return <article className="appointment-row" key={item.id}>
            <div><strong>{item.appointmentDate} {item.appointmentTime}</strong><small>{property?.name || "未选房源"}{room ? ` · ${room.roomNumber || room.name}` : ""}</small></div>
            <div><span>{contactLabel(item)}</span><small>{item.status}</small></div>
            <div className="appointment-actions"><button className="icon-button" type="button" aria-label="编辑预约" onClick={() => openForm(item)}><Edit3 size={16} /></button><button className="icon-button danger" type="button" aria-label="删除预约" onClick={() => void remove(item)} disabled={saving}><Trash2 size={16} /></button></div>
          </article>;
        })}</div> : <p className="muted">暂无看房预约</p>}
      </section>

      {open ? <div className="modal-backdrop" onMouseDown={close}><section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑预约" : "新增预约"}</h2><button className="btn" type="button" onClick={close}><X size={17} /> 关闭</button></div>
        <form className="form-grid" onSubmit={submit}>
          <div className="field"><label>预约日期</label><input required type="date" value={form.appointmentDate} onChange={(event) => setForm((current) => ({ ...current, appointmentDate: event.target.value }))} /></div>
          <div className="field"><label>预约时间</label><input required type="time" value={form.appointmentTime} onChange={(event) => setForm((current) => ({ ...current, appointmentTime: event.target.value }))} /></div>
          <div className="field"><label>姓名</label><input value={form.contactName || ""} onChange={(event) => setForm((current) => ({ ...current, contactName: event.target.value }))} /></div>
          <div className="field"><label>WhatsApp</label><input value={form.contactWhatsapp || ""} onChange={(event) => setForm((current) => ({ ...current, contactWhatsapp: event.target.value }))} /></div>
          <div className="field"><label>电话</label><input value={form.contactPhone || ""} onChange={(event) => setForm((current) => ({ ...current, contactPhone: event.target.value }))} /></div>
          <div className="field"><label>状态</label><input list="appointment-statuses" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))} /><datalist id="appointment-statuses">{statuses.map((status) => <option key={status} value={status} />)}</datalist></div>
          <div className="field"><label>房源</label><select value={form.propertyId || ""} onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value, roomId: "" }))}><option value="">未选择</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
          <div className="field"><label>房间</label><select value={form.roomId || ""} onChange={(event) => setForm((current) => ({ ...current, roomId: event.target.value }))}><option value="">未选择</option>{roomOptions.map((room) => <option key={room.id} value={room.id}>{room.roomNumber || room.name}</option>)}</select></div>
          <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
          <div className="modal-actions"><button className="btn" type="button" onClick={close}>取消</button><button className="btn primary" type="submit" disabled={saving}>{saving ? "保存中..." : "保存预约"}</button></div>
        </form>
      </section></div> : null}
    </AppLayout>
  );
}
