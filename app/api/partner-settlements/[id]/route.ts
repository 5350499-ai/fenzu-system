import { NextResponse } from "next/server";
import { apiErrorResponse, AccountApiError, parseJson, requireActiveAccount, requirePropertyAccess, requireSettlementHistoryAccess, requireSettlementReversalAccess } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function settlementErrorResponse(error: unknown) {
  if (error instanceof AccountApiError && error.status === 401) {
    return NextResponse.json({ error: "登录已失效，请重新登录。", code: "unauthorized" }, { status: 401 });
  }
  if (error instanceof AccountApiError && error.status === 403) {
    return NextResponse.json({ error: "当前账号没有查看或撤销合伙结算的权限。", code: "forbidden" }, { status: 403 });
  }
  return apiErrorResponse(error);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request);
    requireSettlementReversalAccess(context);
    const { id } = await params;
    const body = await parseJson(request) as Record<string, unknown>;
    const reason = String(body.reason || "").trim();
    if (!reason) throw new AccountApiError("撤销结算必须填写原因。", 400, "reversal_reason_required");
    const admin = getSupabaseAdmin();
    const { data: batch, error: batchError } = await admin.from("partner_settlement_batches").select("property_id,status").eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (batchError || !batch) throw new AccountApiError("结算快照不存在。", 404, "settlement_not_found");
    await requirePropertyAccess(context, batch.property_id);
    const { error } = await admin.rpc("reverse_partner_settlement", {
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
    return settlementErrorResponse(error);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await requireActiveAccount(request);
    await requireSettlementHistoryAccess(context);
    const { id } = await params;
    const admin = getSupabaseAdmin();
    const { data: batch, error } = await admin.from("partner_settlement_batches").select("*").eq("id", id).eq("workspace_owner_id", context.profile.workspace_owner_id).maybeSingle();
    if (error || !batch) throw new AccountApiError("结算快照不存在。", 404, "settlement_not_found");
    await requirePropertyAccess(context, batch.property_id);
    const [partners, segments, transfers] = await Promise.all([
      admin.from("partner_settlement_partner_snapshots").select("*").eq("settlement_batch_id", id).order("partner_display_name_snapshot"),
      admin.from("partner_settlement_segment_snapshots").select("*").eq("settlement_batch_id", id).order("segment_start"),
      admin.from("partner_settlement_transfer_snapshots").select("*").eq("settlement_batch_id", id).order("created_at")
    ]);
    return NextResponse.json({ batch, partners: partners.data || [], segments: segments.data || [], transfers: transfers.data || [] });
  } catch (error) {
    return settlementErrorResponse(error);
  }
}
