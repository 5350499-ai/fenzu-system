import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { createDataExportPayload } from "../lib/data-export.ts";
// @ts-expect-error test runner imports the TypeScript module directly.
import { createRestoreSession, materializeRestoreFile, verifyRestoreSessionIntegrity } from "../lib/restore-session.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const data = {
  properties: [{ id: "p1" }], rooms: [{ id: "r1", propertyId: "p1" }], tenants: [], contracts: [],
  rentPayments: [], expenses: [], deposits: [], viewingAppointments: [], tasks: [], partners: [],
  partnerShares: [], partnerNameHistory: [], checkInRequests: [], tenantCreateRequests: [],
  propertyHistory: [], settlementBatches: [], settlementSnapshots: [], settings: {}
};

test("restore session materializes immutable input and verifies its raw bytes", async () => {
  const payload = await createDataExportPayload(data, "2026-08-25T06:47:28.778Z", { sourceWorkspaceId: workspaceId });
  const file = new File([JSON.stringify(payload, null, 2)], "rental-backup-2026-08-25-0847.json", { type: "application/json" });
  const materialized = await materializeRestoreFile(file);
  const session = createRestoreSession(materialized, payload, { properties: [] });

  assert.equal(session.originalFileName, "rental-backup-2026-08-25-0847.json");
  assert.equal(session.originalFileSize, file.size);
  assert.equal(session.parsedBackupPayload.metadata.sourceWorkspaceId, workspaceId);
  assert.equal(await verifyRestoreSessionIntegrity(session), true);
  assert.notEqual(session.originalPayloadSha256, "");
});

test("filesystem timestamp is metadata only and does not replace payload identity", async () => {
  const payload = await createDataExportPayload(data, "2026-08-25T06:47:28.778Z", { sourceWorkspaceId: workspaceId });
  const content = JSON.stringify(payload, null, 2);
  const first = new File([content], "rental-backup-2026-08-25-0847.json", { type: "application/json", lastModified: 1 });
  const second = new File([content], "rental-backup-2026-08-25-0847(1).json", { type: "application/json", lastModified: 2 });
  const firstSession = createRestoreSession(await materializeRestoreFile(first), payload, null);
  const secondMaterialized = await materializeRestoreFile(second);

  assert.notEqual(firstSession.originalFileLastModified, secondMaterialized.fileLastModified);
  assert.equal(firstSession.originalPayloadSha256, secondMaterialized.payloadSha256);
  assert.equal(payload.metadata.exportedAt, "2026-08-25T06:47:28.778Z");
});
