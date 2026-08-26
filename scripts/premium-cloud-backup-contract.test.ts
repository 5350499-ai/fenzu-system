import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { classifyPremiumCloudField, createDataExportPayload, premiumCloudCapabilityRequired, sanitizePremiumCloudBackupData, PREMIUM_CLOUD_ALLOWED_DATA_KEYS, PREMIUM_CLOUD_EXCLUDED_DATA_KEYS } from "../lib/data-export.ts";

const workspaceId = "11111111-1111-4111-8111-111111111111";

test("Premium cloud contract derives from the 18-table boundary and excludes account/audit domains", () => {
  assert.equal(PREMIUM_CLOUD_ALLOWED_DATA_KEYS.includes("properties"), true);
  assert.equal(PREMIUM_CLOUD_ALLOWED_DATA_KEYS.includes("tenantCreateRequests"), true);
  assert.equal((PREMIUM_CLOUD_ALLOWED_DATA_KEYS as readonly string[]).includes("accounts"), false);
  assert.equal((PREMIUM_CLOUD_ALLOWED_DATA_KEYS as readonly string[]).includes("auditLogs"), false);
  assert.deepEqual(PREMIUM_CLOUD_EXCLUDED_DATA_KEYS, ["accounts", "auditLogs", "audit_logs"]);
});

test("Premium sanitizer keeps structured business data and removes attachment/provider/auth material", () => {
  const clean = sanitizePremiumCloudBackupData({
    properties: [{
      id: "property-1",
      name: "Casa",
      notes: "safe",
      attachmentMetadata: { fileName: "id-card.jpg", storagePath: "private/path", fileSize: 10 },
      file_url: "https://private.example/file",
      providerFileId: "drive-file-id",
      access_token: "secret-token",
      "unexpected key": "unknown"
    }],
    accounts: [{ id: "auth-id", email: "person@example.com" }],
    auditLogs: [{ actionType: "login" }],
    settings: { currencyCode: "EUR", accessToken: "secret" },
    unknownCollection: [{ tokenLike: "secret" }]
  });
  const row = (clean.properties as Array<Record<string, unknown>>)[0];
  assert.deepEqual(row, { id: "property-1", name: "Casa", notes: "safe" });
  assert.deepEqual(clean.settings, { currencyCode: "EUR" });
  assert.equal("accounts" in clean, false);
  assert.equal("auditLogs" in clean, false);
  assert.equal("unknownCollection" in clean, false);
});

test("field classification fails closed for sensitive, binary and unknown fields", () => {
  assert.equal(classifyPremiumCloudField("access_token"), "AUTH_SECRET");
  assert.equal(classifyPremiumCloudField("binary"), "BINARY_OR_FILE_PAYLOAD");
  assert.equal(classifyPremiumCloudField("fileName", true), "SENSITIVE_ATTACHMENT_REFERENCE");
  assert.equal(classifyPremiumCloudField("not a field"), "UNKNOWN");
});

test("Premium profile metadata and checksum remain on the canonical Backup v2 engine", async () => {
  const payload = await createDataExportPayload({ properties: [], rooms: [], tenants: [], contracts: [], rentPayments: [], expenses: [], deposits: [], viewingAppointments: [], tasks: [], partners: [], partnerShares: [], partnerNameHistory: [], settlementBatches: [], settlementSnapshots: [], partnerSettlementPartnerSnapshots: [], partnerSettlementSegmentSnapshots: [], partnerSettlementTransferSnapshots: [], checkInRequests: [], tenantCreateRequests: [], propertyHistory: [], settings: {}, accounts: [{ token: "excluded" }] }, new Date().toISOString(), {
    sourceWorkspaceId: workspaceId,
    backupType: "cloud",
    backupProfile: "PREMIUM_CLOUD"
  });
  assert.equal(payload.metadata.backupProfile, "PREMIUM_CLOUD");
  assert.equal(payload.metadata.backupFormatVersion, 2);
  assert.equal(payload.metadata.schemaVersion, "20260824180000");
  assert.equal("accounts" in payload.data, false);
  assert.equal(payload.metadata.sourceWorkspaceId, workspaceId);
  assert.equal(payload.metadata.checksum.length, 64);
});

test("Premium cloud path requires a Premium or Internal Full capability", () => {
  assert.equal(premiumCloudCapabilityRequired("FREE"), false);
  assert.equal(premiumCloudCapabilityRequired("PREMIUM"), true);
  assert.equal(premiumCloudCapabilityRequired("INTERNAL_FULL"), true);
});
