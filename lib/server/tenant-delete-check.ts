import "server-only";

import { AccountApiError, type AccountRequestContext } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { emptyTenantBusinessDataSummary, tenantDeleteBusinessDataMessage, tenantHasBusinessData, type TenantBusinessDataSummary } from "@/lib/tenant-delete";

type TenantRow = { id: string; status?: string | null; room_id?: string | null };

const tenantRelations: Array<{ table: string; column: string; key: keyof TenantBusinessDataSummary }> = [
  { table: "contracts", column: "tenant_id", key: "contracts" },
  { table: "rent_payments", column: "tenant_id", key: "rentPayments" },
  { table: "deposits", column: "tenant_id", key: "deposits" },
  { table: "utility_allocations", column: "tenant_id", key: "utilityAllocations" },
  { table: "tasks", column: "tenant_id", key: "tasks" },
  { table: "tenant_notes", column: "tenant_id", key: "tenantNotes" },
  { table: "tenant_documents", column: "tenant_id", key: "tenantDocuments" },
  { table: "contract_files", column: "tenant_id", key: "contractFiles" },
  { table: "check_in_requests", column: "tenant_id", key: "checkInRequests" }
];

export async function inspectTenantBusinessData(context: AccountRequestContext, tenant: TenantRow): Promise<TenantBusinessDataSummary> {
  const summary = emptyTenantBusinessDataSummary();
  if (tenant.room_id) summary.roomRelation = 1;
  const admin = getSupabaseAdmin();
  for (const relation of tenantRelations) {
    const ownerColumn = relation.table === "check_in_requests" ? "workspace_owner_id" : "user_id";
    const { count, error } = await admin.from(relation.table).select("id", { count: "exact", head: true }).eq(relation.column, tenant.id).eq(ownerColumn, context.profile.workspace_owner_id);
    if (error) throw new AccountApiError("暂时无法确认该租客是否存在历史业务数据，请稍后重试。", 503, "TENANT_DELETE_CHECK_FAILED");
    summary[relation.key] = count || 0;
  }
  return summary;
}

export async function assertTenantHasNoBusinessData(context: AccountRequestContext, tenant: TenantRow) {
  const summary = await inspectTenantBusinessData(context, tenant);
  if (tenantHasBusinessData(summary)) throw new AccountApiError(tenantDeleteBusinessDataMessage(String(tenant.status || "")), 409, "TENANT_HAS_BUSINESS_DATA");
  return summary;
}
