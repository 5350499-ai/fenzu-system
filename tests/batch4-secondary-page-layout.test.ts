import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tenants = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");
const properties = readFileSync(new URL("../app/properties/page.tsx", import.meta.url), "utf8");
const rooms = readFileSync(new URL("../app/rooms/page.tsx", import.meta.url), "utf8");
const settlements = readFileSync(new URL("../app/partner-settlements/page.tsx", import.meta.url), "utf8");
const dataCenter = readFileSync(new URL("../app/data-center/page.tsx", import.meta.url), "utf8");

test("Batch 4 secondary pages retain one semantic renderer per target root", () => {
  assert.match(tenants, /tenant-list-row-stack/);
  assert.match(properties, /property-list-card/);
  assert.match(rooms, /finance-line room-finance-line/);
  assert.match(settlements, /settlement-history-card/);
  assert.match(dataCenter, /data-center-page/);
  assert.match(css, /\.property-list-card-heading\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.data-center-grid\s*\{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
});

test("Room rows have one active content-driven grid owner", () => {
  assert.match(css, /\.room-finance-line\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\) auto auto minmax\(0, 1fr\) auto/);
  assert.doesNotMatch(css, /\.app-shell \.room-finance-line\s*\{[\s\S]*?grid-template-columns/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*360px\)\s*\{[^}]*\.room-finance-line/);
  assert.doesNotMatch(css, /\.room-finance-line\s*\{[\s\S]*?minmax\(120px, 1\.15fr\)/);
});

test("Batch 4 keeps content-driven constraints without device-model patches", () => {
  assert.doesNotMatch(css, /@media[^\{]*(?:375|390|430)px/);
  assert.match(css, /\.room-finance-line \.room-coverage-summary[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(css, /\.data-center-restore-table-wrap\s*\{[\s\S]*?overflow-x:\s*auto/);
  assert.match(css, /\.property-list-card-heading strong[\s\S]*?overflow-wrap:\s*anywhere/);
});
