import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");

test("tenant detail keeps the three requested two-column field pairs", () => {
  assert.match(page, /tenant-basic-detail-grid/);
  assert.match(page, /入住人数[\s\S]*每月缴费日/);
  assert.match(page, /tenant-amount-grid[\s\S]*月租标准[\s\S]*最近一次实收[\s\S]*押金标准[\s\S]*已收押金/);
  assert.match(page, /tenant-coverage-field/);
  assert.match(page, /tenant-note-field/);
});

test("tenant detail no longer renders the empty payment-performance notice", () => {
  assert.doesNotMatch(page, /<div className="tenant-performance-empty">/);
});
