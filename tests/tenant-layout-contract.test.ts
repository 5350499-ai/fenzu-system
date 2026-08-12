import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("current and moved-out tenants use the same detail component and compact action grid", () => {
  assert.equal((page.match(/<TenantDetail\b/g) || []).length, 1);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions-row\s*\{\s*display:\s*contents/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-action-spacer\s*\{\s*display:\s*none/);
});

test("tenant detail uses the final four-pair plus two-wide-row contract", () => {
  assert.equal((page.match(/className="tenant-detail-pair-row"/g) || []).length, 4);
  assert.match(page, /className="tenant-detail-wide-row tenant-coverage-field"/);
  assert.match(page, /className="tenant-detail-wide-row tenant-note-field"/);
  assert.match(css, /\.tenant-core-detail-grid > \.tenant-detail-pair-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /--tenant-detail-row-gap:\s*var\(--ui-compact-row-gap\)/);
});

test("deposit status is represented once in the expanded detail and payment summary remains", () => {
  assert.equal((page.match(/<span className="muted">押金状态<\/span>/g) || []).length, 1);
  assert.match(page, /tenant-payment-performance/);
  assert.match(page, /tenant-performance-summary/);
});

test("tenant list gives name and property readable minimum tracks before badges", () => {
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line\s*\{[\s\S]*?minmax\(5\.5em, 1fr\)[\s\S]*?minmax\(6\.5em, 1\.2fr\)/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line \.tenant-name/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line \.tenant-property-short/);
});

test("tenant list collapses statuses into one wrapping track", () => {
  assert.match(page, /className="tenant-status-wrapper"/);
  assert.match(css, /\.tenant-compact-list \.tenant-status-wrapper\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line > \.tenant-status-wrapper\s*\{[\s\S]*?grid-column:\s*5/);
  assert.match(css, /\.tenant-compact-list \.tenant-mobile-meta\s*\{[\s\S]*?flex-wrap:\s*wrap/);
});

test("tenant room uses a compact list contract and a full detail contract", () => {
  assert.match(page, /className="tenant-list-room"/);
  assert.doesNotMatch(page, /compactRoomName\(/);
  assert.match(page, /className="tenant-detail-property"/);
  assert.match(page, /className="tenant-detail-room"/);
  assert.match(css, /\.tenant-compact-list \.tenant-finance-line > \.tenant-list-room[\s\S]*?max-width:\s*10ch[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-property > strong,[\s\S]*?\.tenant-detail-panel \.tenant-detail-room > strong[\s\S]*?overflow:\s*visible[\s\S]*?white-space:\s*normal/);
});

test("compact vertical rhythm uses relative gaps and preserves touch-sized actions", () => {
  assert.match(css, /--ui-compact-row-gap:\s*0\.5em/);
  assert.match(css, /\.tenant-core-detail-grid\s*\{[\s\S]*?row-gap:\s*0/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?row-gap:\s*var\(--ui-compact-action-row-gap\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-action-button\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
  assert.doesNotMatch(css, /\.tenant-core-detail-grid[^\{]*\{[^\}]*height:\s*\d+px/i);
});

test("tenant detail core rows use one gap source and keep action touch targets", () => {
  assert.match(css, /\.tenant-detail-panel \.tenant-core-detail-grid\s*\{[\s\S]*?row-gap:\s*var\(--ui-compact-row-gap\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-core-detail-grid \.compact-detail-row\s*\{[\s\S]*?padding-block:\s*2px/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?row-gap:\s*0\.35em[\s\S]*?margin-block:\s*0[\s\S]*?padding-block:\s*0/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-action-button\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
});
