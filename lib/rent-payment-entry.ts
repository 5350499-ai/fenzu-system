import type { BusinessRentPayment } from "./business-data";

/** A rent row is financial state only when at least one rent amount is meaningful. */
export function hasMeaningfulRentState(payment: Pick<BusinessRentPayment, "amountDue" | "amountPaid" | "amountUnpaid">) {
  return [payment.amountDue, payment.amountPaid, payment.amountUnpaid].some((value) => Number(value || 0) > 0);
}

/** Resolve the rent amount shared by validation and the payment payload. */
export function normalizeRentPaymentAmount(input: {
  isRent: boolean;
  isHistoricalEdit: boolean;
  isCollectionPayment: boolean;
  paymentStatus?: string;
  amountDue: unknown;
  amountPaid: unknown;
}) {
  if (!input.isRent || input.isHistoricalEdit || input.isCollectionPayment) {
    return Number(input.amountPaid ?? 0);
  }
  if (input.paymentStatus === "未收") return 0;
  return Number(input.amountDue ?? 0);
}
