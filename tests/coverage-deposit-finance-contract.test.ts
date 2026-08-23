import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260823180000_coverage_and_deposit_income.sql"), "utf8");
const businessData = readFileSync(join(root, "lib/business-data.ts"), "utf8");
const checkIn = readFileSync(join(root, "app/check-in/page.tsx"), "utf8");
const tenants = readFileSync(join(root, "app/tenants/page.tsx"), "utf8");
const payments = readFileSync(join(root, "app/rent-payments/page.tsx"), "utf8");
const profit = readFileSync(join(root, "lib/profit.ts"), "utf8");
const dashboard = readFileSync(join(root, "app/page.tsx"), "utf8");
const settlement = readFileSync(join(root, "app/partnership-settlement/page.tsx"), "utf8");

test("coverage is contract-owned and independent of rent payment creation", () => {
  assert.match(migration, /alter table public\.contracts[\s\S]*coverage_start_date date[\s\S]*coverage_end_date date/);
  assert.match(migration, /insert into public\.contracts[\s\S]*coverage_start_date, coverage_end_date/);
  assert.match(migration, /v_has_rent_state/);
  assert.match(migration, /v_deposit_income_payment_id/);
  assert.match(businessData, /coverageStartDate: row\.coverage_start_date/);
  assert.match(businessData, /coverage_start_date: row\.coverageStartDate/);
  assert.match(checkIn, /coverageStartDate: form\.coverageStartDate/);
  assert.match(tenants, /latestCoverageForTenant\(form\.id, payments, contracts\)/);
  assert.match(tenants, /coverageStartDate: coverageStartDate/);
});

test("legacy payment coverage remains a read fallback", () => {
  const coverage = readFileSync(join(root, "lib/rent-coverage.ts"), "utf8");
  assert.match(coverage, /const contract = \[\.\.\.contracts\]/);
  assert.match(coverage, /return latestCoveragePayment\(payments\.filter\(\(payment\) => payment\.tenantId === tenantId\)\)/);
  assert.match(coverage, /contract-coverage:/);
});

test("deposit income is a separate idempotent ledger row", () => {
  assert.match(migration, /source_deposit_id uuid references public\.deposits\(id\)/);
  assert.match(migration, /rent_payments_workspace_source_deposit_idx/);
  assert.match(migration, /''押金收入'', ''押金收入'', v_deposit_id/);
  assert.match(migration, /amount_due, amount_paid, amount_unpaid/);
  assert.match(migration, /depositIncomePaymentId/);
  assert.match(businessData, /sourceDepositId: row\.source_deposit_id/);
  assert.match(businessData, /source_deposit_id: row\.sourceDepositId/);
  assert.match(payments, /"押金收入"/);
  assert.match(profit, /projectDepositIncomePayments/);
  assert.match(profit, /历史投影/);
  assert.match(dashboard, /projectDepositIncomePayments/);
  assert.match(settlement, /projectDepositIncomePayments/);
  assert.match(settlement, /buildSettlement\(\[id\][\s\S]*ledgerPayments/);
});

test("deposit ledger is not reintroduced as rent payment amount", () => {
  assert.match(checkIn, /const actualPaid = form\.paymentStatus === "未收" \? 0 : rentAmount/);
  assert.match(checkIn, /incomeType: "押金收入"/);
  assert.match(checkIn, /sourceDepositId: result\.depositId/);
});

test("restore mapping carries both new durability fields", () => {
  assert.match(migration, /coverage_start_date=excluded\.coverage_start_date/);
  assert.match(migration, /coverage_end_date=excluded\.coverage_end_date/);
  assert.match(migration, /source_deposit_id=excluded\.source_deposit_id/);
  assert.match(migration, /v_contract_block/);
  assert.match(migration, /regexp_replace\(/);
  assert.match(migration, /Restore contract relationship or field mapping is incomplete/);
  assert.match(migration, /Restore contract coverage insertion point not found/);
  assert.match(migration, /Restore contract coverage mapping already exists in an unknown shape/);
  assert.match(migration, /Restore legacy contract compatibility marker not found/);
  assert.match(migration, /jsonb_array_elements\(coalesce\(p_data->''contracts''/);
  assert.match(migration, /c\.coverage_start_date/);
  assert.match(migration, /c\.coverage_end_date/);
  assert.match(migration, /E'    \)\), ''\[\]''::jsonb\),\\n'/);
});

test("restore rent-payment matcher is field-semantic and fail-closed", () => {
  assert.match(migration, /v_rent_block/);
  assert.match(migration, /v_rent_normalized := regexp_replace/);
  assert.ok(migration.includes("regexp_replace(v_rent_block"));
  assert.match(migration, /v_rent_normalized[\s\S]*'g'/);
  for (const field of ["payment_status", "income_type", "income_item", "client_request_id"]) {
    assert.match(migration, new RegExp(`${field}=excluded\\.${field}`));
  }
  assert.match(migration, /Restore rent payment field mapping is incomplete/);
  assert.match(migration, /Restore rent payment upsert boundary is unknown/);
  assert.match(migration, /Restore rent payment source-deposit mapping already exists/);
  assert.match(migration, /source_deposit_id=excluded\.source_deposit_id/);
  assert.match(migration, /Restore rent payment source-deposit insertion point not found/);
  assert.match(migration, /';\\s\*\$'/);
});

test("rent-payment matcher variants preserve fail-closed behavior", () => {
  const required = ["payment_status", "income_type", "income_item", "client_request_id"];
  const mappingPasses = (block: string) => {
    const normalized = block.replace(/\s+/g, "");
    return required.every((field) => normalized.includes(`${field}=excluded.${field}`))
      && !normalized.includes("source_deposit_id=excluded.source_deposit_id")
      && /;\s*$/.test(block);
  };

  const reviewed = `
    payment_status = excluded.payment_status,
    income_type = excluded.income_type,
    income_item = excluded.income_item,
    client_request_id = excluded.client_request_id;
  `;
  assert.equal(mappingPasses(reviewed), true);
  assert.equal(mappingPasses(`client_request_id=excluded.client_request_id, income_item=excluded.income_item, payment_status=excluded.payment_status, income_type=excluded.income_type;`), true);
  assert.equal(mappingPasses(`payment_status=excluded.payment_status, income_type=excluded.income_type, client_request_id=excluded.client_request_id;`), false);
  assert.equal(mappingPasses(`payment_status=excluded.payment_status, income_type=excluded.income_type, income_item=excluded.income_item;`), false);
  assert.equal(mappingPasses(`payment_status=excluded.payment_status, income_type=excluded.income_type, income_item=excluded.income_item, client_request_id=excluded.client_request_id, source_deposit_id=excluded.source_deposit_id;`), false);
});
