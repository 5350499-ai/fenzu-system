import { localToday } from "@/lib/actual-move-out-date";

export function propertyShortCode(name?: string | null) {
  const value = name?.trim() || "";
  if (!value) return "";
  const match = value.match(/^([0-9]+[A-Za-z]+)\b/);
  return match?.[1] || Array.from(value).slice(0, 4).join("");
}

export function formatAppointmentTime(time?: string | null) {
  return (time || "").slice(0, 5);
}

function dateWithOffset(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function formatHomeAppointmentDateTime(date: string, time?: string | null) {
  const current = localToday();
  const shortTime = formatAppointmentTime(time);
  if (date === current) return shortTime;
  if (date === dateWithOffset(current, 1)) return `明天 ${shortTime}`;
  const [year, month, day] = date.split("-");
  return year === current.slice(0, 4) ? `${Number(month)}月${Number(day)}日 ${shortTime}` : `${date} ${shortTime}`;
}

export function formatManagementAppointmentDateTime(date: string, time?: string | null) {
  const current = localToday();
  const shortTime = formatAppointmentTime(time);
  const [year, month, day] = date.split("-");
  return year === current.slice(0, 4) ? `${Number(month)}月${Number(day)}日 ${shortTime}` : `${date} ${shortTime}`;
}

export function formatAppointmentLocation(propertyName?: string | null, roomNumber?: string | null) {
  const property = propertyShortCode(propertyName);
  const room = roomNumber?.trim() || "";
  if (property && room) return `${property}·${room}`;
  if (room) return room;
  if (property) return property;
  return "未选房间";
}
