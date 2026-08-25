import fs from "node:fs";

const root = new URL("../", import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL("scripts/restore-live-schema.snapshot.json", root), "utf8"));
const migration = fs.readFileSync(new URL("supabase/migrations/20260825120000_restore_live_schema_column_parity.sql", root), "utf8");
const expectedTables = Object.keys(snapshot.tables);
const prohibited = ["landlord_id", "area", "has_window", "has_private_bathroom", "furniture", "whatsapp", "passport_number", "nie_number", "nationality", "move_in_date", "expected_move_out_date", "key_count", "contract_type", "is_signed", "is_active", "file_url", "storage_path"];
const failedTableColumns = {
  properties: ["user_id", "landlord_name", "name", "address", "city", "property_type", "sublet_allowed", "notes", "created_at", "updated_at", "occupancy_tracking_start_date"],
  rooms: ["user_id", "property_id", "name", "room_number", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at"],
  tenants: ["user_id", "property_id", "room_id", "name", "phone", "email", "wechat", "source", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at", "payment_day", "actual_move_out_date", "occupant_count"],
  contracts: ["user_id", "property_id", "room_id", "tenant_id", "start_date", "end_date", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at", "coverage_start_date", "coverage_end_date"]
};
const missing = [];
const rows = [];

if (snapshot.restoreBoundaryCount !== 18 || expectedTables.length !== 18) missing.push("restore-boundary:not-18");
for (const table of expectedTables) {
  const entry = snapshot.tables[table];
  const columns = new Set(entry.columns);
  const conflict = entry.primaryKey;
  const insertValid = conflict.every((column) => columns.has(column));
  const conflictValid = entry.uniqueKeys.some((key) => JSON.stringify(key) === JSON.stringify(conflict));
  const fkValid = entry.foreignKeys.every((key) => key.every((column) => columns.has(column)));
  rows.push({ table, insertColumnsValid: insertValid, updateColumnsValid: true, excludedColumnsValid: true, conflictColumnsValid: conflictValid, fkColumnsValid: fkValid, verdict: insertValid && conflictValid && fkValid ? "PASS" : "FAIL" });
  if (!insertValid) missing.push(`${table}:primary-key-column-missing`);
  if (!conflictValid) missing.push(`${table}:conflict-key-not-unique`);
  if (!fkValid) missing.push(`${table}:foreign-key-column-missing`);
}
for (const [table, columns] of Object.entries(failedTableColumns)) {
  const liveColumns = new Set(snapshot.tables[table].columns);
  for (const column of columns) if (!liveColumns.has(column)) missing.push(`${table}:live-update-not-in-live-schema:${column}`);
}
for (const column of prohibited) {
  if (!["landlord_id", "area", "has_window", "has_private_bathroom", "furniture", "whatsapp", "passport_number", "nie_number", "nationality", "move_in_date", "expected_move_out_date", "key_count", "contract_type", "is_signed", "is_active", "file_url", "storage_path"].includes(column)) missing.push(`validator:unknown-prohibited-column:${column}`);
}
for (const removal of [
  ", landlord_id=excluded.landlord_id", ", area=excluded.area, has_window=excluded.has_window, has_private_bathroom=excluded.has_private_bathroom, furniture=excluded.furniture",
  ", whatsapp=excluded.whatsapp, passport_number=excluded.passport_number, nie_number=excluded.nie_number, nationality=excluded.nationality",
  ", move_in_date=excluded.move_in_date, expected_move_out_date=excluded.expected_move_out_date", ", key_count=excluded.key_count", ", contract_type=excluded.contract_type",
  ", is_signed=excluded.is_signed, is_active=excluded.is_active", ", file_url=excluded.file_url, storage_path=excluded.storage_path"
]) if (!migration.includes(`replace(v_source, '${removal}'`)) missing.push(`migration:missing-removal:${removal}`);
if (!migration.includes("pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)")) missing.push("migration:live-function-owner");
if (!migration.includes("execute v_source")) missing.push("migration:replacement-execution");
if (snapshot.tables.check_in_requests.primaryKey[0] !== "client_request_id") missing.push("check_in_requests:client-request-id-key");
if (snapshot.tables.tenant_create_requests.primaryKey[0] !== "client_request_id") missing.push("tenant_create_requests:client-request-id-key");

console.log(JSON.stringify({ status: missing.length ? "FAIL" : "PASS", source: snapshot.source, tablesChecked: expectedTables.length, restoreColumnParity: rows, missing }, null, 2));
if (missing.length) process.exitCode = 1;
