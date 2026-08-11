import assert from "node:assert/strict";
// @ts-expect-error test runner imports the TypeScript module directly.
import { classifyBusinessDeleteError } from "../lib/server/delete-error.ts";

assert.deepEqual(classifyBusinessDeleteError({ code: "42501" }), { message: "没有权限删除该记录。", status: 403, code: "DELETE_FORBIDDEN" });
assert.deepEqual(classifyBusinessDeleteError({ code: "23503" }), { message: "该记录仍有关联业务数据，无法删除，请先处理关联记录。", status: 409, code: "DELETE_REFERENCED" });
assert.deepEqual(classifyBusinessDeleteError({ code: "XX000" }), { message: "删除记录失败，请稍后重试。", status: 500, code: "DELETE_FAILED" });

console.log("business delete error tests passed");
