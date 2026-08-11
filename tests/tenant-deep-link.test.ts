import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner imports TypeScript directly.
import { planTenantDeepLink, tenantDeepLinkScrollTargetId } from "../lib/tenant-deep-link.ts";

const tenant = (id: string, status = "在租", propertyId = "property-1") => ({ id, status, propertyId });

test("tenant deep link makes a current tenant after the compact first eight visible and scrollable", () => {
  const tenants = Array.from({ length: 10 }, (_, index) => tenant(`tenant-${index + 1}`));
  const plan = planTenantDeepLink({ tenantId: "tenant-9", tenants, sortedTenants: tenants, pageSize: 15 });
  assert.equal(plan?.page, 1);
  assert.equal(plan?.expandCurrent, true);
  assert.equal(plan?.expandRetired, false);
  assert.equal(plan?.scrollTargetId, tenantDeepLinkScrollTargetId("tenant-9"));
});

test("tenant deep link resolves archived and retired groups by stable tenant ID", () => {
  const tenants = [tenant("current"), tenant("retired", "已退租"), tenant("archived", "已归档", "property-2")];
  const retired = planTenantDeepLink({ tenantId: "retired", tenants, sortedTenants: tenants, pageSize: 2 });
  const archived = planTenantDeepLink({ tenantId: "archived", tenants, sortedTenants: [tenants[2], tenants[0], tenants[1]], pageSize: 2 });
  assert.equal(retired?.page, 1);
  assert.equal(retired?.expandRetired, true);
  assert.equal(archived?.showArchived, true);
  assert.equal(archived?.page, 1);
  assert.equal(archived?.requiredPropertyId, "property-2");
});
