import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error test runner imports the TypeScript module directly.
import { allPaymentPropertyScopeIds, paymentMatchesPropertyScope, UNLINKED_PROPERTY_SCOPE } from "../lib/property-scope.ts";

const paymentsPage = readFileSync(new URL("../app/rent-payments/page.tsx", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");

test("all-property payment scope includes the canonical unlinked bucket", () => {
  const scope = allPaymentPropertyScopeIds([{ id: "property-a" }, { id: "property-b" }]);
  assert.deepEqual(scope, ["property-a", "property-b", UNLINKED_PROPERTY_SCOPE]);
  assert.equal(paymentMatchesPropertyScope(null, scope), true);
  assert.equal(paymentMatchesPropertyScope("property-a", scope), true);
  assert.equal(paymentMatchesPropertyScope(null, ["property-a"]), false);
});

test("payment list, search, and total share the canonical scope instead of an entity join", () => {
  assert.match(paymentsPage, /paymentMatchesPropertyScope\(payment\.propertyId, selectedPropertyIds\)/);
  assert.match(paymentsPage, /matchesFinanceSearch\(query/);
  assert.match(paymentsPage, /filteredPaymentTotal/);
  assert.match(paymentsPage, /<PropertyMultiSelect includeUnlinked/);
  assert.doesNotMatch(paymentsPage, /selectedPropertyIds\.includes\(payment\.propertyId\)/);
  assert.match(dashboard, /calculateUnassignedIncome\(rentPayments, thisMonthRange\)/);
});
