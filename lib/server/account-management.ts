import "server-only";

import { randomUUID } from "crypto";
import {
  ACCOUNT_MODULES,
  emptyModulePermissions,
  emptySensitivePermissions,
  normalizeLoginIdentifier,
  type ModulePermission,
  type PropertyAccessMode,
  type SensitivePermissions
} from "@/lib/account-permissions";
import { AccountApiError, type AccountRequestContext, type AccountProfileRow, revokeAllAppSessions, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const OWNER_ID = "57b1a78b-d3fe-4e6f-bd9a-055ce1527936";

type RawModulePermission = Partial<ModulePermission> & { moduleKey?: string };
type RawSensitivePermissions = Partial<SensitivePermissions>;

export type AccountConfigurationInput = {
  username?: string;
  displayName?: string;
  mustChangePassword?: boolean;
  propertyAccessMode?: PropertyAccessMode;
  propertyIds?: string[];
  modulePermissions?: RawModulePermission[];
  sensitivePermissions?: RawSensitivePermissions;
};

export function requireText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new AccountApiError(`${label}不能为空。`);
  return text;
}

export function validatePassword(value: unknown, confirmation?: unknown) {
  const password = requireText(value, "密码");
  if (password.length < 8) throw new AccountApiError("密码至少需要8位。");
  if (confirmation !== undefined && password !== confirmation) throw new AccountApiError("两次输入的密码不一致。");
  return password;
}

export function normalizePermissions(input?: RawModulePermission[]) {
  const byKey = new Map((input || []).map((item) => [item.moduleKey, item]));
  return emptyModulePermissions().map((base) => {
    const source = byKey.get(base.moduleKey) || {};
    const canCreate = Boolean(source.canCreate);
    const canEdit = Boolean(source.canEdit);
    const canArchive = Boolean(source.canArchive);
    const canDelete = Boolean(source.canDelete);
    const canView = Boolean(source.canView || canCreate || canEdit || canArchive || canDelete);
    // Custom accounts cannot form a privilege-escalation chain in Phase 2.
    if (base.moduleKey === "accounts") {
      return { ...base };
    }
    return { moduleKey: base.moduleKey, canView, canCreate, canEdit, canArchive, canDelete };
  });
}

export function normalizeSensitivePermissions(input?: RawSensitivePermissions) {
  const normalized = { ...emptySensitivePermissions() };
  for (const key of Object.keys(normalized) as Array<keyof SensitivePermissions>) {
    normalized[key] = Boolean(input?.[key]);
  }
  // Phase 2 deliberately reserves account management to the fixed owner.
  normalized.canManageAccounts = false;
  return normalized;
}

function toDbSensitivePermissions(value: SensitivePermissions) {
  return {
    can_view_tenant_phone: value.canViewTenantPhone,
    can_view_tenant_wechat: value.canViewTenantWechat,
    can_view_tenant_id_number: value.canViewTenantIdNumber,
    can_view_tenant_notes: value.canViewTenantNotes,
    can_view_contract_files: value.canViewContractFiles,
    can_view_rent_files: value.canViewRentFiles,
    can_view_expense_files: value.canViewExpenseFiles,
    can_download_files: value.canDownloadFiles,
    can_upload_files: value.canUploadFiles,
    can_replace_files: value.canReplaceFiles,
    can_delete_files: value.canDeleteFiles,
    can_export_data: value.canExportData,
    can_view_profits: value.canViewProfits,
    can_view_partnership_settlement: value.canViewPartnershipSettlement,
    can_view_audit_logs: value.canViewAuditLogs,
    can_manage_accounts: false,
    can_manage_settings: value.canManageSettings
  };
}

function toClientSensitivePermissions(row: Record<string, boolean> | null) {
  const empty = emptySensitivePermissions();
  if (!row) return empty;
  return {
    canViewTenantPhone: Boolean(row.can_view_tenant_phone),
    canViewTenantWechat: Boolean(row.can_view_tenant_wechat),
    canViewTenantIdNumber: Boolean(row.can_view_tenant_id_number),
    canViewTenantNotes: Boolean(row.can_view_tenant_notes),
    canViewContractFiles: Boolean(row.can_view_contract_files),
    canViewRentFiles: Boolean(row.can_view_rent_files),
    canViewExpenseFiles: Boolean(row.can_view_expense_files),
    canDownloadFiles: Boolean(row.can_download_files),
    canUploadFiles: Boolean(row.can_upload_files),
    canReplaceFiles: Boolean(row.can_replace_files),
    canDeleteFiles: Boolean(row.can_delete_files),
    canExportData: Boolean(row.can_export_data),
    canViewProfits: Boolean(row.can_view_profits),
    canViewPartnershipSettlement: Boolean(row.can_view_partnership_settlement),
    canViewAuditLogs: Boolean(row.can_view_audit_logs),
    canManageAccounts: Boolean(row.can_manage_accounts),
    canManageSettings: Boolean(row.can_manage_settings)
  };
}

