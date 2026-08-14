import type {
  BusinessContract,
  BusinessDeposit,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant
} from "./business-data";
import {
  fixedRentCollectionReminderStage,
  isCoverageExpired,
  latestCoverageForTenant,
  overdueReferenceAmount,
  paymentCoverageEnd,
  roomOccupancyStatus,
  isCurrentRentalRelationship,
  todayString
} from "./rent-coverage";
import { compareOperationsRooms } from "./room-status-sort";
import { sumOccupants } from "./tenant-occupancy";

export { compareOperationsRooms } from "./room-status-sort";

export type OperationsScope = {
  properties: BusinessProperty[];
  rooms: BusinessRoom[];
  tenants: BusinessTenant[];
  contracts: BusinessContract[];
  payments: BusinessRentPayment[];
  deposits: BusinessDeposit[];
};

export type OperationsStats = {
  activeTenants: number;
  activeOccupants: number;
  movedOutTenants: number;
  contractsStartedThisMonth: number;
  expiringContracts: number;
  rentDueTenants: number;
  overdueTenants: number;
  overdueAmount: number;
  pendingDepositTenants: number;
  totalRooms: number;
  rentedRooms: number;
  vacantRooms: number;
  rentableRooms: number;
  occupancy: number;
};

export type OperationsRoom = {
  room: BusinessRoom;
  property: BusinessProperty | undefined;
  statusLabel: string;
  statusTone: "green" | "orange" | "amber" | "red" | "blue";
  currentTenantLabel: string;
  monthlyRent: number;
  coverageEnd: string;
  contractEnd: string;
  contractUrgent: boolean;
  vacancy: "not-vacant" | "known" | "unknown" | "invalid-date";
  vacantDays: number | null;
  vacancyStart: string;
};

export type OperationsContractFlowMonth = {
  month: string;
  label: string;
  started: number;
  ended: number;
};

export type OperationsRoomStatusKey = "rented" | "vacant" | "maintenance" | "paused" | "other";

export type OperationsRoomStatusItem = {
  key: OperationsRoomStatusKey;
  label: string;
  count: number;
  percentage: number;
};

export type OperationsRoomStatusDistribution = {
  total: number;
  items: OperationsRoomStatusItem[];
};

export function calculateOperationsStats(scope: OperationsScope, today = todayString()): OperationsStats {
  const activeTenants = scope.tenants.filter(isCurrentRentalRelationship);
  const movedOutTenants = scope.tenants.filter((tenant) => tenant.status.includes("已退租"));
  const activeTenantIds = new Set(activeTenants.map((tenant) => tenant.id));
  const validContracts = scope.contracts.filter((contract) => !isVoided(contract.notes));
  const thisMonth = today.slice(0, 7);
  const contractsStartedThisMonth = validContracts.filter((contract) => contract.startDate.startsWith(thisMonth)).length;
  const expiringContracts = validContracts.filter((contract) => isCurrentContract(contract, today) && daysBetween(today, contract.endDate) <= 30).length;

  const rentDueTenants = activeTenants.filter((tenant) => {
    const stage = fixedRentCollectionReminderStage(tenant, latestCoverageForTenant(tenant.id, scope.payments), today);
    return Boolean(stage && stage.level !== "overdue");
  });
  const overdue = activeTenants.filter((tenant) => isCoverageExpired(latestCoverageForTenant(tenant.id, scope.payments), today));
  const pendingDepositTenantIds = new Set(
    scope.deposits
      .filter((deposit) => {
        const tenant = scope.tenants.find((item) => item.id === deposit.tenantId);
        return Boolean(tenant?.status.includes("已退租") && deposit.status === "待退" && !isVoided(deposit.notes));
      })
      .map((deposit) => deposit.tenantId)
  );

  const visibleRooms = scope.rooms.filter((room) => !isArchivedRoom(room));
  const roomStatuses = visibleRooms.map((room) => roomOccupancyStatus(room, scope.tenants));
  const rentableRooms = visibleRooms.filter((room) => !isStoppedRoom(room)).length;
  const rentedRooms = roomStatuses.filter((status) => status === "已租" || status === "即将退租").length;
  const vacantRooms = roomStatuses.filter((status) => status === "空置" || status === "空房").length;

  return {
    activeTenants: activeTenants.length,
    activeOccupants: sumOccupants(activeTenants),
    movedOutTenants: movedOutTenants.length,
    contractsStartedThisMonth,
    expiringContracts,
    rentDueTenants: rentDueTenants.length,
    overdueTenants: overdue.length,
    overdueAmount: overdue.reduce((total, tenant) => total + overdueReferenceAmount(latestCoverageForTenant(tenant.id, scope.payments), tenant), 0),
    pendingDepositTenants: pendingDepositTenantIds.size,
    totalRooms: visibleRooms.length,
    rentedRooms,
    vacantRooms,
    rentableRooms,
    occupancy: rentableRooms ? Math.round((rentedRooms / rentableRooms) * 100) : 0
  };
}

