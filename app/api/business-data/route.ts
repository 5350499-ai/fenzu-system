import { NextResponse } from "next/server";
import { AccountApiError, apiErrorResponse, isFreeSingleAccount, parseJson, requireActiveAccount, requireModulePermission, requirePropertyAccess } from "@/lib/server/account-auth";
import { FREE_SINGLE_PROPERTY_LIMIT, FREE_SINGLE_ROOM_LIMIT } from "@/lib/free-single";
import { getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { ensureFreeSingleMember, freeSingleAttribution } from "@/lib/server/free-single-member";

const resources: Record<string, { table: string; module: string; propertyColumn: string }> = {
  "business-properties": { table: "properties", module: "properties", propertyColumn: "id" },
  "v1-properties": { table: "properties", module: "properties", propertyColumn: "id" },
  "business-rooms": { table: "rooms", module: "rooms", propertyColumn: "property_id" },
  "business-tenants": { table: "tenants", module: "tenants", propertyColumn: "property_id" },
  "business-contracts": { table: "contracts", module: "tenants", propertyColumn: "property_id" },
  "business-rent-payments": { table: "rent_payments", module: "rent_payments", propertyColumn: "property_id" },
  "business-viewing-appointments": { table: "viewing_appointments", module: "properties", propertyColumn: "property_id" },
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
    viewing_appointments: "id,notes,property_id",
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

async function enforceFreeSingleQuota(context: Awaited<ReturnType<typeof requireActiveAccount>>, resource: { table: string }, row: Record<string, unknown>, existing?: Record<string, unknown>) {
  if (!isFreeSingleAccount(context)) return;
  const client = getSupabaseAuthVerifier(context.accessToken);
  if (resource.table === "properties") {
    const wasArchived = String(existing?.notes || "").startsWith("[已归档]");
    const willBeArchived = String(row.notes || "").startsWith("[已归档]");
    if (existing && (!wasArchived || willBeArchived)) return;
    const { data, error } = await client
      .from("properties")
      .select("id,notes")
      .eq("user_id", context.profile.workspace_owner_id);
    if (error) throw new AccountApiError("无法检查免费版房源额度，请稍后重试。", 500);
    const activeCount = (data || []).filter((property) => !String(property.notes || "").startsWith("[已归档]")).length;
    if (activeCount >= FREE_SINGLE_PROPERTY_LIMIT) throw new AccountApiError("免费版最多可管理 5 套房源。", 409);
  }
  if (resource.table === "rooms") {
    const wasArchived = String(existing?.status || "").includes("已归档");
    const willBeArchived = String(row.status || "").includes("已归档");
    if (existing && (!wasArchived || willBeArchived)) return;
    const propertyId = String(row.property_id || existing?.property_id || "");
    if (!propertyId) throw new AccountApiError("房间缺少所属房源。", 400);
    const { data, error } = await client
      .from("rooms")
      .select("id,status")
      .eq("user_id", context.profile.workspace_owner_id)
      .eq("property_id", propertyId);
    if (error) throw new AccountApiError("无法检查免费版房间额度，请稍后重试。", 500);
    const activeCount = (data || []).filter((room) => !String(room.status || "").includes("已归档")).length;
    if (activeCount >= FREE_SINGLE_ROOM_LIMIT) throw new AccountApiError("免费版每套房源最多可管理 10 间房间。", 409);
  }
}

async function normalizeFreeSingleBusinessRow(context: Awaited<ReturnType<typeof requireActiveAccount>>, row: Record<string, unknown>) {
  if (!isFreeSingleAccount(context)) return row;
  const next = { ...row };
  const self = await ensureFreeSingleMember(context);
  // Keep the established attribution model: a free account has one real,
  // account-linked member instead of a fake A/B or display-only fallback.
  if ("received_by" in next) next.received_by = freeSingleAttribution(self);
  if ("paid_by" in next) next.paid_by = freeSingleAttribution(self);
  return next;
}

export async function POST(request: Request) {
  try {
    const body = await parseJson(request) as { key?: string; operations?: BusinessOperation[]; ownerOnly?: boolean };
    const paymentUpdateRequiresOwner = body.key === "business-rent-payments"
      && body.operations?.some((operation) => operation?.action === "update");
    const context = await requireActiveAccount(request, body.ownerOnly === true);
    // Existing delegated accounts keep the historical owner-only payment edit
    // boundary. A free-single account manages only its own workspace and may
    // use the normal rent-payment edit permission.
    if (paymentUpdateRequiresOwner && context.profile.account_type !== "owner" && !isFreeSingleAccount(context)) {
      throw new AccountApiError("没有权限编辑收款记录。", 403);
    }
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
      const row = await normalizeFreeSingleBusinessRow(context, operation.row || {});
      const id = String(operation.id || row.id || "");
      if (!id) throw new AccountApiError("记录ID不能为空。", 400);

      if (operation.action === "create") {
        await requireModulePermission(context, resource.module, "create");
        await enforceFreeSingleQuota(context, resource, row);
        const propertyId = resource.propertyColumn === "id" ? id : row[resource.propertyColumn];
        await requirePropertyAccess(context, propertyId as string | undefined);
        if (row.user_id !== context.profile.workspace_owner_id) throw new AccountApiError("业务数据空间不正确。", 403);
        const { data, error } = await client.from(resource.table).insert(row).select("id");
        if (error) throw new AccountApiError(error.code === "42501" ? "没有权限执行此操作。" : "保存失败，请稍后重试。", error.code === "42501" ? 403 : 500);
        savedRows.push(...((data || []) as Array<{ id: string }>));
        if (resource.table === "properties" && isFreeSingleAccount(context)) await ensureFreeSingleMember(context);
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
      await enforceFreeSingleQuota(context, resource, row, before);
      const newPropertyId = resource.propertyColumn === "id" ? id : row[resource.propertyColumn];
      await requirePropertyAccess(context, newPropertyId as string | undefined);
      if (row.user_id !== context.profile.workspace_owner_id) throw new AccountApiError("业务数据空间不正确。", 403);
      const { data, error } = await client.from(resource.table).update(row).eq("id", id).select("id");
      if (error) throw new AccountApiError(error.code === "42501" ? "没有权限执行此操作。" : "保存失败，请稍后重试。", error.code === "42501" ? 403 : 500);
      if (!data || data.length !== 1) throw new AccountApiError(resource.table === "rent_payments" ? "收款记录未更新，请刷新后重试。" : "记录未更新，请刷新后重试。", 409);
      savedRows.push(...((data || []) as Array<{ id: string }>));
    }

    return NextResponse.json({ ok: true, rows: savedRows });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
