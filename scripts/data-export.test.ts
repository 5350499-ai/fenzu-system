import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { buildCsvDataExport, buildExcelDataExport, createDataExportPayload, dataExportFileName, dryRunRestore, formatBackupSize, isDataExportPayload, validateDataExportIntegrity, verifyDataExportChecksum } from "../lib/data-export.ts";

const completeData = {
  properties: [{ id: "p1" }],
  rooms: [{ id: "r1", propertyId: "p1" }],
  tenants: [{ id: "t1", propertyId: "p1", roomId: "r1" }],
  contracts: [{ id: "c1", propertyId: "p1", roomId: "r1", tenantId: "t1" }],
  rentPayments: [{ id: "rp1", propertyId: "p1", roomId: "r1", tenantId: "t1" }],
  expenses: [{ id: "e1", propertyId: "p1", roomId: "r1" }],
  deposits: [{ id: "d1", propertyId: "p1", roomId: "r1", tenantId: "t1" }],
  viewingAppointments: [{ id: "view1", propertyId: "p1", roomId: "r1" }],
  tasks: [{ id: "task1" }],
  partners: [{ id: "partner1" }],
  partnerShares: [{ id: "share1", propertyId: "p1", partnerId: "partner1" }],
  partnerNameHistory: [{ id: "history1", partnerId: "partner1" }],
  checkInRequests: [], tenantCreateRequests: [],
  propertyHistory: [],
  settlementBatches: [{ id: "batch1", propertyId: "p1" }],
  settlementSnapshots: [{ id: "snapshot1" }],
  settings: {}
};

test("official backup metadata, checksum, summary and sensitive filtering are valid", async () => {
  const payload = await createDataExportPayload({
    properties: [{ id: "property-1", name: "Demo" }],
    auditLogs: [{ action: "test", before_data: { password: "hidden", safe: true, nested: { access_token: "hidden" } } }],
    settings: { legacyPartnerRatios: { A: 50, B: 50 } }
  }, "2026-08-04T10:20:30.000Z", { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });

  assert.equal(isDataExportPayload(payload), true);
  assert.deepEqual(Object.keys(payload), ["metadata", "summary", "data"]);
  assert.equal(payload.metadata.backupFormatVersion, 2);
  assert.equal(payload.metadata.sourceWorkspaceId, "11111111-1111-4111-8111-111111111111");
  assert.equal(payload.metadata.backupType, "local");
  assert.equal(payload.metadata.description.includes("官方备份"), true);
  assert.equal(payload.metadata.generatedBy, "Fenzu System");
  assert.equal(payload.metadata.softwareEdition, "Community");
  assert.equal(payload.metadata.platform, "Web");
  assert.equal(payload.metadata.exportReason, "Manual");
  assert.equal(payload.metadata.applicationName, "咱家分租");
  assert.equal(payload.metadata.applicationId, "zanjia-rental");
  assert.equal(Number.isInteger(payload.metadata.exportDurationMs), true);
  assert.equal(payload.metadata.recordCount, payload.summary.totalRecords);
  assert.equal(payload.summary.propertiesCount, 1);
  assert.equal(payload.summary.totalRecords, 2);
  assert.equal(payload.summary.backupSizeBytes, new TextEncoder().encode(JSON.stringify(payload, null, 2)).byteLength);
  assert.equal(payload.summary.backupSizeHuman, formatBackupSize(payload.summary.backupSizeBytes));
  assert.equal(await verifyDataExportChecksum(payload), true);
  const parsed = JSON.parse(JSON.stringify(payload, null, 2));
  assert.equal(parsed.data.properties.length, 1);
  assert.deepEqual(parsed.data.auditLogs[0].before_data, { safe: true, nested: {} });
  assert.equal(JSON.stringify(parsed).includes("hidden"), false);
  assert.match(dataExportFileName(new Date(2026, 7, 4, 22, 35, 30)), /^zanjia-rental-backup-2026-08-04-22-35\.json$/);
});

test("integrity validation detects duplicate ids and broken references", async () => {
  const payload = await createDataExportPayload({
    properties: [{ id: "p1" }], rooms: [{ id: "r1", propertyId: "missing" }, { id: "r1", propertyId: "p1" }],
    tenants: [], contracts: [], rentPayments: [], expenses: [], deposits: [], viewingAppointments: [], tasks: [],
    partners: [], partnerShares: [], partnerNameHistory: [], checkInRequests: [], tenantCreateRequests: [], propertyHistory: [], settlementBatches: [], settlementSnapshots: [], settings: {}
  }, new Date().toISOString(), { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });
  const result = validateDataExportIntegrity(payload);
  assert.equal(result.valid, false);
  assert.equal(result.errors.some((error) => error.includes("重复主键")), true);
  assert.equal(result.errors.some((error) => error.includes("不存在的 properties")), true);
});

test("invalid export shapes and incompatible versions are rejected", async () => {
  assert.equal(isDataExportPayload({ format: "fenzu-system-json", version: 1, data: {} }), false);
  assert.equal(isDataExportPayload({ format: "other", version: 1, exportedAt: "now", data: {} }), false);

  const payload = await createDataExportPayload(completeData, new Date().toISOString(), { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });
  const incompatible = { ...payload, metadata: { ...payload.metadata, schemaVersion: "future-schema" } };
  const result = await dryRunRestore(incompatible);
  assert.equal(result.valid, false);
  assert.equal(result.errors[0], "此备份文件与当前软件版本不兼容，暂时无法恢复。");
});

test("core restore payload requires source workspace identity and complete request references", async () => {
  const payload = await createDataExportPayload(completeData, new Date().toISOString(), { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });
  const missingWorkspace = structuredClone(payload);
  delete (missingWorkspace.metadata as Record<string, unknown>).sourceWorkspaceId;
  assert.equal(isDataExportPayload(missingWorkspace), false);
  const brokenRequest = structuredClone(payload);
  brokenRequest.data.checkInRequests = [{ clientRequestId: "22222222-2222-4222-8222-222222222222", tenantId: "missing-tenant" }];
  assert.equal(validateDataExportIntegrity(brokenRequest).valid, false);
  const duplicateRequest = structuredClone(payload);
  duplicateRequest.data.tenantCreateRequests = [
    { clientRequestId: "33333333-3333-4333-8333-333333333333" },
    { clientRequestId: "33333333-3333-4333-8333-333333333333" }
  ];
  assert.equal(validateDataExportIntegrity(duplicateRequest).valid, false);
});

test("dry-run restore validates a complete official backup without writing data", async () => {
  const payload = await createDataExportPayload(completeData, new Date().toISOString(), { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });
  const result = await dryRunRestore(payload);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
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