export function buildOperationsRooms(scope: OperationsScope, today = todayString()): OperationsRoom[] {
  const propertyById = new Map(scope.properties.map((property) => [property.id, property]));
  return scope.rooms
    .filter((room) => !isArchivedRoom(room))
    .map((room) => {
      const dynamicStatus = roomOccupancyStatus(room, scope.tenants);
      const currentTenants = scope.tenants.filter((tenant) => tenant.roomId === room.id && isCurrentRentalRelationship(tenant));
      const coverageEnds = currentTenants
        .map((tenant) => {
          const payment = latestCoverageForTenant(tenant.id, scope.payments);
          return payment ? paymentCoverageEnd(payment) : "";
        })
        .filter(Boolean)
        .sort();
      const activeContracts = scope.contracts
        .filter((contract) => contract.roomId === room.id && currentTenants.some((tenant) => tenant.id === contract.tenantId) && isCurrentContract(contract, today))
        .sort((left, right) => left.endDate.localeCompare(right.endDate));
      const currentContract = activeContracts[0];
      const currentTenantLabel = currentTenants.map((tenant) => tenant.name).filter(Boolean).join("、") || "-";
      const monthlyRent = currentTenants.reduce((total, tenant) => total + Number(tenant.monthlyRent || 0), 0);
      const isVacant = dynamicStatus === "空置" || dynamicStatus === "空房";
      const vacancy = isVacant ? vacancyInfo(room.id, scope.contracts, today) : { status: "not-vacant" as const, days: null, start: "" };

      return {
        room,
        property: propertyById.get(room.propertyId),
        statusLabel: roomStatusLabel(dynamicStatus),
        statusTone: roomStatusTone(dynamicStatus),
        currentTenantLabel,
        monthlyRent,
        coverageEnd: coverageEnds[0] || "",
        contractEnd: currentContract?.endDate || "",
        contractUrgent: Boolean(currentContract?.endDate && daysBetween(today, currentContract.endDate) <= 30),
        vacancy: vacancy.status,
        vacantDays: vacancy.days,
        vacancyStart: vacancy.start
      };
    })
    .sort(compareOperationsRooms);
}

export function calculateOperationsContractFlow(
  scope: OperationsScope,
  today = todayString()
): OperationsContractFlowMonth[] {
  const months = recentNaturalMonths(today, 6);
  const counts = new Map(months.map((month) => [month.month, { started: 0, ended: 0 }]));

  for (const contract of scope.contracts.filter(isChartEligibleContract)) {
    const startMonth = contract.startDate?.slice(0, 7);
    const endMonth = contract.endDate?.slice(0, 7);
    if (startMonth && counts.has(startMonth)) counts.get(startMonth)!.started += 1;
    if (endMonth && counts.has(endMonth)) counts.get(endMonth)!.ended += 1;
  }

  return months.map((month) => ({ ...month, ...counts.get(month.month)! }));
}

export function calculateOperationsRoomStatusDistribution(scope: OperationsScope): OperationsRoomStatusDistribution {
  const visibleRooms = scope.rooms.filter((room) => !isArchivedRoom(room));
  const counts: Record<OperationsRoomStatusKey, number> = {
    rented: 0,
    vacant: 0,
    maintenance: 0,
    paused: 0,
    other: 0
  };

  for (const room of visibleRooms) {
    const dynamicStatus = roomOccupancyStatus(room, scope.tenants);
    if (dynamicStatus === "已租") counts.rented += 1;
    else if (dynamicStatus === "空置" || dynamicStatus === "空房") counts.vacant += 1;
    else if (dynamicStatus === "维修中") counts.maintenance += 1;
    else if (dynamicStatus === "暂停出租") counts.paused += 1;
    else counts.other += 1;
  }

  const labels: Record<OperationsRoomStatusKey, string> = {
    rented: "已出租",
    vacant: "空置",
    maintenance: "维修中",
    paused: "暂停出租",
    other: "其他状态"
  };

  return {
    total: visibleRooms.length,
    items: (Object.keys(counts) as OperationsRoomStatusKey[])
      .filter((key) => counts[key] > 0)
      .map((key) => ({
        key,
        label: labels[key],
        count: counts[key],
        percentage: Math.round((counts[key] / visibleRooms.length) * 100)
      }))
  };
}

function vacancyInfo(roomId: string, contracts: BusinessContract[], today: string) {
  const endedContract = contracts
    .filter((contract) => contract.roomId === roomId && isEndedContract(contract) && Boolean(contract.endDate) && !isVoided(contract.notes))
    .sort((left, right) => right.endDate.localeCompare(left.endDate))[0];
  if (!endedContract?.endDate) return { status: "unknown" as const, days: null, start: "" };
  const days = daysBetween(endedContract.endDate, today);
  if (days < 0) return { status: "invalid-date" as const, days: null, start: endedContract.endDate };
  return { status: "known" as const, days, start: endedContract.endDate };
}

function isCurrentContract(contract: BusinessContract, today: string) {
  return Boolean(contract.endDate && contract.endDate >= today && !isEndedContract(contract));
}

function recentNaturalMonths(today: string, length: number): Array<{ month: string; label: string }> {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  return Array.from({ length }, (_, index) => {
    const date = new Date(year, month - length + index, 1);
    const monthNumber = date.getMonth() + 1;
    return {
      month: `${date.getFullYear()}-${String(monthNumber).padStart(2, "0")}`,
      label: `${monthNumber}月`
    };
  });
}

function isChartEligibleContract(contract: BusinessContract) {
  const status = (contract.status || "").toLowerCase();
  return !isVoided(contract.notes) && !["已作废", "作废", "void"].some((value) => status.includes(value));
}

function isEndedContract(contract: BusinessContract) {
  const status = contract.status || "";
  return ["已结束", "已归档", "已退租", "已作废", "作废", "ended", "archived", "void"].some((value) => status.toLowerCase().includes(value.toLowerCase()));
}

function isStoppedRoom(room: BusinessRoom) {
  return ["维修中", "暂停出租", "已归档"].includes(room.status);
}

function isArchivedRoom(room: BusinessRoom) {
  return room.status === "已归档";
}

function roomStatusLabel(status: string) {
  if (status === "已租") return "已出租";
  if (status === "空房") return "空置";
  return status || "空置";
}

function roomStatusTone(status: string): OperationsRoom["statusTone"] {
  if (status === "已租") return "green";
  if (status === "空置" || status === "空房") return "orange";
  if (status === "维修中") return "red";
  return "blue";
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]"));
}
