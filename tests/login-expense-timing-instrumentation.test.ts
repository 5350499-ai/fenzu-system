import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (file: string) => readFile(file, "utf8");

test("login timing carries one trace from submit through home interactive", async () => {
  const [login, dashboard, helper, api] = await Promise.all([
    source("app/login/page.tsx"),
    source("app/page.tsx"),
    source("lib/save-latency-timing.ts"),
    source("app/api/performance-timing/login/route.ts")
  ]);
  assert.match(login, /createSaveTiming\("login"\)/);
  assert.match(login, /saveTimingRequestHeaders\(timing\)/);
  assert.match(login, /storePendingLoginTiming\(timing\)/);
  assert.match(login, /SESSION_READY/);
  assert.match(login, /ACCOUNT_ACCESS_START/);
  assert.match(login, /REDIRECT_START/);
  assert.match(dashboard, /takePendingLoginTiming\(\)/);
  assert.match(dashboard, /HOME_LOAD_START/);
  assert.match(dashboard, /emitLoginTiming\(loginTiming/);
  assert.match(helper, /LOGIN_PENDING_KEY/);
  assert.match(api, /VERCEL_ENV === "preview"/);
  assert.match(api, /\[login-timing\]/);
});

test("expense create and edit share Preview-only timing instrumentation", async () => {
  const [expenses, helper, api, businessDataApi] = await Promise.all([
    source("app/expenses/page.tsx"),
    source("lib/save-latency-timing.ts"),
    source("app/api/performance-timing/expense/route.ts"),
    source("app/api/business-data/route.ts")
  ]);
  assert.match(expenses, /createSaveTiming\(form\.id \? "expense-edit" : "expense-create"\)/);
  assert.match(expenses, /emitExpenseTiming\(timing\)/);
  assert.match(expenses, /ATTACHMENT_START/);
  assert.match(expenses, /LOCAL_STATE_READY/);
  assert.match(helper, /emitExpenseTiming/);
  assert.match(api, /expense-(?:create|edit)/);
  assert.match(api, /\[expense-timing\]/);
  assert.match(businessDataApi, /startServerTiming\(request, "business-data"\)/);
});

test("timing sinks remain non-persistent and Preview-only", async () => {
  const [loginApi, expenseApi] = await Promise.all([
    source("app/api/performance-timing/login/route.ts"),
    source("app/api/performance-timing/expense/route.ts")
  ]);
  for (const api of [loginApi, expenseApi]) {
    assert.match(api, /VERCEL_ENV === "preview"/);
    assert.doesNotMatch(api, /\.from\(/);
    assert.doesNotMatch(api, /insert\(|update\(|delete\(/);
  }
});
