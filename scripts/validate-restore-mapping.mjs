import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/data-restore/route.ts", import.meta.url), "utf8");
const exportSource = fs.readFileSync(new URL("../app/api/data-restore/route.ts", import.meta.url), "utf8");
const restoreSql = fs.readFileSync(new URL("../supabase/migrations/20260805120000_restore_v4_transaction.sql", import.meta.url), "utf8");
const schemaMigration = fs.readFileSync(new URL("../supabase/migrations/20260806080332_restore_schema_single_source.sql", import.meta.url), "utf8");

// Table names define the restore boundary; column names intentionally do not
// live in this script. The only column source is information_schema/PostgreSQL
// itself at runtime.
const restoreTables = [
  "properties", "rooms", "tenants", "contracts", "rent_payments", "expenses", "deposits",
  "viewing_appointments", "tasks", "partners", "partner_property_shares", "partner_name_history",
  "partner_settlement_batches", "partner_settlement_partner_snapshots",
  "partner_settlement_segment_snapshots", "partner_settlement_transfer_snapshots"
];
const missing = [];

for (const table of restoreTables) {
  if (!restoreSql.includes(`insert into public.${table}`)) missing.push(`restore-insert:${table}`);
}

if (!route.includes('select("*")')) missing.push("export:select-star-live-schema");
if (!route.includes("function toSnakeKey")) missing.push("restore:generic-snake-case-mapping");
if (!route.includes("normalizeRestoreDataFromDatabaseSchema")) missing.push("restore:generic-normalizer");
if (!route.includes("jsonb_populate_recordset")) missing.push("restore:database-record-mapping");
if (!schemaMigration.includes("jsonb_each(v_expected)") || !schemaMigration.includes("where v_actual ? entry.key")) {
  missing.push("validation:dynamic-live-schema-projection");
}
if (route.includes("RESTORE_TABLE_COLUMNS") || schemaMigration.includes("backupFieldCount")) {
  // backupFieldCount is a diagnostic output, not a field list. The explicit
  // RESTORE_TABLE_COLUMNS constant, however, would reintroduce a second SSoT.
  if (route.includes("RESTORE_TABLE_COLUMNS")) missing.push("forbidden:manual-restore-column-whitelist");
}

let previousPosition = -1;
for (const table of restoreTables) {
  const position = restoreSql.indexOf(`insert into public.${table}`);
  if (position <= previousPosition) missing.push(`restore-order:${table}`);
  previousPosition = position;
}

console.log(JSON.stringify({
  status: missing.length ? "FAIL" : "PASS",
  tablesChecked: restoreTables.length,
  fieldSource: "PostgreSQL information_schema.columns / jsonb_populate_recordset / to_jsonb",
  exportSource: "live select(*) rows",
  restoreSource: "generic camelCase-to-snake_case plus PostgreSQL record mapping",
  validationSource: "dynamic intersection with actual to_jsonb(row) keys",
  missing
}, null, 2));
if (missing.length) process.exitCode = 1;
