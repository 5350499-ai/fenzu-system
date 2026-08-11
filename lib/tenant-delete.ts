export const TENANT_DELETE_CONFIRMATION = "DELETE";

export function isTenantDeleteConfirmed(value: string) {
  return value.trim() === TENANT_DELETE_CONFIRMATION;
}

export function tenantDeletePermissionMessage(canDelete: boolean) {
  return canDelete ? "" : "当前账号没有永久删除租客的权限。";
}
