type TenantLike = { id: string; roomId: string; status: string; actualMoveOutDate?: string };
type RoomLike = { id: string; status: string };
type ContractLike = { tenantId: string; status: string };
type DepositLike = { tenantId: string; status: string };

export function buildTenantMoveOutPlan<TTenant extends TenantLike, TRoom extends RoomLike, TContract extends ContractLike, TDeposit extends DepositLike>({
  tenant,
  tenants,
  rooms,
  contracts,
  deposits,
  depositStatus,
  actualMoveOutDate,
  actualMoveOutDateEnabled,
  isCurrentRelationship,
  isVoidedDeposit
}: {
  tenant: TTenant;
  tenants: TTenant[];
  rooms: TRoom[];
  contracts: TContract[];
  deposits: TDeposit[];
  depositStatus: "待退" | "已退";
  actualMoveOutDate: string;
  actualMoveOutDateEnabled: boolean;
  isCurrentRelationship: (tenant: TTenant) => boolean;
  isVoidedDeposit: (deposit: TDeposit) => boolean;
}) {
  if (!tenants.some((item) => item.id === tenant.id)) throw new Error("租客记录不存在，请刷新后重试。");
  if (!isCurrentRelationship(tenant)) throw new Error("该租客已不是当前租赁关系，请刷新后确认状态。");
  const nextTenants = tenants.map((item) => item.id === tenant.id ? {
    ...item,
    status: "已退租",
    ...(actualMoveOutDateEnabled ? { actualMoveOutDate } : {})
  } : item);
  const nextRooms = rooms.map((room) => {
    if (room.id !== tenant.roomId) return room;
    const occupied = nextTenants.some((item) => item.roomId === room.id && isCurrentRelationship(item));
    if (occupied) return { ...room, status: "已租" };
    return ["已租", "预订中", "即将退租"].includes(room.status) ? { ...room, status: "空置" } : room;
  });
  return {
    tenants: nextTenants,
    rooms: nextRooms,
    contracts: contracts.map((contract) => contract.tenantId === tenant.id ? { ...contract, status: "已结束" } : contract),
    deposits: deposits.map((deposit) => deposit.tenantId === tenant.id && !isVoidedDeposit(deposit) ? { ...deposit, status: depositStatus } : deposit)
  };
}

export function createMoveOutSubmissionGuard() {
  let active = false;
  return {
    async run<T>(action: () => Promise<T>) {
      if (active) return { started: false as const };
      active = true;
      try {
        return { started: true as const, value: await action() };
      } finally {
        active = false;
      }
    }
  };
}
