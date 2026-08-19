import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const home = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const more = readFileSync(new URL("../app/more/page.tsx", import.meta.url), "utf8");
const freeSinglePolicy = readFileSync(new URL("../supabase/migrations/20260808110000_free_single_account_boundaries.sql", import.meta.url), "utf8");

test("free single owners keep a settlement entry without receiving partnership settlement access", () => {
  assert.match(home, /item\.href === ["']\/partnership-settlement["'] && access\.isFreeSingle/);
  assert.match(home, /href: ["']\/property-profits["']/);
  assert.match(home, /module: ["']profits["']/);
  assert.match(home, /href: ["']\/partnership-settlement["']/);
  assert.match(freeSinglePolicy, /requested_module in \('attachments', 'partnership_settlement', 'audit_logs', 'accounts'\)/);
  assert.match(freeSinglePolicy, /requested_permission in \([\s\S]*'view_partnership_settlement'/);
});

test("free single owners receive a personal settlement card in More without changing managed navigation", () => {
  assert.match(more, /access\.isFreeSingle[\s\S]*href: ["']\/property-profits["'], label: ["']结算["'], icon: HandCoins/);
  assert.match(more, /const moreItems = access\.isFreeSingle[\s\S]*: items/);
  assert.match(more, /moreItems\.map/);
  assert.match(more, /className="shortcut-grid more-grid"/);
  assert.doesNotMatch(more, /href: ["']\/partnership-settlement["']/);
});

test("managed and partner accounts retain the existing partnership settlement target", () => {
  assert.match(home, /title: ["'][^"']+["'], href: ["']\/partnership-settlement["']/);
  assert.match(home, /canViewPartnershipSettlement/);
});
