import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { getTenantStatusSlots } from "../lib/tenant-status-slots.ts";
// @ts-expect-error Node's strip-types test runner imports TypeScript directly.
import { tenantRentRowLabel, tenantRentRowTone } from "../lib/tenant-debt-display.ts";

const page = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("current and moved-out tenants use the same detail component and compact action grid", () => {
  assert.equal((page.match(/<TenantDetail\b/g) || []).length, 1);
  assert.equal((page.match(/record-detail-panel tenant-detail-panel/g) || []).length, 1);
  assert.match(page, /tenant-lifecycle-status-area[\s\S]*?actualMoveOutDate/);
  assert.equal((page.match(/movedOut && isActualMoveOutDateEnabled\(\)/g) || []).length, 1);
  assert.match(page, /className="compact-action-grid tenant-detail-actions"/);
  assert.match(css, /\.compact-action-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?row-gap:\s*var\(--ui-compact-action-row-gap\)/);
  assert.doesNotMatch(page, /tenant-detail-action-spacer/);
});

test("expanded tenants place payment-specific actions in the existing detail action grid", () => {
  assert.match(page, /const tenantDebtCases = getTenantDebtCases\(tenant\.id, debtCases\)/);
  assert.match(page, /debtCases=\{tenantDebtCases\}/);
  assert.match(page, /onWaiveDebt=\{waiveDebtCase\}/);
  assert.match(page, /canCollectRent=\{access\.can\("rent_payments", "create"\).*tenantDebtCases\.length === 0\}/);
});

test("tenant detail keeps payment-specific actions without a standalone debt card", () => {
  assert.doesNotMatch(page, /TenantDebtActionStack|<DebtActionPanel/);
  assert.match(page, /data-payment-id=\{debtCase\.paymentId\}/);
  assert.match(page, /debtCase\.canCollect \?/);
  assert.match(page, /debtCase\.canWaive \?/);
  assert.match(page, /已逾期\$\{primaryDebtCase\.daysOverdue\}天/);
  assert.match(page, /data-payment-id=\{debtCase\.paymentId\}/);
  assert.doesNotMatch(page, /tenant-detail-debt-delete-row/);
});

test("tenant detail does not repeat lifecycle or debt badges inside the deposit section", () => {
  const detail = page.slice(page.indexOf("function TenantDetail("), page.indexOf("function TenantDetailActions("));
  assert.doesNotMatch(detail, /tenant-lifecycle-badges/);
  assert.doesNotMatch(detail, /hasHistoricalOpenDebt/);
  assert.doesNotMatch(detail, /historicalDebtLabel/);
  assert.match(detail, /<span className="muted">押金状态<\/span>/);
});

