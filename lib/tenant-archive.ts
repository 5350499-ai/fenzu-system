export function isArchivedTenantStatus(status = "") {
  return status === "已归档" || status.toLowerCase() === "archived";
}

export function filterTenantsByArchiveMode<T extends { status?: string }>(tenants: T[], archiveMode: boolean) {
  return tenants.filter((tenant) => archiveMode === isArchivedTenantStatus(tenant.status || ""));
}
