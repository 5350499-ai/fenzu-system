import { BusinessContract, BusinessDeposit, BusinessRoom, BusinessTenant } from "@/lib/business-data";
import { isValidCalendarDate } from "@/lib/actual-move-out-date";
import { isEndedTenantStatus } from "@/lib/tenant-sorting";

export type MoveOutInput = {
  tenant: BusinessTenant;
  tenants: BusinessTenant[];
  rooms: BusinessRoom[];
  contracts: BusinessContract[];
  deposits: BusinessDeposit[];
  actualMoveOutDate: string;
  depositHandled: boolean;
  note: string;
};

export type MoveOutPlan = {
  tenants: BusinessTenant[];
  rooms: BusinessRoom[];
  contracts: BusinessContract[];
  deposits: BusinessDeposit[];
};

export function validateMoveOutInput(input: MoveOutInput): string | null {
  if (isEndedTenantStatus(input.tenant.status)) return "该租客已经退租或归档，不能重复办理退租。";
  if (!isValidCalendarDate(input.actualMoveOutDate)) {
    return "请输入有效的实际退租日期。";
  }
  const moveInDate = input.tenant.moveInDate || input.contracts.find((contract) => contract.tenantId === input.tenant.id)?.startDate;
  if (moveInDate && input.actualMoveOutDate < moveInDate) return "实际退租日期不能早于入住日期。";
  return null;
}

export function buildMoveOutPlan(input: MoveOutInput): MoveOutPlan {
  const error = validateMoveOutInput(input);
  if (error) throw new Error(error);
  const tenantId = input.tenant.id;
  const nextTenant: BusinessTenant = {
    ...input.tenant,
    status: "已退租",
    actualMoveOutDate: input.actualMoveOutDate,
    notes: appendMoveOutNote(input.tenant.notes, input.note)
  };
  const nextContracts = input.contracts.map((contract) => (
    contract.tenantId === tenantId ? { ...contract, status: "已结束" } : contract
  ));
  const nextDeposits = input.deposits.map((deposit) => {
    if (deposit.tenantId !== tenantId || deposit.status === "已作废" || deposit.notes?.includes("[已作废]")) return deposit;
    const status = input.depositHandled ? "已退" : "待退";
    const marker = `[退租押金处理:${status}]`;
    return { ...deposit, status, notes: appendMarker(deposit.notes, marker) };
  });
  const nextTenants = input.tenants.map((tenant) => tenant.id === tenantId ? nextTenant : tenant);
  const nextRooms = input.rooms.map((room) => {
    if (room.id !== input.tenant.roomId) return room;
    const hasActiveTenant = nextTenants.some((tenant) => tenant.roomId === room.id && !isEndedTenantStatus(tenant.status));
    return hasActiveTenant ? { ...room, status: "已租" } : { ...room, status: "空置" };
  });
  return { tenants: nextTenants, rooms: nextRooms, contracts: nextContracts, deposits: nextDeposits };
}

function appendMoveOutNote(existing: string | undefined, note: string) {
  const trimmed = note.trim();
  if (!trimmed) return existing || "";
  return appendMarker(existing, `[退租备注:${trimmed}]`);
}

function appendMarker(existing: string | undefined, marker: string) {
  if (!existing) return marker;
  if (existing.includes(marker)) return existing;
  return `${existing}\n${marker}`;
}
