import assert from "node:assert/strict";
import test from "node:test";
// @ts-ignore Node's strip-types test runner resolves the explicit source extension.
import { analyticsScopedPath, parseAnalyticsPropertyScope } from "../lib/analytics-drilldown.ts";

const all = ["property-a", "property-b"];

test("ANALYTICS_SCOPE_PRESERVING_DRILLDOWN_TEST", () => {
  assert.equal(analyticsScopedPath("/deposits?pending=1", ["property-b"], all), "/deposits?pending=1&propertyId=property-b");
  assert.equal(analyticsScopedPath("/rooms?status=%E7%A9%BA%E7%BD%AE", all, all), "/rooms?status=%E7%A9%BA%E7%BD%AE");
  assert.deepEqual(parseAnalyticsPropertyScope("?propertyId=property-a%2Cproperty-b"), all);
});

test("DEPOSIT_PENDING_DRILLDOWN_TEST", () => {
  assert.equal(analyticsScopedPath("/deposits?pending=1", ["property-a"], all), "/deposits?pending=1&propertyId=property-a");
});

test("TENANT_METRIC_DRILLDOWN_TEST", () => {
  assert.equal(analyticsScopedPath("/tenants?status=active&rentDue=1", ["property-a"], all), "/tenants?status=active&rentDue=1&propertyId=property-a");
  assert.equal(analyticsScopedPath("/tenants?status=moved-out&archived=1", ["property-b"], all), "/tenants?status=moved-out&archived=1&propertyId=property-b");
});

test("ROOM_METRIC_DRILLDOWN_TEST", () => {
  assert.equal(analyticsScopedPath("/rooms?status=%E5%B7%B2%E7%A7%9F", ["property-a"], all), "/rooms?status=%E5%B7%B2%E7%A7%9F&propertyId=property-a");
});

test("DEBT_METRIC_DRILLDOWN_TEST", () => {
  assert.equal(analyticsScopedPath("/tenants?status=active&debt=1", ["property-b"], all), "/tenants?status=active&debt=1&propertyId=property-b");
});

test("CROSS_WORKSPACE_SCOPE_BLOCK_TEST", () => {
  const target = analyticsScopedPath("/tenants?status=active", ["untrusted-id"], all);
  assert.deepEqual(parseAnalyticsPropertyScope(new URL(target, "https://analytics.local").search), ["untrusted-id"]);
  assert.notEqual(target, "/tenants?status=active");
});

test("PURE_METRIC_NON_CLICKABLE_TEST", () => {
  assert.equal(analyticsScopedPath("/analytics", all, all), "/analytics");
});
