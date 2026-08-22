import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const restoreSql = readFileSync("supabase/migrations/20260805120000_restore_v4_transaction.sql", "utf8");
const mappingMigration = readFileSync("supabase/migrations/20260822100000_restore_full_field_mapping.sql", "utf8");
const mappingSource = `${restoreSql}\n${mappingMigration}`;

const conflictUpdateFields = [
  "landlord_id", "area", "has_window", "has_private_bathroom", "furniture",
  "whatsapp", "passport_number", "nie_number", "nationality", "move_in_date", "expected_move_out_date", "key_count",
  "contract_type", "occupant_count", "is_signed", "is_active", "file_url", "storage_path",
  "client_request_id", "completed_at"
];

test("existing-row conflict update restores fields added after the original Restore V4 mapping", () => {
  for (const field of conflictUpdateFields) assert.match(mappingSource, new RegExp(`${field}=excluded\\.${field}`), field);

  const baseline = Object.fromEntries(conflictUpdateFields.map((field) => [field, `backup-${field}`]));
  const modified = { ...baseline, ...Object.fromEntries(conflictUpdateFields.map((field) => [field, `modified-${field}`])) };
  const restored = { ...modified };
  for (const field of conflictUpdateFields) restored[field] = baseline[field];
  assert.deepEqual(restored, baseline);
});

test("currency_code is carried through Backup settings and the transactional Restore boundary", () => {
  const backupService = readFileSync("lib/server/backup-service.ts", "utf8");
  const restoreRoute = readFileSync("app/api/data-restore/route.ts", "utf8");
  assert.match(backupService, /settings:[\s\S]*currencyCode/);
  assert.match(restoreRoute, /settings: source\.settings/);
  assert.match(mappingMigration, /set currency_code = upper\(p_data->''settings''->>''currencyCode''\)/);
});
