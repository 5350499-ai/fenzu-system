export type TenantSortMode = "room" | "expiry" | "rent" | "property" | "status" | "priority";

type TenantLike = {
  id: string;
  roomId?: string;
  status?: string;
  name?: string;
  monthlyRent?: number;
  actualMoveOutDate?: string;
  updatedAt?: string;
  createdAt?: string;
};

type RoomLike = { id: string; roomNumber?: string; name?: string };

export function isEndedTenantStatus(status = "") {
  return ["已退租", "已归档", "已结束", "已删除"].some((value) => status.includes(value));
}

export function countTenantGroups<T extends { status?: string }>(tenants: T[]) {
  return tenants.reduce((counts, tenant) => {
    if (isEndedTenantStatus(tenant.status)) counts.retired += 1;
    else counts.current += 1;
    return counts;
  }, { current: 0, retired: 0 });
}

export function extractRoomNumber(value: string | undefined | null): number | null {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function sortTenantsByRoomAndStatus<T extends TenantLike>(tenants: T[], rooms: RoomLike[], options: {
  mode?: TenantSortMode;
  direction?: "asc" | "desc";
  getProperty?: (tenant: T) => string;
  getExpiry?: (tenant: T) => string;
  getStatusRank?: (tenant: T) => number;
} = {}): T[] {
  const mode = options.mode || "room";
  const direction = options.direction === "desc" ? -1 : 1;
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const compareText = (a: string, b: string) => a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  const compareDateDesc = (a: string, b: string) => (b || "").localeCompare(a || "");
  return tenants.map((tenant, index) => ({ tenant, index })).sort((a, b) => {
    const leftEnded = isEndedTenantStatus(a.tenant.status);
    const rightEnded = isEndedTenantStatus(b.tenant.status);
    if (leftEnded !== rightEnded) return leftEnded ? 1 : -1;
    const leftRoom = roomById.get(a.tenant.roomId || "");
    const rightRoom = roomById.get(b.tenant.roomId || "");
    const leftRoomNumber = extractRoomNumber(leftRoom?.roomNumber || leftRoom?.name);
    const rightRoomNumber = extractRoomNumber(rightRoom?.roomNumber || rightRoom?.name);
    const roomCompare = leftRoomNumber === null && rightRoomNumber === null ? 0 : leftRoomNumber === null ? 1 : rightRoomNumber === null ? -1 : leftRoomNumber - rightRoomNumber;
    let difference = mode === "room" ? roomCompare : 0;
    if (!difference && mode === "rent") difference = (Number(a.tenant.monthlyRent) - Number(b.tenant.monthlyRent)) * direction;
    if (!difference && mode === "property") difference = compareText(options.getProperty?.(a.tenant) || "", options.getProperty?.(b.tenant) || "") * direction;
    if (!difference && mode === "expiry") difference = compareText(options.getExpiry?.(a.tenant) || "9999-12-31", options.getExpiry?.(b.tenant) || "9999-12-31") * direction;
    if (!difference && (mode === "status" || mode === "priority")) difference = ((options.getStatusRank?.(a.tenant) || 0) - (options.getStatusRank?.(b.tenant) || 0)) * direction;
    if (!difference && leftEnded) difference = compareDateDesc(a.tenant.actualMoveOutDate || a.tenant.updatedAt || a.tenant.createdAt || "", b.tenant.actualMoveOutDate || b.tenant.updatedAt || b.tenant.createdAt || "");
    if (!difference) difference = roomCompare;
    if (!difference) difference = compareText(a.tenant.name || "", b.tenant.name || "");
    if (!difference) difference = compareText(a.tenant.id, b.tenant.id);
    return difference || a.index - b.index;
  }).map((entry) => entry.tenant);
}

export function sortRoomsByNumberAndStatus<T extends { id: string; roomNumber?: string; name?: string; status?: string }>(rooms: T[], options: { getProperty?: (room: T) => string } = {}): T[] {
  const archived = (status = "") => status.includes("已归档");
  const compareText = (a: string, b: string) => a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
  return rooms.map((room, index) => ({ room, index })).sort((a, b) => {
    const archivedCompare = Number(archived(a.room.status)) - Number(archived(b.room.status));
    if (archivedCompare) return archivedCompare;
    const leftNumber = extractRoomNumber(a.room.roomNumber || a.room.name);
    const rightNumber = extractRoomNumber(b.room.roomNumber || b.room.name);
    const numberCompare = leftNumber === null && rightNumber === null ? 0 : leftNumber === null ? 1 : rightNumber === null ? -1 : leftNumber - rightNumber;
    if (numberCompare) return numberCompare;
    const propertyCompare = compareText(options.getProperty?.(a.room) || "", options.getProperty?.(b.room) || "");
    return propertyCompare || compareText(a.room.id, b.room.id) || a.index - b.index;
  }).map((entry) => entry.room);
}
