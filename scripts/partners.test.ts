import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's strip-types runner needs the explicit source extension.
import { canDeletePartner, hasOverlappingShareIntervals, resolveLegacyPartner, validateActivePartnerCount, validatePartnerPercentages, validatePartnerPlanRows } from "../lib/partner-rules.ts";

const partner = (id: string, legacyCode: string | null) => ({ id, legacyCode });

test("active partner count is 1 through 5 only", () => {
  assert.equal(validateActivePartnerCount(1), true);
  assert.equal(validateActivePartnerCount(5), true);
  assert.equal(validateActivePartnerCount(0), false);
  assert.equal(validateActivePartnerCount(6), false);
});

test("percentage plans accept 100, 70+5+25 and zero percent", () => {
  assert.equal(validatePartnerPercentages([100]).valid, true);
  assert.equal(validatePartnerPercentages([70, 5, 25]).valid, true);
  assert.equal(validatePartnerPercentages([100, 0]).valid, true);
  assert.equal(validatePartnerPercentages([50, 40]).valid, false);
  assert.equal(validatePartnerPercentages([50, 60]).valid, false);
});

test("a plan contains only explicitly selected unique participants", () => {
  assert.equal(validatePartnerPlanRows([{ partnerId: "a", percentage: 100 }]).valid, true);
  assert.equal(validatePartnerPlanRows([{ partnerId: "a", percentage: 70 }, { partnerId: "b", percentage: 5 }, { partnerId: "c", percentage: 25 }]).valid, true);
  assert.equal(validatePartnerPlanRows([{ partnerId: "a", percentage: 50 }, { partnerId: "b", percentage: 50 }, { partnerId: "b", percentage: 0 }]).valid, false);
  assert.equal(validatePartnerPlanRows([]).valid, false);
});

test("legacy resolution is explicit and unknown values are not mapped to A", () => {
  const partners = [partner("a", "A"), partner("b", "B")];
  assert.equal(resolveLegacyPartner(partners, "A")?.id, "a");
  assert.equal(resolveLegacyPartner(partners, "B")?.id, "b");
  assert.equal(resolveLegacyPartner(partners, "C"), null);
});

test("share intervals may not overlap", () => {
  assert.equal(hasOverlappingShareIntervals([{ effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }, { effectiveFrom: "2026-07-01", effectiveTo: null }]), false);
  assert.equal(hasOverlappingShareIntervals([{ effectiveFrom: "2026-01-01", effectiveTo: null }, { effectiveFrom: "2026-07-01", effectiveTo: null }]), true);
});

test("legacy or referenced partners cannot be deleted", () => {
  assert.equal(canDeletePartner({ id: "a", legacyCode: "A" }, []), false);
  assert.equal(canDeletePartner({ id: "c", legacyCode: null }, [{ partnerId: "c" }]), false);
  assert.equal(canDeletePartner({ id: "c", legacyCode: null }, []), true);
});
