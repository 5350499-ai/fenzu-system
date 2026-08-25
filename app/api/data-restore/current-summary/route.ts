import { NextResponse } from "next/server";
import { apiErrorResponse, requireActiveAccount, requireRestorePreviewReadAccess } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

async function countRows(admin: ReturnType<typeof getSupabaseAdmin>, table: string, column: string, ownerId: string) {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true }).eq(column, ownerId);
  if (error) throw new Error(`读取恢复预览计数失败：${table}`);
  return count || 0;
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    requireRestorePreviewReadAccess(context);
    const admin = getSupabaseAdmin();
    const ownerId = context.profile.workspace_owner_id;
    const [partners, partnerShares, partnerNameHistory, checkInRequests, tenantCreateRequests, accounts] = await Promise.all([
      countRows(admin, "partners", "workspace_owner_id", ownerId),
      countRows(admin, "partner_property_shares", "workspace_owner_id", ownerId),
      countRows(admin, "partner_name_history", "workspace_owner_id", ownerId),
      countRows(admin, "check_in_requests", "workspace_owner_id", ownerId),
      countRows(admin, "tenant_create_requests", "workspace_owner_id", ownerId),
      countRows(admin, "user_profiles", "workspace_owner_id", ownerId)
    ]);
    return NextResponse.json({ partners, partnerShares, partnerNameHistory, checkInRequests, tenantCreateRequests, accountProjectionCount: accounts });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
