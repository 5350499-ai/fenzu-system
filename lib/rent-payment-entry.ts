import type { BusinessRentPayment } from "./business-data";

/** A rent row is financial state only when at least one rent amount is meaningful. */
export function hasMeaningfulRentState(payment: Pick<BusinessRentPayment, "amountDue" | "amountPaid" | "amountUnpaid">) {
  return [payment.amountDue, payment.amountPaid, payment.amountUnpaid].some((value) => Number(value || 0) > 0);
}
