export const TENANT_DELETE_CONFIRMATION = "DELETE";
export const TENANT_PERMANENT_DELETE_DISABLED = "TENANT_PERMANENT_DELETE_DISABLED";

/** The current tenant schema models an occupant, not an unassigned contact. */
export function isTenantPermanentDeleteEnabled() {
  return false;
}

export function tenantPermanentDeleteDisabledMessage() {
  return "\u79df\u5ba2\u8bb0\u5f55\u4ec5\u652f\u6301\u9000\u79df\u548c\u5f52\u6863\uff0c\u5386\u53f2\u4e1a\u52a1\u8bb0\u5f55\u4f1a\u88ab\u4fdd\u7559\u3002\u5f53\u524d\u7248\u672c\u4e0d\u652f\u6301\u6c38\u4e45\u5220\u9664\u79df\u5ba2\u3002";
}

export type TenantBusinessDataSummary = {
  roomRelation: number;
  contracts: number;
  rentPayments: number;
  deposits: number;
  utilityAllocations: number;
  tasks: number;
  tenantNotes: number;
  tenantDocuments: number;
  contractFiles: number;
  checkInRequests: number;
};

export function emptyTenantBusinessDataSummary(): TenantBusinessDataSummary {
  return { roomRelation: 0, contracts: 0, rentPayments: 0, deposits: 0, utilityAllocations: 0, tasks: 0, tenantNotes: 0, tenantDocuments: 0, contractFiles: 0, checkInRequests: 0 };
}

export function tenantHasBusinessData(summary: TenantBusinessDataSummary) {
  return Object.values(summary).some((count) => count > 0);
}

export function tenantDeleteBusinessDataMessage(status = "") {
  const retired = /已退租|已归档|已结束|ended|archived/i.test(status);
  return retired
    ? "该租客已有历史业务数据，无法永久删除。可以将该租客归档，历史收款、押金、合同和结算记录将继续保留。"
    : "该租客已有业务数据，无法永久删除。请根据实际情况先办理退租，之后可以归档。历史账目不会被删除。";
}

export function isTenantDeleteConfirmed(value: string) {
  return value.trim() === TENANT_DELETE_CONFIRMATION;
}

export function tenantDeletePermissionMessage(canDelete: boolean) {
  if (canDelete && !isTenantPermanentDeleteEnabled()) return tenantPermanentDeleteDisabledMessage();
  return canDelete ? "" : "当前账号没有永久删除租客的权限。";
}
