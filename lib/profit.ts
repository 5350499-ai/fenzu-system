import {
  BusinessDeposit,
  BusinessExpense,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom
} from "./business-data";

export type RangePreset = "thisMonth" | "lastMonth" | "last30Days" | "last3Months" | "last6Months" | "last12Months" | "custom";

export type DateRange = {
  start: string;
  end: string;
  label: string;
};

export type PropertyProfit = {
  property: BusinessProperty;
  income: number;
  expense: number;
  netProfit: number;
  unpaid: number;
  depositAmount: number;
  occupancy: number;
  vacantRooms: number;
  rentedRooms: number;
  rentableRooms: number;
  hasLoss: boolean;
  hasUnpaid: boolean;
  payments: BusinessRentPayment[];
  expenses: BusinessExpense[];
  deposits: BusinessDeposit[];
};

export const rangeOptions: { value: RangePreset; label: string }[] = [
  { value: "thisMonth", label: "本月" },
  { value: "lastMonth", label: "上月" },
  { value: "last30Days", label: "最近30天" },
  { value: "last3Months", label: "最近3个月" },
  { value: "last6Months", label: "最近6个月" },
  { value: "last12Months", label: "最近12个月" },
  { value: "custom", label: "自定义" }
];

export function getDateRange(preset: RangePreset, customStart?: string, customEnd?: string, now = new Date()): DateRange {
  const today = startOfDay(now);
  if (preset === "custom") {
    return {
      start: customStart || toDateInput(startOfMonth(today)),
      end: customEnd || toDateInput(today),
      label: "自定义"
    };
  }
  if (preset === "lastMonth") {
    const start = addMonths(startOfMonth(today), -1);
    const end = addDays(startOfMonth(today), -1);
    return { start: toDateInput(start), end: toDateInput(end), label: "上月" };
  }
  if (preset === "last30Days") {
    return { start: toDateInput(addDays(today, -29)), end: toDateInput(today), label: "最近30天" };
  }
  if (preset === "last3Months") return rollingMonths(today, 3, "最近3个月");
  if (preset === "last6Months") return rollingMonths(today, 6, "最近6个月");
  if (preset === "last12Months") return rollingMonths(today, 12, "最近12个月");
  return { start: toDateInput(startOfMonth(today)), end: toDateInput(endOfMonth(today)), label: "本月" };
}

export function calculatePropertyProfits(
  properties: BusinessProperty[],
  rooms: BusinessRoom[],
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[],
  deposits: BusinessDeposit[],
  range: DateRange
): PropertyProfit[] {
  return properties.map((property) => calculatePropertyProfit(property, rooms, payments, expenses, deposits, range));
}

export function calculatePropertyProfit(
  property: BusinessProperty,
  rooms: BusinessRoom[],
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[],
  deposits: BusinessDeposit[],
  range: DateRange
): PropertyProfit {
  const scopedRooms = rooms.filter((room) => room.propertyId === property.id && !isArchived(room.status));
  const rentableRooms = scopedRooms.filter((room) => !isStoppedStatus(room.status)).length;
  const rentedRooms = scopedRooms.filter((room) => isRentedStatus(room.status)).length;
  const vacantRooms = scopedRooms.filter((room) => isVacantStatus(room.status)).length;
  const scopedPayments = payments.filter((payment) => payment.propertyId === property.id && isMonthInRange(payment.rentMonth, range) && !isVoided(payment.notes));
  const scopedExpenses = expenses.filter((expense) => expense.propertyId === property.id && isMonthInRange(expense.expenseMonth, range) && !isVoided(expense.notes));
  const scopedDeposits = deposits.filter((deposit) => property.id === deposit.propertyId && isDateInRange(deposit.transactionDate, range) && !isVoided(deposit.notes));
  const income = sumBy(scopedPayments, "amountPaid");
  const expense = sumBy(scopedExpenses, "amount");
  const unpaid = sumBy(scopedPayments, "amountUnpaid");
  const depositAmount = scopedDeposits.reduce((total, deposit) => {
    if (deposit.type === "退还") return total - Number(deposit.amount || 0);
    if (deposit.type === "扣除") return total;
    return total + Number(deposit.amount || 0);
  }, 0);
  const netProfit = income - expense;

  return {
    property,
    income,
    expense,
    netProfit,
    unpaid,
    depositAmount,
    occupancy: rentableRooms ? Math.round((rentedRooms / rentableRooms) * 100) : 0,
    vacantRooms,
    rentedRooms,
    rentableRooms,
    hasLoss: netProfit < 0,
    hasUnpaid: unpaid > 0,
    payments: scopedPayments,
    expenses: scopedExpenses,
    deposits: scopedDeposits
  };
}

export function calculateTotals(stats: PropertyProfit[]) {
  const income = sumBy(stats, "income");
  const expense = sumBy(stats, "expense");
  const unpaid = sumBy(stats, "unpaid");
  const depositAmount = sumBy(stats, "depositAmount");
  const rentableRooms = sumBy(stats, "rentableRooms");
  const rentedRooms = sumBy(stats, "rentedRooms");
  return {
    income,
    expense,
    netProfit: income - expense,
    unpaid,
    depositAmount,
    rentableRooms,
    rentedRooms,
    vacantRooms: sumBy(stats, "vacantRooms"),
    occupancy: rentableRooms ? Math.round((rentedRooms / rentableRooms) * 100) : 0
  };
}

export function monthlyProfitRows(
  propertyId: string,
  payments: BusinessRentPayment[],
  expenses: BusinessExpense[],
  monthsBack = 12
) {
  const months = recentMonths(monthsBack);
  return months.map((month) => {
    const income = sumBy(payments.filter((item) => item.propertyId === propertyId && item.rentMonth === month && !isVoided(item.notes)), "amountPaid");
    const expense = sumBy(expenses.filter((item) => item.propertyId === propertyId && item.expenseMonth === month && !isVoided(item.notes)), "amount");
    return {
      month,
      income,
      expense,
      netProfit: income - expense
    };
  });
}

export function isMonthInRange(month: string, range: DateRange) {
  if (!month) return false;
  const date = month.length === 7 ? `${month}-01` : month;
  return isDateInRange(date, range);
}

export function isDateInRange(date: string, range: DateRange) {
  if (!date) return false;
  return date >= range.start && date <= range.end;
}

export function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function rollingMonths(today: Date, count: number, label: string): DateRange {
  const start = addMonths(startOfMonth(today), -(count - 1));
  return { start: toDateInput(start), end: toDateInput(endOfMonth(today)), label };
}

function recentMonths(count: number) {
  const start = startOfMonth(new Date());
  return Array.from({ length: count }, (_, index) => toMonthInput(addMonths(start, -index)));
}

function sumBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function isRentedStatus(status: string) {
  return ["已租", "即将退租"].includes(status);
}

function isVacantStatus(status: string) {
  return status === "空置" || status === "空房";
}

function isStoppedStatus(status: string) {
  return ["维修中", "暂停出租", "已归档"].includes(status);
}

function isArchived(status: string) {
  return status === "已归档";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]"));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMonthInput(date: Date) {
  return date.toISOString().slice(0, 7);
}
