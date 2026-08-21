import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("app/api/rent-collection/route.ts", "utf8");

test("waive resolves historical tenants through workspace-owned property", () => {
  assert.match(routeSource, /\.select\("id,property_id,room_id,name,monthly_rent,actual_move_out_date,status"\)/);
  assert.doesNotMatch(routeSource, /\.select\([^\n]*move_in_date/);
  assert.match(routeSource, /\.eq\("id", derivedTarget\.tenantId\)[\s\S]*?\.maybeSingle\(\)/);
  assert.doesNotMatch(routeSource, /\.eq\("id", derivedTarget\.tenantId\)[\s\S]*?\.eq\("user_id", context\.profile\.workspace_owner_id\)/);
  assert.match(routeSource, /resolveHistoricalPropertyId\(/);
  assert.match(routeSource, /\.eq\("id", propertyId\)[\s\S]*?\.eq\("user_id", workspaceOwnerId\)/);
  assert.match(routeSource, /actual_move_out_date,status/);
});

test("payment-backed waive also resolves tenant identity without requiring active status", () => {
  assert.match(routeSource, /\.eq\("id", payment\.tenant_id\)[\s\S]*?tenantRowFound: true/);
  assert.doesNotMatch(routeSource, /tenantRow\.property_id !== payment\.property_id/);
  assert.match(routeSource, /requirePropertyAccess\(context, propertyId\)/);
  assert.match(routeSource, /requireModulePermission\(context, "rent_payments", "edit"\)/);
});
