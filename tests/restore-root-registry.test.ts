import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
// The test runner uses Node's strip-types loader; the repository's existing
// contract tests use explicit .ts imports for that loader.
// @ts-expect-error TS5097 is a test-runner-only extension rule.
import { CORE_RESTORE_ENTITY_REGISTRY } from "../lib/backup-restore-entities.ts";
const snapshot = JSON.parse(readFileSync(fileURLToPath(new URL("../scripts/restore-live-schema.snapshot.json", import.meta.url)), "utf8")) as { tables: Record<string, { primaryKey: string[] }> };

test("canonical Restore root covers the live 18-table boundary", () => {
  assert.equal(CORE_RESTORE_ENTITY_REGISTRY.length, 18);
  for (const entity of CORE_RESTORE_ENTITY_REGISTRY) {
    assert.ok(entity.table, `${entity.key} must have a table`);
    const live = snapshot.tables[entity.table as keyof typeof snapshot.tables];
    assert.ok(live, `${entity.table} must exist in the live schema snapshot`);
    assert.deepEqual(entity.primaryKey, live.primaryKey, `${entity.table} primary key drift`);
    assert.deepEqual(entity.conflictKey, live.primaryKey, `${entity.table} conflict key drift`);
    assert.ok(entity.restoreOrder && entity.restoreOrder >= 1 && entity.restoreOrder <= 18);
    for (const dependency of entity.fkDependencies ?? []) {
      assert.ok(CORE_RESTORE_ENTITY_REGISTRY.some((candidate) => candidate.key === dependency || candidate.table === dependency), `${entity.table} dependency ${dependency} must be canonical`);
    }
  }
});

test("request entities use client_request_id as their idempotency identity", () => {
  const requests = CORE_RESTORE_ENTITY_REGISTRY.filter((entity) => entity.idempotencyRole === "REQUEST");
  assert.deepEqual(requests.map((entity) => entity.table), ["check_in_requests", "tenant_create_requests"]);
  assert.ok(requests.every((entity) => entity.primaryKey?.[0] === "client_request_id"));
});
