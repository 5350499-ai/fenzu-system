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
  assert.match(partnerSettings, /function usePartnerDirectoryState\(scope:\s*string/);
  assert.match(payments, /usePartnerDirectoryState\(access\.userId, access\.isFreeSingle\)/);
  assert.match(expenses, /usePartnerDirectoryState\(access\.userId, access\.isFreeSingle\)/);
});

test("MONTHLY_RESULT_SEMANTIC_ORDER and PROFIT_LABEL_VALUE_STATUS_GROUPING", () => {
  const period = profits.indexOf("unified-monthly-period");
  const status = profits.indexOf("unified-monthly-status-region");
  const financial = profits.indexOf("unified-monthly-financial");
  assert.ok(period < status && status < financial);
  assert.doesNotMatch(profits, /unified-monthly-income|unified-monthly-expense|unified-monthly-right/);
  const financialRegion = profits.slice(financial, profits.indexOf("</div>)}", financial));
  assert.match(financialRegion, /收入/);
  assert.match(financialRegion, /支出/);
  assert.match(financialRegion, /净利润/);
  assert.match(profits, /<StatusBadge tone=\{row\.financial\.netProfit < 0 \? "red" : row\.financial\.netProfit > 0 \? "green" : undefined\} className="unified-monthly-status-badge">/);
});

test("CONTENT_DRIVEN_PROFIT_ALIGNMENT keeps complete values and natural regions", () => {
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) max-content minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.unified-monthly-financial\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /\.unified-monthly-financial \.unified-monthly-metric\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content/);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
  assert.match(css, /\.unified-monthly-status-region\s*\{[\s\S]*?align-items:\s*center/);
  assert.match(css, /\.unified-monthly-status-badge\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.doesNotMatch(css, /@media[^\{]*(?:375|390|412|430)px/);
});
