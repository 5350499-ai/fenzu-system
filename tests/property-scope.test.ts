import assert from "node:assert/strict";
// @ts-expect-error test runner imports the TypeScript module directly.
import { allPropertyIds, isAllPropertyScope, togglePropertyScope } from "../lib/property-scope.ts";

const properties = [{ id: "1" }, { id: "2" }, { id: "3" }];
assert.deepEqual(allPropertyIds(properties), ["1", "2", "3"]);
assert.equal(isAllPropertyScope(["1", "2", "3"], properties), true);
assert.equal(isAllPropertyScope(["1", "3"], properties), false);
assert.deepEqual(togglePropertyScope(["1", "2"], "2"), ["1"]);
assert.deepEqual(togglePropertyScope(["1", "2"], "3"), ["1", "2", "3"]);
assert.deepEqual(togglePropertyScope([], "1"), ["1"]);

console.log("property scope tests passed");
