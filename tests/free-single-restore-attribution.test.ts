import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/data-restore/route.ts", "utf8");

test("free-single restore rehydrates server-owned attribution fields", () => {
  assert.match(route, /rehydrateFreeSingleAttributionFields/);
  assert.match(route, /rentPayments: restoreRows\("rentPayments", \["receivedBy"\]\)/);
  assert.match(route, /expenses: restoreRows\("expenses", \["paidBy"\]\)/);
  assert.match(route, /deposits: restoreRows\("deposits", \["receivedBy", "paidBy"\]\)/);
  assert.match(route, /sanitizeFreeSingleExportData\(uploadedPayload\.data\),[\s\S]*currentBackup\.data/);
});

test("free-single restore keeps attribution server-owned", () => {
  assert.match(route, /snapshot\?\.\[field\] \?\? "A"/);
  assert.match(route, /Free-single exports deliberately remove attribution fields/);
});
