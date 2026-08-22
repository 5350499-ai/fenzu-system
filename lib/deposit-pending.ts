import type { BusinessDeposit, BusinessTenant } from "./business-data";

export type PendingDepositScope = ReadonlySet<string> | null;

/**
 * Canonical selector for the deposit-pending metric and its detail view.
 * Linked rent deposits remain valid detail records when they are pending;
 * the general deposits list may still hide them outside the pending view.
 */
export function selectPendingDepositRecords(
  deposits: BusinessDeposit[],
  tenants: BusinessTenant[],
  propertyScope: PendingDepositScope = null
) {
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));

  return deposits.filter((deposit) => {
    if (propertyScope !== null && !propertyScope.has(deposit.propertyId)) return false;
    const tenant = tenantById.get(deposit.tenantId);
    return Boolean(
      tenant?.status.includes("已退租") &&
      deposit.status === "待退" &&
      !deposit.notes?.includes("[已作废]")
    );
  });
}

export function selectPendingDepositTenantIds(
  deposits: BusinessDeposit[],
  tenants: BusinessTenant[],
  propertyScope: PendingDepositScope = null
) {
  return new Set(selectPendingDepositRecords(deposits, tenants, propertyScope).map((deposit) => deposit.tenantId));
}
