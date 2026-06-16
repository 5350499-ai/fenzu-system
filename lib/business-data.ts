import { isSupabaseConfigured, supabase } from "./supabase";

export type ContractAttachment = {
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
};

export type BusinessProperty = {
  id: string;
  name: string;
  address: string;
  city: string;
  landlordName?: string;
  subletAllowed?: boolean;
  notes?: string;
};

export type BusinessRoom = {
  id: string;
  propertyId: string;
  name: string;
  roomNumber: string;
  monthlyRent: number;
  depositAmount: number;
  status: string;
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
  status: string;
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
  status: string;
  notes?: string;
  attachment?: ContractAttachment;
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
  paymentMethod: string;
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
  type: string;
  amount: number;
  status: string;
  transactionDate: string;
  notes?: string;
};

type AnyRecord = Record<string, any> & { id: string };
type TableConfig = {
  table: string;
  select?: string;
  order?: string;
  fromDb: (row: AnyRecord) => AnyRecord;
  toDb: (row: AnyRecord, userId: string) => AnyRecord;
};

export const propertyKey = "business-properties";
export const roomKey = "business-rooms";
export const tenantKey = "business-tenants";
export const contractKey = "business-contracts";
export const rentPaymentKey = "business-rent-payments";
export const expenseKey = "business-expenses";
export const depositKey = "business-deposits";
export const taskKey = "v1-tasks";

const remoteIdKey = (key: string) => `supabase-ids:${key}`;
const contractMetaMarker = "__contractMeta";

const tableConfigs: Record<string, TableConfig> = {
  [propertyKey]: propertyConfig(),
  "v1-properties": propertyConfig(),
  [roomKey]: {
    table: "rooms",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      propertyId: row.property_id || "",
      name: row.name || "",
      roomNumber: row.room_number || "",
      monthlyRent: Number(row.monthly_rent || 0),
      depositAmount: Number(row.deposit_amount || 0),
      status: normalizeRoomStatus(row.status || "空置"),
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      name: row.name || "",
      room_number: row.roomNumber || "",
      monthly_rent: Number(row.monthlyRent || 0),
      deposit_amount: Number(row.depositAmount || 0),
      status: normalizeRoomStatus(row.status || "空置"),
      notes: row.notes || null
    })
  },
  [tenantKey]: {
    table: "tenants",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      propertyId: row.property_id || "",
      roomId: row.room_id || "",
      name: row.name || "",
      phone: row.phone || "",
      wechat: row.wechat || "",
      source: normalizeSource(row.source || "其他"),
      monthlyRent: Number(row.monthly_rent || 0),
      depositAmount: Number(row.deposit_amount || 0),
      status: normalizeTenantStatus(row.status || "在租"),
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      room_id: row.roomId,
      name: row.name || "",
      phone: row.phone || null,
      wechat: row.wechat || null,
      source: normalizeSource(row.source || "其他"),
      monthly_rent: Number(row.monthlyRent || 0),
      deposit_amount: Number(row.depositAmount || 0),
      status: normalizeTenantStatus(row.status || "在租"),
      notes: row.notes || null
    })
  },
  [contractKey]: {
    table: "contracts",
    order: "created_at",
    fromDb: (row) => {
      const parsed = parseContractNotes(row.notes || "");
      return {
        id: row.id,
        propertyId: row.property_id || "",
        roomId: row.room_id || "",
        tenantId: row.tenant_id || "",
        startDate: row.start_date || "",
        endDate: row.end_date || "",
        monthlyRent: Number(row.monthly_rent || 0),
        depositAmount: Number(row.deposit_amount || 0),
        status: normalizeContractStatus(row.status || "有效"),
        notes: parsed.notes
      };
    },
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      room_id: row.roomId || null,
      tenant_id: row.tenantId || null,
      monthly_rent: Number(row.monthlyRent || 0),
      deposit_amount: Number(row.depositAmount || 0),
      start_date: row.startDate || null,
      end_date: row.endDate || null,
      status: normalizeContractStatus(row.status || "有效"),
      notes: packContractNotes(row.notes || "")
    })
  },
  [rentPaymentKey]: {
    table: "rent_payments",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      propertyId: row.property_id || "",
      roomId: row.room_id || "",
      tenantId: row.tenant_id || "",
      rentMonth: dateToMonth(row.rent_month),
      amountDue: Number(row.amount_due || 0),
      amountPaid: Number(row.amount_paid || 0),
      amountUnpaid: Number(row.amount_unpaid || 0),
      paymentMethod: normalizePaymentMethod(row.payment_method || "转账"),
      isOverdue: Boolean(row.is_overdue),
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      room_id: row.roomId,
      tenant_id: row.tenantId,
      rent_month: monthToDate(row.rentMonth),
      amount_due: Number(row.amountDue || 0),
      amount_paid: Number(row.amountPaid || 0),
      amount_unpaid: Number(row.amountUnpaid || 0),
      payment_method: normalizePaymentMethod(row.paymentMethod || "转账"),
      is_overdue: Boolean(row.isOverdue),
      notes: row.notes || null
    })
  },
  [expenseKey]: {
    table: "expenses",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      propertyId: row.property_id || "",
      expenseMonth: dateToMonth(row.expense_month),
      category: normalizeExpenseCategory(row.category || "其他"),
      amount: Number(row.amount || 0),
      paymentDate: row.payment_date || "",
      isPaid: Boolean(row.is_paid),
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      expense_month: monthToDate(row.expenseMonth),
      category: normalizeExpenseCategory(row.category || "其他"),
      amount: Number(row.amount || 0),
      payment_date: row.paymentDate || null,
      is_paid: Boolean(row.isPaid),
      notes: row.notes || null
    })
  },
  [depositKey]: {
    table: "deposits",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      propertyId: row.property_id || "",
      roomId: row.room_id || "",
      tenantId: row.tenant_id || "",
      type: normalizeDepositType(row.transaction_type || "收取"),
      amount: Number(row.amount || 0),
      status: normalizeDepositStatus(row.status || "已收"),
      transactionDate: row.transaction_date || "",
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      property_id: row.propertyId,
      room_id: row.roomId,
      tenant_id: row.tenantId,
      transaction_type: normalizeDepositType(row.type || "收取"),
      amount: Number(row.amount || 0),
      status: normalizeDepositStatus(row.status || "已收"),
      transaction_date: row.transactionDate || null,
      notes: row.notes || null
    })
  },
  [taskKey]: {
    table: "tasks",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      title: row.title || "",
      dueDate: row.due_date || "",
      status: row.status || "待处理",
      priority: row.priority || "普通",
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      task_type: "manual",
      title: row.title || "",
      due_date: row.dueDate || null,
      status: row.status || "待处理",
      priority: row.priority || "普通",
      notes: row.notes || null
    })
  }
};

