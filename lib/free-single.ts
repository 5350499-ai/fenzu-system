import { FREE_SINGLE_LIMITS } from "./account-capabilities";

export const FREE_SINGLE_PLAN = "free_single" as const;
export const MANAGED_PLAN = "managed" as const;
export type AccountPlan = typeof FREE_SINGLE_PLAN | typeof MANAGED_PLAN;

export const FREE_SINGLE_PROPERTY_LIMIT = FREE_SINGLE_LIMITS.maxProperties;
export const FREE_SINGLE_ROOM_LIMIT = FREE_SINGLE_LIMITS.maxRoomsPerProperty;

export function isFreeSinglePlan(value: unknown): value is typeof FREE_SINGLE_PLAN {
  return value === FREE_SINGLE_PLAN;
}

export function isFreeSingleRestrictedModule(moduleKey: string) {
  return ["attachments", "archive", "accounts"].includes(moduleKey);
}

export function isFreeSingleRestrictedSensitivePermission(key: string) {
  return [
    "can_view_contract_files", "can_view_rent_files", "can_view_expense_files", "can_view_attachments",
    "can_download_files", "can_upload_files", "can_replace_files", "can_delete_files",
    "can_manage_accounts"
  ].includes(key);
}
