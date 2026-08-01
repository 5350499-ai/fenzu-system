import assert from "node:assert/strict";
import { monthEnd } from "../lib/rent-coverage";

assert.equal(monthEnd("2026-08"), "2026-08-31");
assert.equal(monthEnd("2026-02"), "2026-02-28");
assert.equal(monthEnd("2028-02"), "2028-02-29");
assert.equal(monthEnd("2026-01"), "2026-01-31");

console.log("tenant detail renewal date tests passed");
