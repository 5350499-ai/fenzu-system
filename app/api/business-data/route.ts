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

function existingLookupColumns(table: string) {
  const columns: Record<string, string> = {
    properties: "id,notes",
    rooms: "id,status,notes,property_id",
    tenants: "id,status,property_id",
    contracts: "id,status,notes,property_id",
    rent_payments: "id,notes,property_id",
    expenses: "id,notes,property_id",
    deposits: "id,status,notes,property_id",
    tasks: "id,status,notes,property_id"
  };
  return columns[table] || "id,property_id";
}

type BusinessOperation = {
  action: "create" | "update" | "delete";
  row?: Record<string, unknown>;
  id?: string;
};

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const body = await parseJson(request) as { key?: string; operations?: BusinessOperation[] };
    const resource = body.key ? resources[body.key] : null;
    if (!resource) throw new AccountApiError("不支持的业务数据类型。", 400);
    if (!Array.isArray(body.operations)) throw new AccountApiError("页面版本已更新，请刷新后重试。", 400);
    const operations = body.operations.filter((operation) => operation && ["create", "update", "delete"].includes(operation.action));
    const client = getSupabaseAuthVerifier(context.accessToken);
    const lookupIds = [...new Set(operations
      .filter((operation) => operation.action !== "create")
      .map((operation) => String(operation.id || operation.row?.id || ""))
      .filter(Boolean))];
    const lookupColumns = existingLookupColumns(resource.table);
    const { data: existingData, error: lookupError } = lookupIds.length
      ? await client.from(resource.table).select(lookupColumns).in("id", lookupIds)
      : { data: [], error: null };
    if (lookupError) throw new AccountApiError("读取目标记录失败，请稍后重试。", 500);
    const existingRows = (existingData || []) as unknown as Array<Record<string, unknown>>;
    const existing = new Map(existingRows.map((row) => [String(row.id), row]));
    const savedRows: Array<{ id: string }> = [];

    for (const operation of operations) {
      const row = operation.row || {};
      const id = String(operation.id || row.id || "");
      if (!id) throw new AccountApiError("记录ID不能为空。", 400);

      if (operation.action === "create") {
        await requireModulePermission(context, resource.module, "create");
        const propertyId = resource.propertyColumn === "id" ? id : row[resource.propertyColumn];
        await requirePropertyAccess(context, propertyId as string | undefined);
        if (row.user_id !== context.profile.workspace_owner_id) throw new AccountApiError("业务数据空间不正确。", 403);
        const { data, error } = await client.from(resource.table).insert(row).select("id");
        if (error) throw new AccountApiError(error.code === "42501" ? "没有权限执行此操作。" : "保存失败，请稍后重试。", error.code === "42501" ? 403 : 500);
        savedRows.push(...((data || []) as Array<{ id: string }>));
        continue;
      }

      const before = existing.get(id);
      if (!before) throw new AccountApiError("目标记录不存在或无权访问。", 404);
      const oldPropertyId = resource.propertyColumn === "id" ? id : before[resource.propertyColumn];
      await requirePropertyAccess(context, oldPropertyId as string | undefined);

      if (operation.action === "delete") {
        await requireModulePermission(context, resource.module, "delete");
        const { error } = await client.from(resource.table).delete().eq("id", id);
        if (error) throw new AccountApiError("没有权限删除该记录。", 403);
        continue;
      }

      const permission = isArchiveChange(before, row) ? "archive" : "edit";
      await requireModulePermission(context, resource.module, permission);
      const newPropertyId = resource.propertyColumn === "id" ? id : row[resource.propertyColumn];
      await requirePropertyAccess(context, newPropertyId as string | undefined);
      if (row.user_id !== context.profile.workspace_owner_id) throw new AccountApiError("业务数据空间不正确。", 403);
      const { data, error } = await client.from(resource.table).update(row).eq("id", id).select("id");
      if (error) throw new AccountApiError(error.code === "42501" ? "没有权限执行此操作。" : "保存失败，请稍后重试。", error.code === "42501" ? 403 : 500);
      savedRows.push(...((data || []) as Array<{ id: string }>));
    }

    return NextResponse.json({ ok: true, rows: savedRows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
