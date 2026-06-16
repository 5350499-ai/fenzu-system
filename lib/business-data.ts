import { properties, rentPayments, rooms, tenants } from "./demo-data";

export type BusinessProperty = {
  id: string;
  name: string;
  address: string;
  city: string;
  landlordName?: string;
  notes?: string;
};

export type BusinessRoom = {
  id: string;
  propertyId: string;
  name: string;
  roomNumber: string;
  monthlyRent: number;
  depositAmount: number;
  status: "空置" | "已租" | "预订中" | "即将退租" | "维修中" | "暂停出租";
  notes?: string;
};

export type BusinessTenant = {
  id: string;
  propertyId: string;
  roomId: string;
  name: string;
  phone: string;
  wechat: string;
  source: string;
  monthlyRent: number;
  depositAmount: number;
  status: "在租" | "预定入住" | "已退房";
  notes?: string;
};

export type BusinessContract = {
  id: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRent: number;
  depositAmount: number;
  status: "有效" | "即将到期" | "已结束";
  notes?: string;
};

export type BusinessRentPayment = {
  id: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  rentMonth: string;
  amountDue: number;
  amountPaid: number;
  amountUnpaid: number;
  paymentMethod: "现金" | "转账" | "Bizum" | "其他";
  isOverdue: boolean;
  notes?: string;
};

export type BusinessExpense = {
  id: string;
  propertyId: string;
  expenseMonth: string;
  category: string;
  amount: number;
  paymentDate: string;
  isPaid: boolean;
  notes?: string;
};

export type BusinessDeposit = {
  id: string;
  propertyId: string;
  roomId: string;
  tenantId: string;
  type: "收取" | "退还" | "扣除";
  amount: number;
  status: "已收" | "待退" | "已退" | "部分扣除";
  transactionDate: string;
  notes?: string;
};

export const propertyKey = "business-properties";
export const roomKey = "business-rooms";
export const tenantKey = "business-tenants";
export const contractKey = "business-contracts";
export const rentPaymentKey = "business-rent-payments";
export const expenseKey = "business-expenses";
export const depositKey = "business-deposits";

export function getInitialProperties(): BusinessProperty[] {
  return readStored<BusinessProperty[]>(propertyKey) || readLegacyProperties() || properties.map((item) => ({
    id: item.id,
    name: item.name,
    address: item.address,
    city: item.city,
    landlordName: item.landlordName,
    notes: item.notes || ""
  }));
}

export function getInitialRooms(currentProperties = getInitialProperties()): BusinessRoom[] {
  return readStored<BusinessRoom[]>(roomKey) || readLegacyRooms(currentProperties) || rooms.map((item) => ({
    id: item.id,
    propertyId: item.propertyId,
    name: item.name,
    roomNumber: item.roomNumber,
    monthlyRent: item.monthlyRent,
    depositAmount: item.depositAmount,
    status: roomStatusToChinese(item.status),
    notes: ""
  }));
}

export function getInitialTenants(currentProperties = getInitialProperties(), currentRooms = getInitialRooms(currentProperties)): BusinessTenant[] {
  return readStored<BusinessTenant[]>(tenantKey) || readLegacyTenants(currentProperties, currentRooms) || tenants.map((item) => ({
    id: item.id,
    propertyId: item.propertyId,
    roomId: item.roomId,
    name: item.name,
    phone: item.phone,
    wechat: item.wechat || item.whatsapp || "",
    source: item.source,
    monthlyRent: item.monthlyRent,
    depositAmount: item.depositAmount,
    status: item.status === "active" ? "在租" : item.status === "reserved" ? "预定入住" : "已退房",
    notes: ""
  }));
}

export function getInitialContracts(
  currentProperties = getInitialProperties(),
  currentRooms = getInitialRooms(currentProperties),
  currentTenants = getInitialTenants(currentProperties, currentRooms)
): BusinessContract[] {
  return readStored<BusinessContract[]>(contractKey) || currentTenants.slice(0, 10).map((tenant, index) => ({
    id: `contract-${index + 1}`,
    propertyId: tenant.propertyId,
    roomId: tenant.roomId,
    tenantId: tenant.id,
    startDate: "2026-01-01",
    endDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    monthlyRent: tenant.monthlyRent,
    depositAmount: tenant.depositAmount,
    status: index < 4 ? "即将到期" : "有效",
    notes: index < 4 ? "请提前联系租客确认是否续约" : ""
  }));
}

export function getInitialRentPayments(
  currentProperties = getInitialProperties(),
  currentRooms = getInitialRooms(currentProperties),
  currentTenants = getInitialTenants(currentProperties, currentRooms)
): BusinessRentPayment[] {
  return readStored<BusinessRentPayment[]>(rentPaymentKey) || readLegacyRentPayments(currentProperties, currentRooms, currentTenants) || rentPayments.map((item) => ({
    id: item.id,
    propertyId: item.propertyId,
    roomId: item.roomId,
    tenantId: item.tenantId,
    rentMonth: item.rentMonth.slice(0, 7),
    amountDue: item.amountDue,
    amountPaid: item.amountPaid,
    amountUnpaid: item.amountUnpaid,
    paymentMethod: item.paymentMethod,
    isOverdue: item.isOverdue,
    notes: item.isOverdue ? "需要催收本月剩余房租" : ""
  }));
}

