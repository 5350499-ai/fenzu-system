// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { isArchivedTenantStatus } from "./tenant-archive.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { isEndedTenantStatus } from "./tenant-sorting.ts";

type DeepLinkTenant = { id: string; propertyId?: string; status?: string };

export type TenantDeepLinkPlan<T extends DeepLinkTenant> = {
  tenant: T;
  showArchived: boolean;
  page: number;
  expandCurrent: boolean;
  expandRetired: boolean;
  scrollTargetId: string;
  requiredPropertyId: string;
};

/**
 * Resolve view state before a reminder-driven tenant detail is rendered.
 * The result is ID-based and contains no DOM timing assumptions.
 */
export function planTenantDeepLink<T extends DeepLinkTenant>({
  tenantId,
  tenants,
  sortedTenants,
  pageSize
}: {
  tenantId: string;
  tenants: T[];
  sortedTenants: T[];
  pageSize: number;
}): TenantDeepLinkPlan<T> | null {
  const tenant = tenants.find((item) => item.id === tenantId);
  const index = sortedTenants.findIndex((item) => item.id === tenantId);
  if (!tenant || index < 0) return null;
  const showArchived = isArchivedTenantStatus(tenant.status || "");
  return {
    tenant,
    showArchived,
    page: Math.floor(index / Math.max(pageSize, 1)) + 1,
    expandCurrent: !showArchived && !isEndedTenantStatus(tenant.status || ""),
    expandRetired: !showArchived && isEndedTenantStatus(tenant.status || ""),
    scrollTargetId: tenantDeepLinkScrollTargetId(tenant.id),
    requiredPropertyId: tenant.propertyId || ""
  };
}

export function tenantDeepLinkScrollTargetId(tenantId: string) {
  return `tenant-deep-link-${encodeURIComponent(tenantId)}`;
}
