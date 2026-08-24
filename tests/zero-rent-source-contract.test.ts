import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { hasMeaningfulRentState } from "../lib/rent-payment-entry.ts";

const migration = readFileSync("supabase/migrations/20260823120000_check_in_optional_rent_payment.sql", "utf8");
const eligibilityMigration = readFileSync("supabase/migrations/20260823150000_check_in_allow_shared_room.sql", "utf8");
const checkIn = readFileSync("app/check-in/page.tsx", "utf8");
const tenants = readFileSync("app/tenants/page.tsx", "utf8");
const payments = readFileSync("app/rent-payments/page.tsx", "utf8");
const settlement = readFileSync("app/partnership-settlement/page.tsx", "utf8");
const appointments = readFileSync("app/viewing-appointments/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("rent payment creation requires meaningful rent state, not positive paid only", () => {
  assert.equal(hasMeaningfulRentState({ amountDue: 0, amountPaid: 0, amountUnpaid: 0 }), false);
  assert.equal(hasMeaningfulRentState({ amountDue: 500, amountPaid: 0, amountUnpaid: 500 }), true);
  assert.equal(hasMeaningfulRentState({ amountDue: 500, amountPaid: 500, amountUnpaid: 0 }), true);
});

test("check-in RPC separates deposit cash from rent and makes rent payment optional", () => {
  assert.match(migration, /v_has_rent_state boolean/);
  assert.match(migration, /v_has_rent_state := v_rent_due > 0 or v_rent_paid > 0 or v_rent_unpaid > 0/);
  assert.match(migration, /if v_has_rent_state then\s+v_payment_id := gen_random_uuid\(\);/);
  assert.match(migration, /if v_has_rent_state then\s+insert into public\.rent_payments/);
  assert.match(migration, /v_rent_paid := case when p_payment_status = '已收' then v_rent_due else 0 end/);
  assert.match(migration, /v_rent_unpaid := case when p_payment_status = '未收' then v_rent_due else 0 end/);
  assert.match(migration, /'rentPaymentId', v_payment_id/);
  assert.match(migration, /rent_payment_id = v_payment_id/);
  assert.match(migration, /v_total_received := v_rent_paid \+ v_collected_deposit/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.rent_payments/i);
  assert.doesNotMatch(migration, /update\s+public\.rent_payments/i);
  assert.match(migration, /revoke all on function public\.create_atomic_check_in\([\s\S]*?\) from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant execute on function public\.create_atomic_check_in\([\s\S]*?\) to authenticated/i);
  assert.doesNotMatch(migration, /occupant_count/);
  assert.match(checkIn, /rentPaymentId\?: string \| null/);
  assert.match(checkIn, /const hasRentPayment = Boolean\(paymentId\) && hasMeaningfulRentState/);
  assert.match(checkIn, /setPayments\(nextLedgerPayments\.length/);
});

test("tenant creation does not persist an empty rent placeholder", () => {
  assert.match(tenants, /fetch\("\/api\/tenants\/create"/);
  assert.match(tenants, /rentAmount: paymentForm\.amountDue/);
  assert.match(tenants, /monthlyRent: 0/);
  assert.match(tenants, /depositAmount: 0/);
});

test("manual income defaults to unlinked other income while rent remains selectable", () => {
  assert.match(payments, /incomeType: "其他收入"/);
  assert.match(payments, /\["其他收入", "房租收入", "续交房租", "押金收入", "赔偿收入"\]/);
});

test("free-single confirmation uses the canonical owner or free-single authorization", () => {
  assert.match(settlement, /\(access\.isOwner \|\| access\.isFreeSingle\)/);
  assert.match(settlement, /fetch\("\/api\/partner-settlements"/);
  assert.match(settlement, /exactBatch/);
  assert.match(settlement, /overlap/);
});

test("appointment actions occupy semantic row owners instead of spanning both rows", () => {
  assert.match(appointments, /appointment-row-actions/);
  assert.match(appointments, /appointment-actions/);
  assert.match(css, /\.appointment-row-actions[\s\S]*grid-row: 1/);
  assert.match(css, /\.appointment-actions[\s\S]*grid-row: 2/);
  assert.doesNotMatch(css, /\.appointment-actions[\s\S]*grid-row: 1 \/ span 2/);
});

test("shared-room eligibility correction removes only the historical blockers", () => {
  assert.match(eligibilityMigration, /create_atomic_check_in\(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint/);
  assert.match(eligibilityMigration, /canonical create_atomic_check_in reviewed structure does not match/);
  assert.match(eligibilityMigration, /v_old text := .*已租.*occupied/);
  assert.match(eligibilityMigration, /v_old text := .*在租.*current/);
  assert.match(eligibilityMigration, /v_new text := .*coalesce\(v_room\.status/);
  assert.doesNotMatch(eligibilityMigration, /capacity|max_?occup|remaining beds|满员|床位/i);
  assert.match(checkIn, /const availableRooms = rooms\.filter\(\(room\) => room\.propertyId === form\.propertyId && room\.status !== "已归档"\)/);
  assert.doesNotMatch(checkIn, /availableRooms[\s\S]{0,220}room\.status\s*!==\s*["']已租|availableRooms[\s\S]{0,220}occupied/);
});

test("shared-room correction does not change RPC permission owners", () => {
  assert.doesNotMatch(eligibilityMigration, /grant\s+execute|revoke\s+all|security\s+definer|search_path/i);
  assert.doesNotMatch(eligibilityMigration, /occupant_count/i);
  assert.ok(eligibilityMigration.includes(String.raw`v_normalized := regexp_replace(v_function, '\s+', ' ', 'g');`));
  assert.match(eligibilityMigration, /reviewed structure does not match; refusing to alter unknown function/);
  assert.match(eligibilityMigration, /eligibility blockers were not fully removed/);
});

test("shared-room matcher treats formatting-only changes as equivalent and fails closed on missing markers", () => {
  const reviewed = `if not found\n  or coalesce(v_room.status, '') in ('已租', 'occupied')\n  or exists (\n    select 1 from public.tenants\n    where room_id = p_room_id\n      and status in ('在租', 'current')\n  )\n  or coalesce(v_room.status, '') like`;
  const normalize = (value: string) => value.replace(/\s+/g, " ");
  const expected = "if not found or coalesce(v_room.status, '') in ('已租', 'occupied') or exists ( select 1 from public.tenants where room_id = p_room_id and status in ('在租', 'current') ) or coalesce(v_room.status, '') like";
  assert.equal(normalize(reviewed), expected);
  assert.notEqual(normalize(reviewed.replace("status in ('在租', 'current')", 'status in (\'已租\')')), expected);
  assert.match(eligibilityMigration, /position\(v_old in v_normalized\) = 0/);
});

test("move-out room status remains derived from remaining active tenants", () => {
  const moveOut = readFileSync("supabase/migrations/20260815100000_beta2a_write_hardening.sql", "utf8");
  assert.match(moveOut, /select count\(\*\) into v_active_count/);
  assert.match(moveOut, /status = case when v_active_count > 0 then/);
  assert.match(moveOut, /U&'\\5df2\\79df'/);
  assert.match(moveOut, /U&'\\7a7a\\7f6e'/);
});
