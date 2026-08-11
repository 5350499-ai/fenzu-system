import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { EXPENSE_TYPE_PRESETS } from "../lib/expense-type-presets.ts";

test("expense entry presets stay compact without constraining custom values", () => {
  assert.deepEqual(EXPENSE_TYPE_PRESETS, ["房租", "电费", "其他"]);
  assert.equal(EXPENSE_TYPE_PRESETS.includes("维修费" as never), false);
});
