import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, AccountApiError, writeAuditLog, isFreeSingleAccount } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function cleanName(value: unknown) {
  const name = String(value || "").trim();
  if (!name) throw new AccountApiError("合伙人名称不能为空", 400);
  if (name.length > 80) throw new AccountApiError("合伙人名称不能超过80个字符", 400);
  return name;
}

function lifecycleError(error: { message?: string }, fallback: string) {
  console.error("[partners] partner lifecycle RPC failed", error);
  const message = error.message || "";
  if (message.includes("effective or historical")) return new AccountApiError("已有当前或历史比例方案，只能停用", 400);
  if (message.includes("Legacy partners")) return new AccountApiError("历史A/B合伙人只能停用，不能删除", 400);
  if (message.includes("Account-linked")) return new AccountApiError("已绑定账号的合伙人不能删除", 400);
  if (message.includes("at least one active")) return new AccountApiError("至少保留1位启用合伙人", 400);
  return new AccountApiError(fallback, 400);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request);
    const { id } = await params;
    const body = await parseJson(request) as Record<string, unknown>;
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: partner, error: readError } = await admin.from("partners").select("*").eq("id", id).eq("workspace_owner_id", ownerId).maybeSingle();
    if (readError || !partner) throw new AccountApiError("合伙人不存在", 404);
    if (isFreeSingleAccount(context)) {
      const keys = Object.keys(body);
      if (partner.linked_account_id !== context.userId || keys.length !== 1 || keys[0] !== "displayName") {
        throw new AccountApiError("免费版只能修改本人的显示名称。", 403, "free_single_self_member_only");
      }
      const nextDisplayName = cleanName(body.displayName);
      if (nextDisplayName !== partner.display_name) {
        const { error: renameError } = await admin.rpc("rename_partner_with_history", { p_workspace_owner_id: ownerId, p_partner_id: id, p_new_display_name: nextDisplayName, p_changed_by_account_id: context.userId });
        if (renameError) throw new Error(renameError.message);
        await writeAuditLog(context, { actionType: "rename_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: { displayName: partner.display_name }, afterData: { displayName: nextDisplayName }, description: "修改本人成员名称" });
      }
      return NextResponse.json({ ok: true });
    }
    if (context.profile.account_type !== "owner") throw new AccountApiError("没有权限管理合伙成员。", 403);

    if (body.isActive !== undefined && !Boolean(body.isActive) && partner.is_active) {
      const futureResult = await admin.from("partner_property_shares").select("property_id", { count: "exact" }).eq("partner_id", id).gt("effective_from", new Date().toISOString().slice(0, 10));
      if (futureResult.error) throw new Error("检查未来比例计划失败");
      if ((futureResult.count || 0) > 0 && body.cancelFuturePlans !== true) {
        throw new AccountApiError(`该合伙人存在${futureResult.count}条未来比例计划，请确认停用并取消这些计划`, 409);
      }
      const { error } = await admin.rpc("deactivate_partner_with_future_cleanup", {
        p_workspace_owner_id: ownerId,
        p_partner_id: id,
        p_cancel_future_plans: body.cancelFuturePlans === true
      });
      if (error) throw lifecycleError(error, "停用合伙人失败，请稍后重试");
      await writeAuditLog(context, { actionType: "deactivate_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: partner, afterData: { isActive: false, cancelFuturePlans: body.cancelFuturePlans === true }, description: "停用合伙人" });
      return NextResponse.json({ ok: true });
    }

    const update: Record<string, unknown> = {};
    const nextDisplayName = body.displayName !== undefined ? cleanName(body.displayName) : undefined;
    if (body.sortOrder !== undefined) {
      const sortOrder = Number(body.sortOrder);
      if (!Number.isFinite(sortOrder)) throw new AccountApiError("排序必须是数字", 400);
      update.sort_order = Math.max(0, Math.trunc(sortOrder));
    }
    if (body.isActive !== undefined) {
      const isActive = Boolean(body.isActive);
      if (isActive && !partner.is_active) {
        const { count, error } = await admin.from("partners").select("id", { count: "exact", head: true }).eq("workspace_owner_id", ownerId).eq("is_active", true);
        if (error) throw new Error("检查合伙人数失败");
        if ((count || 0) >= 10) throw new AccountApiError("启用合伙人最多10位", 400);
      }
      update.is_active = isActive;
    }
    if (nextDisplayName !== undefined && nextDisplayName !== partner.display_name) {
      const { error: renameError } = await admin.rpc("rename_partner_with_history", { p_workspace_owner_id: ownerId, p_partner_id: id, p_new_display_name: nextDisplayName, p_changed_by_account_id: context.userId });
      if (renameError) throw new Error(renameError.message);
    }
    if (!Object.keys(update).length) {
      if (nextDisplayName !== undefined && nextDisplayName !== partner.display_name) await writeAuditLog(context, { actionType: "rename_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: { displayName: partner.display_name }, afterData: { displayName: nextDisplayName }, description: "修改合伙人名称" });
      return NextResponse.json({ ok: true });
    }
    const { error } = await admin.from("partners").update(update).eq("id", id).eq("workspace_owner_id", ownerId);
    if (error) throw new Error(error.message);
    await writeAuditLog(context, { actionType: "update_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: partner, afterData: update, description: "修改动态合伙人" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: partner, error: readError } = await admin.from("partners").select("id,legacy_code,is_active,linked_account_id").eq("id", id).eq("workspace_owner_id", ownerId).maybeSingle();
    if (readError || !partner) throw new AccountApiError("合伙人不存在", 404);
    if (isFreeSingleAccount(context)) throw new AccountApiError("普通 Beta 用户暂不开放合伙成员管理。", 403, "ordinary_beta_partner_disabled");
    if (context.profile.account_type !== "owner") throw new AccountApiError("没有权限管理合伙成员。", 403);
    const { error } = await admin.rpc("delete_partner_with_future_cleanup", { p_workspace_owner_id: ownerId, p_partner_id: id });
    if (error) throw lifecycleError(error, "删除合伙人失败，请稍后重试");
    await writeAuditLog(context, { actionType: "delete_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: partner, description: "删除无业务关联的合伙人" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
