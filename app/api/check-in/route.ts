import { NextResponse } from "next/server";
import {
  AccountApiError,
  apiErrorResponse,
  parseJson,
  requireActiveAccount,
  requireModulePermission,
  requirePropertyAccess
} from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

type CheckInBody = {
  clientRequestId?: string;
  propertyId?: string;
  roomId?: string;
  tenantName?: string;
  phone?: string;
  documentNumber?: string;
  rentAmount?: number;
  depositAmount?: number;
  paymentDay?: number;
  paymentDate?: string;
  coverageStartDate?: string;
  coverageEndDate?: string;
  contractEndDate?: string;
  depositStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  receivedBy?: string;
  notes?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | undefined, optional = false) {
  return optional && !value ? true : Boolean(value && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as CheckInBody;
    const rentAmount = Number(body.rentAmount ?? 0);
    const depositAmount = Number(body.depositAmount ?? 0);
    const paymentDay = Number(body.paymentDay ?? 20);

    if (!body.clientRequestId || !uuidPattern.test(body.clientRequestId)
      || !body.propertyId || !uuidPattern.test(body.propertyId)
      || !body.roomId || !uuidPattern.test(body.roomId)
      || !body.tenantName?.trim()
      || !validDate(body.paymentDate)
      || !validDate(body.coverageStartDate)
      || !validDate(body.coverageEndDate)
      || !validDate(body.contractEndDate, true)
      || body.coverageEndDate! < body.coverageStartDate!
      || !Number.isFinite(rentAmount) || rentAmount < 0
      || !Number.isFinite(depositAmount) || depositAmount < 0
      || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
      throw new AccountApiError("请检查入住资料。", 400);
    }

    await requireModulePermission(context, "check_in", "create");
    await requireModulePermission(context, "tenants", "create");
    await requireModulePermission(context, "rooms", "edit");
    await requireModulePermission(context, "rent_payments", "create");
    if (depositAmount > 0) await requireModulePermission(context, "deposits", "create");
    await requirePropertyAccess(context, body.propertyId);

    const client = getSupabaseAuthVerifier(context.accessToken);
    const { data, error } = await client.rpc("create_atomic_check_in", {
      p_client_request_id: body.clientRequestId,
      p_property_id: body.propertyId,
      p_room_id: body.roomId,
      p_tenant_name: body.tenantName.trim(),
      p_phone: body.phone?.trim() || null,
      p_document_number: body.documentNumber?.trim() || null,
      // A room selection never supplies a rent value. The only rent input is
      // the amount the user entered for this check-in.
      p_monthly_rent: rentAmount,
      p_rent_amount: rentAmount,
      p_deposit_amount: depositAmount,
      p_payment_day: paymentDay,
      p_payment_date: body.paymentDate,
      p_coverage_start_date: body.coverageStartDate,
      p_coverage_end_date: body.coverageEndDate,
      p_contract_end_date: body.contractEndDate || null,
      p_deposit_status: body.depositStatus || "已收",
      p_payment_status: body.paymentStatus || "已收",
      p_payment_method: body.paymentMethod || "转账",
      p_received_by: body.receivedBy || "A",
      p_notes: body.notes?.trim() || null
    });

    if (error) {
      if (error.code === "42501") throw new AccountApiError("没有权限执行一键入住。", 403);
      if (error.code === "22023") throw new AccountApiError("请检查入住资料。", 400);
      if (error.message.includes("room unavailable")) throw new AccountApiError("该房间当前无法入住。", 409);
      if (error.message.includes("check-in request conflict")) throw new AccountApiError("检测到未完成的入住记录，请由管理员继续补齐。", 409);
      throw new AccountApiError("保存入住失败，本次没有产生任何记录。", 500);
    }

    return NextResponse.json({ ok: true, result: data });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
