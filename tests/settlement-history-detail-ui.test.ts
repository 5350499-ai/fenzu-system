import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/partner-settlements/[id]/page.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

test("settlement snapshot labels use property identity with a natural fallback", () => {
  assert.match(page, /function segmentLabel\(/);
  assert.match(page, /segment\.property_name_snapshot/);
  assert.match(page, /return fallbackPropertyName === "房源名称未保存" \? "结算分段"/);
  assert.match(page, /segmentLabel\(segment, propertyName\)/);
  assert.match(page, /<DetailCard title="结算明细">/);
  assert.doesNotMatch(page, /比例分段 \{index \+ 1\}/);
});

test("settlement history surfaces use shared light and dark theme tokens", () => {
  assert.match(css, /\.settlement-history-card \{ border-color: var\(--border\); background: var\(--surface\); \}/);
  assert.match(css, /\.settlement-snapshot-page \.snapshot-meta \{ color: var\(--muted\); \}/);
  assert.match(css, /\.settlement-snapshot-page \.snapshot-section,[\s\S]*?border-color: var\(--border\);/);
  assert.doesNotMatch(css, /\.settlement-history-card \{[^}]*background:rgba\(30,41,59,\.42\)/);
});

test("snapshot presentation keeps the existing reversal action boundary", () => {
  assert.match(page, /method: "POST"/);
  assert.match(page, /\/api\/partner-settlements\/\$\{batch\.id\}/);
  assert.match(page, /撤销结算/);
});
