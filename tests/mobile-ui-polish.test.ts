import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");
const reminders = readFileSync("app/reminders/page.tsx", "utf8");

test("reminder center relies on the canonical main scroll owner above the reserved navigation row", () => {
  assert.match(reminders, /className="card panel"/);
  assert.doesNotMatch(reminders, /reminder-page-surface/);
  assert.match(reminders, /reminders\.map\(\(item\)/);
  assert.match(css, /\.app-shell\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.main\s*\{[\s\S]*?min-height:\s*0[\s\S]*?overflow-y:\s*auto[\s\S]*?-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?position:\s*relative[\s\S]*?grid-row:\s*2/);
});

test("reminder lists of 4, 8 and 12 rows have no page-local scroll or navigation-clearance owner", () => {
  const mainClientHeight = 640;
  const pageTop = 18;
  const rowBlockSize = 96;
  const rowGap = 6;
  const requiredBottomGap = 18;
  for (const reminderCount of [4, 8, 12]) {
    assert.ok(reminderCount > 3);
    assert.match(reminders, /reminders\.map\(\(item\)/);
    const listHeight = reminderCount * rowBlockSize + (reminderCount - 1) * rowGap;
    const lastCardBottom = pageTop + listHeight;
    const mainScrollHeight = lastCardBottom + requiredBottomGap;
    const maxScrollTop = Math.max(0, mainScrollHeight - mainClientHeight);
    const visibleBottomAtMaxScroll = maxScrollTop + mainClientHeight;
    assert.ok(lastCardBottom <= visibleBottomAtMaxScroll - requiredBottomGap);
  }
  assert.doesNotMatch(reminders, /reminder-page-surface/);
  assert.doesNotMatch(css, /\.reminder-page-surface\s*\{/);
  assert.match(css, /\.main\s*\{[\s\S]*?overflow-y:\s*auto/);
});

test("full reminder route keeps page and list content-sized for the main scroll owner", () => {
  assert.match(reminders, /className="card panel reminders-more-page"/);
  assert.match(css, /\.reminders-more-page,\s*\n\.reminders-more-page \.reminder-page-list-single\s*\{[\s\S]*?min-block-size:\s*max-content;[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(css, /\.reminders-more-page[^}]*overflow-y\s*:\s*(?:auto|scroll)/);
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
