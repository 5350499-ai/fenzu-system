export const ACCOUNT_MODULES = [
  { key: "home", label: "首页", actions: ["view"] },
  { key: "properties", label: "房源", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "rooms", label: "房间", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "tenants", label: "租客", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "rent_payments", label: "收款", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "expenses", label: "支出", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "reminders", label: "提醒中心", actions: ["view"] },
  { key: "analytics", label: "统计", actions: ["view"] },
  { key: "profits", label: "利润", actions: ["view"] },
  { key: "partnership_settlement", label: "合伙结算", actions: ["view"] },
  { key: "attachments", label: "附件", actions: ["view", "create", "edit", "archive", "delete"] },
  { key: "audit_logs", label: "操作日志", actions: ["view"] },
  { key: "settings", label: "系统设置", actions: ["view"] },
  { key: "accounts", label: "账号管理", actions: ["view"] }
] as const;

export type AccountModuleKey = (typeof ACCOUNT_MODULES)[number]["key"];
export type PermissionAction = "view" | "create" | "edit" | "archive" | "delete";

export type ModulePermission = {
  moduleKey: AccountModuleKey;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
};

export const SENSITIVE_PERMISSIONS = [
  { key: "canViewTenantPhone", label: "查看租客电话" },
  { key: "canViewTenantWechat", label: "查看租客微信" },
  { key: "canViewTenantIdNumber", label: "查看租客证件号码" },
  { key: "canViewTenantNotes", label: "查看租客备注" },
  { key: "canViewContractFiles", label: "查看合同附件" },
  { key: "canViewRentFiles", label: "查看收款附件" },
  { key: "canViewExpenseFiles", label: "查看支出附件" },
  { key: "canDownloadFiles", label: "下载附件" },
  { key: "canUploadFiles", label: "上传附件" },
  { key: "canReplaceFiles", label: "替换附件" },
  { key: "canDeleteFiles", label: "删除附件" },
  { key: "canExportData", label: "导出数据" },
  { key: "canViewProfits", label: "查看利润" },
  { key: "canViewPartnershipSettlement", label: "查看合伙结算" },
  { key: "canViewAuditLogs", label: "查看操作日志" },
  { key: "canManageAccounts", label: "管理账号" },
  { key: "canManageSettings", label: "修改系统设置" }
] as const;

export type SensitivePermissionKey = (typeof SENSITIVE_PERMISSIONS)[number]["key"];
export type SensitivePermissions = Record<SensitivePermissionKey, boolean>;

export type PropertyAccessMode = "all" | "selected";

export function emptyModulePermissions(): ModulePermission[] {
  return ACCOUNT_MODULES.map((module) => ({
    moduleKey: module.key,
    canView: false,
    canCreate: false,
    canEdit: false,
    canArchive: false,
    canDelete: false
  }));
}

export function emptySensitivePermissions(): SensitivePermissions {
  return SENSITIVE_PERMISSIONS.reduce((permissions, item) => {
    permissions[item.key] = false;
    return permissions;
  }, {} as SensitivePermissions);
}

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
