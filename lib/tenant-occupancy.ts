import type { BusinessTenant } from "./business-data";

export function occupantCountForTenant(tenant: BusinessTenant) {
  const count = Number(tenant.occupantCount);
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

export function sumOccupants(tenants: BusinessTenant[]) {
  return tenants.reduce((total, tenant) => total + occupantCountForTenant(tenant), 0);
}
