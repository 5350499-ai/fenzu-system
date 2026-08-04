export type RoomStatusSortItem = {
  room: { roomNumber?: string | null; name?: string | null };
  statusLabel: string;
};

function leadingRoomNumber(value: string | null | undefined) {
  const match = String(value || "").trim().match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

export function roomNumberForSort(room: RoomStatusSortItem["room"]) {
  return leadingRoomNumber(room.roomNumber) ?? leadingRoomNumber(room.name);
}

function isVacantStatus(statusLabel: string) {
  return statusLabel === "空置" || statusLabel === "空房";
}

export function compareOperationsRooms(left: RoomStatusSortItem, right: RoomStatusSortItem) {
  const vacantDifference = Number(isVacantStatus(right.statusLabel)) - Number(isVacantStatus(left.statusLabel));
  if (vacantDifference) return vacantDifference;

  const leftNumber = roomNumberForSort(left.room);
  const rightNumber = roomNumberForSort(right.room);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber === null && rightNumber !== null) return 1;
  if (leftNumber !== null && rightNumber === null) return -1;

  return String(left.room.name || "").localeCompare(String(right.room.name || ""), "zh-CN", { numeric: true, sensitivity: "base" });
}