export function getInitialExpenses(currentProperties = getInitialProperties()): BusinessExpense[] {
  return readStored<BusinessExpense[]>(expenseKey) || [
    { id: "expense-1", propertyId: currentProperties[0]?.id || "", expenseMonth: "2026-06", category: "房东租金", amount: 980, paymentDate: "2026-06-01", isPaid: true, notes: "每月固定支付给房东" },
    { id: "expense-2", propertyId: currentProperties[1]?.id || currentProperties[0]?.id || "", expenseMonth: "2026-06", category: "维修", amount: 120, paymentDate: "2026-06-12", isPaid: false, notes: "厨房水龙头维修" }
  ];
}

export function getInitialDeposits(
  currentProperties = getInitialProperties(),
  currentRooms = getInitialRooms(currentProperties),
  currentTenants = getInitialTenants(currentProperties, currentRooms)
): BusinessDeposit[] {
  return readStored<BusinessDeposit[]>(depositKey) || currentTenants.slice(0, 8).map((tenant, index) => ({
    id: `deposit-${index + 1}`,
    propertyId: tenant.propertyId,
    roomId: tenant.roomId,
    tenantId: tenant.id,
    type: index % 4 === 0 ? "扣除" : index % 3 === 0 ? "退还" : "收取",
    amount: tenant.depositAmount,
    status: index % 4 === 0 ? "部分扣除" : index % 3 === 0 ? "已退" : "已收",
    transactionDate: `2026-06-${String(index + 1).padStart(2, "0")}`,
    notes: index % 4 === 0 ? "退租清洁费扣除" : "押金记录"
  }));
}

export function saveBusinessData<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readStored<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T) : null;
}

function readLegacyProperties() {
  const stored = readStored<any[]>("v1-properties");
  if (!stored) return null;
  return stored.map((item) => ({
    id: item.id,
    name: item.name,
    address: item.address,
    city: item.city,
    landlordName: item.landlordName,
    notes: item.notes || ""
  })) as BusinessProperty[];
}

function readLegacyRooms(currentProperties: BusinessProperty[]) {
  const stored = readStored<any[]>("v1-rooms");
  if (!stored) return null;
  return stored.map((item) => ({
    id: item.id,
    propertyId: currentProperties.find((property) => property.name === item.propertyName)?.id || currentProperties[0]?.id || "",
    name: item.name,
    roomNumber: item.roomNumber,
    monthlyRent: Number(item.monthlyRent || 0),
    depositAmount: Number(item.depositAmount || 0),
    status: item.status || "空置",
    notes: item.notes || ""
  })) as BusinessRoom[];
}

function readLegacyTenants(currentProperties: BusinessProperty[], currentRooms: BusinessRoom[]) {
  const stored = readStored<any[]>("v1-tenants");
  if (!stored) return null;
  return stored.map((item) => ({
    id: item.id,
    propertyId: currentProperties.find((property) => property.name === item.propertyName)?.id || currentProperties[0]?.id || "",
    roomId: currentRooms.find((room) => room.name === item.roomName)?.id || "",
    name: item.name,
    phone: item.phone,
    wechat: item.wechat || "",
    source: item.source || "其他",
    monthlyRent: Number(item.monthlyRent || 0),
    depositAmount: Number(item.depositAmount || 0),
    status: item.status || "在租",
    notes: item.notes || ""
  })) as BusinessTenant[];
}

function readLegacyRentPayments(
  currentProperties: BusinessProperty[],
  currentRooms: BusinessRoom[],
  currentTenants: BusinessTenant[]
) {
  const stored = readStored<any[]>("v1-rent-payments");
  if (!stored) return null;
  return stored.map((item) => ({
    id: item.id,
    propertyId: currentProperties.find((property) => property.name === item.propertyName)?.id || currentProperties[0]?.id || "",
    roomId: currentRooms.find((room) => room.name === item.roomName)?.id || "",
    tenantId: currentTenants.find((tenant) => tenant.name === item.tenantName)?.id || "",
    rentMonth: item.rentMonth,
    amountDue: Number(item.amountDue || 0),
    amountPaid: Number(item.amountPaid || 0),
    amountUnpaid: Number(item.amountUnpaid || 0),
    paymentMethod: item.paymentMethod || "转账",
    isOverdue: Boolean(item.isOverdue),
    notes: item.notes || ""
  })) as BusinessRentPayment[];
}

function roomStatusToChinese(status: string): BusinessRoom["status"] {
  if (status === "rented") return "已租";
  if (status === "reserved") return "预订中";
  if (status === "moving_out") return "即将退租";
  if (status === "maintenance") return "维修中";
  if (status === "paused") return "暂停出租";
  return "空置";
}
