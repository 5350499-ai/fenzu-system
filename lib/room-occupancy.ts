import type { BusinessContract, BusinessRoom, BusinessTenant } from "./business-data";

export type OccupancyRange = { start: string; end: string };

export type RoomOccupancySummary = {
  roomId: string;
  propertyId: string;
  roomName: string;
  rentedDays: number;
  availableDays: number;
  rate: number | null;
};

export type PropertyOccupancySummary = {
  propertyId: string;
  rentedDays: number;
  availableDays: number;
  rate: number | null;
  rooms: RoomOccupancySummary[];
};

export type OccupancySummary = {
  rentedDays: number;
  availableDays: number;
  rate: number | null;
  properties: PropertyOccupancySummary[];
};

const DAY_MS = 86_400_000;

export function calculateOccupancySummary(
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  range: OccupancyRange,
  today = range.end
): OccupancySummary {
  const roomSummaries = rooms
    .map((room) => calculateRoomOccupancy(room, tenants, contracts, range, today))
    .filter((room): room is RoomOccupancySummary => room !== null);
  const propertyMap = new Map<string, RoomOccupancySummary[]>();
  roomSummaries.forEach((room) => propertyMap.set(room.propertyId, [...(propertyMap.get(room.propertyId) || []), room]));
  const properties = [...propertyMap.entries()].map(([propertyId, propertyRooms]) => {
    const rentedDays = propertyRooms.reduce((sum, room) => sum + room.rentedDays, 0);
    const availableDays = propertyRooms.reduce((sum, room) => sum + room.availableDays, 0);
    return { propertyId, rentedDays, availableDays, rate: rateFor(rentedDays, availableDays), rooms: propertyRooms };
  });
  const rentedDays = roomSummaries.reduce((sum, room) => sum + room.rentedDays, 0);
  const availableDays = roomSummaries.reduce((sum, room) => sum + room.availableDays, 0);
  return { rentedDays, availableDays, rate: rateFor(rentedDays, availableDays), properties };
}

export function calculateRoomOccupancy(
  room: BusinessRoom,
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  range: OccupancyRange,
  today = range.end
): RoomOccupancySummary | null {
  const start = maxDate(range.start, room.createdAt || range.start);
  const end = minDate(range.end, today, isArchivedRoom(room) && room.updatedAt ? room.updatedAt : range.end);
  if (!start || !end || start > end) return null;

  const availableDays = inclusiveDays(start, end);
  const intervals = tenants
    .filter((tenant) => tenant.propertyId === room.propertyId && tenant.roomId === room.id)
    .flatMap((tenant) => tenantIntervals(tenant, contracts, range, start, end));
  const rentedDays = mergeIntervals(intervals).reduce((sum, interval) => sum + inclusiveDays(interval.start, interval.end), 0);
  return {
    roomId: room.id,
    propertyId: room.propertyId,
    roomName: room.name || room.roomNumber || "未命名房间",
    rentedDays: Math.min(rentedDays, availableDays),
    availableDays,
    rate: rateFor(rentedDays, availableDays)
  };
}

export function rateFor(rentedDays: number, availableDays: number) {
  return availableDays > 0 ? (rentedDays / availableDays) * 100 : null;
}

function tenantIntervals(
  tenant: BusinessTenant,
  contracts: BusinessContract[],
  range: OccupancyRange,
  availableStart: string,
  availableEnd: string
) {
  const tenantContracts = contracts.filter((contract) => contract.tenantId === tenant.id && contract.roomId === tenant.roomId);
  const source = tenantContracts.length
    ? tenantContracts.map((contract) => ({ start: contract.startDate || tenant.moveInDate || "", end: contract.endDate || tenant.actualMoveOutDate || range.end }))
    : [{ start: tenant.moveInDate || "", end: tenant.actualMoveOutDate || range.end }];
  return source
    .map((interval) => ({
      start: maxDate(range.start, availableStart, interval.start),
      end: minDate(range.end, availableEnd, interval.end)
    }))
    .filter((interval) => Boolean(interval.start && interval.end && interval.start <= interval.end));
}

function mergeIntervals(intervals: Array<{ start: string; end: string }>) {
  const sorted = [...intervals].sort((left, right) => left.start.localeCompare(right.start) || left.end.localeCompare(right.end));
  const merged: Array<{ start: string; end: string }> = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (!previous || addDays(previous.end, 1) < interval.start) merged.push({ ...interval });
    else if (interval.end > previous.end) previous.end = interval.end;
  }
  return merged;
}

function inclusiveDays(start: string, end: string) {
  return Math.max(0, Math.floor((dateValue(end) - dateValue(start)) / DAY_MS) + 1);
}

function maxDate(...values: string[]) {
  return values.filter(Boolean).sort().at(-1) || "";
}

function minDate(...values: string[]) {
  return values.filter(Boolean).sort()[0] || "";
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function isArchivedRoom(room: BusinessRoom) {
  return room.status.includes("归档") || room.status.includes("已退出");
}
