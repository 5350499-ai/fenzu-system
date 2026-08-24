import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, isFreeSingleAccount, parseJson, requireActiveAccount, requireModulePermission, requirePropertyAccess } from "@/lib/server/account-auth";
import { ensureFreeSingleMember, freeSingleAttribution } from "@/lib/server/free-single-member";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { finishServerTiming, markServerTiming, startServerTiming } from "@/lib/server/save-latency-timing";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^\d{4}-\d{2}-\d{2}$/;
type Body = { clientRequestId?: string; propertyId?: string; roomId?: string; name?: string; phone?: string; wechat?: string; source?: string; status?: string; monthlyRent?: number; occupantCount?: number; paymentDay?: number; contractStartDate?: string; contractEndDate?: string; coverageStartDate?: string; coverageEndDate?: string; paymentDate?: string; rentAmount?: number; depositAmount?: number; paymentStatus?: string; paymentMethod?: string; receivedBy?: string; notes?: string };
const validDate = (value: unknown, optional = false) => optional && !value ? true : typeof value === "string" && date.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

export async function POST(request: Request) {
  const timing = startServerTiming(request, "tenant-create");
  try {
    const context = await requireActiveAccount(request);
    markServerTiming(timing, "authEnd");
    const body = await parseJson(request) as Body;
    const rentAmount = Number(body.rentAmount ?? 0);
    const depositAmount = Number(body.depositAmount ?? 0);
    const monthlyRent = Number(body.monthlyRent ?? rentAmount);
    const occupantCount = Number(body.occupantCount ?? 1);
    const paymentDay = Number(body.paymentDay ?? 20);
    const paymentStatus = body.paymentStatus === "未收" ? "未收" : "已收";
    const meaningfulPayment = rentAmount > 0;
    if (!body.clientRequestId || !uuid.test(body.clientRequestId) || !body.propertyId || !uuid.test(body.propertyId) || !body.roomId || !uuid.test(body.roomId)
      || !body.name?.trim() || !validDate(body.contractStartDate) || !validDate(body.contractEndDate, true)
      || !validDate(body.coverageStartDate) || !validDate(body.coverageEndDate) || !validDate(body.paymentDate)
      || body.coverageEndDate! < body.coverageStartDate! || !Number.isFinite(rentAmount) || rentAmount < 0
      || !Number.isFinite(depositAmount) || depositAmount < 0 || !Number.isFinite(monthlyRent) || monthlyRent < 0
      || !Number.isInteger(occupantCount) || occupantCount < 1 || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31
      || !body.receivedBy?.trim()) throw new AccountApiError("请检查租客资料。", 400);
    await requireModulePermission(context, "tenants", "create");
    await requireModulePermission(context, "rooms", "edit");
    if (meaningfulPayment) await requireModulePermission(context, "rent_payments", "create");
    if (depositAmount > 0) await requireModulePermission(context, "deposits", "create");
    await requirePropertyAccess(context, body.propertyId);
    let receivedBy = body.receivedBy.trim();
    if (isFreeSingleAccount(context)) receivedBy = freeSingleAttribution(await ensureFreeSingleMember(context));
    else {
      const { data, error } = await getSupabaseAdmin().from("partners").select("id,legacy_code").eq("workspace_owner_id", context.profile.workspace_owner_id).eq("is_active", true);
      if (error || !(data || []).some((partner) => partner.id === receivedBy || partner.legacy_code === receivedBy)) throw new AccountApiError("请选择当前有效的收款归属。", 400);
    }
    const client = getSupabaseAuthVerifier(context.accessToken);
    markServerTiming(timing, "rpcStart");
    const { data, error } = await client.rpc("create_tenant_atomic", {
      p_client_request_id: body.clientRequestId, p_property_id: body.propertyId, p_room_id: body.roomId,
      p_tenant_name: body.name.trim(), p_phone: body.phone?.trim() || null, p_wechat: body.wechat?.trim() || null,
      p_source: body.source?.trim() || "其他", p_tenant_status: body.status === "空置" ? "空置" : "在租",
      p_monthly_rent: monthlyRent, p_occupant_count: occupantCount, p_payment_day: paymentDay,
      p_contract_start_date: body.contractStartDate, p_contract_end_date: body.contractEndDate || null,
      p_coverage_start_date: body.coverageStartDate, p_coverage_end_date: body.coverageEndDate,
      p_payment_date: body.paymentDate, p_rent_amount: rentAmount, p_deposit_amount: depositAmount,
      p_payment_status: paymentStatus, p_payment_method: body.paymentMethod || "转账", p_received_by: receivedBy, p_notes: body.notes?.trim() || null
    });
    markServerTiming(timing, "rpcEnd");
    if (error) {
      if (error.code === "42501") throw new AccountApiError("没有权限新增租客。", 403);
      if (error.code === "22023") throw new AccountApiError("请检查租客资料。", 400);
      if (error.code === "23505") throw new AccountApiError("新增租客请求冲突，请刷新后确认。", 409);
      if (error.message.includes("room unavailable")) throw new AccountApiError("该房间当前无法使用。", 409);
      throw new AccountApiError("新增租客失败，本次没有产生任何记录。", 500);
    }
    return finishServerTiming(NextResponse.json({ ok: true, result: data }), timing);
  } catch (error) { return finishServerTiming(apiErrorResponse(error), timing); }
}
