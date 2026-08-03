import type { BusinessRentPayment } from "./business-data";

export function rentCollectionRemaining(payment: BusinessRentPayment) {
  const due = Number(payment.amountDue || 0);
  const paid = Number(payment.amountPaid || 0);
  if (due > 0) return Math.max(due - paid, 0);
  return Math.max(Number(payment.amountUnpaid || 0), 0);
}
