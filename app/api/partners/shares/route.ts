import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, AccountApiError, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validatePartnerPercentages } from "@/lib/partners";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const propertyId = String(body.propertyId || "");
    const effectiveFrom = String(body.effectiveFrom || "");
    const rawRows = Array.isArray(body.percentages) ? body.percentages : [];
    if (!propertyId || !DATE_RE.test(effectiveFrom)) throw new AccountApiError("请选择合法的房源和生效日期", 400);
    if (effectiveFrom < new Date().toISOString().slice(0, 10)) throw new AccountApiError("生效日期不能早于今天", 400);
    const rows = rawRows.map((row) => {
      const value = row as Record<string, unknown>;
      return { partnerId: String(value.partnerId || ""), percentage: Number(value.percentage) };
    });
    const result = validatePartnerPercentages(rows.map((row) => row.percentage));
    if (!result.valid || rows.some((row) => !row.partnerId)) throw new AccountApiError("启用合伙人比例合计必须为100%，且每项需在0—100%之间", 400);
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: property } = await admin.from("properties").select("id").eq("id", propertyId).eq("user_id", ownerId).maybeSingle();
    if (!property) throw new AccountApiError("房源不存在或无权访问", 403);
    const { data: partners, error: partnersError } = await admin.from("partners").select("id,is_active,workspace_owner_id").eq("workspace_owner_id", ownerId).in("id", rows.map((row) => row.partnerId));
    if (partnersError || !partners || partners.length !== rows.length || partners.some((partner) => !partner.is_active)) throw new AccountApiError("比例只能配置给当前启用合伙人", 400);
    const { error } = await admin.rpc("replace_partner_property_share_plan", { p_workspace_owner_id: ownerId, p_property_id: propertyId, p_effective_from: effectiveFrom, p_rows: rows });
    if (error) throw new Error(error.message);
    await writeAuditLog(context, { actionType: "create_partner_share_plan", moduleKey: "settings", entityType: "property", entityId: propertyId, afterData: { effectiveFrom, percentages: rows }, description: "保存房源合伙比例计划" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
