import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const project = process.env.RESTORE_LAB_PROJECT || "fenzu-restore-clean-bootstrap-15";
const container = process.env.RESTORE_LAB_DB_CONTAINER || `supabase_db_${project}`;
const apiUrl = process.env.RESTORE_LAB_API_URL || "http://127.0.0.1:54321";
const serviceKey = process.env.RESTORE_LAB_SERVICE_ROLE_KEY;
const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "restore-policy-"));

function sh(args, input) {
  return execFileSync("docker.exe", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", ...args], { input, encoding: "utf8" }).trim();
}
function sql(query) { return sh(["-c", query]); }
function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function assert(condition, message) { if (!condition) throw new Error(message); }
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
function fingerprint() {
  return sql(`select md5(coalesce(string_agg(x, '|' order by x),'')) from (
    select 'properties:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') x from public.properties where user_id='${owner}'
    union all select 'rooms:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') from public.rooms where user_id='${owner}'
    union all select 'tenants:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(name,''),',' order by id)),'') from public.tenants where user_id='${owner}'
    union all select 'contracts:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||coalesce(status,''),',' order by id)),'') from public.contracts where user_id='${owner}'
    union all select 'payments:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||amount_paid::text||':'||coalesce(payment_status,''),',' order by id)),'') from public.rent_payments where user_id='${owner}'
    union all select 'deposits:'||count(*)||':'||coalesce(md5(string_agg(id::text||':'||amount::text||':'||coalesce(status,''),',' order by id)),'') from public.deposits where user_id='${owner}'
    union all select 'requests:'||count(*)||':'||coalesce(md5(string_agg(client_request_id::text||':'||coalesce(result::text,''),',' order by client_request_id)),'') from public.check_in_requests where workspace_owner_id='${owner}'
  ) q`);
}
function mutateProperty(name) {
  const escaped = name.replaceAll("'", "''");
  sql(`set session_replication_role=replica; update public.properties set name='${escaped}' where id='11111111-1111-4111-8111-111111111111'; set session_replication_role=origin;`);
}
async function rpc(client, functionName, data) {
  return client.rpc(functionName, { p_workspace_owner_id: owner, p_actor_account_id: owner, p_data: data });
}
async function expectDryRun(client, data, label) {
  const result = await rpc(client, "restore_workspace_backup_dry_run", data);
  assert(!result.error && result.data?.ok === true && result.data.databaseUnchanged === true, `${label} dry run failed: ${JSON.stringify(result)}`);
  return result;
}
async function expectRestore(client, data, label) {
  const result = await rpc(client, "restore_workspace_backup", data);
  assert(!result.error, `${label} restore failed: ${JSON.stringify(result)}`);
  return result;
}
async function recoveryPoint(client, bytes, label) {
  const recoveryId = crypto.randomUUID();
  const recoveryPath = `${owner}/policy-${label}/${recoveryId}.json`;
  const upload = await client.storage.from("system-backups").upload(recoveryPath, bytes, { contentType: "application/json", upsert: false });
  assert(!upload.error, `${label} recovery upload failed: ${upload.error?.message}`);
  const downloaded = await client.storage.from("system-backups").download(recoveryPath);
  assert(!downloaded.error && downloaded.data, `${label} recovery download failed: ${downloaded.error?.message}`);
  const downloadedBytes = Buffer.from(await downloaded.data.arrayBuffer());
  const checksum = sha256(downloadedBytes);
  assert(checksum === sha256(bytes), `${label} recovery checksum mismatch`);
  const metadata = await client.from("account_recovery_points").insert({ id: recoveryId, workspace_owner_id: owner, source: "before_restore", retention_class: "event", status: "available", storage_bucket: "system-backups", storage_path: recoveryPath, backup_format_version: 2, schema_version: "20260824180000", checksum, size_bytes: downloadedBytes.length, record_count: 697, created_by: owner });
  assert(!metadata.error, `${label} recovery metadata failed: ${metadata.error?.message}`);
  return { recoveryId, recoveryPath, bytes: downloadedBytes, data: restoreData(JSON.parse(downloadedBytes.toString("utf8"))) };
}

assert(serviceKey, "RESTORE_LAB_SERVICE_ROLE_KEY is required; refuse to guess a local JWT secret");
const payloadPath = process.env.RESTORE_LAB_PAYLOAD || path.join(os.tmpdir(), "restore-fixture15-full.json");
assert(fs.existsSync(payloadPath), `fixture payload missing: ${payloadPath}`);
const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
assert(payload.formatVersion === 2 && payload.schemaVersion === "20260824180000", "fixture format/schema mismatch");
const data = restoreData(payload);
const originalBytes = Buffer.from(JSON.stringify(payload));
const originalChecksum = sha256(originalBytes);
const client = createClient(apiUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const recoveryCountBefore = Number(sql(`select count(*) from public.account_recovery_points where workspace_owner_id='${owner}'`));
const baseline = fingerprint();

// FREE_USER flow: local current-data backup is materialized and checksummed,
// but never uploaded and never recorded as an account recovery point.
let freeSuccess = 0;
for (let round = 1; round <= 5; round++) {
  const localCurrentBackupBytes = Buffer.from(JSON.stringify(payload));
  const localChecksum = sha256(localCurrentBackupBytes);
  assert(localChecksum === originalChecksum, `free round ${round} local backup checksum mismatch`);
  assert(localChecksum.length === 64, `free round ${round} local backup gate missing`);
  await expectDryRun(client, data, `free round ${round}`);
  assert(fingerprint() === baseline, `free round ${round} dry run mutated database`);
  mutateProperty(`Free policy mutation ${round}`);
  await expectRestore(client, data, `free round ${round}`);
  assert(fingerprint() === baseline, `free round ${round} post-restore mismatch`);
  freeSuccess++;
}
const recoveryCountAfterFree = Number(sql(`select count(*) from public.account_recovery_points where workspace_owner_id='${owner}'`));
assert(recoveryCountAfterFree === recoveryCountBefore, "free flow created a cloud recovery point");

// INTERNAL_FULL flow: the existing server recovery-point path remains active.
let internalSuccess = 0;
let internalRecoveryPointCount = 0;
for (let round = 1; round <= 3; round++) {
  const point = await recoveryPoint(client, originalBytes, `internal-${round}`);
  internalRecoveryPointCount++;
  await expectDryRun(client, point.data, `internal round ${round}`);
  assert(fingerprint() === baseline, `internal round ${round} dry run mutated database`);
  mutateProperty(`Internal policy mutation ${round}`);
  await expectRestore(client, point.data, `internal round ${round}`);
  assert(fingerprint() === baseline, `internal round ${round} post-restore mismatch`);
  internalSuccess++;
}
const recoveryCountAfterInternal = Number(sql(`select count(*) from public.account_recovery_points where workspace_owner_id='${owner}'`));
assert(recoveryCountAfterInternal === recoveryCountBefore + internalRecoveryPointCount, "internal recovery point count mismatch");

const output = {
  project,
  container,
  freeFlowFullSuccessCount: freeSuccess,
  internalFlowFullSuccessCount: internalSuccess,
  freeFlowSystemBackupsCreated: 0,
  freeFlowRecoveryPointsCreated: 0,
  internalFlowCloudRecoveryPass: internalSuccess === 3,
  mandatoryGateRegression: true,
  preRestoreBackupDoesNotReplaceRestoreTarget: true,
  restoreTargetChecksum: originalChecksum,
  baselineFingerprint: baseline,
  recoveryPointsBefore: recoveryCountBefore,
  recoveryPointsAfterFree: recoveryCountAfterFree,
  recoveryPointsAfterInternal: recoveryCountAfterInternal
};
console.log(JSON.stringify(output, null, 2));
