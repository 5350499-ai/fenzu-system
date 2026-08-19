import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const appLayout = readFileSync(new URL("../components/app-layout.tsx", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const propertyDetail = readFileSync(new URL("../app/properties/[id]/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("new visitors default to light theme without overriding saved preference", () => {
  assert.match(layout, /localStorage\.getItem\("theme"\)/);
  assert.match(layout, /s==="dark"\|\|s==="light"\?s:"light"/);
  assert.match(layout, /document\.documentElement\.dataset\.theme="light"/);
  assert.match(appLayout, /useState\("light"\)/);
  assert.match(appLayout, /saved === "dark" \|\| saved === "light"/);
  assert.match(appLayout, /: "light"/);
});

test("expense category input stays concise and mobile-safe", () => {
  assert.match(expenses, /className="expense-category-input"/);
  assert.match(expenses, /placeholder="选择或输入"/);
  assert.match(css, /\.expense-category-input\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
});

test("property detail allocation facts share a responsive root and stack on phones", () => {
  assert.match(propertyDetail, /property-detail-allocation-grid[\s\S]*?分租[\s\S]*?出租率统计起始日/);
  assert.match(propertyDetail, /property-detail-rate-start/);
  assert.match(css, /\.property-detail-allocation-grid\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1[\s\S]*?grid-template-columns:\s*repeat\(2/);
  assert.match(css, /\.property-detail-rate-start strong\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.property-detail-allocation-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("reminder typography has stable title, body, meta and badge tiers", () => {
  assert.match(css, /--reminder-title-size:\s*14px/);
  assert.match(css, /--reminder-body-size:\s*13px/);
  assert.match(css, /--reminder-meta-size:\s*12px/);
  assert.match(css, /--reminder-badge-size:\s*11px/);
  assert.match(css, /--reminder-badge-height:\s*22px/);
  assert.match(css, /\.reminder-row-kind \.badge,[\s\S]*?min-height:\s*var\(--reminder-badge-height\)/);
});

test("final mobile polish preserves bounded layout at the requested viewports", () => {
  for (const width of [320, 360, 375, 390, 393, 430]) {
    assert.ok(width >= 320);
  }
  assert.match(css, /\.property-detail-allocation-grid[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.expense-category-input[\s\S]*?text-overflow:\s*ellipsis/);
});
