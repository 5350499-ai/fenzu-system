import type { BusinessRoom, BusinessTenant } from "./business-data";

function roomNumberValue(room?: BusinessRoom) {
  const source = `${room?.roomNumber || ""} ${room?.name || ""}`.trim();
  const match = source.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function isMovedOut(tenant: BusinessTenant) {
  return tenant.status.includes("已退租") || tenant.status.includes("已归档");
}

function dateValue(value?: string) {
  const candidate = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : "";
}

/** Default tenant list order: active tenants by room, moved-out tenants last. */
export function sortTenantsByRoomAndStatus(tenants: BusinessTenant[], rooms: BusinessRoom[]) {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return tenants
    .map((tenant, index) => ({ tenant, index }))
    .sort((left, right) => {
      const leftMovedOut = isMovedOut(left.tenant);
      const rightMovedOut = isMovedOut(right.tenant);
      if (leftMovedOut !== rightMovedOut) return leftMovedOut ? 1 : -1;

      if (!leftMovedOut) {
        const leftRoom = roomNumberValue(roomById.get(left.tenant.roomId));
        const rightRoom = roomNumberValue(roomById.get(right.tenant.roomId));
        if (leftRoom == null && rightRoom != null) return 1;
        if (leftRoom != null && rightRoom == null) return -1;
        if (leftRoom != null && rightRoom != null && leftRoom !== rightRoom) return leftRoom - rightRoom;
      } else {
        const leftMoveOut = dateValue(left.tenant.actualMoveOutDate);
        const rightMoveOut = dateValue(right.tenant.actualMoveOutDate);
        if (leftMoveOut !== rightMoveOut) return rightMoveOut.localeCompare(leftMoveOut);
        const leftUpdated = dateValue(left.tenant.updatedAt);
        const rightUpdated = dateValue(right.tenant.updatedAt);
        if (leftUpdated !== rightUpdated) return rightUpdated.localeCompare(leftUpdated);
      }
      return left.index - right.index;
    })
    .map(({ tenant }) => tenant);
}
