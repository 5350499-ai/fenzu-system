import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260815160000_move_room_occupancy_guard_compensation.sql", "utf8");
const route = readFileSync("app/api/tenants/move-room/route.ts", "utf8");

test("compensation migration replaces the complete Move Room function without text replacement", () => {
  assert.match(migration, /create or replace function public\.update_tenant_current_assignment/);
  assert.doesNotMatch(migration, /pg_get_functiondef|replace\s*\(/);
  assert.match(migration, /v_new_room\.id <> v_old_room\.id and exists/);
  assert.match(migration, /status in \('在租', 'current'\)/);
  assert.match(migration, /errcode = 'P0001', message = 'room unavailable'/);
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
});

test("Move Room route keeps the canonical occupied-room HTTP 409 contract", () => {
  assert.match(route, /update_tenant_current_assignment/);
  assert.match(route, /room unavailable/);
  assert.match(route, /409/);
});

test("compensation migration has no migration-time destructive statements", () => {
  assert.doesNotMatch(migration, /\b(drop|truncate|delete from)\b/i);
  assert.doesNotMatch(migration, /alter table|insert into public\.(tenants|rooms|contracts|deposits|rent_payments)/i);
});
