import type { BusinessRentPayment } from "./business-data";

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Keep date-only form values as calendar strings; never pass them through Date/UTC. */
export function normalizeLocalDate(value?: string) {
  if (!value) return "";
  return LOCAL_DATE_RE.test(value) ? value : "";
}

export function validateRentPaymentDates(payment: Pick<BusinessRentPayment, "coverageStartDate" | "coverageEndDate">) {
  const start = normalizeLocalDate(payment.coverageStartDate);
  const end = normalizeLocalDate(payment.coverageEndDate);
  if (start && end && start > end) return "租金覆盖开始日期不能晚于结束日期。";
  return "";
}

/** Build an edit patch while preserving immutable identity and untouched fields. */
export function buildRentPaymentEditPayload(original: BusinessRentPayment, draft: BusinessRentPayment) {
  return {
    ...draft,
    id: original.id,
    createdAt: original.createdAt,
    rentMonth: original.rentMonth,
    paymentDate: normalizeLocalDate(draft.paymentDate),
    coverageStartDate: normalizeLocalDate(draft.coverageStartDate),
    coverageEndDate: normalizeLocalDate(draft.coverageEndDate)
  } satisfies BusinessRentPayment;
}

export function idSuffix(id?: string) {
  return id ? id.slice(-8) : "";
}
