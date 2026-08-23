import type { BusinessExpense, BusinessRentPayment } from "./business-data";

export function isManualIncomeLedgerVisible(payment: BusinessRentPayment) {
  const isRentLedger = !payment.incomeType || payment.incomeType === "房租收入" || payment.incomeType === "续交房租";
  return isRentLedger || Number(payment.amountPaid || 0) > 0;
}

export function isManualExpenseLedgerVisible(expense: BusinessExpense) {
  return Number(expense.amount || 0) > 0;
}
