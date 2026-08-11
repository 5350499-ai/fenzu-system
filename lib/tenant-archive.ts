export function isArchivedTenantStatus(status = "") {
  return status === "已归档" || status.toLowerCase() === "archived";
}

export function filterTenantsByArchiveMode<T extends { status?: string }>(tenants: T[], archiveMode: boolean) {
  return tenants.filter((tenant) => archiveMode === isArchivedTenantStatus(tenant.status || ""));
}

export function archiveModeForTenantDeepLink<T extends { id: string; status?: string }>(tenants: T[], tenantId: string) {
  const target = tenants.find((tenant) => tenant.id === tenantId);
  return target ? isArchivedTenantStatus(target.status || "") : null;
}
