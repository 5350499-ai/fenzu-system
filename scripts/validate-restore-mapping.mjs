import fs from "node:fs";

const route = fs.readFileSync(new URL("../app/api/data-restore/route.ts", import.meta.url), "utf8");
const exportSource = fs.readFileSync(new URL("../lib/data-export.ts", import.meta.url), "utf8");
const restoreSql = fs.readFileSync(new URL("../supabase/migrations/20260805120000_restore_v4_transaction.sql", import.meta.url), "utf8");

const specs = {
  properties: ["id", "user_id", "name", "address", "city", "landlord_name", "property_type", "sublet_allowed", "notes", "occupancy_tracking_start_date", "created_at", "updated_at"],
  rooms: ["id", "user_id", "property_id", "name", "room_number", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at"],
  tenants: ["id", "user_id", "property_id", "room_id", "name", "phone", "email", "wechat", "source", "monthly_rent", "deposit_amount", "status", "notes", "created_at", "updated_at", "payment_day", "actual_move_out_date"],
  contracts: ["id", "user_id", "property_id", "room_id", "tenant_id", "monthly_rent", "deposit_amount", "start_date", "end_date", "status", "notes", "created_at", "updated_at"],
  rent_payments: ["id", "user_id", "tenant_id", "property_id", "room_id", "rent_month", "amount_due", "amount_paid", "amount_unpaid", "payment_date", "payment_method", "is_overdue", "notes", "created_at", "updated_at", "received_by", "coverage_start_date", "coverage_end_date", "payment_status", "income_type", "income_item"],
  expenses: ["id", "user_id", "property_id", "room_id", "expense_month", "category", "amount", "payment_date", "payment_method", "paid_by", "is_paid", "notes", "created_at", "updated_at"],
  deposits: ["id", "user_id", "tenant_id", "property_id", "room_id", "transaction_type", "amount", "transaction_date", "status", "notes", "created_at", "updated_at", "received_by", "paid_by"],
  viewing_appointments: ["id", "user_id", "property_id", "room_id", "appointment_date", "appointment_time", "contact_name", "contact_whatsapp", "contact_phone", "status", "notes", "created_at", "updated_at"],
  tasks: ["id", "user_id", "task_type", "title", "description", "due_date", "status", "priority", "property_id", "room_id", "tenant_id", "contract_id", "rent_payment_id", "deposit_id", "notes", "created_at", "updated_at"],
  partners: ["id", "workspace_owner_id", "legacy_code", "display_name", "color_key", "sort_order", "is_active", "linked_account_id", "created_at", "updated_at"],
  partner_property_shares: ["id", "workspace_owner_id", "property_id", "partner_id", "percentage", "effective_from", "effective_to", "created_at", "updated_at"],
  partner_name_history: ["id", "workspace_owner_id", "partner_id", "old_display_name", "new_display_name", "changed_at", "changed_by_account_id", "created_at"],
  partner_settlement_batches: ["id", "workspace_owner_id", "property_id", "period_start", "period_end", "period_range", "status", "total_income", "total_expense", "net_profit", "currency", "confirmed_at", "confirmed_by_account_id", "reversed_at", "reversed_by_account_id", "reversal_reason", "note", "created_at", "updated_at", "property_name_snapshot", "confirmed_by_display_name_snapshot", "income_details_snapshot", "expense_details_snapshot"],
  partner_settlement_partner_snapshots: ["id", "settlement_batch_id", "partner_id", "partner_display_name_snapshot", "legacy_code_snapshot", "actual_collected", "actual_paid", "actual_retained", "profit_entitlement", "settlement_balance", "share_segments_snapshot", "created_at"],
  partner_settlement_segment_snapshots: ["id", "settlement_batch_id", "segment_start", "segment_end", "total_income", "total_expense", "net_profit", "shares_snapshot", "created_at"],
  partner_settlement_transfer_snapshots: ["id", "settlement_batch_id", "from_partner_id", "to_partner_id", "from_name_snapshot", "to_name_snapshot", "amount", "currency", "created_at"]
};

const aliases = (field) => [field, field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
const generatedFields = new Set(["partner_settlement_batches.period_range"]);
const missing = [];
let fieldCount = 0;
for (const [table, fields] of Object.entries(specs)) {
  for (const field of fields) {
    fieldCount += 1;
    if (!generatedFields.has(`${table}.${field}`) && !aliases(field).some((alias) => route.includes(alias))) missing.push(`${table}.${field}`);
  }
}

const requiredGuards = [
  ["nullable UUID normalization", "function nullableUuid"],
  ["snapshot partner_id mapping", "partner_id: nullableUuid(row.partner_id ?? row.partnerId)"],
  ["snapshot segment mapping", "segment_start: date(row.segment_start ?? row.segmentStart)"],
  ["snapshot transfer mapping", "from_partner_id: nullableUuid(row.from_partner_id ?? row.fromPartnerId)"]
];
for (const [label, token] of requiredGuards) if (!route.includes(token)) missing.push(`guard:${label}`);
if (!exportSource.includes("key.endsWith(\"Id\") || key.endsWith(\"_id\")")) missing.push("guard:recursive UUID export normalization");

const restoreOrder = ["properties", "rooms", "tenants", "contracts", "rent_payments", "expenses", "deposits", "viewing_appointments", "tasks", "partners", "partner_property_shares", "partner_name_history"];
let previousPosition = -1;
for (const table of restoreOrder) {
  const position = restoreSql.indexOf(`insert into public.${table}`);
  if (position <= previousPosition) missing.push(`restore-order:${table}`);
  previousPosition = position;
}
for (const table of ["partner_settlement_batches", "partner_settlement_partner_snapshots", "partner_settlement_segment_snapshots", "partner_settlement_transfer_snapshots"]) {
  if (!restoreSql.includes(`insert into public.${table}`)) missing.push(`restore-insert:${table}`);
}

console.log(JSON.stringify({
  status: missing.length ? "FAIL" : "PASS",
  tablesChecked: Object.keys(specs).length,
  fieldsChecked: fieldCount,
  generatedByDatabase: [...generatedFields],
  restoreOrderChecked: restoreOrder.length + 4,
  missing
}, null, 2));
if (missing.length) process.exitCode = 1;