export function getInitialProperties(): BusinessProperty[] {
  return isSupabaseConfigured ? [] : readStored<BusinessProperty[]>(propertyKey) || [];
}

export function getInitialRooms(..._args: unknown[]): BusinessRoom[] {
  return isSupabaseConfigured ? [] : readStored<BusinessRoom[]>(roomKey) || [];
}

export function getInitialTenants(..._args: unknown[]): BusinessTenant[] {
  return isSupabaseConfigured ? [] : readStored<BusinessTenant[]>(tenantKey) || [];
}

export function getInitialContracts(..._args: unknown[]): BusinessContract[] {
  return isSupabaseConfigured ? [] : readStored<BusinessContract[]>(contractKey) || [];
}

export function getInitialRentPayments(..._args: unknown[]): BusinessRentPayment[] {
  return isSupabaseConfigured ? [] : readStored<BusinessRentPayment[]>(rentPaymentKey) || [];
}

export function getInitialExpenses(..._args: unknown[]): BusinessExpense[] {
  return isSupabaseConfigured ? [] : readStored<BusinessExpense[]>(expenseKey) || [];
}

export function getInitialDeposits(..._args: unknown[]): BusinessDeposit[] {
  return isSupabaseConfigured ? [] : readStored<BusinessDeposit[]>(depositKey) || [];
}

export async function loadBusinessData<T extends AnyRecord>(key: string, fallback: T[] = []): Promise<T[]> {
  const config = tableConfigs[key];
  if (!isSupabaseConfigured || !supabase || !config) {
    return readStored<T[]>(key) || fallback;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return [];

  let query = supabase.from(config.table).select(config.select || "*");
  if (config.order) query = query.order(config.order, { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(toBusinessError(error.message));

  const rows = ((data || []) as unknown as AnyRecord[]).map((row) => config.fromDb(row)) as T[];
  writeRemoteIds(key, rows.map((row) => row.id));
  return rows;
}

export async function saveBusinessData<T extends AnyRecord>(key: string, value: T[]) {
  if (!isSupabaseConfigured || !supabase || !tableConfigs[key]) {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
    return;
  }

  const config = tableConfigs[key];
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) return;

  const previousIds = readRemoteIds(key);
  if (!previousIds.length && !value.length) return;

  const nextIds = value.map((row) => row.id).filter(Boolean);
  const removedIds = previousIds.filter((id) => !nextIds.includes(id));
  if (removedIds.length) {
    const { error } = await supabase.from(config.table).delete().in("id", removedIds);
    if (error) throw new Error(toBusinessError(error.message));
  }

  const rows = value.filter((row) => row.id).map((row) => config.toDb(row, session.user.id));
  if (rows.length) {
    const { error } = await supabase.from(config.table).upsert(rows);
    if (error) throw new Error(toBusinessError(error.message));
  }

  writeRemoteIds(key, nextIds);
}

function propertyConfig(): TableConfig {
  return {
    table: "properties",
    order: "created_at",
    fromDb: (row) => ({
      id: row.id,
      name: row.name || "",
      address: row.address || "",
      city: row.city || "",
      landlordName: row.landlord_name || "",
      subletAllowed: Boolean(row.sublet_allowed),
      notes: row.notes || ""
    }),
    toDb: (row, userId) => ({
      id: row.id,
      user_id: userId,
      name: row.name || "",
      address: row.address || null,
      city: row.city || null,
      landlord_name: row.landlordName || null,
      sublet_allowed: Boolean(row.subletAllowed),
      notes: row.notes || null
    })
  };
}

function parseContractNotes(value: string): { notes: string; attachment?: ContractAttachment } {
  if (!value) return { notes: "" };

  try {
    const parsed = JSON.parse(value);
    if (parsed?.[contractMetaMarker]) {
      return { notes: parsed.notes || "" };
    }
  } catch {
    // Existing plain notes remain valid.
  }

  return { notes: value };
}

function packContractNotes(notes: string) {
  return notes || null;
}

function readStored<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as T) : null;
}

function readRemoteIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(remoteIdKey(key));
  return stored ? (JSON.parse(stored) as string[]) : [];
}

function writeRemoteIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(remoteIdKey(key), JSON.stringify(ids));
}

function monthToDate(value?: string) {
  if (!value) return null;
  return value.length === 7 ? `${value}-01` : value;
}

function dateToMonth(value?: string) {
  if (!value) return "";
  return value.slice(0, 7);
}

function normalizeRoomStatus(status: string) {
  return normalize(status, {
    "绌虹疆": "空置",
    "宸茬": "已租",
    "棰勮涓?": "预订中",
    "鍗冲皢閫€绉?": "即将退租",
    "缁翠慨涓?": "维修中",
    "鏆傚仠鍑虹": "暂停出租",
    vacant: "空置",
    rented: "已租",
    reserved: "预订中",
    moving_out: "即将退租",
    maintenance: "维修中",
    paused: "暂停出租"
  });
}

function normalizeTenantStatus(status: string) {
  return normalize(status, {
    "鍦ㄧ": "在租",
    "棰勫畾鍏ヤ綇": "预定入住",
    "宸查€€鎴?": "已退租",
    active: "在租",
    archived: "已退租"
  });
}

function normalizeContractStatus(status: string) {
  return normalize(status, {
    "鏈夋晥": "有效",
    "鍗冲皢鍒版湡": "即将到期",
    "宸茬粨鏉?": "已结束",
    active: "有效",
    ended: "已结束"
  });
}

function normalizeDepositType(type: string) {
  return normalize(type, {
    "鏀跺彇": "收取",
    "閫€杩?": "退还",
    "鎵ｉ櫎": "扣除"
  });
}

function normalizeDepositStatus(status: string) {
  return normalize(status, {
    "宸叉敹": "已收",
    "寰呴€€": "待退",
    "宸查€€": "已退",
    "閮ㄥ垎鎵ｉ櫎": "部分扣除"
  });
}

function normalizePaymentMethod(method: string) {
  return normalize(method, {
    "鐜伴噾": "现金",
    "杞处": "转账",
    "鍏朵粬": "其他"
  });
}

function normalizeSource(source: string) {
  return normalize(source, {
    "寰俊缇?": "微信群",
    "鍗庝汉琛?": "华人街",
    "灏忕孩涔?": "小红书",
    "鏈嬪弸浠嬬粛": "朋友介绍",
    "鍏朵粬": "其他"
  });
}

function normalizeExpenseCategory(category: string) {
  return normalize(category, {
    "鎴夸笢绉熼噾": "房东租金",
    "缁翠慨": "维修",
    "娓呮磥": "清洁",
    "瀹跺叿": "家具",
    "鏃ョ敤鍝?": "日用品",
    "绋庤垂": "税费",
    "鏉傝垂": "杂费",
    "鍏朵粬": "其他"
  });
}

function normalize(value: string, dictionary: Record<string, string>) {
  return dictionary[value] || value || "";
}

function toBusinessError(message: string) {
  if (message.includes("violates foreign key constraint") || message.includes("foreign key")) {
    if (message.includes("rooms_property_id_fkey") || message.includes("properties")) {
      return "该房源下还有房间或业务数据，不能直接删除。请先归档房源，或处理关联房间。";
    }
    if (message.includes("tenants") || message.includes("contracts") || message.includes("rent_payments") || message.includes("deposits")) {
      return "该记录已经有关联业务数据，不能直接删除。建议使用归档、退租或作废。";
    }
  }
  if (message.includes("permission") || message.includes("row-level security")) {
    return "当前账号没有权限保存这条数据，请确认已经登录。";
  }
  return message || "操作失败，请稍后重试。";
}
