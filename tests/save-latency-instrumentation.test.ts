import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string) => readFile(join(root, file), "utf8");

test("save latency instrumentation defines the shared T0-T10 trace model", async () => {
  const helper = await source("lib/save-latency-timing.ts");
  assert.match(helper, /traceId/);
  assert.match(helper, /T0/);
  assert.match(helper, /T10/);
  assert.match(helper, /x-save-trace-id/);
  assert.match(helper, /sessionStorage/);
  assert.match(helper, /performance\.now/);
});

test("server timing is preview-only and preserves uninstrumented requests", async () => {
  const helper = await source("lib/server/save-latency-timing.ts");
  assert.match(helper, /VERCEL_ENV === "preview"/);
  assert.match(helper, /x-save-timing-enabled/);
  assert.match(helper, /server-timing/);
  assert.match(helper, /context\.traceId !== "missing-trace-id"/);
});

test("all four save flows carry timing instrumentation without changing their endpoints", async () => {
  const [checkIn, tenants, rentPayments, businessData, checkInApi, businessDataApi] = await Promise.all([
    source("app/check-in/page.tsx"),
    source("app/tenants/page.tsx"),
    source("app/rent-payments/page.tsx"),
    source("lib/business-data.ts"),
    source("app/api/check-in/route.ts"),
    source("app/api/business-data/route.ts")
  ]);

  assert.match(checkIn, /createSaveTiming\("check-in"\)/);
  assert.match(checkIn, /saveTimingRequestHeaders\(timing\)/);
  assert.match(checkIn, /storePendingCheckInTiming\(timing\)/);
  assert.match(checkInApi, /startServerTiming\(request, "check-in"\)/);
  assert.match(checkInApi, /finishServerTiming/);

  assert.match(tenants, /createSaveTiming\("tenant-create"\)/);
  assert.match(tenants, /TENANT_SAVE_MS/);
  assert.match(tenants, /TENANT_REFRESH_MS/);

  assert.match(rentPayments, /createSaveTiming\(/);
  assert.match(rentPayments, /CORE_PAYMENT_MS/);
  assert.match(rentPayments, /DEPOSIT_SIDE_EFFECT_MS/);
  assert.match(rentPayments, /TENANT_SIDE_EFFECT_MS/);

  assert.match(businessData, /x-save-trace-id/);
  assert.match(businessDataApi, /startServerTiming\(request, "business-data"\)/);
  assert.match(businessDataApi, /finishServerTiming/);
});

test("instrumentation does not add business persistence or migration files", async () => {
  const migrationFiles = await (await import("node:fs/promises")).readdir(join(root, "supabase/migrations"));
  assert.equal(migrationFiles.some((file) => file.includes("save_latency") || file.includes("timing")), false);
});
