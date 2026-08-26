#!/usr/bin/env node

/**
 * Generate a clean, synthetic-only HK rehearsal bootstrap from the canonical
 * migration chain. Historical migrations are never edited or deleted.
 *
 * Production-account checks and seed data are historical data operations, not
 * schema requirements. They are excluded here and replaced with a deterministic
 * synthetic Auth/workspace identity after the schema migrations have run.
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");
const output = process.argv[2] ?? join(root, "supabase", "bootstrap", "hk-canonical-bootstrap.generated.sql");

const excluded = new Set([
  "20260713155640_accounts_permissions_stage1_owner_name_fix.sql",
]);

const files = (await readdir(migrationsDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

function removeFirstBlock(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) return source;
  const end = source.indexOf("end $$;", start);
  if (end < 0) throw new Error(`Unclosed bootstrap block: ${marker}`);
  return `${source.slice(0, start)}${source.slice(end + "end $$;".length)}`;
}

function normalize(name, source) {
  if (name === "20260713154204_accounts_permissions_stage1.sql") {
    let result = removeFirstBlock(source, "-- Abort before any DDL");
    const seedStart = result.indexOf("-- Seed the fixed current account");
    const seedEnd = result.indexOf("alter table public.user_profiles enable row level security;");
    if (seedStart < 0 || seedEnd < 0) throw new Error("Stage 1 seed boundary not found");
    result = `${result.slice(0, seedStart)}-- Production owner seed omitted by HK canonical bootstrap.\n\n${result.slice(seedEnd)}`;
    return result;
  }

  if (name === "20260713163836_accounts_permissions_stage2.sql") {
    let result = source.replace(/do \$\$\s*declare\s+expected_owner_id[\s\S]*?end \$\$;/, "");
    if (result === source) throw new Error("Stage 2 owner guard not found");
    const seedStart = result.indexOf("-- The fixed owner keeps the real email.");
    const seedEnd = result.indexOf("-- Owners with a legacy browser session");
    if (seedStart < 0 || seedEnd < 0) throw new Error("Stage 2 seed boundary not found");
    result = `${result.slice(0, seedStart)}-- Production account identity seed omitted by HK canonical bootstrap.\n\n${result.slice(seedEnd)}`;
    return result;
  }

  return source;
}

const parts = [
  "-- GENERATED HK_CANONICAL_BOOTSTRAP; source migrations remain the canonical schema owner.",
  "-- This file is rehearsal-only and must never be applied to Production.",
  "create schema if not exists auth;",
  "create table if not exists auth.users (id uuid primary key, email text, deleted_at timestamptz);",
  "insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'synthetic-owner@example.invalid') on conflict (id) do nothing;",
];

for (const name of files) {
  if (excluded.has(name)) {
    parts.push(`-- EXCLUDED HISTORICAL DATA REPAIR: ${name}`);
    continue;
  }
  const source = await readFile(join(migrationsDir, name), "utf8");
  parts.push(`-- BEGIN CANONICAL MIGRATION: ${name}`);
  parts.push(normalize(name, source));
  parts.push(`-- END CANONICAL MIGRATION: ${name}`);
}

parts.push(`
-- Synthetic owner/workspace fixture. No Production identity or data is used.
insert into public.user_profiles (
  auth_user_id, workspace_owner_id, username, display_name, account_type,
  status, property_access_mode, must_change_password
) values (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'synthetic-owner@example.invalid', 'Synthetic Owner', 'owner', 'active', 'all', false
);

insert into public.user_permissions (user_id, module_key, can_view, can_create, can_edit, can_archive, can_delete)
select '00000000-0000-4000-8000-000000000001', module_key, true, true, true, true, true
from unnest(array['home','properties','rooms','tenants','rent_payments','expenses','reminders','analytics','profits','partnership_settlement','settings','accounts']) as module_key;

insert into public.user_sensitive_permissions (user_id, can_view_tenant_phone, can_view_tenant_wechat, can_view_tenant_id_number, can_view_tenant_notes, can_export_data, can_view_profits, can_view_partnership_settlement, can_manage_accounts, can_manage_settings)
values ('00000000-0000-4000-8000-000000000001', true, true, true, true, true, true, true, true, true);

insert into public.account_auth_identities (auth_user_id, normalized_username, auth_email, is_internal_email)
values ('00000000-0000-4000-8000-000000000001', 'synthetic-owner@example.invalid', 'synthetic-owner@example.invalid', false);
`);

await writeFile(output, parts.join("\n\n"), "utf8");
console.log(`HK_CANONICAL_BOOTSTRAP_WRITTEN ${output}`);
console.log(`MIGRATION_COUNT ${files.length}`);
console.log(`EXCLUDED_HISTORICAL_DATA_REPAIRS ${excluded.size + 2}`);
