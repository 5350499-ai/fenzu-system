import type { BusinessContract, BusinessDeposit, BusinessRentPayment, BusinessRoom, BusinessTenant } from "./business-data";

export type TenantCreateResult = {
  clientRequestId: string;
  tenant: BusinessTenant;
  room: BusinessRoom;
  contract: BusinessContract;
  rentPayment: BusinessRentPayment | null;
  deposit: BusinessDeposit | null;
  idempotentReplay: boolean;
};

/** A synchronous guard; React state alone cannot stop two rapid mobile taps. */
export function createTenantCreateSubmissionGuard() {
  let active = false;
  return {
    async run<T>(action: () => Promise<T>) {
      if (active) return { started: false as const };
      active = true;
      try {
        return { started: true as const, value: await action() };
      } finally {
        active = false;
      }
    }
  };
}