async function validatePropertyIds(ownerId: string, propertyIds: string[]) {
  const admin = getSupabaseAdmin();
  const uniqueIds = [...new Set(propertyIds.filter((value) => typeof value === "string" && value.trim()))];
  if (!uniqueIds.length) return [];
  const { data, error } = await admin
    .from("properties")
    .select("id")
    .eq("user_id", ownerId)
    .in("id", uniqueIds);
  if (error || (data || []).length !== uniqueIds.length) {
    throw new AccountApiError("存在无效或未授权的房源。", 400);
  }
  return uniqueIds;
}

async function usernameAvailable(username: string, exceptUserId?: string) {
  const admin = getSupabaseAdmin();
  let query = admin
    .from("account_auth_identities")
    .select("auth_user_id")
    .eq("normalized_username", username)
    .limit(1);
  if (exceptUserId) query = query.neq("auth_user_id", exceptUserId);
  const { data, error } = await query;
  if (error) throw new AccountApiError("账号检查失败，请稍后重试。", 500);
  return !data?.length;
}

async function savePermissionRows(userId: string, permissions: ModulePermission[]) {
  const admin = getSupabaseAdmin();
  const rows = permissions.map((item) => ({
    user_id: userId,
    module_key: item.moduleKey,
    can_view: item.canView,
    can_create: item.canCreate,
    can_edit: item.canEdit,
    can_archive: item.canArchive,
    can_delete: item.canDelete
  }));
  const { error } = await admin.from("user_permissions").upsert(rows, { onConflict: "user_id,module_key" });
  if (error) throw new AccountApiError("保存模块权限失败。", 500);
}

async function saveSensitiveRows(userId: string, permissions: SensitivePermissions) {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("user_sensitive_permissions")
    .upsert({ user_id: userId, ...toDbSensitivePermissions(permissions) }, { onConflict: "user_id" });
  if (error) throw new AccountApiError("保存敏感权限失败。", 500);
}

async function savePropertyAccess(userId: string, ownerId: string, mode: PropertyAccessMode, propertyIds: string[], actorUserId: string) {
  const admin = getSupabaseAdmin();
  const validIds = mode === "selected" ? await validatePropertyIds(ownerId, propertyIds) : [];
  const { error: deleteError } = await admin.from("user_property_access").delete().eq("user_id", userId);
  if (deleteError) throw new AccountApiError("保存房源范围失败。", 500);
  if (!validIds.length) return validIds;
  const { error: insertError } = await admin.from("user_property_access").insert(
    validIds.map((propertyId) => ({ user_id: userId, property_id: propertyId, created_by: actorUserId }))
  );
  if (insertError) throw new AccountApiError("保存房源范围失败。", 500);
  return validIds;
}

export async function createCustomAccount(context: AccountRequestContext, input: AccountConfigurationInput & { password: unknown; passwordConfirmation: unknown; status?: string }) {
  const username = normalizeLoginIdentifier(requireText(input.username, "登录账号"));
  const displayName = requireText(input.displayName, "显示名称");
  const password = validatePassword(input.password, input.passwordConfirmation);
  if (!(await usernameAvailable(username))) throw new AccountApiError("登录账号已存在，请使用其他账号。", 409);

  const mode: PropertyAccessMode = input.propertyAccessMode === "all" ? "all" : "selected";
  const permissions = normalizePermissions(input.modulePermissions);
  const sensitivePermissions = normalizeSensitivePermissions(input.sensitivePermissions);
  const status = input.status === "disabled" ? "disabled" : "active";
  const internalEmail = `account-${randomUUID()}@accounts.fenzu.invalid`;
  const admin = getSupabaseAdmin();

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true,
    ban_duration: status === "disabled" ? "876000h" : undefined,
    user_metadata: { account_kind: "custom" }
  });
  if (authError || !authData.user) throw new AccountApiError("创建登录账号失败，请稍后重试。", 500);

  const targetId = authData.user.id;
  try {
    const { error: profileError } = await admin.from("user_profiles").insert({
      auth_user_id: targetId,
      workspace_owner_id: context.profile.workspace_owner_id,
      username,
      display_name: displayName,
      account_type: "custom",
      status,
      property_access_mode: mode,
      must_change_password: Boolean(input.mustChangePassword),
      created_by: context.userId,
      updated_by: context.userId,
      disabled_at: status === "disabled" ? new Date().toISOString() : null,
      disabled_by: status === "disabled" ? context.userId : null
    });
    if (profileError) throw profileError;

    const { error: identityError } = await admin.from("account_auth_identities").insert({
      auth_user_id: targetId,
      normalized_username: username,
      auth_email: internalEmail,
      is_internal_email: true
    });
    if (identityError) throw identityError;

    await savePermissionRows(targetId, permissions);
    await saveSensitiveRows(targetId, sensitivePermissions);
    const propertyIds = await savePropertyAccess(targetId, context.profile.workspace_owner_id, mode, input.propertyIds || [], context.userId);

    await writeAuditLog(context, {
      actionType: "account_created",
      moduleKey: "accounts",
      entityType: "user_profile",
      entityId: targetId,
      afterData: { username, displayName, status, propertyAccessMode: mode, propertyIds, permissions, sensitivePermissions, mustChangePassword: Boolean(input.mustChangePassword) },
      description: `创建自定义账号：${displayName}`
    });

    return targetId;
  } catch (error) {
    await admin.auth.admin.deleteUser(targetId).catch(() => undefined);
    throw new AccountApiError(error instanceof Error ? "创建账号失败，已自动回滚登录账号。" : "创建账号失败。", 500);
  }
}

