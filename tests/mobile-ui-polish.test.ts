import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");
const reminders = readFileSync("app/reminders/page.tsx", "utf8");

test("reminder center keeps the document scrollable above the mobile navigation", () => {
  assert.match(reminders, /className="card panel reminder-page-surface"/);
  assert.match(css, /\.reminder-page-surface\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.reminder-page-surface\s*\{[\s\S]*?touch-action:\s*pan-y[\s\S]*?padding-bottom:\s*var\(--ui-bottom-nav-clearance\)/);
});

test("monthly profit amounts may wrap instead of truncating on narrow screens", () => {
  assert.match(css, /\.unified-monthly-metric b\s*\{[\s\S]*?overflow-wrap:\s*anywhere[\s\S]*?white-space:\s*normal/);
});

test("tenant detail fields use a shared mobile label/value track", () => {
  assert.match(css, /\.tenant-core-detail-grid > \.tenant-detail-pair-row > \.compact-detail-row,[\s\S]*?grid-template-columns:\s*minmax\(5\.5em, max-content\) minmax\(0, 1fr\)/);
  assert.match(css, /tenant-coverage-field[\s\S]*?white-space:\s*nowrap/);
});
