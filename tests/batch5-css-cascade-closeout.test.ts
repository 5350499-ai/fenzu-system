import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("Batch 5 keeps shell modes semantic and removes device-width layout branches", () => {
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(min-width: 641px\) and \(max-width: 1100px\)/);
  assert.match(css, /@media \(min-width: 1101px\)/);
  assert.doesNotMatch(css, /@media[^\{]*(?:359|360|375|390|412|430)px/);
});

test("shared capacity grids use intrinsic tracks instead of device-specific fallbacks", () => {
  assert.match(css, /\.settings-list \.settings-currency-row\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 150px\), 1fr\)\)/);
  assert.match(css, /\.account-center-summary-item-grid\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 156px\), 1fr\)\)/);
  assert.match(css, /\.backup-reminder-settings \.field\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 160px\), 1fr\)\)/);
  assert.match(css, /\.form-grid-row\s*\{[\s\S]*?repeat\(auto-fit, minmax\(min\(100%, 160px\), 1fr\)\)/);
});

test("Batch 5 preserves the frozen responsive owners and tokens", () => {
  assert.match(css, /\.main\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?display:\s*none/);
  assert.match(css, /--z-content-overlay:\s*10/);
  assert.match(css, /--z-navigation:\s*20/);
  assert.match(css, /--z-app-modal:\s*100/);
  assert.match(css, /\.unified-monthly-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1\.1fr\) max-content minmax\(0, 1\.35fr\)/);
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) auto auto minmax\(0, 1fr\) auto/);
});
