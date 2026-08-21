import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const homepage = readFileSync("app/page.tsx", "utf8");
const cacheManager = readFileSync("lib/cache/cache-manager.ts", "utf8");
const businessData = readFileSync("lib/business-data.ts", "utf8");

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
  assert.match(businessData, /"dashboard-v3"/);
});

test("business mutations invalidate the dashboard aggregate precisely", () => {
  for (const key of ["expenseKey", "rentPaymentKey", "propertyKey", "roomKey", "tenantKey", "contractKey", "taskKey"]) {
    assert.match(businessData, new RegExp(`\\[${key}\\]:[\\s\\S]*?(home-summary|dashboard-v3)`));
  }
});
