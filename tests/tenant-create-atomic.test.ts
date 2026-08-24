import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
// @ts-expect-error Node's test runner loads this narrow TypeScript helper directly.
import { createTenantCreateSubmissionGuard } from "../lib/tenant-create.ts";

const root = process.cwd();
const source = (file: string) => readFile(join(root, file), "utf8");

test("tenant creation is one authenticated API/RPC transaction with idempotency", async () => {
  const [route, migration, page] = await Promise.all([
    source("app/api/tenants/create/route.ts"),
    source("supabase/migrations/20260824155308_tenant_create_atomic.sql"),
    source("app/tenants/page.tsx")
  ]);
  assert.match(route, /requireActiveAccount/);
  assert.match(route, /requirePropertyAccess/);
  assert.match(route, /create_tenant_atomic/);
  assert.match(route, /startServerTiming\(request, "tenant-create"\)/);
  assert.match(migration, /tenant_create_requests/);
  assert.match(migration, /security definer set search_path = ''/);
  assert.match(migration, /on conflict \(client_request_id\) do nothing/);
  assert.match(migration, /idempotentReplay/);
  assert.match(page, /fetch\("\/api\/tenants\/create"/);
  assert.match(page, /createTenantCreateSubmissionGuard/);
  assert.doesNotMatch(page.slice(page.indexOf('const guarded ='), page.indexOf('} catch (error: any)', page.indexOf('const guarded ='))), /persistAll\(/);
});

test("atomic create preserves separated rent/deposit finance and omits zero rows", async () => {
  const migration = await source("supabase/migrations/20260824155308_tenant_create_atomic.sql");
  assert.match(migration, /v_rent_paid numeric := case when coalesce\(p_payment_status, '已收'\) = '未收' then 0 else coalesce\(p_rent_amount, 0\) end/);
  assert.match(migration, /if v_has_payment then[\s\S]*insert into public\.rent_payments/);
  assert.match(migration, /if coalesce\(p_deposit_amount,0\) > 0 then[\s\S]*insert into public\.deposits/);
  assert.match(migration, /'totalReceived',v_rent_paid \+ p_deposit_amount/);
  assert.doesNotMatch(migration, /amount_paid[^\n]*p_rent_amount\s*\+\s*p_deposit_amount/);
});

test("room state is derived without introducing a shared-room capacity guard", async () => {
  const migration = await source("supabase/migrations/20260824155308_tenant_create_atomic.sql");
  assert.match(migration, /select \* into v_room[\s\S]*for update/);
  assert.match(migration, /exists\(select 1 from public\.tenants[\s\S]*status like '%在租%'/);
  assert.doesNotMatch(migration, /count\(\*\)[^;]*(capacity|occupancy|occupant)/i);
});

test("tenant-create submission lock rejects a rapid second tap and releases on failure", async () => {
  const guard = createTenantCreateSubmissionGuard();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = guard.run(async () => { await pending; return "saved"; });
  const second = await guard.run(async () => "duplicate");
  assert.equal(second.started, false);
  release();
  assert.deepEqual(await first, { started: true, value: "saved" });
  await assert.rejects(guard.run(async () => { throw new Error("failed"); }), /failed/);
  assert.deepEqual(await guard.run(async () => "retry"), { started: true, value: "retry" });
});

test("atomic tenant creation uses local result plus one invalidation instead of a tenant refresh", async () => {
  const page = await source("app/tenants/page.tsx");
  const segment = page.slice(page.indexOf('const guarded ='), page.indexOf('} catch (error: any)', page.indexOf('const guarded =')));
  assert.match(segment, /setTenants/);
  assert.match(segment, /setRooms/);
  assert.match(segment, /setContracts/);
  assert.match(segment, /invalidateBusinessData\(\[tenantKey, roomKey, contractKey, rentPaymentKey, depositKey\]\)/);
  assert.doesNotMatch(segment, /refreshBusinessData/);
  assert.match(segment, /TENANT_CREATE_API_MS/);
  assert.match(segment, /TENANT_CREATE_RPC_MS/);
  assert.match(segment, /TENANT_CREATE_TOTAL_MS/);
});
