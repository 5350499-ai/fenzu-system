import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");
const reminders = readFileSync("app/reminders/page.tsx", "utf8");

test("reminder center keeps the document scrollable above the mobile navigation", () => {
  assert.match(reminders, /className="card panel reminder-page-surface"/);
  assert.match(reminders, /reminders\.map\(\(item\)/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.main\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?overflow-y:\s*auto[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.reminder-page-surface\s*\{[\s\S]*?overflow:\s*visible/);
  assert.match(css, /\.reminder-page-surface\s*\{[\s\S]*?touch-action:\s*pan-y/);
});

test("monthly profit labels and amounts remain separate non-breaking blocks", () => {
  const profits = readFileSync("app/property-profits/page.tsx", "utf8");
  assert.match(profits, /unified-monthly-label/);
  assert.match(profits, /unified-monthly-amount/);
  assert.match(css, /\.unified-monthly-label\s*\{[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.unified-monthly-amount\s*\{[\s\S]*?white-space:\s*nowrap[\s\S]*?word-break:\s*keep-all/);
  assert.match(css, /\.unified-monthly-metric\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test("tenant detail fields use a shared mobile label/value track", () => {
  assert.match(css, /\.tenant-core-detail-grid > \.tenant-detail-pair-row > \.compact-detail-row,[\s\S]*?grid-template-columns:\s*minmax\(5\.5em, max-content\) minmax\(0, 1fr\)/);
  assert.match(css, /tenant-coverage-field[\s\S]*?white-space:\s*nowrap/);
});
