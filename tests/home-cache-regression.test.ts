import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homepage = readFileSync("app/page.tsx", "utf8");
const cacheManager = readFileSync("lib/cache/cache-manager.ts", "utf8");
const businessData = readFileSync("lib/business-data.ts", "utf8");
const cacheKeys = readFileSync("lib/cache/cache-keys.ts", "utf8");
const partners = readFileSync("lib/partners.ts", "utf8");
const cacheRuntime = readFileSync("components/cache-runtime.tsx", "utf8");
const homeTiming = readFileSync("lib/home-load-timing.ts", "utf8");

test("home renders the warm dashboard snapshot before backup reminder revalidation", () => {
  const cacheRead = homepage.indexOf("const memorySnapshot = cacheManager.peekMemory");
  const reminderFetch = homepage.indexOf("void loadServerBackupReminderSettings");
  const dashboardGet = homepage.indexOf("const snapshot = await cacheManager.get<DashboardSnapshot>");
  assert.ok(cacheRead >= 0);
  assert.ok(reminderFetch > cacheRead);
  assert.ok(dashboardGet > cacheRead);
  assert.match(homepage.slice(reminderFetch, dashboardGet), /void loadServerBackupReminderSettings/);
  assert.match(homepage, /if \(memorySnapshot\) applySnapshot\(memorySnapshot\)/);
  assert.match(homepage, /setDataStatus\("loading"\)/);
});

test("global cache keeps the dashboard key scoped and stale-while-revalidate", () => {
  assert.match(cacheManager, /GLOBAL_CACHE_VERSION = "global-cache-v3"/);
  assert.match(cacheManager, /return `\$\{GLOBAL_CACHE_VERSION\}:\$\{scope\}:\$\{key\}`/);
  assert.match(cacheManager, /this\.revalidate\(key, options\)\.catch/);
  assert.match(cacheKeys, /DASHBOARD_CACHE_KEY = "dashboard-v4"/);
  assert.match(cacheKeys, /PARTNER_SETTLEMENT_CACHE_KEY = "partner-settlement-v4"/);
  assert.doesNotMatch(businessData, /dashboard-v3|partner-settlement-v3/);
  assert.match(businessData, /FINANCE_DERIVED_CACHE_KEYS/);
  assert.match(partners, /PARTNER_SETTLEMENT_CACHE_KEY/);
});

test("business mutations invalidate the dashboard aggregate precisely", () => {
  for (const key of ["expenseKey", "rentPaymentKey", "depositKey", "propertyKey", "roomKey", "tenantKey", "contractKey", "viewingAppointmentKey"]) {
    assert.match(businessData, new RegExp(`\\[${key}\\]:[\\s\\S]*?HOME_DERIVED_CACHE_KEYS`));
  }
  assert.match(businessData, /\[depositKey\]: \[depositKey, \.\.\.FINANCE_DERIVED_CACHE_KEYS\]/);
});

test("homepage starts independent reads together and excludes competing global warmup", () => {
  assert.match(homepage, /const coreLoad = Promise\.all\(\[/);
  assert.match(homepage, /const secondaryLoad = Promise\.all\(\[/);
  assert.match(homepage, /await Promise\.all\(\[coreLoad, secondaryLoad\]\)/);
  assert.match(homepage, /HOME_CORE_LOAD_MS/);
  assert.match(homepage, /HOME_SECONDARY_LOAD_MS/);
  assert.match(homepage, /HOME_TOTAL_MS/);
  assert.match(homepage, /HOME_INTERACTIVE/);
  assert.match(cacheRuntime, /window\.location\.pathname === "\/"/);
  assert.match(homeTiming, /hostname !== "fenzu-system\.vercel\.app"/);
  assert.match(homeTiming, /api\/performance-timing\/home/);
});
