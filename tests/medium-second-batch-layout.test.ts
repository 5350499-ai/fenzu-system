import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const start = css.indexOf("/* 2.4c second batch");
const end = css.indexOf("\n}", start);
const medium = start >= 0 && end >= 0 ? css.slice(start, end + 2) : "";

test("second-batch Medium roots use proportional content-capacity grids", () => {
  assert.match(medium, /min-width:\s*641px/);
  assert.match(medium, /max-width:\s*1100px/);
  assert.match(medium, /\.app-shell \.metrics[\s\S]*auto-fit[\s\S]*220px/);
  assert.match(medium, /\.app-shell \.dashboard-panels[\s\S]*auto-fit[\s\S]*360px/);
  assert.match(medium, /\.app-shell \.data-center-grid[\s\S]*auto-fit/);
});

test("second-batch text owners can shrink without changing business semantics", () => {
  assert.match(medium, /\.app-shell \.property-detail-heading > \*/);
  assert.match(medium, /\.app-shell \.mobile-record-field > \*/);
  assert.match(medium, /min-width:\s*0/);
  assert.match(medium, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(medium, /window\.innerWidth|screen\.width|devicePixelRatio|userAgent|transform:\s*scale|zoom:/);
});

test("second-batch scope preserves frozen roots and Shell breakpoints", () => {
  assert.doesNotMatch(medium, /\.tenant-list-identity-row|\.tenant-list-rent-row|\.tenant-status-row|\.tenant-detail-panel/);
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1100px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1101px\)/);
});
