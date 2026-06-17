export type RoomStatus =
  | "vacant"
  | "rented"
  | "reserved"
  | "moving_out"
  | "maintenance"
  | "paused";

export type Property = {
  id: string;
  name: string;
  address: string;
  city: string;
  landlordName: string;
  subletAllowed: boolean;
  notes?: string;
};

export type Room = {
  id: string;
  propertyId: string;
  name: string;
  roomNumber: string;
  monthlyRent: number;
  depositAmount: number;
  status: RoomStatus;
  currentTenant?: string;
  hasWindow: boolean;
  hasPrivateBathroom: boolean;
  notes?: string;
};

export type Tenant = {
  id: string;
  propertyId: string;
  roomId: string;
  name: string;
  phone: string;
  wechat?: string;
  whatsapp?: string;
  passportNumber?: string;
  nieNumber?: string;
  source: "微信群" | "华人街" | "小红书" | "Facebook" | "朋友介绍" | "其他";
  moveInDate: string;
  expectedMoveOutDate: string;
  monthlyRent: number;
  depositAmount: number;
  status: "active" | "reserved" | "moved_out";
};

export type RentPayment = {
  id: string;
  tenantId: string;
  propertyId: string;
  roomId: string;
  rentMonth: string;
  amountDue: number;
  amountPaid: number;
  amountUnpaid: number;
  coverageStartDate?: string;
  coverageEndDate?: string;
  paymentDate?: string;
  paymentMethod: "现金" | "转账" | "Bizum" | "其他";
  isOverdue: boolean;
};

export type ContractReminder = {
  id: string;
  personName: string;
  propertyName: string;
  roomName?: string;
  endDate: string;
  daysLeft: number;
  type: "tenant" | "landlord";
};

export type TaskItem = {
  id: string;
  title: string;
  dueDate: string;
  status: "待处理" | "已完成" | "已取消";
};
