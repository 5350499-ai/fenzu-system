import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const payments = readFileSync(new URL("../app/rent-payments/page.tsx", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const profits = readFileSync(new URL("../app/property-profits/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const partnerSettings = readFileSync(new URL("../lib/partner-settings.ts", import.meta.url), "utf8");

test("NO_WRONG_PARTNER_FLASH_ON_INITIAL_RENDER", () => {
  assert.match(partnerSettings, /state === "loading"\) return "归属加载中"/);
  assert.match(partnerSettings, /state === "unavailable"\) return "归属暂不可用"/);
  assert.match(partnerSettings, /state === "ready" \? partnerClass\(partner\) : "partner-pending"/);
  assert.doesNotMatch(payments, /partnerLabel\(payment\.receivedBy, partnerDirectory\)/);
  assert.doesNotMatch(expenses, /partnerLabel\(expense\.paidBy, partnerDirectory\)/);
});

test("REAL_PARTNER_NAME_AFTER_HYDRATION", () => {
  assert.match(partnerSettings, /return partnerLabel\(partner, directory\)/);
  assert.match(payments, /setPartnerDirectoryState\(partnerData \? "ready" : "unavailable"\)/);
  assert.match(expenses, /setPartnerDirectoryState\(partnerData \? "ready" : "unavailable"\)/);
});

test("MONTHLY_RESULT_SEMANTIC_ORDER and PROFIT_LABEL_VALUE_STATUS_GROUPING", () => {
  const left = profits.indexOf("unified-monthly-left");
  const income = profits.indexOf("unified-monthly-income");
  const expense = profits.indexOf("unified-monthly-expense");
  const right = profits.indexOf("unified-monthly-right");
  assert.ok(left < income && income < expense && expense < right);
  assert.doesNotMatch(profits, /unified-monthly-middle/);
  const netRegion = profits.slice(right, profits.indexOf("</div>)}", right));
  assert.match(netRegion, /unified-monthly-label">净利润/);
  assert.match(netRegion, /unified-monthly-amount/);
  assert.match(netRegion, /unified-monthly-status/);
});

test("CONTENT_DRIVEN_PROFIT_ALIGNMENT keeps complete values and natural regions", () => {
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 8rem\), 1fr\)\)/);
  assert.match(css, /\.unified-monthly-metric,[\s\S]*?\.unified-monthly-status\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content/);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
  assert.match(css, /\.unified-monthly-status\s*\{[\s\S]*?margin-top:\s*auto/);
  assert.doesNotMatch(css, /@media[^\{]*(?:375|390|412|430)px/);
});
