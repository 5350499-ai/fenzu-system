import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function rule(selector: string) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing CSS owner: ${selector}`);
  const end = css.indexOf("\n}", start);
  assert.ok(end >= 0, `unterminated CSS owner: ${selector}`);
  return css.slice(start, end + 2);
}

test("table scrolling is owned by a bounded wrapper, not the page", () => {
  const wrapper = rule(".table-wrap");
  assert.match(wrapper, /overflow-x:\s*auto/);
  assert.match(wrapper, /min-width:\s*0/);
  assert.match(wrapper, /max-width:\s*100%/);
  assert.match(css, /table\s*\{[\s\S]*?min-width:\s*720px/);
});

test("SVG chart scrolling is isolated to its wrapper", () => {
  const frame = rule(".tenant-svg-chart-frame");
  const scroll = rule(".tenant-svg-scroll");
  assert.match(frame, /min-width:\s*0/);
  assert.match(frame, /overflow:\s*hidden/);
  assert.match(scroll, /width:\s*100%/);
  assert.match(scroll, /min-width:\s*0/);
  assert.match(scroll, /max-width:\s*100%/);
  assert.match(scroll, /overflow-x:\s*auto/);
  assert.match(css, /\.tenant-status-svg, \.tenant-income-svg\s*\{[\s\S]*?min-width:\s*768px/);
  for (const selector of [".tenant-month-track", ".tenant-rent-chart", ".tenant-timeline-track", ".data-center-restore-table-wrap"]) {
    const owner = rule(selector);
    assert.match(owner, /min-width:\s*0/);
    assert.match(owner, /max-width:\s*100%/);
    assert.match(owner, /overflow-x:\s*auto/);
  }
});

test("high-risk business rows keep explicit shrink ownership", () => {
  const mediumStart = css.indexOf("/* 2.4c first batch");
  const mediumEnd = css.indexOf("/* 2.4c second batch", mediumStart);
  const medium = css.slice(mediumStart, mediumEnd);
  for (const selector of [".rent-finance-line", ".expense-finance-line", ".attachment-inventory-file-row", ".settlement-history-partner"]) {
    assert.match(medium, new RegExp(selector.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")));
  }
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) auto auto minmax\(0, 1fr\) auto/);
  assert.match(medium, /min-width:\s*0/);
  assert.doesNotMatch(medium, /window\.innerWidth|screen\.width|devicePixelRatio|userAgent|transform:\s*scale|zoom:/);
});

test("frozen Tenant List and BUG-01 owners remain outside high-risk changes", () => {
  assert.match(css, /\.tenant-list-identity-row/);
  assert.match(css, /\.tenant-list-rent-row/);
  assert.match(css, /\.tenant-status-row/);
  assert.match(css, /\.check-in-form-grid\s*>\s*\.collapsible-attachments\s*\{[\s\S]*?overflow:\s*visible/);
});
