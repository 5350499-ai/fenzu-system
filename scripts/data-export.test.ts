import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { createDataExportPayload, dataExportFileName, isDataExportPayload } from "../lib/data-export.ts";

test("export payload is readable JSON and strips sensitive nested fields", () => {
  const payload = createDataExportPayload({
    properties: [{ id: "property-1", name: "Demo" }],
    auditLogs: [{ action: "test", before_data: { password: "hidden", safe: true, nested: { access_token: "hidden" } } }],
    settings: { legacyPartnerRatios: { A: 50, B: 50 } }
  }, "2026-08-04T10:20:30.000Z");

  assert.equal(isDataExportPayload(payload), true);
  const parsed = JSON.parse(JSON.stringify(payload, null, 2));
  assert.equal(parsed.data.properties.length, 1);
  assert.deepEqual(parsed.data.auditLogs[0].before_data, { safe: true, nested: {} });
  assert.equal(JSON.stringify(parsed).includes("hidden"), false);
  assert.match(dataExportFileName(new Date("2026-08-04T10:20:30.000Z")), /2026-08-04T10-20-30-000Z\.json$/);
});

test("invalid export shapes are rejected", () => {
  assert.equal(isDataExportPayload({ format: "fenzu-system-json", version: 1, data: {} }), false);
  assert.equal(isDataExportPayload({ format: "other", version: 1, exportedAt: "now", data: {} }), false);
});
