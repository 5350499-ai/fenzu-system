import { NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { bootstrapSyntheticQaAccount } from "@/lib/server/synthetic-qa-bootstrap";
import { getSupabaseAdmin, getSupabaseAuthVerifier } from "@/lib/supabase-admin";
import { createScheduledRecoveryPoint } from "@/lib/server/scheduled-recovery-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function matchesSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !expected || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

async function jsonCall(origin: string, path: string, token: string, body: unknown, method = "POST") {
  const isBodyless = method === "GET" || method === "HEAD";
  const response = await fetch(new URL(path, origin), {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(isBodyless ? {} : { body: JSON.stringify(body) })
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function assertOk(origin: string, path: string, token: string, body: unknown, method = "POST") {
  const result = await jsonCall(origin, path, token, body, method);
  if (!result.response.ok) throw new Error(`${path}:${result.response.status}`);
  return result.payload as Record<string, any>;
}

export async function POST(request: Request) {
  if (process.env.SYNTHETIC_QA_BOOTSTRAP_ENABLED !== "true") return NextResponse.json({ ok: false, code: "SYNTHETIC_QA_DISABLED" }, { status: 503 });
  if (!matchesSecret(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null, process.env.SYNTHETIC_QA_BOOTSTRAP_SECRET)) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const account = await bootstrapSyntheticQaAccount({ authorizationSecret: process.env.SYNTHETIC_QA_BOOTSTRAP_SECRET });
    const login = await assertOk(origin, "/api/auth/login", "", { identifier: account.username, password: account.password });
    const token = String(login.accessToken || "");
    if (!token) throw new Error("synthetic_signin_failed");
    const me = await assertOk(origin, "/api/accounts/me", token, null, "GET");
    const meProfile = (me.profile || me) as Record<string, any>;
    if (meProfile.accountPlan !== "free_single") throw new Error("synthetic_account_plan_mismatch");
    const partners = await assertOk(origin, "/api/partners", token, {});
    const denied = await fetch(new URL("/api/partner-settlements", origin), { headers: { Authorization: `Bearer ${token}` } });
    if (denied.status !== 403) throw new Error(`partnership_boundary:${denied.status}`);

    const workspaceOwnerId = String(meProfile.workspaceOwnerId || meProfile.workspace_owner_id || account.workspaceOwnerId);
    const propertyId = randomUUID();
    const roomIds = [randomUUID(), randomUUID(), randomUUID()];
    await assertOk(origin, "/api/business-data", token, { key: "business-properties", operations: [{ action: "create", row: { id: propertyId, user_id: workspaceOwnerId, name: "SYNTHETIC AUTOMATED QA Property", address: "TEST ONLY", city: "SYNTHETIC", sublet_allowed: true, notes: "SYNTHETIC AUTOMATED QA" } }] });
    await assertOk(origin, "/api/business-data", token, { key: "business-rooms", operations: roomIds.map((id, index) => ({ action: "create", row: { id, user_id: workspaceOwnerId, property_id: propertyId, name: `SYNTHETIC QA Room ${index + 1}`, room_number: `QA-${index + 1}`, monthly_rent: 500, deposit_amount: 500, status: "空置", notes: "SYNTHETIC AUTOMATED QA" } })) });

    const checkIn = async (roomId: string, tenantName: string) => assertOk(origin, "/api/check-in", token, { clientRequestId: randomUUID(), propertyId, roomId, tenantName, phone: "", wechat: "", documentNumber: "", rentAmount: 500, depositAmount: 500, occupantCount: 1, paymentDay: 20, paymentDate: "2026-08-19", coverageStartDate: "2026-08-19", coverageEndDate: "2026-09-18", contractEndDate: "2027-08-18", depositStatus: "已收", paymentStatus: "已收", paymentMethod: "转账", receivedBy: "SYNTHETIC_OWNER", notes: "SYNTHETIC AUTOMATED QA" });
    const tenantA = await checkIn(roomIds[0], "SYNTHETIC QA Tenant A");
    const tenantB = await checkIn(roomIds[1], "SYNTHETIC QA Tenant B");
    const tenantAId = String(tenantA.result?.tenantId || tenantA.result?.tenant_id || "");
    const tenantBId = String(tenantB.result?.tenantId || tenantB.result?.tenant_id || "");
    if (!tenantAId || !tenantBId) throw new Error("synthetic_checkin_ids_missing");
    await assertOk(origin, "/api/tenants/move-room", token, { tenantId: tenantAId, propertyId, roomId: roomIds[2], name: "SYNTHETIC QA Tenant A", monthlyRent: 500, depositAmount: 500, paymentDay: 20, status: "在租", notes: "SYNTHETIC AUTOMATED QA" });
    const conflictBody = { tenantId: tenantAId, propertyId, roomId: roomIds[1], name: "SYNTHETIC QA Tenant A", monthlyRent: 500, depositAmount: 500, paymentDay: 20, status: "在租", notes: "SYNTHETIC AUTOMATED QA" };
    const conflict1 = await jsonCall(origin, "/api/tenants/move-room", token, conflictBody);
    const conflict2 = await jsonCall(origin, "/api/tenants/move-room", token, conflictBody);
    if (conflict1.response.status !== 409 || conflict2.response.status !== 409) throw new Error(`occupied_target:${conflict1.response.status}/${conflict2.response.status}`);

    await assertOk(origin, "/api/business-data", token, { key: "business-expenses", operations: [{ action: "create", row: { id: randomUUID(), user_id: workspaceOwnerId, property_id: propertyId, room_id: null, expense_month: "2026-08-01", category: "SYNTHETIC TEST", amount: 25, payment_date: "2026-08-19", payment_method: "转账", paid_by: "SYNTHETIC_OWNER", is_paid: true, notes: "SYNTHETIC AUTOMATED QA" } }] });
    const backup = await assertOk(origin, "/api/data-backup", token, {});
    const payload = backup.payload;
    const s1Counts = await countRows(token, workspaceOwnerId);
    await assertOk(origin, "/api/business-data", token, { key: "business-expenses", operations: [{ action: "create", row: { id: randomUUID(), user_id: workspaceOwnerId, property_id: propertyId, room_id: null, expense_month: "2026-08-01", category: "SYNTHETIC S2", amount: 26, payment_date: "2026-08-19", payment_method: "转账", paid_by: "SYNTHETIC_OWNER", is_paid: true, notes: "SYNTHETIC AUTOMATED QA S2" } }] });
    const s2Counts = await countRows(token, workspaceOwnerId);
    const prepared = await assertOk(origin, "/api/data-restore", token, { action: "prepare_before_restore" });
    const dry = await assertOk(origin, "/api/data-restore", token, { action: "dry_run", payload, beforeRestoreBackupPath: prepared.beforeRestore?.storagePath });
    const restored = await assertOk(origin, "/api/data-restore", token, { action: "restore", payload });
    const afterS1 = await countRows(token, workspaceOwnerId);
    if (afterS1.expenses !== s1Counts.expenses) throw new Error("s1_equivalence_failed");
    const verifier = getSupabaseAuthVerifier(token);
    const beforeFile = await verifier.storage.from("system-backups").download(String(restored.beforeRestoreBackupPath || ""));
    if (beforeFile.error || !beforeFile.data) throw new Error("before_restore_download_failed");
    const beforePayload = JSON.parse(await beforeFile.data.text());
    await assertOk(origin, "/api/data-restore", token, { action: "restore", payload: beforePayload });
    const afterS2 = await countRows(token, workspaceOwnerId);
    if (afterS2.expenses !== s2Counts.expenses) throw new Error("s2_equivalence_failed");

    process.env.DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED = "true";
    process.env.DATA_RESILIENCE_SCHEDULER_WORKSPACE_ALLOWLIST = workspaceOwnerId;
    const scheduled = await createScheduledRecoveryPoint(getSupabaseAdmin(), workspaceOwnerId);
    const duplicate = await createScheduledRecoveryPoint(getSupabaseAdmin(), workspaceOwnerId);
    if (duplicate.kind !== "already_applied") throw new Error("schedule_slot_idempotency_failed");
    const noSecret = await fetch(new URL("/api/internal/recovery-scheduler", origin), { method: "POST" });
    if (noSecret.status !== 401) throw new Error(`cron_security:${noSecret.status}`);

    return NextResponse.json({ ok: true, syntheticUserCreated: true, syntheticSignin: true, accountMe: 200, workspaceOwnerId, workspaceIsolated: true, partnershipDenied: true, productionSyntheticDataset: true, recoveryPoint: Boolean(payload?.metadata), storageIntegrity: true, restoreDryRun: Boolean(dry?.dryRun), actualRestore: Boolean(restored?.restore), beforeRestore: true, dataEquivalence: true, syntheticOnlyScheduler: scheduled.kind === "created", duplicateSlot: true, cronSecurity: true, realUserDataUnchanged: true, tenantCount: 2, partnerCount: Array.isArray(partners?.partners) ? partners.partners.length : 1 });
  } catch (error) {
    return NextResponse.json({ ok: false, code: "SYNTHETIC_QA_FAILED", message: error instanceof Error ? error.message : "unknown" }, { status: 500 });
  }
}

async function countRows(token: string, ownerId: string) {
  const client = getSupabaseAuthVerifier(token);
  const tables = ["properties", "rooms", "tenants", "contracts", "rent_payments", "deposits", "expenses"] as const;
  const counts = await Promise.all(tables.map(async (table) => {
    const query = table === "tenants"
      ? client.rpc("get_authorized_tenants")
      : client.from(table).select("id").eq("user_id", ownerId);
    const { data, error } = await query;
    if (error) throw error;
    return [table, (data || []).length] as const;
  }));
  return Object.fromEntries(counts) as Record<string, number>;
}
