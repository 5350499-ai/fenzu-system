import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, parseJson, requireActiveAccount, requireModulePermission, requirePropertyAccess } from "@/lib/server/account-auth";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";

const resources: Record<string, { table: string; module: string; propertyColumn: string }> = {
  "business-properties": { table: "properties", module: "properties", propertyColumn: "id" },
  "v1-properties": { table: "properties", module: "properties", propertyColumn: "id" },
  "business-rooms": { table: "rooms", module: "rooms", propertyColumn: "property_id" },
  "business-tenants": { table: "tenants", module: "tenants", propertyColumn: "property_id" },
  "business-contracts": { table: "contracts", module: "tenants", propertyColumn: "property_id" },
  "business-rent-payments": { table: "rent_payments", module: "rent_payments", propertyColumn: "property_id" },
  "business-expenses": { table: "expenses", module: "expenses", propertyColumn: "property_id" },
  "business-deposits": { table: "deposits", module: "deposits", propertyColumn: "property_id" },
  "v1-tasks": { table: "tasks", module: "tasks", propertyColumn: "property_id" }
};

function isArchiveChange(before: Record<string, unknown> | undefined, after: Record<string, unknown>) {
  const oldStatus = String(before?.status || "");
  const newStatus = String(after.status || "");
  const oldNotes = String(before?.notes || "");
  const newNotes = String(after.notes || "");
  const words = ["已归档", "已退租", "已结束", "已作废"];
  return (oldStatus !== newStatus && words.some((word) => oldStatus.includes(word) || newStatus.includes(word)))
    || (oldNotes !== newNotes && words.some((word) => oldNotes.includes(word) || newNotes.includes(word)));
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { key?: string; rows?: Array<Record<string, unknown>>; removedIds?: string[] };
    const resource = body.key ? resources[body.key] : null;
    if (!resource) throw new AccountApiError("不支持的业务数据类型。", 400);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const removedIds = Array.isArray(body.removedIds) ? body.removedIds.filter((id): id is string => typeof id === "string") : [];
    const client = getSupabaseAuthVerifier(context.accessToken);
    const ids = rows.map((row) => String(row.id || "")).filter(Boolean);
    const lookupIds = [...new Set([...ids, ...removedIds])];
    const lookupColumns = resource.table === "properties" ? "id,notes" : resource.table === "tenants" ? "id,status,property_id" : "id,status,notes,property_id";
    const { data: existingData, error: lookupError } = lookupIds.length
      ? await client.from(resource.table).select(lookupColumns).in("id", lookupIds)
      : { data: [], error: null };
    if (lookupError) throw new AccountApiError("读取现有记录失败。", 403);
    const existingRows = (existingData || []) as unknown as Array<Record<string, unknown>>;
    const existing = new Map(existingRows.map((row) => [String(row.id), row]));

    if (removedIds.length) {
      await requireModulePermission(context, resource.module, "delete");
      for (const id of removedIds) {
        const before = existing.get(id);
        const propertyId = resource.propertyColumn === "id" ? id : before?.[resource.propertyColumn];
        await requirePropertyAccess(context, propertyId as string | undefined);
      }
      const { error } = await client.from(resource.table).delete().in("id", removedIds);
      if (error) throw new AccountApiError("没有权限删除该记录。", 403);
    }

    for (const row of rows) {
      const id = String(row.id || "");
      const before = existing.get(id);
      const action = before ? (isArchiveChange(before, row) ? "archive" : "edit") : "create";
      await requireModulePermission(context, resource.module, action);
      const propertyId = resource.propertyColumn === "id" ? id : row[resource.propertyColumn];
      await requirePropertyAccess(context, propertyId as string | undefined);
      if (row.user_id !== context.profile.workspace_owner_id) throw new AccountApiError("业务数据空间不正确。", 403);
    }
    if (rows.length) {
      const { error } = await client.from(resource.table).upsert(rows);
      if (error) throw new AccountApiError("没有权限保存该记录。", 403);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
