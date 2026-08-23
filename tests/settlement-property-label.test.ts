import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("settlement segments retain stable property identity across order changes", () => {
  const domain = readFileSync("lib/partner-settlement.ts", "utf8");
  const page = readFileSync("app/partnership-settlement/page.tsx", "utf8");
  assert.match(domain, /propertyId: string;/);
  assert.match(domain, /propertyId: scopedPropertyId/);
  assert.match(domain, /const netProfit = roundMoney\(income - expense\)/);
  assert.match(domain, /totalIncome/);
  assert.match(page, /segment\.propertyId/);
  assert.match(page, /未命名房源/);
  assert.doesNotMatch(page, /title=\{`比例分段/);
});
