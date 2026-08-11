import type { BusinessRentPayment } from "./business-data";
// @ts-expect-error Node's strip-types test runner needs an explicit TypeScript extension here.
import { rentPeriodRemainingAmount } from "./rent-period-state.ts";

export function rentCollectionRemaining(payment: BusinessRentPayment) {
  return rentPeriodRemainingAmount(payment);
}
