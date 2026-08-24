import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = "supabase/migrations/20260824112251_checkin_rent_deposit_finance_model.sql";
const migration = readFileSync(migrationPath, "utf8");
const route = readFileSync("app/api/check-in/receipt-links/route.ts", "utf8");

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      if (value[index + 1] === "'") { index += 1; continue; }
      quoted = !quoted;
      continue;
    }
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

test("canonical check-in stores rent only and reports rent plus collected deposit", () => {
  assert.match(migration, /v_rent_paid\s*:=\s*case\s+when p_payment_status = '已收' then v_rent_due else 0 end/i);
  assert.match(migration, /v_total_received\s*:=\s*v_rent_paid \+ v_collected_deposit/i);
  assert.match(migration, /amount_due, amount_paid, amount_unpaid[\s\S]*?v_rent_due, v_rent_paid, v_rent_unpaid/i);
  assert.doesNotMatch(migration, /then\s+coalesce\(p_rent_amount,\s*0\)\s*\+\s*v_collected_deposit/i);
});

test("zero-rent check-in creates deposit without meaningless rent payment", () => {
  assert.match(migration, /v_has_rent_state\s*:=\s*v_rent_due > 0 or v_rent_paid > 0 or v_rent_unpaid > 0/i);
  assert.match(migration, /if v_has_rent_state then[\s\S]*?insert into public\.rent_payments/i);
  assert.match(migration, /if coalesce\(p_deposit_amount, 0\) > 0 then[\s\S]*?insert into public\.deposits/i);
});

test("future check-in keeps explicit request linkage and exact marker linkage", () => {
  assert.match(migration, /'\[收租押金:' \|\| v_payment_id::text \|\| '\]'/);
  assert.match(migration, /rent_payment_id = v_payment_id, deposit_id = v_deposit_id/);
});

test("canonical RPC preserves shared-room, coverage, transaction, wrapper and permission boundaries", () => {
  assert.match(migration, /if not found or coalesce\(v_room\.status, ''\) like '%归档%'/);
  assert.doesNotMatch(migration, /status.*in \('已租', 'occupied'\)|exists\s*\(\s*select 1 from public\.tenants/i);
  assert.match(migration, /insert into public\.contracts \([\s\S]*?coverage_start_date, coverage_end_date,[\s\S]*?\) values \([\s\S]*?p_coverage_start_date, p_coverage_end_date,[\s\S]*?'有效'/);
  assert.match(migration, /insert into public\.rent_payments \([\s\S]*?coverage_start_date, coverage_end_date/);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /owner to postgres/i);
  assert.match(migration, /revoke all[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute[\s\S]*to service_role/i);
  assert.doesNotMatch(migration, /create or replace function public\.create_atomic_check_in\([\s\S]*?p_occupant_count integer/);
  assert.doesNotMatch(migration, /regexp_replace|execute\s+format|dynamic sql/i);
});

test("every canonical RPC INSERT has matching target and value cardinality", () => {
  const inserts = [...migration.matchAll(/insert\s+into\s+public\.\w+\s*\(([\s\S]*?)\)\s*values\s*\(([\s\S]*?)\)\s*(?:on conflict[\s\S]*?)?;/gi)];
  assert.ok(inserts.length >= 6);
  for (const insert of inserts) {
    assert.equal(splitTopLevel(insert[1]).length, splitTopLevel(insert[2]).length, insert[0].slice(0, 80));
  }
  assert.equal((migration.match(/\$\$/g) || []).length, 2);
});

test("historical check-in link route is authenticated, workspace scoped, property scoped and fail closed", () => {
  assert.match(route, /requireActiveAccount\(request\)/);
  assert.match(route, /requireModulePermission\(context, "rent_payments", "view"\)/);
  assert.match(route, /requireModulePermission\(context, "deposits", "view"\)/);
  assert.match(route, /\.eq\("workspace_owner_id", workspaceOwnerId\)/);
  assert.match(route, /allowedPropertyIds\.has\(payment\.property_id\)/);
  assert.match(route, /check_in_receipt_link_(?:incomplete|mismatch|ambiguous)/);
  assert.doesNotMatch(route, /amount|created_at|transaction_date/);
});
