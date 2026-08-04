import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, AccountApiError, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { validatePartnerPlanRows } from "@/lib/partners";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function lifecycleError(error: { message?: string }, fallback: string) {
  console.error("[partners] share lifecycle RPC failed", error);
  const message = error.message || "";
  if (message.includes("permission denied") || message.includes("42501")) return new AccountApiError(fallback, 500, "permission_denied");
  if (message.includes("range lower bound") || message.includes("overlap") || message.includes("100 percent")) return new AccountApiError(fallback, 409, "share_plan_conflict");
  if (message.includes("transaction") || message.includes("deadlock")) return new AccountApiError(fallback, 500, "transaction_failed");
  if (message.includes("Only future share plans")) return new AccountApiError("只能操作尚未生效的未来计划", 400);
  if (message.includes("does not exist")) return new AccountApiError("未来计划不存在或已被处理", 404);
  if (message.includes("Property does not belong")) return new AccountApiError("房源不存在或无权访问", 403);
  return new AccountApiError(fallback, 400);
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const propertyId = String(body.propertyId || "");
    const effectiveFrom = String(body.effectiveFrom || "");
    const rawRows = Array.isArray(body.percentages) ? body.percentages : [];
    if (!propertyId || !DATE_RE.test(effectiveFrom)) throw new AccountApiError("请选择合法的房源和生效日期", 400);
    if (effectiveFrom <= new Date().toISOString().slice(0, 10)) throw new AccountApiError("只能新增或替换未来比例计划", 400);
    const rows = rawRows.map((row) => {
      const value = row as Record<string, unknown>;
      return { partnerId: String(value.partnerId || ""), percentage: Number(value.percentage) };
    });
    const result = validatePartnerPlanRows(rows);
    if (!result.valid) throw new AccountApiError("参与合伙人比例合计必须为100%，且每位合伙人只能出现一次", 400);
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const { data: property } = await admin.from("properties").select("id").eq("id", propertyId).eq("user_id", ownerId).maybeSingle();
    if (!property) throw new AccountApiError("房源不存在或无权访问", 403);
    const { data: partners, error: partnersError } = await admin.from("partners").select("id,is_active,workspace_owner_id").eq("workspace_owner_id", ownerId).in("id", rows.map((row) => row.partnerId));
    if (partnersError || !partners || partners.length !== rows.length || partners.some((partner) => !partner.is_active)) throw new AccountApiError("比例只能配置给当前启用合伙人", 400);
    const { error } = await admin.rpc("replace_partner_property_share_plan", { p_workspace_owner_id: ownerId, p_property_id: propertyId, p_effective_from: effectiveFrom, p_rows: rows });
    if (error) throw lifecycleError(error, "比例计划保存失败，请稍后重试");
    await writeAuditLog(context, { actionType: "create_partner_share_plan", moduleKey: "settings", entityType: "property", entityId: propertyId, afterData: { effectiveFrom, percentages: rows }, description: "保存房源合伙比例计划" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const propertyId = String(body.propertyId || "");
    const effectiveFrom = String(body.effectiveFrom || "");
    if (!propertyId || !DATE_RE.test(effectiveFrom)) throw new AccountApiError("请选择要取消的未来比例计划", 400);
    const { error } = await getSupabaseAdmin().rpc("cancel_future_partner_share_plan", {
      p_workspace_owner_id: context.profile.workspace_owner_id,
      p_property_id: propertyId,
      p_effective_from: effectiveFrom
    });
    if (error) throw lifecycleError(error, "未来计划取消失败，请稍后重试");
    await writeAuditLog(context, { actionType: "cancel_partner_share_plan", moduleKey: "settings", entityType: "property", entityId: propertyId, afterData: { effectiveFrom }, description: "取消未来房源合伙比例计划" });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const propertyId = String(body.propertyId || "");
    const effectiveFrom = String(body.effectiveFrom || "");
    if (!propertyId || !DATE_RE.test(effectiveFrom)) throw new AccountApiError("璇疯緭鍏ユ柊鐨勭涓€涓瘮渚嬭捣濮嬫棩", 400);
    const { error } = await getSupabaseAdmin().rpc("adjust_first_partner_share_start_date", { p_workspace_owner_id: context.profile.workspace_owner_id, p_property_id: propertyId, p_new_effective_from: effectiveFrom, p_changed_by_account_id: context.userId });
    if (error) throw lifecycleError(error, "璋冩暣棣栦釜姣斾緥鏂规澶辫触锛岃绋嶅悗閲嶈瘯");
    await writeAuditLog(context, { actionType: "adjust_first_partner_share_start_date", moduleKey: "settings", entityType: "property", entityId: propertyId, afterData: { effectiveFrom }, description: "璋冩暣鎴挎簮棣栦釜鍒╂鼎姣斾緥璧峰鏃ユ湡" });
    return NextResponse.json({ ok: true, effectiveFrom });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
