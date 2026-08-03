import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, writeAuditLog, AccountApiError } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request, true);
    const { id } = await params;
    const body = await parseJson(request) as Record<string, unknown>;
    const admin = getSupabaseAdmin();
    const { data: partner, error: readError } = await admin.from("partners").select("*").eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (readError || !partner) throw new AccountApiError("合伙人不存在", 404);
    const update: Record<string, unknown> = {};
    if (body.displayName !== undefined) {
      const value = String(body.displayName).trim();
      if (!value) throw new AccountApiError("合伙人名称不能为空", 400);
      update.display_name = value;
    }
    if (body.sortOrder !== undefined) update.sort_order = Math.max(0, Math.trunc(Number(body.sortOrder)));
    if (body.isActive !== undefined) {
      const isActive = Boolean(body.isActive);
      if (!isActive && partner.is_active) {
        const { count } = await admin.from("partners").select("id", { count: "exact", head: true }).eq("workspace_owner_id", context.profile.workspace_owner_id).eq("is_active", true);
        if ((count || 0) <= 1) throw new AccountApiError("至少保留1位启用合伙人", 400);
      }
      update.is_active = isActive;
    }
    if (!Object.keys(update).length) return NextResponse.json({ ok: true });
    const { error } = await admin.from("partners").update(update).eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id);
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
    const { data: partner } = await admin.from("partners").select("id,legacy_code,is_active").eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (!partner) throw new AccountApiError("合伙人不存在", 404);
    if (partner.legacy_code) throw new AccountApiError("历史A/B合伙人只能停用，不能删除", 400);
    const { count } = await admin.from("partner_property_shares").select("id", { count: "exact", head: true }).eq("partner_id", id);
    if ((count || 0) > 0) throw new AccountApiError("已有房源比例记录，只能停用", 400);
    const { error } = await admin.from("partners").delete().eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id);
    if (error) throw new Error(error.message);
    await writeAuditLog(context, { actionType: "delete_partner", moduleKey: "settings", entityType: "partner", entityId: id, description: "删除无业务关联的动态合伙人" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
