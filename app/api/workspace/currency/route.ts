import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireWorkspaceCurrencyPermission, writeAuditLog } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { DEFAULT_CURRENCY, normalizeCurrencyCode, type CurrencyCode } from "@/lib/currency";

async function readWorkspaceCurrency(workspaceOwnerId: string): Promise<CurrencyCode> {
  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("currency_code")
    .eq("auth_user_id", workspaceOwnerId)
    .maybeSingle();
  if (error) {
    if (error.code === "42703") return DEFAULT_CURRENCY;
    throw new Error("加载工作区货币失败");
  }
  return normalizeCurrencyCode(data?.currency_code);
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    return NextResponse.json({ currencyCode: await readWorkspaceCurrency(context.profile.workspace_owner_id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    await requireWorkspaceCurrencyPermission(context);
    const body = await parseJson(request) as { currencyCode?: unknown };
    const requested = normalizeCurrencyCode(body.currencyCode);
    if (typeof body.currencyCode !== "string" || requested !== body.currencyCode.toUpperCase()) {
      throw new AccountApiError("不支持的工作区货币。", 400, "unsupported_currency");
    }
    const before = await readWorkspaceCurrency(context.profile.workspace_owner_id);
    if (before === requested) return NextResponse.json({ ok: true, currencyCode: requested });
    const { error } = await getSupabaseAdmin()
      .from("user_profiles")
      .update({ currency_code: requested, updated_by: context.userId })
      .eq("auth_user_id", context.profile.workspace_owner_id)
      .eq("workspace_owner_id", context.profile.workspace_owner_id);
    if (error) throw new Error("保存工作区货币失败");
    await writeAuditLog(context, {
      actionType: "update_workspace_currency",
      moduleKey: "settings",
      entityType: "workspace_settings",
      entityId: context.profile.workspace_owner_id,
      beforeData: { currencyCode: before },
      afterData: { currencyCode: requested },
      description: "修改工作区显示货币（不转换历史金额）"
    });
    return NextResponse.json({ ok: true, currencyCode: requested });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
