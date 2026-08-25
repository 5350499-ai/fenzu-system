import fs from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url);
const snapshot = JSON.parse(fs.readFileSync(new URL("scripts/restore-live-schema.snapshot.json", root), "utf8"));
const migrationFiles = fs.readdirSync(new URL("supabase/migrations", root)).filter((name) => name.endsWith(".sql"));
const migration = migrationFiles.map((name) => fs.readFileSync(new URL(`supabase/migrations/${name}`, root), "utf8")).join("\n");
const activeFunctionSqlFile = process.env.RESTORE_IMPL_SQL_FILE;
const activeFunctionSql = activeFunctionSqlFile && fs.existsSync(path.resolve(activeFunctionSqlFile)) ? fs.readFileSync(path.resolve(activeFunctionSqlFile), "utf8") : null;
const expectedTables = Object.keys(snapshot.tables);
const prohibited = ["landlord_id", "area", "has_window", "has_private_bathroom", "furniture", "whatsapp", "passport_number", "nie_number", "nationality", "move_in_date", "expected_move_out_date", "key_count", "contract_type", "is_signed", "file_url", "storage_path"];
const legacyMarkers = [
  "excluded.landlord_id", "excluded.area", "excluded.has_window", "excluded.has_private_bathroom", "excluded.furniture",
  "excluded.whatsapp", "excluded.passport_number", "excluded.nie_number", "excluded.nationality", "excluded.move_in_date",
  "excluded.expected_move_out_date", "excluded.key_count", "excluded.contract_type", "excluded.is_signed", "excluded.file_url",
  "excluded.storage_path"
];
const tableLegacyMarkers = {
  properties: ["excluded.landlord_id"],
  rooms: ["excluded.area", "excluded.has_window", "excluded.has_private_bathroom", "excluded.furniture"],
  tenants: ["excluded.whatsapp", "excluded.passport_number", "excluded.nie_number", "excluded.nationality", "excluded.move_in_date", "excluded.expected_move_out_date", "excluded.key_count"],
  contracts: ["excluded.contract_type", "excluded.landlord_id", "excluded.is_signed", "excluded.is_active", "excluded.file_url", "excluded.storage_path"],
  tasks: ["excluded.completed_at"]
};
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
  const updateValid = entry.columns.every((column) => columns.has(column));
  const conflictValid = entry.uniqueKeys.some((key) => JSON.stringify(key) === JSON.stringify(conflict));
  const fkValid = entry.foreignKeys.every((key) => key.every((column) => columns.has(column)));
  rows.push({ table, insertColumnsValid: insertValid, updateColumnsValid: updateValid, excludedColumnsValid: updateValid, conflictColumnsValid: conflictValid, fkColumnsValid: fkValid, verdict: insertValid && updateValid && conflictValid && fkValid ? "PASS" : "FAIL" });
  if (!insertValid) missing.push(`${table}:primary-key-column-missing`);
  if (!updateValid) missing.push(`${table}:update-column-missing`);
  if (!conflictValid) missing.push(`${table}:conflict-key-not-unique`);
  if (!fkValid) missing.push(`${table}:foreign-key-column-missing`);
}
for (const [table, columns] of Object.entries(failedTableColumns)) {
  const liveColumns = new Set(snapshot.tables[table].columns);
  for (const column of columns) if (!liveColumns.has(column)) missing.push(`${table}:live-update-not-in-live-schema:${column}`);
}
if (snapshot.tables.check_in_requests.primaryKey[0] !== "client_request_id") missing.push("check_in_requests:client-request-id-key");
if (snapshot.tables.tenant_create_requests.primaryKey[0] !== "client_request_id") missing.push("tenant_create_requests:client-request-id-key");
if (!migration.includes("pg_get_functiondef('public.restore_workspace_backup_impl(uuid,uuid,jsonb)'::regprocedure)")) missing.push("migration:live-function-owner");
if (!migration.includes("execute v_source")) missing.push("migration:replacement-execution");

const activeLegacyReferences = activeFunctionSql
  ? Object.entries(tableLegacyMarkers).flatMap(([table, markers]) => {
    const start = activeFunctionSql.toLowerCase().indexOf(`update public.${table}`);
    const end = start < 0 ? -1 : activeFunctionSql.toLowerCase().indexOf("update public.", start + 1);
    const block = start < 0 ? "" : activeFunctionSql.slice(start, end < 0 ? activeFunctionSql.length : end);
    return markers.filter((marker) => block.toLowerCase().includes(marker.toLowerCase())).map((marker) => `${table}:${marker}`);
  })
  : [];
if (activeLegacyReferences.length) missing.push(...activeLegacyReferences.map((marker) => `active-function:prohibited-reference:${marker}`));

console.log(JSON.stringify({ status: missing.length ? "FAIL" : "PASS", source: snapshot.source, tablesChecked: expectedTables.length, restoreColumnParity: rows, activeFunctionSqlValidation: activeFunctionSql ? (activeLegacyReferences.length ? "FAIL" : "PASS") : "NOT_AVAILABLE", prohibitedLegacyReferenceCount: activeLegacyReferences.length, missing }, null, 2));
if (missing.length) process.exitCode = 1;
