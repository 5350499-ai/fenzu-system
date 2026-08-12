import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../components/reminder-row.tsx", import.meta.url), "utf8");

test("tenant debt action contract keeps positive and zero-amount actions", () => {
  assert.match(source, /续交房租/);
  assert.match(source, /放弃追缴/);
  assert.match(source, /display\.debtCase\?\.canCollect/);
  assert.match(source, /display\.debtCase\?\.canWaive/);
});

test("full debt row keeps a stable tenant deep-link wrapper", () => {
  assert.match(source, /className="reminder-row-link" href=\{item\.href\}/);
});
