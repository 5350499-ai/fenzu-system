import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { partnerUpdatePayload } from "../lib/partner-update.ts";

test("free_single member rename never submits the forbidden sort order", () => {
  assert.deepEqual(partnerUpdatePayload({
    displayName: " 测试员 ",
    isFreeSingle: true,
    sortOrder: 9
  }), { displayName: "测试员" });
});

test("managed partner editing keeps display name and sort order", () => {
  assert.deepEqual(partnerUpdatePayload({
    displayName: " 峰峰 ",
    isFreeSingle: false,
    sortOrder: 2
  }), { displayName: "峰峰", sortOrder: 2 });
});
