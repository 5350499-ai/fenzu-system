import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { hasMeaningfulRentState } from "../lib/rent-payment-entry.ts";

const migration = readFileSync("supabase/migrations/20260823120000_check_in_optional_rent_payment.sql", "utf8");
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
  assert.match(checkIn, /rentPaymentId\?: string \| null/);
  assert.match(checkIn, /const hasRentPayment = Boolean\(paymentId\) && hasMeaningfulRentState/);
  assert.match(checkIn, /setPayments\(hasRentPayment \?/);
});

test("tenant creation does not persist an empty rent placeholder", () => {
  assert.match(tenants, /const shouldPersistPayment = hasMeaningfulRentState\(nextPayment\)/);
  assert.match(tenants, /const nextPayments = !shouldPersistPayment \? payments/);
  assert.match(tenants, /monthlyRent: 0/);
  assert.match(tenants, /depositAmount: 0/);
});

test("manual income defaults to unlinked other income while rent remains selectable", () => {
  assert.match(payments, /incomeType: "其他收入"/);
  assert.match(payments, /\["其他收入", "房租收入", "续交房租", "赔偿收入"\]/);
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
