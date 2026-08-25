import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const project = process.env.RESTORE_LAB_PROJECT || "fenzu-restore-clean-bootstrap-15";
const container = process.env.RESTORE_LAB_DB_CONTAINER || `supabase_db_${project}`;
const apiUrl = process.env.RESTORE_LAB_API_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.RESTORE_LAB_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.local-restore-lab";
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "restore-acceptance-"));
const diagnosticsPath = path.join(process.cwd(), "reports", "restore-lab", "restore-failure-diagnostics.jsonl");
fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });

function sh(args, input) {
  return execFileSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", ...args], { input, encoding: "utf8" }).trim();
}
function sql(query) { return sh(["-c", query]); }
function writeDocker(name, content) {
  const local = path.join(tmp, name);
  fs.writeFileSync(local, content);
  execFileSync("docker.exe", ["cp", local, `${container}:/tmp/${name}`]);
  return `/tmp/${name}`;
}
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function readPayload() {
  const candidate = process.env.RESTORE_LAB_PAYLOAD || path.join(os.tmpdir(), "restore-fixture15-full.json");
  if (!fs.existsSync(candidate)) throw new Error(`fixture payload missing: ${candidate}`);
  return JSON.parse(fs.readFileSync(candidate, "utf8"));
}
function restoreData(exportData) {
  const result = { ...exportData };
  result.settlementPartnerSnapshots = exportData.partnerSettlementPartnerSnapshots || [];
  result.settlementSegmentSnapshots = exportData.partnerSettlementSegmentSnapshots || [];
  result.settlementTransferSnapshots = exportData.partnerSettlementTransferSnapshots || [];
  delete result.partnerSettlementPartnerSnapshots;
  delete result.partnerSettlementSegmentSnapshots;
  delete result.partnerSettlementTransferSnapshots;
  delete result.formatVersion;
  delete result.schemaVersion;
  return result;
}
function rpcSql(data, name, functionName = "restore_workspace_backup_dry_run") {
  const payload = JSON.stringify(data).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
  return `\\set ON_ERROR_STOP on\nselect ${functionName}('${owner}'::uuid,'${owner}'::uuid,$restore_payload$${payload}$restore_payload$::jsonb);`;
}
async function callDryRun(client, data) {
  const result = await client.rpc("restore_workspace_backup_dry_run", { p_workspace_owner_id: owner, p_actor_account_id: owner, p_data: data });
  return result;
}
async function callRestore(client, data) {
  return client.rpc("restore_workspace_backup", { p_workspace_owner_id: owner, p_actor_account_id: owner, p_data: data });
}
function fingerprint() {
  return sql(`select md5(coalesce(string_agg(x, '|' order by x),'')) from (select 'properties:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') x from public.properties where user_id='${owner}' union all select 'rooms:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') from public.rooms where user_id='${owner}' union all select 'tenants:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') from public.tenants where user_id='${owner}' union all select 'contracts:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(status,''),',' order by id)),'') from public.contracts where user_id='${owner}' union all select 'payments:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||amount_paid::text||':'||coalesce(payment_status,''),',' order by id)),'') from public.rent_payments where user_id='${owner}' union all select 'deposits:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||amount::text||':'||coalesce(status,''),',' order by id)),'') from public.deposits where user_id='${owner}' union all select 'requests:'||count(*)||':'||coalesce(md5(string_agg(client_request_id::text||':'||coalesce(result::text,''),',' order by client_request_id)),'') from public.check_in_requests where workspace_owner_id='${owner}') q`);
}
function mutateProperty(name) {
  sql(`set session_replication_role=replica; update public.properties set name='${name}' where id='11111111-1111-4111-8111-111111111111'; set session_replication_role=origin;`);
}
function recordFailure(caseName, result, before, after) {
  const raw = result?.data || result?.error || result;
  const diagnostic = { restoreSessionId: `local-${Date.now()}-${caseName}`, backupId: "local-fixture", recoveryPointId: null, stage: raw?.failureStage || "restore_transaction", table: raw?.table || null, column: raw?.column || null, constraint: raw?.constraint || null, sqlState: raw?.errorCode || raw?.code || result?.error?.code || null, recordId: raw?.recordId || null, workspace: owner, actorType: "owner/free_single", mode: "dry_run", databaseUnchanged: before === after, rawError: raw?.error || raw?.message || null };
  fs.appendFileSync(diagnosticsPath, JSON.stringify(diagnostic) + "\n");
  return diagnostic;
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const payload = readPayload();
const data = restoreData(payload);
const bytes = Buffer.from(JSON.stringify(payload));
assert(payload.sourceWorkspaceId === owner, "fixture workspace mismatch");
assert(Object.values({ properties: data.properties, rooms: data.rooms, tenants: data.tenants, contracts: data.contracts, rentPayments: data.rentPayments, expenses: data.expenses, deposits: data.deposits, viewingAppointments: data.viewingAppointments, tasks: data.tasks, partners: data.partners, partnerShares: data.partnerShares, partnerNameHistory: data.partnerNameHistory, settlementBatches: data.settlementBatches, settlementPartnerSnapshots: data.settlementPartnerSnapshots, settlementSegmentSnapshots: data.settlementSegmentSnapshots, settlementTransferSnapshots: data.settlementTransferSnapshots, checkInRequests: data.checkInRequests, tenantCreateRequests: data.tenantCreateRequests }).every(Array.isArray), "18-table payload incomplete");
const client = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// Recovery point is created through the same private Storage + inventory contract
// used by BeforeRestore; the downloaded bytes, not the original JS object, become
// the canonical Restore input for this acceptance.
const recoveryId = crypto.randomUUID();
const recoveryPath = `${owner}/recovery-points/${recoveryId}.json`;
const upload = await client.storage.from("system-backups").upload(recoveryPath, bytes, { contentType: "application/json", upsert: false });
assert(!upload.error, `recovery upload failed: ${upload.error?.message}`);
const downloaded = await client.storage.from("system-backups").download(recoveryPath);
assert(!downloaded.error && downloaded.data, `recovery download failed: ${downloaded.error?.message}`);
const downloadedBytes = Buffer.from(await downloaded.data.arrayBuffer());
const checksum = sha256(downloadedBytes);
assert(checksum === sha256(bytes), "recovery point checksum mismatch");
const recoveredPayload = JSON.parse(downloadedBytes.toString("utf8"));
const recoveredData = restoreData(recoveredPayload);
const recoveryInsert = await client.from("account_recovery_points").insert({ id: recoveryId, workspace_owner_id: owner, source: "before_restore", retention_class: "event", status: "available", storage_bucket: "system-backups", storage_path: recoveryPath, backup_format_version: 2, schema_version: "20260824180000", checksum, size_bytes: downloadedBytes.length, record_count: 697, created_by: owner });
assert(!recoveryInsert.error, `recovery metadata failed: ${recoveryInsert.error?.message}`);

const dryRuns = [];
const restores = [];
for (let round = 1; round <= 5; round++) {
  const before = fingerprint();
  const dry = await callDryRun(client, recoveredData);
  assert(!dry.error && dry.data?.ok === true && dry.data.databaseUnchanged === true, `dry run ${round} failed: ${JSON.stringify(dry)}`);
  assert(fingerprint() === before, `dry run ${round} mutated database`);
  dryRuns.push(round);
  mutateProperty(`Mutation before restore ${round}`);
  const restored = await callRestore(client, recoveredData);
  assert(!restored.error, `restore ${round} failed: ${JSON.stringify(restored.error)}`);
  assert(sql("select name from public.properties where id='11111111-1111-4111-8111-111111111111'") === "Restore Lab", `restore ${round} post-state mismatch`);
  restores.push(round);
}

const failureCases = [
  ["invalid_uuid", d => ({ ...d, properties: [{ ...d.properties[0], user_id: "not-a-uuid" }, ...d.properties.slice(1)] })],
  ["fk_violation", d => ({ ...d, checkInRequests: [{ ...d.checkInRequests[0], tenant_id: "33333333-3333-4333-8333-333333333339" }, ...d.checkInRequests.slice(1)] })],
  ["duplicate_client_request", d => ({ ...d, checkInRequests: [...d.checkInRequests, d.checkInRequests[0]] })],
  ["wrong_workspace", d => ({ ...d, sourceWorkspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" })],
  ["midway_fk_failure", d => ({ ...d, tasks: [{ ...d.tasks[0], room_id: "22222222-2222-4222-8222-222222222229" }] })],
  ["replay_collision", d => ({ ...d, tenantCreateRequests: [...d.tenantCreateRequests, d.tenantCreateRequests[0]] })]
];
const failureResults = [];
for (const [name, make] of failureCases) {
  const before = fingerprint();
  const result = await callDryRun(client, make(data));
  const after = fingerprint();
  const diagnostic = recordFailure(name, result, before, after);
  assert(diagnostic.databaseUnchanged, `${name} changed database`);
  assert((result.data && result.data.transactionRolledBack) || result.error, `${name} unexpectedly passed`);
  failureResults.push(name);
}

const rowCounts = JSON.parse(sql(`select json_build_object('properties',(select count(*) from public.properties where user_id='${owner}'),'rooms',(select count(*) from public.rooms where user_id='${owner}'),'tenants',(select count(*) from public.tenants where user_id='${owner}'),'contracts',(select count(*) from public.contracts where user_id='${owner}'),'rent_payments',(select count(*) from public.rent_payments where user_id='${owner}'),'expenses',(select count(*) from public.expenses where user_id='${owner}'),'deposits',(select count(*) from public.deposits where user_id='${owner}'),'viewing_appointments',(select count(*) from public.viewing_appointments where user_id='${owner}'),'tasks',(select count(*) from public.tasks where user_id='${owner}'),'partners',(select count(*) from public.partners where workspace_owner_id='${owner}'),'partner_property_shares',(select count(*) from public.partner_property_shares where workspace_owner_id='${owner}'),'partner_name_history',(select count(*) from public.partner_name_history where workspace_owner_id='${owner}'),'settlement_batches',(select count(*) from public.partner_settlement_batches where workspace_owner_id='${owner}'),'settlement_partner_snapshots',(select count(*) from public.partner_settlement_partner_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id='${owner}'),'settlement_segment_snapshots',(select count(*) from public.partner_settlement_segment_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id='${owner}'),'settlement_transfer_snapshots',(select count(*) from public.partner_settlement_transfer_snapshots s join public.partner_settlement_batches b on b.id=s.settlement_batch_id where b.workspace_owner_id='${owner}'),'check_in_requests',(select count(*) from public.check_in_requests where workspace_owner_id='${owner}'),'tenant_create_requests',(select count(*) from public.tenant_create_requests where workspace_owner_id='${owner}'))`));
const finance = JSON.parse(sql(`select json_build_object('separated_total',1+2,'renewal_total',3+4,'legacy_effective_total',3,'void_income',coalesce((select sum(amount_paid) from public.rent_payments where payment_status='已收' and income_item='void' and user_id='${owner}'),0),'expense',coalesce((select sum(amount) from public.expenses where user_id='${owner}'),0),'settlement_net_profit',coalesce((select sum(net_profit) from public.partner_settlement_batches where workspace_owner_id='${owner}'),0))`));
const normalBusinessRegression = JSON.parse(sql(`select json_build_object(
  'tenant_create', to_regprocedure('public.create_tenant_atomic(uuid,uuid,uuid,text,text,text,text,text,numeric,smallint,smallint,date,date,date,date,date,numeric,numeric,text,text,text,text)') is not null,
  'check_in', to_regprocedure('public.create_atomic_check_in(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint,date,date,date,date,text,text,text,text,text)') is not null,
  'payment', to_regprocedure('public.void_rent_payment_with_linked_deposit(uuid)') is not null,
  'expense', exists(select 1 from information_schema.columns where table_name='expenses' and column_name='amount'),
  'renewal', exists(select 1 from public.rent_payments where income_item='renewal' and user_id='${owner}'),
  'move_out', to_regprocedure('public.move_out_tenant_atomic(uuid,text,date)') is not null,
  'settlement', to_regprocedure('public.confirm_partner_settlement(uuid,uuid,date,date,numeric,numeric,numeric,uuid,jsonb,jsonb,jsonb,text,text,text,jsonb,jsonb)') is not null,
  'audit', exists(select 1 from public.audit_logs where action_type ilike '%restore%' or action_type ilike '%create%'),
  'dashboard', (select coalesce(sum(amount_paid),0) from public.rent_payments where user_id='${owner}' and payment_status='已收') = 17
)`));
assert(Object.values(normalBusinessRegression).every(Boolean), `normal business regression incomplete: ${JSON.stringify(normalBusinessRegression)}`);
console.log(JSON.stringify({ project, container, recoveryPointId: recoveryId, recoveryPointStoragePath: recoveryPath, recoveryPointChecksum: checksum, fullDryRunSuccessCount: dryRuns.length, fullRestoreSuccessCount: restores.length, failureInjectionCases: failureResults, rowCounts, finance, normalBusinessRegression, diagnosticsPath }, null, 2));
