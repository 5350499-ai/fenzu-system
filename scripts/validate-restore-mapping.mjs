import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/data-restore/route.ts", import.meta.url), "utf8");
const backupService = fs.readFileSync(new URL("../lib/server/backup-service.ts", import.meta.url), "utf8");
const exportSource = fs.readFileSync(new URL("../app/api/data-restore/route.ts", import.meta.url), "utf8");
const restoreSql = fs.readFileSync(new URL("../supabase/migrations/20260805120000_restore_v4_transaction.sql", import.meta.url), "utf8");
const schemaMigration = fs.readFileSync(new URL("../supabase/migrations/20260806080332_restore_schema_single_source.sql", import.meta.url), "utf8");
const currentMappingMigration = fs.readFileSync(new URL("../supabase/migrations/20260822100000_restore_full_field_mapping.sql", import.meta.url), "utf8");

// Table names define the restore boundary; column names intentionally do not
// live in this script. The only column source is information_schema/PostgreSQL
// itself at runtime.
const restoreTables = [
  "properties", "rooms", "tenants", "contracts", "rent_payments", "expenses", "deposits",
  "viewing_appointments", "tasks", "partners", "partner_property_shares", "partner_name_history",
  "partner_settlement_batches", "partner_settlement_partner_snapshots",
  "partner_settlement_segment_snapshots", "partner_settlement_transfer_snapshots"
];
const conflictUpdateTables = new Set([
  "properties", "rooms", "tenants", "contracts", "rent_payments", "expenses", "deposits",
  "viewing_appointments", "tasks", "partners", "partner_property_shares", "partner_name_history", "partner_settlement_batches"
]);
const missing = [];
const columnsByTable = new Map(restoreTables.map((table) => [table, new Set()]));

for (const file of fs.readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((name) => name.endsWith(".sql")).sort()) {
  const sql = fs.readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
  for (const match of sql.matchAll(/create table(?: if not exists)? public\.([a-z0-9_]+)\s*\(([^]*?)\);/gi)) {
    const columns = columnsByTable.get(match[1]);
    if (!columns) continue;
    for (const line of match[2].split("\n")) {
      const column = line.match(/^\s*([a-z_][a-z0-9_]*)\s+/i)?.[1];
      if (column && !["constraint", "primary", "unique", "check", "foreign", "or"].includes(column.toLowerCase())) columns.add(column);
    }
  }
  for (const match of sql.matchAll(/alter table public\.([a-z0-9_]+)\s+add column([^;]*);/gi)) {
    const columns = columnsByTable.get(match[1]);
    if (!columns) continue;
    const definitions = match[2].replace(/\s+/g, " ");
    const first = definitions.match(/^\s*(?:if not exists\s+)?([a-z_][a-z0-9_]*)\s+/i);
    if (first) columns.add(first[1]);
    for (const column of definitions.matchAll(/,\s*add column(?: if not exists\s+)?([a-z_][a-z0-9_]*)\s+/gi)) columns.add(column[1]);
  }
}

const mappingSource = `${restoreSql}\n${currentMappingMigration}`;

for (const table of restoreTables) {
  if (!restoreSql.includes(`insert into public.${table}`)) missing.push(`restore-insert:${table}`);
  for (const column of conflictUpdateTables.has(table) ? columnsByTable.get(table) || [] : []) {
    if (column === "id") continue;
    if (table === "partner_settlement_batches" && column === "period_range") continue;
    if (!mappingSource.includes(`${column}=excluded.${column}`)) missing.push(`restore-update:${table}.${column}`);
  }
}

if (!backupService.includes('select("*")')) missing.push("export:select-star-live-schema");
if (!route.includes("function toSnakeKey")) missing.push("restore:generic-snake-case-mapping");
if (!route.includes("normalizeRestoreDataFromDatabaseSchema")) missing.push("restore:generic-normalizer");
if (!route.includes("jsonb_populate_recordset")) missing.push("restore:database-record-mapping");
if (!schemaMigration.includes("jsonb_each(v_expected)") || !schemaMigration.includes("where v_actual ? entry.key")) {
  missing.push("validation:dynamic-live-schema-projection");
}
if (!currentMappingMigration.includes("currency_code = upper(p_data->''settings''->>''currencyCode'')")) missing.push("restore-settings:currencyCode");
if (!backupService.includes("currencyCode") || !route.includes("settings: source.settings")) missing.push("settings:currencyCode-call-chain");
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
  schemaColumns: Object.fromEntries([...columnsByTable].map(([table, columns]) => [table, [...columns].sort()])),
  missing
}, null, 2));
if (missing.length) process.exitCode = 1;
