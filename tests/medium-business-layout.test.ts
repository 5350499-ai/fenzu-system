import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const mediumStart = css.indexOf("/* 2.4c first batch");
const mediumEnd = css.indexOf("\n}", mediumStart);
const medium = mediumStart >= 0 && mediumEnd >= 0 ? css.slice(mediumStart, mediumEnd + 2) : "";

test("Medium business roots use one scoped responsive contract", () => {
  assert.match(medium, /\.app-shell \.rent-finance-line,[\s\S]*grid-template-columns: max-content max-content minmax\(0, 1fr\) max-content max-content/);
  assert.match(medium, /\.app-shell \.expense-finance-line/);
  assert.doesNotMatch(medium, /\.app-shell \.room-finance-line\s*\{[\s\S]*?grid-template-columns/);
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) auto auto minmax\(0, 1fr\) auto/);
  assert.match(medium, /\.app-shell \.reminder-page-list-single \.reminder-row-primary/);
  assert.match(medium, /\.app-shell \.attachment-inventory-file-row[\s\S]*minmax\(0, 1fr\)/);
  assert.match(medium, /\.app-shell \.partner-management-row/);
  assert.match(medium, /\.app-shell \.settlement-history-summary-metrics/);
});

test("Medium business text owners can shrink without page-wide overflow", () => {
  assert.match(medium, /min-width: 0/);
  assert.match(medium, /text-overflow: ellipsis/);
  assert.match(medium, /white-space: nowrap/);
  assert.doesNotMatch(medium, /window\.innerWidth|screen\.width|devicePixelRatio|userAgent|transform:\s*scale|zoom:/);
});

test("Phone, Shell and stable business contracts remain outside the first-batch scope", () => {
  assert.match(medium, /min-width: 641px/);
  assert.match(medium, /max-width: 1100px/);
  assert.doesNotMatch(medium, /\.tenant-list-identity-row|\.tenant-list-rent-row|\.tenant-status-row|\.tenant-detail-panel/);
  assert.match(css, /\.compact-rail/);
  assert.match(css, /--ui-mobile-nav-overlay-offset/);
});
