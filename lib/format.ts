import type { RoomStatus } from "./types";

export function euro(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

export const roomStatusLabel: Record<RoomStatus, string> = {
  vacant: "空置",
  rented: "已租",
  reserved: "预订中",
  moving_out: "即将退租",
  maintenance: "维修中",
  paused: "暂停出租"
};

export function roomStatusTone(status: RoomStatus) {
  if (status === "rented") return "green";
  if (status === "vacant") return "blue";
  if (status === "moving_out" || status === "reserved") return "amber";
  if (status === "maintenance" || status === "paused") return "red";
  return "";
}

export function noteSummary(note?: string) {
  const value = (note || "").trim();
  if (!value) return "-";
  return value.length > 10 ? `${value.slice(0, 10)}...` : value;
}
