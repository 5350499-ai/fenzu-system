import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("current and moved-out tenants use the same detail component and compact action grid", () => {
  assert.equal((page.match(/<TenantDetail\b/g) || []).length, 1);
  assert.match(css, /\.tenant-detail-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tenant-detail-action-spacer\s*\{\s*display:\s*none/);
});

test("tenant list gives name and property readable minimum tracks before badges", () => {
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line\s*\{[\s\S]*?minmax\(5\.5em, 1fr\)[\s\S]*?minmax\(6\.5em, 1\.2fr\)/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line \.tenant-name/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line \.tenant-property-short/);
});
