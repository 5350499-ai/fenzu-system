import type { BusinessContract, BusinessProperty, BusinessRoom, BusinessRentPayment, BusinessTenant } from "./business-data";

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
  properties: BusinessProperty[],
  rooms: BusinessRoom[],
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  payments: BusinessRentPayment[] = [],
  range: OccupancyRange,
  today = range.end,
  capAtToday = false
): OccupancySummary {
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  const roomSummaries = rooms
    .filter((room) => propertyById.has(room.propertyId))
    .map((room) => {
      const property = propertyById.get(room.propertyId)!;
      const start = resolvePropertyOccupancyStart(property, tenants, contracts, payments);
      return calculateRoomOccupancy(room, tenants, contracts, payments, range, today, start, capAtToday);
    })
    .filter((room): room is RoomOccupancySummary => room !== null);
  const propertyMap = new Map<string, RoomOccupancySummary[]>();
  roomSummaries.forEach((room) => propertyMap.set(room.propertyId, [...(propertyMap.get(room.propertyId) || []), room]));
  const propertySummaries = [...propertyMap.entries()].map(([propertyId, propertyRooms]) => {
    const rentedDays = propertyRooms.reduce((sum, room) => sum + room.rentedDays, 0);
    const availableDays = propertyRooms.reduce((sum, room) => sum + room.availableDays, 0);
    return { propertyId, rentedDays, availableDays, rate: rateFor(rentedDays, availableDays), rooms: propertyRooms };
  });
  const rentedDays = roomSummaries.reduce((sum, room) => sum + room.rentedDays, 0);
  const availableDays = roomSummaries.reduce((sum, room) => sum + room.availableDays, 0);
  return { rentedDays, availableDays, rate: rateFor(rentedDays, availableDays), properties: propertySummaries };
}

export function calculateRoomOccupancy(
  room: BusinessRoom,
  tenants: BusinessTenant[],
  contracts: BusinessContract[],
  payments: BusinessRentPayment[],
  range: OccupancyRange,
  today = range.end,
  propertyStart?: string,
  capAtToday = false
): RoomOccupancySummary | null {
  const safeRange = validRange(range, today, capAtToday);
  const safePropertyStart = validDate(propertyStart) ? propertyStart! : "";
  if (!safeRange || !safePropertyStart) return null;
  const start = maxDate(safeRange.start, safePropertyStart);
  const end = capAtToday ? minDate(safeRange.end, today) : safeRange.end;
  if (!start || !end || start > end) return null;

  const availableDays = inclusiveDays(start, end);
  const intervals = tenants
    .filter((tenant) => tenant.propertyId === room.propertyId && tenant.roomId === room.id)
    .flatMap((tenant) => tenantIntervals(tenant, contracts, safeRange, start, end));
  const paymentIntervals = payments
    .filter((payment) => isUsableRentCoverage(payment, room))
    .map((payment) => ({ start: payment.coverageStartDate!, end: payment.coverageEndDate! }))
    .filter((interval) => validDate(interval.start) && validDate(interval.end))
    .map((interval) => ({ start: maxDate(safeRange.start, start, interval.start), end: minDate(safeRange.end, end, interval.end) }))
    .filter((interval) => interval.start <= interval.end);
  const rentedDays = Math.min(mergeIntervals([...intervals, ...paymentIntervals]).reduce((sum, interval) => sum + inclusiveDays(interval.start, interval.end), 0), availableDays);
  return {
    roomId: room.id,
    propertyId: room.propertyId,
    roomName: room.name || room.roomNumber || "未命名房间",
    rentedDays,
    availableDays,
    rate: rateFor(rentedDays, availableDays)
  };
}

export function resolvePropertyOccupancyStart(property: BusinessProperty, tenants: BusinessTenant[], contracts: BusinessContract[], payments: BusinessRentPayment[] = []) {
  if (validDate(property.occupancyTrackingStartDate)) return property.occupancyTrackingStartDate!;
  const dates = [
    ...contracts
    .filter((contract) => contract.propertyId === property.id && !isInvalidRecord(contract.status))
    .map((contract) => contract.startDate)
    .filter(validDate),
    ...tenants
    .filter((tenant) => tenant.propertyId === property.id && !isInvalidRecord(tenant.status))
    .map((tenant) => tenant.moveInDate || "")
    .filter(validDate),
    ...payments
    .filter((payment) => payment.propertyId === property.id && payment.tenantId && !isInvalidRecord(payment.notes) && !isInvalidRecord(payment.paymentStatus))
    .map((payment) => payment.coverageStartDate || "")
    .filter(validDate)
  ].sort();
  if (!dates.length) return "";
  return `${dates[0].slice(0, 7)}-01`;
}

export function rateFor(rentedDays: number, availableDays: number) {
  return Number.isFinite(rentedDays) && Number.isFinite(availableDays) && availableDays > 0
    ? (rentedDays / availableDays) * 100
    : null;
}

export function isValidOccupancyDate(value?: string): value is string {
  return validDate(value);
}

function tenantIntervals(tenant: BusinessTenant, contracts: BusinessContract[], range: OccupancyRange, availableStart: string, availableEnd: string) {
  const tenantContracts = contracts.filter((contract) => contract.tenantId === tenant.id && contract.roomId === tenant.roomId && !isInvalidRecord(contract.status) && validDate(contract.startDate));
  const source = tenantContracts.length
    ? tenantContracts.map((contract) => ({ start: contract.startDate, end: contract.endDate || tenant.actualMoveOutDate || range.end }))
    : [{ start: tenant.moveInDate || "", end: tenant.actualMoveOutDate || range.end }];
  return source
    .filter((interval) => validDate(interval.start) && validDate(interval.end))
    .map((interval) => ({ start: maxDate(range.start, availableStart, interval.start), end: minDate(range.end, availableEnd, interval.end) }))
    .filter((interval) => interval.start <= interval.end);
}

function isUsableRentCoverage(payment: BusinessRentPayment, room: BusinessRoom) {
  const nonRentType = /退款|赔偿|其他收入|refund|compensation|other/i.test(payment.incomeType || "");
  const unpaid = /未收|待收|unpaid|pending/i.test(payment.paymentStatus || "");
  return payment.propertyId === room.propertyId
    && payment.roomId === room.id
    && Boolean(payment.tenantId)
    && !nonRentType
    && !unpaid
    && !isInvalidRecord(payment.notes)
    && !isInvalidRecord(payment.paymentStatus)
    && Number.isFinite(payment.amountPaid)
    && payment.amountPaid > 0
    && validDate(payment.coverageStartDate)
    && validDate(payment.coverageEndDate);
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

function validRange(range: OccupancyRange, today: string, capAtToday: boolean) {
  if (!validDate(range.start) || !validDate(range.end) || (capAtToday && !validDate(today)) || range.start > range.end) return null;
  const end = capAtToday ? minDate(range.end, today) : range.end;
  return range.start <= end ? { start: range.start, end } : null;
}

function validDate(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isInvalidRecord(status?: string) {
  return /作废|取消|void|cancel/i.test(status || "");
}

function inclusiveDays(start: string, end: string) {
  const value = Math.floor((dateValue(end) - dateValue(start)) / DAY_MS) + 1;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function maxDate(...values: string[]) {
  return values.filter(validDate).sort().at(-1) || "";
}

function minDate(...values: string[]) {
  return values.filter(validDate).sort()[0] || "";
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00Z`).getTime();
}