export async function updateCustomAccount(context: AccountRequestContext, targetId: string, input: AccountConfigurationInput) {
  if (targetId === OWNER_ID) throw new AccountApiError("主管理员账号不可修改。", 403);
  const admin = getSupabaseAdmin();
  const { data: beforeData, error: targetError } = await admin
    .from("user_profiles")
    .select("auth_user_id,workspace_owner_id,username,display_name,account_type,status,property_access_mode,must_change_password")
    .eq("auth_user_id", targetId)
    .maybeSingle();
  if (targetError || !beforeData || beforeData.account_type !== "custom") throw new AccountApiError("未找到可管理的自定义账号。", 404);

  const before = beforeData as Pick<AccountProfileRow, "auth_user_id" | "workspace_owner_id" | "username" | "display_name" | "account_type" | "status" | "property_access_mode" | "must_change_password">;
  const update: Record<string, unknown> = { updated_by: context.userId };
  let usernameChanged = false;
  if (input.username !== undefined) {
    const username = normalizeLoginIdentifier(requireText(input.username, "登录账号"));
    if (username !== normalizeLoginIdentifier(before.username)) {
      if (!(await usernameAvailable(username, targetId))) throw new AccountApiError("登录账号已存在，请使用其他账号。", 409);
      update.username = username;
      usernameChanged = true;
    }
  }
  if (input.displayName !== undefined) update.display_name = requireText(input.displayName, "显示名称");
  if (input.mustChangePassword !== undefined) update.must_change_password = Boolean(input.mustChangePassword);
  const mode: PropertyAccessMode = input.propertyAccessMode === "all" ? "all" : input.propertyAccessMode === "selected" ? "selected" : before.property_access_mode;
  if (input.propertyAccessMode !== undefined) update.property_access_mode = mode;

  if (Object.keys(update).length > 1) {
    const { error } = await admin.from("user_profiles").update(update).eq("auth_user_id", targetId);
    if (error) throw new AccountApiError("保存账号资料失败。", 500);
  }
  if (usernameChanged) {
    const { error } = await admin
      .from("account_auth_identities")
      .update({ normalized_username: update.username as string })
      .eq("auth_user_id", targetId);
    if (error) throw new AccountApiError("保存登录账号失败。", 500);
  }

  const changedPermissions = input.modulePermissions !== undefined;
  const changedSensitive = input.sensitivePermissions !== undefined;
  const changedProperties = input.propertyAccessMode !== undefined || input.propertyIds !== undefined;
  if (changedPermissions) await savePermissionRows(targetId, normalizePermissions(input.modulePermissions));
  if (changedSensitive) await saveSensitiveRows(targetId, normalizeSensitivePermissions(input.sensitivePermissions));
  let propertyIds: string[] | undefined;
  if (changedProperties) {
    propertyIds = await savePropertyAccess(targetId, before.workspace_owner_id, mode, input.propertyIds || [], context.userId);
    await revokeAllAppSessions(targetId, context.userId, "property_access_changed");
  }

  await writeAuditLog(context, {
    actionType: "account_updated",
    moduleKey: "accounts",
    entityType: "user_profile",
    entityId: targetId,
    beforeData: before,
    afterData: { ...update, propertyAccessMode: mode, propertyIds, permissionsChanged: changedPermissions, sensitivePermissionsChanged: changedSensitive },
    description: `更新自定义账号：${String(update.display_name || before.display_name)}`
  });

  if (changedPermissions) {
    await writeAuditLog(context, { actionType: "permissions_updated", moduleKey: "accounts", entityType: "user_profile", entityId: targetId, description: "修改模块权限" });
  }
  if (changedSensitive) {
    await writeAuditLog(context, { actionType: "sensitive_permissions_updated", moduleKey: "accounts", entityType: "user_profile", entityId: targetId, description: "修改敏感权限" });
  }
  if (changedProperties) {
    await writeAuditLog(context, { actionType: "property_access_updated", moduleKey: "accounts", entityType: "user_profile", entityId: targetId, description: "修改房源访问范围并撤销旧会话" });
  }
}

export function clientSensitivePermissions(row: Record<string, boolean> | null) {
  return toClientSensitivePermissions(row);
}
