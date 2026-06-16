import type { ContractReminder, Property, RentPayment, Room, TaskItem, Tenant } from "./types";

export const properties: Property[] = [
  {
    id: "p1",
    name: "马德里市中心A房",
    address: "Calle Mayor 12, Madrid",
    city: "Madrid",
    landlordName: "Carlos García",
    subletAllowed: true
  },
  {
    id: "p2",
    name: "Usera舒适公寓",
    address: "Calle Marcelo Usera 88, Madrid",
    city: "Madrid",
    landlordName: "María López",
    subletAllowed: true
  },
  {
    id: "p3",
    name: "Vallecas青年合租",
    address: "Avenida de la Albufera 45, Madrid",
    city: "Madrid",
    landlordName: "Javier Martín",
    subletAllowed: true
  }
];

const roomStatuses: Room["status"][] = [
  "vacant",
  "vacant",
  "vacant",
  "moving_out",
  "moving_out",
  "maintenance",
  "paused",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented",
  "rented"
];

const tenantNames = [
  "张三",
  "李四",
  "王五",
  "赵六",
  "陈七",
  "刘八",
  "周九",
  "吴十",
  "郑一",
  "孙二",
  "马三",
  "胡四",
  "林五",
  "高六",
  "郭七",
  "何八",
  "罗九",
  "梁十"
];

export const rooms: Room[] = Array.from({ length: 20 }, (_, index) => {
  const number = index + 1;
  const status = roomStatuses[index];
  const propertyId = number <= 8 ? "p1" : number <= 14 ? "p2" : "p3";
  const rentedLike = status === "rented" || status === "moving_out";

  return {
    id: `r${number}`,
    propertyId,
    name: number === 1 ? "房间A" : number === 2 ? "房间B" : `房间${number}`,
    roomNumber: String(number).padStart(2, "0"),
    monthlyRent: 420 + number * 15,
    depositAmount: 420 + number * 15,
    status,
    currentTenant: rentedLike ? tenantNames[index % tenantNames.length] : undefined,
    hasWindow: number % 3 !== 0,
    hasPrivateBathroom: number % 7 === 0
  };
});

export const tenants: Tenant[] = rooms
  .filter((room) => room.status === "rented" || room.status === "moving_out")
  .map((room, index) => ({
    id: `t${index + 1}`,
    propertyId: room.propertyId,
    roomId: room.id,
    name: tenantNames[index],
    phone: `+34 600 ${String(100 + index).padStart(3, "0")} ${String(200 + index).padStart(3, "0")}`,
    wechat: `tenant${index + 1}`,
    whatsapp: `+34 600 ${String(100 + index).padStart(3, "0")} ${String(200 + index).padStart(3, "0")}`,
    passportNumber: `E${String(10000000 + index)}`,
    nieNumber: index % 2 === 0 ? `Y${String(1000000 + index)}Z` : undefined,
    source: ["微信群", "华人街", "小红书", "Facebook", "朋友介绍", "其他"][index % 6] as Tenant["source"],
    moveInDate: `2026-${String((index % 5) + 1).padStart(2, "0")}-01`,
    expectedMoveOutDate: `2026-07-${String((index % 20) + 5).padStart(2, "0")}`,
    monthlyRent: room.monthlyRent,
    depositAmount: room.depositAmount,
    status: "active"
  }));

export const rentPayments: RentPayment[] = tenants.slice(0, 15).map((tenant, index) => {
  const amountDue = tenant.monthlyRent;
  const amountUnpaid = 120 + (15 - index) * 35;
  const amountPaid = Math.max(amountDue - amountUnpaid, 0);

  return {
    id: `pay${index + 1}`,
    tenantId: tenant.id,
    propertyId: tenant.propertyId,
    roomId: tenant.roomId,
    rentMonth: "2026-06-01",
    amountDue,
    amountPaid,
    amountUnpaid,
    paymentDate: index % 3 === 0 ? "2026-06-05" : undefined,
    paymentMethod: ["现金", "转账", "Bizum", "其他"][index % 4] as RentPayment["paymentMethod"],
    isOverdue: true
  };
});

const tenantContractReminders: ContractReminder[] = Array.from({ length: 10 }, (_, index) => {
  const tenant = tenants[index % tenants.length];
  const room = rooms.find((item) => item.id === tenant.roomId);
  const property = properties.find((item) => item.id === tenant.propertyId);

  return {
    id: `tc${index + 1}`,
    personName: tenant.name,
    propertyName: property?.name || "",
    roomName: room?.name || "",
    endDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    daysLeft: index + 1,
    type: "tenant"
  };
});

const landlordContractReminders: ContractReminder[] = Array.from({ length: 10 }, (_, index) => {
  const property = properties[index % properties.length];

  return {
    id: `lc${index + 1}`,
    personName: property.landlordName,
    propertyName: property.name,
    endDate: `2026-08-${String(index + 1).padStart(2, "0")}`,
    daysLeft: index + 12,
    type: "landlord"
  };
});

export const contractReminders: ContractReminder[] = [
  ...tenantContractReminders,
  ...landlordContractReminders
];

export const tasks: TaskItem[] = Array.from({ length: 12 }, (_, index) => ({
  id: `task${index + 1}`,
  title: [
    "跟进欠租租客",
    "确认续约意向",
    "退租前房间检查",
    "提醒补交押金",
    "联系维修师傅",
    "核对水电账单"
  ][index % 6],
  dueDate: `2026-06-${String(index + 17).padStart(2, "0")}`,
  status: index % 5 === 0 ? "已完成" : "待处理"
}));

export const expenses = [
  { id: "e1", month: "2026-06", propertyId: "p1", amount: 980, category: "房东租金" },
  { id: "e2", month: "2026-06", propertyId: "p2", amount: 670, category: "房东租金" },
  { id: "e3", month: "2026-06", propertyId: "p3", amount: 740, category: "房东租金" }
];
