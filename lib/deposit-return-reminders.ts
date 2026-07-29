import type { BusinessDeposit, BusinessTenant } from "./business-data";

/**
 * Deposit-return follow-up is only meaningful after the related tenancy has
 * ended. This deliberately uses the recorded deposit amount and never
 * derives an amount from rent payments or a tenant's monthly rent.
 */
export function pendingDepositReturnRecords(
  deposits: BusinessDeposit[],
  tenants: BusinessTenant[]
) {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  return deposits.filter((deposit) => {
    const tenant = tenantById.get(deposit.tenantId);
    return Boolean(
      tenant?.status === "已退租" &&
      deposit.status === "待退" &&
      Number(deposit.amount) > 0 &&
      !isVoidedDeposit(deposit.notes)
    );
  });
}

export function isVoidedDeposit(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}
