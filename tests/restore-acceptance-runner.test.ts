import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("isolated Restore acceptance runner covers the required gates", () => {
  const source = fs.readFileSync("scripts/restore-lab/acceptance-runner.mjs", "utf8");
  for (const marker of [
    "recovery-points",
    "fullDryRunSuccessCount",
    "fullRestoreSuccessCount",
    "invalid_uuid",
    "fk_violation",
    "duplicate_client_request",
    "wrong_workspace",
    "midway_fk_failure",
    "restore-failure-diagnostics.jsonl",
    "settlement_net_profit",
    "normalBusinessRegression"
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), marker);
});
