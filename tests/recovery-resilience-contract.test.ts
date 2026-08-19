import assert from "node:assert/strict";
import { test } from "node:test";
// @ts-expect-error Node's strip-types test runner needs the explicit extension.
import { evaluateRecoveryPointHealth, scheduledRecoverySlot, schedulerWorkspaceAllowlist, selectRecoveryPointCleanupCandidates, stableWorkspaceMinute } from "../lib/server/recovery-point-policy.ts";
import { readFileSync } from "node:fs";

test("scheduled recovery slots are UTC-day stable and workspace staggering is deterministic", () => {
  assert.equal(scheduledRecoverySlot(new Date("2026-08-15T01:00:00Z")), "2026-08-15");
  assert.equal(scheduledRecoverySlot(new Date("2026-08-15T23:59:59Z")), "2026-08-15");
  assert.equal(stableWorkspaceMinute("workspace-a"), stableWorkspaceMinute("workspace-a"));
});

test("retention never selects the newest available point", () => {
  const points = [
    { source: "scheduled" as const, status: "available" as const, createdAt: "2026-08-15T00:00:00Z" },
    { source: "scheduled" as const, status: "available" as const, createdAt: "2026-07-01T00:00:00Z" }
  ];
  const candidates = selectRecoveryPointCleanupCandidates(points, new Date("2026-08-15T00:00:00Z"));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].createdAt, "2026-07-01T00:00:00Z");
});

test("health escalates from warning to error and critical", () => {
  const now = new Date("2026-08-15T00:00:00Z");
  assert.equal(evaluateRecoveryPointHealth({ now, latestSuccessAt: "2026-08-13T23:00:00Z" }).status, "WARNING");
  assert.equal(evaluateRecoveryPointHealth({ now, latestSuccessAt: "2026-08-12T00:00:00Z", consecutiveFailures: 2 }).status, "ERROR");
  assert.equal(evaluateRecoveryPointHealth({ now, schedulerInfrastructureFailure: true }).status, "CRITICAL");
});

test("scheduler is disabled by default and cron route requires a secret", () => {
  const route = readFileSync("app/api/internal/recovery-scheduler/route.ts", "utf8");
  const policy = readFileSync("lib/server/recovery-point-policy.ts", "utf8");
  assert.match(route, /DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /account_recovery_scheduler_runs/);
  assert.match(route, /existingRun\?\.status === "completed"/);
  assert.match(route, /existingRun\?\.status === "running"/);
  assert.match(route, /SCHEDULER_RUN_LOOKUP_FAILED/);
  assert.match(route, /SCHEDULER_RUN_START_FAILED/);
  assert.match(route, /SCHEDULER_RUN_FINALIZE_FAILED/);
  assert.match(route, /schedulerWorkspaceAllowlist/);
  assert.match(policy, /DATA_RESILIENCE_SCHEDULER_WORKSPACE_ALLOWLIST/);
});

test("scheduler workspace allowlist defaults to deny and accepts only explicit IDs", () => {
  assert.deepEqual([...schedulerWorkspaceAllowlist("")], []);
  assert.deepEqual([...schedulerWorkspaceAllowlist(" synthetic-a, synthetic-b,synthetic-a ")], ["synthetic-a", "synthetic-b"]);
});

test("health aggregate does not expose scheduler error details", () => {
  const route = readFileSync("app/api/admin/recovery-health/route.ts", "utf8");
  assert.doesNotMatch(route, /error_summary/);
  assert.match(route, /workspace_count/);
});

test("production readiness contracts keep activation explicit", () => {
  const runbook = readFileSync("DATA_RESILIENCE_PRODUCTION_ACTIVATION_RUNBOOK.md", "utf8");
  assert.match(runbook, /DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED/);
  assert.match(runbook, /migration/i);
  assert.match(runbook, /Production/);
});
