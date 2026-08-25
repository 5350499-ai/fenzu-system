import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const parityMigration = readFileSync("supabase/migrations/20260825120000_restore_live_schema_column_parity.sql", "utf8");
const finalParityMigration = readFileSync("supabase/migrations/20260825140000_restore_active_schema_final_parity.sql", "utf8");
const snapshot = JSON.parse(readFileSync("scripts/restore-live-schema.snapshot.json", "utf8"));
const tables = snapshot.tables as Record<string, { columns: string[]; primaryKey: string[]; foreignKeys: string[][] }>;
const prohibited = ["landlord_id", "area", "has_window", "has_private_bathroom", "furniture", "whatsapp", "passport_number", "nie_number", "nationality", "move_in_date", "expected_move_out_date", "key_count", "contract_type", "is_signed", "is_active", "file_url", "storage_path"];

test("live restore replacement only references current schema columns", () => {
  assert.equal(snapshot.restoreBoundaryCount, 18);
  for (const [table, entry] of Object.entries(tables)) {
    assert.ok(entry.columns.includes(entry.primaryKey[0]), `${table} primary key is live`);
    for (const column of entry.foreignKeys.flat()) assert.ok(entry.columns.includes(column), `${table}.${column} foreign key is live`);
  }
  for (const field of prohibited) assert.match(parityMigration, new RegExp(`replace\\(v_source, '[^']*${field}=excluded\\.${field}`), field);
  assert.match(parityMigration, /restore_workspace_backup_impl\(uuid,uuid,jsonb\)/);
});

test("request restore identities remain client_request_id", () => {
  assert.deepEqual(tables.check_in_requests.primaryKey, ["client_request_id"]);
  assert.deepEqual(tables.tenant_create_requests.primaryKey, ["client_request_id"]);
});

test("final active schema parity removes the live-invalid task completion mapping", () => {
  assert.match(finalParityMigration, /restore_workspace_backup_impl\(uuid,uuid,jsonb\)/);
  assert.match(finalParityMigration, /v_marker text := ', completed_at=excluded\.completed_at'/);
  assert.match(finalParityMigration, /v_source := replace\(v_source, v_marker, ''\)/);
  assert.match(finalParityMigration, /Restore tasks\.completed_at mapping remains after replacement/);
});

test("currency_code is carried through Backup settings and the transactional Restore boundary", () => {
  const backupService = readFileSync("lib/server/backup-service.ts", "utf8");
  const restoreRoute = readFileSync("app/api/data-restore/route.ts", "utf8");
  assert.match(backupService, /settings:[\s\S]*currencyCode/);
  assert.match(restoreRoute, /settings: source\.settings/);
  const mappingMigration = readFileSync("supabase/migrations/20260822100000_restore_full_field_mapping.sql", "utf8");
  assert.match(mappingMigration, /set currency_code = upper\(p_data->''settings''->>''currencyCode''\)/);
});