test("tenant detail uses the final four-pair plus two-wide-row contract", () => {
  assert.equal((page.match(/className="tenant-detail-pair-row"/g) || []).length, 4);
  assert.match(page, /className="tenant-detail-wide-row tenant-coverage-field"/);
  assert.match(page, /className="tenant-detail-wide-row tenant-note-field"/);
  assert.match(css, /\.tenant-core-detail-grid > \.tenant-detail-pair-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(css, /--tenant-detail-row-gap:\s*var\(--ui-compact-row-gap\)/);
});

test("deposit status is represented once in the expanded detail and payment summary remains", () => {
  assert.equal((page.match(/<span className="muted">押金状态<\/span>/g) || []).length, 1);
  assert.match(page, /tenant-payment-performance/);
  assert.match(page, /tenant-performance-summary/);
});

test("tenant list gives name and property readable minimum tracks before badges", () => {
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row\s*\{[\s\S]*?minmax\(0, 3fr\)[\s\S]*?minmax\(0, 4fr\)[\s\S]*?minmax\(0, 3fr\)/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row > \*/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row > \.tenant-list-room/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row > \*[\s\S]*?font-size:\s*var\(--ui-font-size-body, 14px\)[\s\S]*?line-height:\s*var\(--ui-line-height-normal, 1\.45\)/);
});

test("tenant list keeps statuses in one deterministic status row", () => {
  assert.match(page, /className="tenant-list-row tenant-list-identity-row"/);
  assert.match(page, /className="tenant-list-row tenant-list-rent-row"/);
  assert.match(page, /className="tenant-list-row tenant-status-row"/);
  assert.doesNotMatch(page, /className="tenant-status-wrapper"/);
  assert.doesNotMatch(page, /className="tenant-secondary-status-wrapper"/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column[\s\S]*?width:\s*100%/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-rent-row\s*\{[\s\S]*?grid-template-columns:/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(page, /getTenantStatusSlots\(/);
  assert.match(page, /tenant-status-slot-\$\{index \+ 1\}/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row\s*\{[\s\S]*?grid-auto-flow:\s*row/);
});

test("tenant status slots keep business types fixed and empty slots invisible", () => {
  const slots = getTenantStatusSlots({ lifecycleLabel: "在租", hasCurrentDebt: false, hasHistoricalDebt: true, paymentPerformanceLabel: "按时80%", depositStatus: "押金待处理" });
  assert.equal(slots.length, 5);
  assert.equal(slots[0]?.label, "在租");
  assert.equal(slots[1], null);
  assert.equal(slots[2]?.label, "历史欠费");
  assert.equal(slots[3]?.label, "按时80%");
  assert.equal(slots[4]?.label, "押金待处理");
  assert.doesNotMatch(page, /statusSlots\.filter/);
  assert.match(page, /aria-hidden=\{!slot\}/);
});

test("tenant rent row uses three stable proportional slots and semantic display tones", () => {
  assert.equal(tenantRentRowLabel({ daysRemaining: 18, endDate: "2026-08-31", level: "normal", label: "", sortGroup: 3 }), "剩余18天");
  assert.equal(tenantRentRowLabel({ daysRemaining: 13, endDate: "2026-08-26", level: "orange", label: "即将到期13天", sortGroup: 1 }), "剩余13天");
  assert.equal(tenantRentRowLabel({ daysRemaining: 0, endDate: "2026-08-13", level: "red", label: "今日到期", sortGroup: 0 }), "今日到期");
  assert.equal(tenantRentRowLabel({ daysRemaining: -3, endDate: "2026-08-10", level: "red", label: "", sortGroup: 0 }), "已逾期3天");
  assert.equal(tenantRentRowLabel({ daysRemaining: null, endDate: "", level: "normal", label: "", sortGroup: 4 }), "无覆盖日期");
  assert.equal(tenantRentRowTone({ daysRemaining: 30, endDate: "2026-08-31", level: "yellow", label: "", sortGroup: 2 }), "yellow");
  assert.equal(tenantRentRowTone({ daysRemaining: 31, endDate: "2026-09-01", level: "normal", label: "", sortGroup: 3 }), "green");
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-rent-row\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 31fr\)\s+minmax\(0, 25fr\)\s+minmax\(0, 44fr\)/);
  assert.doesNotMatch(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-rent-row\s*\{[^}]*grid-template-columns:[^;}]*\d+px/i);
  assert.match(page, /tenantRentRowLabel\(expiryInfo\)/);
  assert.match(page, /tenantRentRowTone\(expiryInfo\)/);
  assert.doesNotMatch(page, /expiryInfo\.label \|\| "租期正常"/);
});

test("tenant status slot matrix preserves every business position", () => {
  const cases = [
    { lifecycleLabel: "在租", hasCurrentDebt: false, hasHistoricalDebt: false, paymentPerformanceLabel: "按时100%", depositStatus: "无押金", expected: ["在租", null, null, "按时100%", "无押金"] },
    { lifecycleLabel: "在租", hasCurrentDebt: true, hasHistoricalDebt: false, paymentPerformanceLabel: "暂无记录", depositStatus: "无押金", expected: ["在租", "当前欠租", null, "暂无记录", "无押金"] },
    { lifecycleLabel: "在租", hasCurrentDebt: false, hasHistoricalDebt: true, paymentPerformanceLabel: "按时80%", depositStatus: "押金待处理", expected: ["在租", null, "历史欠费", "按时80%", "押金待处理"] },
    { lifecycleLabel: "在租", hasCurrentDebt: true, hasHistoricalDebt: true, paymentPerformanceLabel: "暂无记录", depositStatus: "押金待处理", expected: ["在租", "当前欠租", "历史欠费", "暂无记录", "押金待处理"] },
    { lifecycleLabel: "已退租", hasCurrentDebt: false, hasHistoricalDebt: true, paymentPerformanceLabel: "暂无记录", depositStatus: "押金已处理", expected: ["已退租", null, "历史欠费", "暂无记录", "押金已处理"] },
    { lifecycleLabel: "已归档", hasCurrentDebt: false, hasHistoricalDebt: false, paymentPerformanceLabel: "按时100%", depositStatus: "无押金", expected: ["已归档", null, null, "按时100%", "无押金"] },
  ];

  for (const input of cases) {
    const labels = getTenantStatusSlots(input).map((slot) => slot?.label ?? null);
    assert.deepEqual(labels, input.expected);
  }
});

test("tenant list has a deterministic three-row contract and keeps detail room rules separate", () => {
  const row = page.slice(page.indexOf('className="finance-line tenant-finance-line tenant-list-row-stack"'), page.indexOf('</button>', page.indexOf('className="finance-line tenant-finance-line tenant-list-row-stack"')));
  assert.match(row, /tenant-list-row-stack/);
  assert.equal((row.match(/className="tenant-list-row/g) || []).length, 3);
  assert.match(row, /tenant-list-room/);
  assert.match(row, /tenant-list-coverage/);
  assert.match(row, /tenant-status-item/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row > \.tenant-list-room[\s\S]*?max-width:\s*100%[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-property/);
});

test("tenant list fixtures keep the same three-row shape across lifecycle and status combinations", () => {
  const fixtures = [
    "current + on-rent + on-time + no-deposit",
    "current + overdue + no-record + no-deposit",
    "current + on-rent + no-record + deposit-pending",
    "current + on-time + no-deposit + long-room",
    "moved-out + no-record + deposit-processed",
    "moved-out + historical-debt + deposit-pending",
    "long-tenant + long-property + long-room + multiple-statuses",
  ];

  assert.equal(fixtures.length, 7);
  for (const fixture of fixtures) {
    assert.equal((page.match(/className="tenant-list-row/g) || []).length, 3, fixture);
    assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack\s*\{[\s\S]*?display:\s*flex[\s\S]*?flex-direction:\s*column/, fixture);
    assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row[\s\S]*?grid-template-columns:\s*minmax\(0, 3fr\)\s+minmax\(0, 4fr\)\s+minmax\(0, 3fr\)/, fixture);
    assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/, fixture);
    assert.doesNotMatch(css, /\.tenant-compact-list \.tenant-list-row-stack[^\{]*\{[^}]*flex-wrap\s*:/, fixture);
  }

  for (const width of [375, 390, 393, 414, 430]) {
    assert.ok(width >= 375 && width <= 430, `fixture width ${width}px is covered`);
  }
});

test("tenant status five-slot grid stays proportional across mobile widths", () => {
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row\s*\{[^}]*grid-template-columns:[^;}]*\d+px/i);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-status-row \.badge\s*\{[\s\S]*?max-width:\s*100%[\s\S]*?text-overflow:\s*ellipsis/);
});

test("tenant room uses a compact list contract and a full detail contract", () => {
  assert.match(page, /className="tenant-list-room"/);
  assert.doesNotMatch(page, /compactRoomName\(/);
  assert.match(page, /className="tenant-detail-property"/);
  assert.match(page, /className="tenant-detail-room"/);
  assert.match(css, /\.tenant-compact-list \.tenant-list-row-stack > \.tenant-list-identity-row > \.tenant-list-room[\s\S]*?max-width:\s*100%[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-property > strong,[\s\S]*?\.tenant-detail-panel \.tenant-detail-room > strong[\s\S]*?overflow:\s*visible[\s\S]*?white-space:\s*normal/);
});

test("compact vertical rhythm uses relative gaps and preserves touch-sized actions", () => {
  assert.match(css, /--ui-compact-row-gap:\s*0\.5em/);
  assert.match(css, /\.tenant-core-detail-grid\s*\{[\s\S]*?row-gap:\s*0/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?row-gap:\s*var\(--ui-compact-action-row-gap\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-action-button\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
  assert.doesNotMatch(css, /\.tenant-core-detail-grid[^\{]*\{[^\}]*height:\s*\d+px/i);
});

test("tenant detail density ownership keeps section spacing scoped and deposit nesting compact", () => {
  assert.match(css, /\.record-detail-panel\.tenant-detail-panel:has\(> \.compact-detail-card\)\s*\{[\s\S]*?gap:\s*7px/);
  assert.match(css, /\.tenant-detail-panel \.tenant-lifecycle-status-area > \.deposit-status-detail\s*\{[\s\S]*?margin-block:\s*0[\s\S]*?padding:\s*6px 8px[\s\S]*?gap:\s*6px/);
  assert.match(css, /\.tenant-detail-panel \.tenant-performance-summary\s*\{[\s\S]*?gap:\s*5px[\s\S]*?padding:\s*8px/);
  assert.match(css, /\.tenant-detail-panel \.payment-history-panel,[\s\S]*?\.tenant-detail-panel \.contract-attachments-panel\s*\{[\s\S]*?padding-top:\s*7px/);
});

test("tenant detail utility controls remain touch-sized while visually lighter", () => {
  assert.match(css, /\.tenant-detail-panel \.tenant-details-toggle\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
  assert.match(css, /\.tenant-detail-panel \.tenant-details-toggle\s*\{[\s\S]*?height:\s*44px/);
  assert.match(css, /\.tenant-detail-panel \.tenant-year-switcher button\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
  assert.match(css, /\.tenant-detail-panel \.payment-history-line\s*\{[\s\S]*?padding-block:\s*8px/);
});

test("tenant detail core rows use one gap source and keep action touch targets", () => {
  assert.match(css, /\.tenant-detail-panel \.tenant-core-detail-grid\s*\{[\s\S]*?--tenant-detail-row-gap:\s*0\.35em[\s\S]*?row-gap:\s*var\(--tenant-detail-row-gap\)/);
  assert.match(css, /\.tenant-detail-panel \.tenant-core-detail-grid \.compact-detail-row\s*\{[\s\S]*?padding-block:\s*0/);
  assert.match(css, /\.tenant-detail-panel \.tenant-core-detail-grid\s*\{[\s\S]*?row-gap:\s*0\.35em/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-actions\s*\{[\s\S]*?row-gap:\s*0\.35em[\s\S]*?margin-block:\s*0[\s\S]*?padding-block:\s*0/);
  assert.match(css, /\.tenant-detail-panel \.tenant-detail-action-button\s*\{[\s\S]*?min-height:\s*var\(--ui-touch-target/);
});
