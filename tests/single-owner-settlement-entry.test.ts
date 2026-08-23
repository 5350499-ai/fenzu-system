import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const more = readFileSync(new URL("../app/more/page.tsx", import.meta.url), "utf8");
const layout = readFileSync(new URL("../components/app-layout.tsx", import.meta.url), "utf8");
const settlement = readFileSync(new URL("../app/partnership-settlement/page.tsx", import.meta.url), "utf8");
const profit = readFileSync(new URL("../app/property-profits/page.tsx", import.meta.url), "utf8");

test("ordinary single-owner and managed homepage settlement shortcuts share the settlement route", () => {
  assert.match(home, /title: "结算", href: "\/partnership-settlement"/);
  assert.doesNotMatch(home, /item\.href === "\/partnership-settlement" && access\.isFreeSingle/);
  assert.doesNotMatch(home, /href: "\/property-profits", module: "profits"/);
});

test("More and shared navigation retain settlement as a distinct canonical destination", () => {
  assert.match(more, /items\.map/);
  assert.doesNotMatch(more, /access\.isFreeSingle[\s\S]*结算/);
  assert.match(layout, /href: "\/partnership-settlement", label: "合伙结算"/);
  assert.match(settlement, /<AppLayout title="合伙结算"/);
  assert.match(profit, /<AppLayout title="房源利润分析"/);
});

test("free-single settlement read access is explicit and remains least-privilege", () => {
  const freeSingle = readFileSync(new URL("../lib/free-single.ts", import.meta.url), "utf8");
  const meApi = readFileSync(new URL("../app/api/accounts/me/route.ts", import.meta.url), "utf8");
  const settlementApi = readFileSync(new URL("../app/api/partner-settlements/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(freeSingle, /partnership_settlement/);
  assert.match(meApi, /base\.moduleKey === "partnership_settlement"/);
  assert.match(meApi, /key === "canViewPartnershipSettlement"/);
  assert.match(settlementApi, /requireSettlementHistoryAccess\(context\)/);
  assert.match(settlementApi, /requireSettlementConfirmationAccess\(context\)/);
});
