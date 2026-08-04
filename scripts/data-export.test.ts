import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { buildCsvDataExport, buildExcelDataExport, createDataExportPayload, dataExportFileName, isDataExportPayload, validateDataExportIntegrity, verifyDataExportChecksum } from "../lib/data-export.ts";

test("official backup metadata, checksum, summary and sensitive filtering are valid", async () => {
  const payload = await createDataExportPayload({
    properties: [{ id: "property-1", name: "Demo" }],
    auditLogs: [{ action: "test", before_data: { password: "hidden", safe: true, nested: { access_token: "hidden" } } }],
    settings: { legacyPartnerRatios: { A: 50, B: 50 } }
  }, "2026-08-04T10:20:30.000Z");

  assert.equal(isDataExportPayload(payload), true);
  assert.equal(payload.backupFormatVersion, 1);
  assert.equal(payload.backupType, "local");
  assert.equal(payload.description.includes("官方备份"), true);
  assert.equal(payload.summary.propertiesCount, 1);
  assert.equal(await verifyDataExportChecksum(payload), true);
  const parsed = JSON.parse(JSON.stringify(payload, null, 2));
  assert.equal(parsed.data.properties.length, 1);
  assert.deepEqual(parsed.data.auditLogs[0].before_data, { safe: true, nested: {} });
  assert.equal(JSON.stringify(parsed).includes("hidden"), false);
  assert.match(dataExportFileName(new Date("2026-08-04T10:20:30.000Z")), /2026-08-04T10-20-30\.json$/);
});

test("integrity validation detects duplicate ids and broken references", async () => {
  const payload = await createDataExportPayload({
    properties: [{ id: "p1" }], rooms: [{ id: "r1", propertyId: "missing" }, { id: "r1", propertyId: "p1" }],
    tenants: [], contracts: [], rentPayments: [], expenses: [], deposits: [], viewingAppointments: [], tasks: [],
    partners: [], partnerShares: [], partnerNameHistory: [], propertyHistory: [], settlementBatches: [], settlementSnapshots: [], settings: {}
  });
  const result = validateDataExportIntegrity(payload);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.includes("重复主键")), true);
  assert.equal(result.errors.some((error) => error.includes("不存在的 properties")), true);
});

test("invalid export shapes are rejected", () => {
  assert.equal(isDataExportPayload({ format: "fenzu-system-json", version: 1, data: {} }), false);
  assert.equal(isDataExportPayload({ format: "other", version: 1, exportedAt: "now", data: {} }), false);
});

test("CSV and Excel exports include every business collection", () => {
  const data = { properties: [{ id: "p1" }], rooms: [{ id: "r1" }], tenants: [{ id: "t1" }], contracts: [{ id: "c1" }], rentPayments: [{ id: "rp1" }], expenses: [{ id: "e1" }], deposits: [{ id: "d1" }], tasks: [{ id: "task1" }], viewingAppointments: [{ id: "view1" }], partners: [{ id: "partner1" }], partnerShares: [{ id: "share1" }], settlementSnapshots: [{ id: "snapshot1" }] };
  const csv = buildCsvDataExport(data);
  const excel = buildExcelDataExport(data);
  for (const key of Object.keys(data)) {
    assert.equal(csv.includes(`"${key}"`), true);
    assert.equal(excel.includes(`<h2>${key}</h2>`), true);
  }
  assert.match(excel, /<meta charset="utf-8"/);
});
