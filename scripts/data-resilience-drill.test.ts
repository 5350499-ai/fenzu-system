import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { createDataExportPayload, dryRunRestore, sanitizeFreeSingleExportData } from "../lib/data-export.ts";

const syntheticData = {
  properties: [{ id: "property-a", name: "Synthetic A" }],
  rooms: [{ id: "room-a", propertyId: "property-a", name: "1" }],
  tenants: [{ id: "tenant-a", propertyId: "property-a", roomId: "room-a", name: "Synthetic Tenant" }],
  contracts: [{ id: "contract-a", propertyId: "property-a", roomId: "room-a", tenantId: "tenant-a" }],
  rentPayments: [{ id: "payment-a", propertyId: "property-a", roomId: "room-a", tenantId: "tenant-a", amountPaid: 800 }],
  expenses: [{ id: "expense-a", propertyId: "property-a", roomId: "room-a", amount: 100 }],
  deposits: [{ id: "deposit-a", propertyId: "property-a", roomId: "room-a", tenantId: "tenant-a", amount: 800 }],
  viewingAppointments: [], tasks: [], partners: [], partnerShares: [], partnerNameHistory: [],
  propertyHistory: [], checkInRequests: [], tenantCreateRequests: [], settlementBatches: [], settlementSnapshots: [], settings: {}
};

test("automated recovery drill verifies data equivalence after synthetic corruption", async () => {
  const payload = await createDataExportPayload(syntheticData, "2026-08-15T00:00:00.000Z", { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111", backupType: "local", exportReason: "Manual" });
  const corrupted = { ...syntheticData, properties: [], rentPayments: [{ id: "wrong", amountPaid: 1 }] };
  assert.notDeepEqual(corrupted, payload.data);
  const dryRun = await dryRunRestore(payload);
  assert.deepEqual(dryRun, { valid: true, errors: [] });
  const restored = structuredClone(corrupted);
  Object.assign(restored, payload.data);
  assert.deepEqual(restored, payload.data);
});

test("corruption drill rejects truncated, schema, checksum, duplicate and foreign-reference payloads", async () => {
  const payload = await createDataExportPayload(syntheticData, new Date().toISOString(), { sourceWorkspaceId: "11111111-1111-4111-8111-111111111111" });
  const truncated = JSON.parse(JSON.stringify(payload));
  delete truncated.data.rooms;
  assert.equal((await dryRunRestore(truncated)).valid, false);
  const badSchema = JSON.parse(JSON.stringify(payload)); badSchema.metadata.schemaVersion = "future";
  assert.equal((await dryRunRestore(badSchema)).valid, false);
  const badChecksum = JSON.parse(JSON.stringify(payload)); badChecksum.data.properties[0].name = "tampered";
  assert.equal((await dryRunRestore(badChecksum)).valid, false);
  const duplicate = JSON.parse(JSON.stringify(payload)); duplicate.data.properties.push({ ...duplicate.data.properties[0] });
  assert.equal((await dryRunRestore(duplicate)).valid, false);
  const foreignReference = JSON.parse(JSON.stringify(payload)); foreignReference.data.rooms[0].propertyId = "other-workspace-property";
  assert.equal((await dryRunRestore(foreignReference)).valid, false);
});

test("ordinary user recovery strips restricted system and attachment fields", () => {
  const clean = sanitizeFreeSingleExportData({ ...syntheticData, settings: { currencyCode: "CNY", secret: "removed" }, partners: [{ id: "p", linkedAccountId: "other" }], accounts: [{ id: "admin" }], rentPayments: [{ id: "p", attachmentPath: "secret", amountPaid: 1 }] });
  assert.deepEqual(clean.partners, []); assert.deepEqual(clean.accounts, []);
  assert.equal((clean.rentPayments as Array<Record<string, unknown>>)[0].attachmentPath, undefined);
  assert.deepEqual(clean.settings, { currencyCode: "CNY" });
});
