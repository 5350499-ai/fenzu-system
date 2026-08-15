import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error node's strip-types runner loads TypeScript modules directly.
import { RECOVERY_POINT_RETENTION_POLICY, buildRecoveryPointDescriptor, isRecoveryPointRestorable, recoveryPointStoragePath, selectRecoveryPointsForRetention } from "../lib/server/recovery-point-policy.ts";

const payload = { metadata: { backupId: "11111111-1111-4111-8111-111111111111", backupFormatVersion: 1, schemaVersion: "20260808000100", checksum: "a".repeat(64), recordCount: 3 }, summary: { backupSizeBytes: 128 } } as any;

test("recovery point descriptor is workspace-scoped and restorable", () => {
  const point = buildRecoveryPointDescriptor(payload, { workspaceOwnerId: "22222222-2222-4222-8222-222222222222", source: "before_restore", storageBucket: "system-backups", createdBy: "33333333-3333-4333-8333-333333333333" });
  assert.equal(point.storagePath, recoveryPointStoragePath(point.workspaceOwnerId, point.id)); assert.equal(point.retentionClass, "event"); assert.equal(isRecoveryPointRestorable(point), true);
});

test("retention policy bounds scheduled points while retaining event points", () => {
  const now = new Date("2026-08-15T00:00:00.000Z");
  const points = Array.from({ length: RECOVERY_POINT_RETENTION_POLICY.maxPerWorkspace + 5 }, (_, index) => ({ source: index === 0 ? "before_destructive" as const : "scheduled" as const, createdAt: new Date(now.getTime() - index * 86400000).toISOString() }));
  const retained = selectRecoveryPointsForRetention(points, now); assert.equal(retained.length, RECOVERY_POINT_RETENTION_POLICY.maxPerWorkspace); assert.equal(retained.some((point) => point.source === "before_destructive"), true);
});

test("recovery point eligibility rejects missing or invalid metadata", () => {
  assert.equal(isRecoveryPointRestorable({ status: "failed", checksum: "x", storagePath: "x", backupFormatVersion: 1, schemaVersion: "v" }), false);
  assert.equal(isRecoveryPointRestorable({ status: "available", checksum: "", storagePath: "x", backupFormatVersion: 1, schemaVersion: "v" }), false);
});
