import { emptyModulePermissions } from "@/lib/account-permissions";
import { clientSensitivePermissions } from "@/lib/server/account-management";
import { createDataExportPayload, type DataExportPayload } from "@/lib/data-export";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

function rows(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function text(value: unknown, fallback = "") { return typeof value === "string" ? value : fallback; }

function nullableText(value: unknown) { const result = text(value); return result || null; }

function toCamelKey(key: string) { return key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase()); }

function toExportRows(value: unknown) {
  return rows(value).map((row) => Object.fromEntries(Object.entries(row).map(([key, item]) => [toCamelKey(key), item])));
}

async function readRows(admin: AdminClient, table: string, ownerColumn: string, ownerId: string) {
  const { data, error } = await admin.from(table).select("*").eq(ownerColumn, ownerId);
  if (error) {
    const failure = new Error(`读取表 ${table} 失败`);
    Object.assign(failure, { stage: "database_read", schema: "public", table, recordCount: 0, supabaseResponse: error });
    throw failure;
  }
  return data || [];
}

async function readTable<T extends { data: unknown; error: unknown }>(table: string, query: PromiseLike<T>) {
  const result = await query;
  if (result.error) {
    const failure = new Error(`读取表 ${table} 失败`);
    Object.assign(failure, { stage: "database_read", schema: "public", table, recordCount: 0, supabaseResponse: result.error });
    throw failure;
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function loadServerBackupData(admin: AdminClient, ownerId: string): Promise<Record<string, unknown>> {
  const [properties, rooms, tenants, contracts, rentPayments, expenses, deposits, viewingAppointments, tasks, partners, partnerShares, partnerNameHistory, settlementBatches] = await Promise.all([
    readRows(admin, "properties", "user_id", ownerId), readRows(admin, "rooms", "user_id", ownerId), readRows(admin, "tenants", "user_id", ownerId),
    readRows(admin, "contracts", "user_id", ownerId), readRows(admin, "rent_payments", "user_id", ownerId), readRows(admin, "expenses", "user_id", ownerId),
    readRows(admin, "deposits", "user_id", ownerId), readRows(admin, "viewing_appointments", "user_id", ownerId), readRows(admin, "tasks", "user_id", ownerId),
    readRows(admin, "partners", "workspace_owner_id", ownerId), readRows(admin, "partner_property_shares", "workspace_owner_id", ownerId), readRows(admin, "partner_name_history", "workspace_owner_id", ownerId),
    readRows(admin, "partner_settlement_batches", "workspace_owner_id", ownerId)
  ]);
  const batchIds = settlementBatches.map((batch) => String(batch.id));
  const partnerSnapshots = batchIds.length ? await readTable("partner_settlement_partner_snapshots", admin.from("partner_settlement_partner_snapshots").select("*").in("settlement_batch_id", batchIds)) : [];
  const segmentSnapshots = batchIds.length ? await readTable("partner_settlement_segment_snapshots", admin.from("partner_settlement_segment_snapshots").select("*").in("settlement_batch_id", batchIds)) : [];
  const transferSnapshots = batchIds.length ? await readTable("partner_settlement_transfer_snapshots", admin.from("partner_settlement_transfer_snapshots").select("*").in("settlement_batch_id", batchIds)) : [];
  const group = (items: Array<Record<string, unknown>>) => items.reduce((map, row) => {
    const key = String(row.settlement_batch_id); const list = map.get(key) || []; list.push(row); map.set(key, list); return map;
  }, new Map<string, Record<string, unknown>[]>());
  const partnerByBatch = group(partnerSnapshots as Array<Record<string, unknown>>);
  const segmentByBatch = group(segmentSnapshots as Array<Record<string, unknown>>);
  const transferByBatch = group(transferSnapshots as Array<Record<string, unknown>>);
  const profiles = await readTable("user_profiles", admin.from("user_profiles").select("auth_user_id,username,display_name,account_type,status,property_access_mode,must_change_password,last_login_at,last_activity_at,disabled_at").eq("workspace_owner_id", ownerId).order("created_at", { ascending: true })) as Array<Record<string, unknown>>;
  const permissions = await readTable("user_permissions", admin.from("user_permissions").select("user_id,module_key,can_view,can_create,can_edit,can_archive,can_delete")) as Array<Record<string, unknown>>;
  const sensitive = await readTable("user_sensitive_permissions", admin.from("user_sensitive_permissions").select("*")) as Array<Record<string, unknown>>;
  const access = await readTable("user_property_access", admin.from("user_property_access").select("user_id,property_id")) as Array<Record<string, unknown>>;
  const identities = await readTable("account_auth_identities", admin.from("account_auth_identities").select("auth_user_id,auth_email,is_internal_email")) as Array<Record<string, unknown>>;
  const audit = await readTable("audit_logs", admin.from("audit_logs").select("id,log_category,actor_user_id,actor_username,actor_display_name,action_type,module_key,entity_type,entity_id,before_data,after_data,description,success,created_at").eq("success", true).order("created_at", { ascending: false }).limit(1000)) as Array<Record<string, unknown>>;
  const userIds = new Set(profiles.map((profile) => String(profile.auth_user_id)));
  const accessByUser = new Map<string, string[]>();
  access.forEach((row) => {
    const userId = String(row.user_id);
    if (!userIds.has(userId)) return;
    accessByUser.set(userId, [...(accessByUser.get(userId) || []), String(row.property_id)]);
  });
  const identityByUser = new Map(identities.map((row) => [String(row.auth_user_id), row]));
  const latestAction = new Map<string, string>();
  const auditLogs = audit.filter((row) => !row.actor_user_id || userIds.has(String(row.actor_user_id))).map((row) => toExportRows([row])[0]);
  auditLogs.forEach((row) => {
    const actorId = text(row.actorUserId);
    if (actorId && !latestAction.has(actorId)) latestAction.set(actorId, text(row.createdAt));
  });
  const sensitiveByUser = new Map(sensitive.map((row) => [String(row.user_id), row]));
  const accounts = profiles.map((profile) => {
    const userId = String(profile.auth_user_id);
    const permissionRows = new Map(permissions.filter((row) => String(row.user_id) === userId).map((row) => [String(row.module_key), row]));
    const identity = identityByUser.get(userId);
    return {
      id: userId, username: profile.username, displayName: profile.display_name, accountType: profile.account_type, status: profile.status,
      propertyAccessMode: profile.property_access_mode, propertyIds: accessByUser.get(userId) || [], mustChangePassword: profile.must_change_password,
      lastLoginAt: profile.last_login_at, lastActivityAt: profile.last_activity_at, latestActionAt: latestAction.get(userId) || null,
      email: identity?.is_internal_email ? null : identity?.auth_email || null, emailBound: Boolean(identity && !identity.is_internal_email), disabledAt: profile.disabled_at,
      modulePermissions: emptyModulePermissions().map((base) => {
        const row = permissionRows.get(base.moduleKey);
        return { moduleKey: base.moduleKey, canView: Boolean(row?.can_view), canCreate: Boolean(row?.can_create), canEdit: Boolean(row?.can_edit), canArchive: Boolean(row?.can_archive), canDelete: Boolean(row?.can_delete) };
      }),
      sensitivePermissions: clientSensitivePermissions((sensitiveByUser.get(userId) || null) as Record<string, boolean> | null)
    };
  });
  return {
    properties: toExportRows(properties), rooms: toExportRows(rooms), tenants: toExportRows(tenants), contracts: toExportRows(contracts), rentPayments: toExportRows(rentPayments), expenses: toExportRows(expenses), deposits: toExportRows(deposits), viewingAppointments: toExportRows(viewingAppointments), tasks: toExportRows(tasks), partners: toExportRows(partners), partnerShares: toExportRows(partnerShares), partnerNameHistory: toExportRows(partnerNameHistory), propertyHistory: [],
    settlementBatches: toExportRows(settlementBatches), settlementSnapshots: settlementBatches.map((batch) => ({ batch: toExportRows([batch])[0], partners: toExportRows(partnerByBatch.get(String(batch.id)) || []), segments: toExportRows(segmentByBatch.get(String(batch.id)) || []), transfers: toExportRows(transferByBatch.get(String(batch.id)) || [] ) })), accounts, auditLogs, settings: { legacyPartnerRatios: { A: 50, B: 50 } }
  };
}

export async function createDataBackup(admin: AdminClient, ownerId: string, options: Parameters<typeof createDataExportPayload>[2] = {}): Promise<DataExportPayload> {
  return createDataExportPayload(await loadServerBackupData(admin, ownerId), new Date().toISOString(), options);
}
