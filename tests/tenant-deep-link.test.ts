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
  assert.equal(retired?.targetGroup, "moved_out");
  assert.equal(retired?.temporarilyOverrideFilters, true);
  assert.equal(archived?.showArchived, true);
  assert.equal(archived?.targetGroup, "archived_moved_out");
  assert.equal(archived?.page, 1);
  assert.equal(archived?.requiredPropertyId, "property-2");
});

test("moved-out deep links remain in normal mode, expand the retired group, and keep the stable scroll target", () => {
  const tenants = [tenant("same-name-current"), tenant("same-name-moved-out", "moved_out", "property-2")];
  const plan = planTenantDeepLink({ tenantId: "same-name-moved-out", tenants, sortedTenants: tenants, pageSize: 1 });
  assert.equal(plan?.tenant.id, "same-name-moved-out");
  assert.equal(plan?.showArchived, false);
  assert.equal(plan?.targetGroup, "moved_out");
  assert.equal(plan?.expandRetired, true);
  assert.equal(plan?.expandCurrent, false);
  assert.equal(plan?.page, 2);
  assert.equal(plan?.requiredPropertyId, "property-2");
  assert.equal(plan?.scrollTargetId, tenantDeepLinkScrollTargetId("same-name-moved-out"));
});

test("archived tenants resolve their archive subgroup by ID", () => {
  const tenants = [tenant("archived-moved-out", "archived", "property-3")];
  // Archived status is the project\'s archive mode. Its historical move-out
  // detail is still resolved by the stable target ID, not a room or display name.
  const plan = planTenantDeepLink({ tenantId: "archived-moved-out", tenants, sortedTenants: tenants, pageSize: 15 });
  assert.equal(plan?.showArchived, true);
  assert.equal(plan?.targetGroup, "archived_current");
  assert.equal(plan?.scrollTargetId, tenantDeepLinkScrollTargetId("archived-moved-out"));
});
