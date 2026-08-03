import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, AccountApiError, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function cleanName(value: unknown) {
  const name = String(value || "").trim();
  if (!name) throw new AccountApiError("合伙人名称不能为空", 400);
  if (name.length > 80) throw new AccountApiError("合伙人名称不能超过80个字符", 400);
  return name;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request, true);
    const { id } = await params;
    const body = await parseJson(request) as Record<string, unknown>;
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: partner, error: readError } = await admin.from("partners").select("*").eq("id", id).eq("workspace_owner_id", ownerId).maybeSingle();
    if (readError || !partner) throw new AccountApiError("合伙人不存在", 404);

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
      if (error) throw new AccountApiError(error.message, 400);
      await writeAuditLog(context, { actionType: "deactivate_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: partner, afterData: { isActive: false, cancelFuturePlans: body.cancelFuturePlans === true }, description: "停用合伙人" });
      return NextResponse.json({ ok: true });
    }

    const update: Record<string, unknown> = {};
    if (body.displayName !== undefined) update.display_name = cleanName(body.displayName);
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
        if ((count || 0) >= 5) throw new AccountApiError("启用合伙人最多5位", 400);
      }
      update.is_active = isActive;
    }
    if (!Object.keys(update).length) return NextResponse.json({ ok: true });
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
    const context = await requireActiveAccount(request, true);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: partner, error: readError } = await admin.from("partners").select("id,legacy_code,is_active,linked_account_id").eq("id", id).eq("workspace_owner_id", ownerId).maybeSingle();
    if (readError || !partner) throw new AccountApiError("合伙人不存在", 404);
    const { error } = await admin.rpc("delete_partner_with_future_cleanup", { p_workspace_owner_id: ownerId, p_partner_id: id });
    if (error) throw new AccountApiError(error.message, 400);
    await writeAuditLog(context, { actionType: "delete_partner", moduleKey: "settings", entityType: "partner", entityId: id, beforeData: partner, description: "删除无业务关联的合伙人" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
