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

function ended(status = "") {
  return ["已退租", "已归档", "已结束", "已删除"].some((value) => status.includes(value));
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
    const leftEnded = ended(a.tenant.status);
    const rightEnded = ended(b.tenant.status);
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
