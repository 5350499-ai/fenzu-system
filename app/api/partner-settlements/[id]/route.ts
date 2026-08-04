import { NextResponse } from "next/server";
import { apiErrorResponse, AccountApiError, parseJson, requireActiveAccount, requireSensitivePermission } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request, true);
    const { id } = await params;
    const body = await parseJson(request) as Record<string, unknown>;
    const reason = String(body.reason || "").trim();
    if (!reason) throw new AccountApiError("撤销结算必须填写原因。", 400, "reversal_reason_required");
    const { error } = await getSupabaseAdmin().rpc("reverse_partner_settlement", {
      p_workspace_owner_id: context.profile.workspace_owner_id,
      p_batch_id: id,
      p_reversed_by_account_id: context.userId,
      p_reason: reason
    });
    if (error) {
      console.error("[partner-settlements] reverse RPC failed", error);
      throw new AccountApiError("撤销结算失败，请稍后重试。", 409, "settlement_reversal_failed");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request);
    await requireSensitivePermission(context, "can_view_partnership_settlement");
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data: batch, error } = await admin.from("partner_settlement_batches").select("*").eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (error || !batch) throw new AccountApiError("结算快照不存在。", 404, "settlement_not_found");
    const [partners, segments, transfers] = await Promise.all([
      admin.from("partner_settlement_partner_snapshots").select("*").eq("settlement_batch_id", id).order("partner_display_name_snapshot"),
      admin.from("partner_settlement_segment_snapshots").select("*").eq("settlement_batch_id", id).order("segment_start"),
      admin.from("partner_settlement_transfer_snapshots").select("*").eq("settlement_batch_id", id).order("created_at")
    ]);
    return NextResponse.json({ batch, partners: partners.data || [], segments: segments.data || [], transfers: transfers.data || [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
