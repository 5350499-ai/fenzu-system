import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const tenants = readFileSync(new URL("../app/tenants/page.tsx", import.meta.url), "utf8");
const tasks = readFileSync(new URL("../components/tasks-server-manager.tsx", import.meta.url), "utf8");
const expenses = readFileSync(new URL("../app/expenses/page.tsx", import.meta.url), "utf8");
const payments = readFileSync(new URL("../app/rent-payments/page.tsx", import.meta.url), "utf8");
const properties = readFileSync(new URL("../app/properties/[id]/page.tsx", import.meta.url), "utf8");
const componentMap = readFileSync(new URL("../UI_COMPONENT_MAP.md", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../UI_DESIGN_SYSTEM.md", import.meta.url), "utf8");

test("compact action grid owns three equal mobile columns and preserves touch targets", () => {
  assert.match(css, /\.compact-action-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.compact-action-grid\s*\{[\s\S]*?gap:\s*var\(--ui-compact-action-grid-gap/);
  assert.match(css, /\.compact-action-grid\s*>\s*\.btn,[\s\S]*?min-height:\s*var\(--ui-touch-target/);
});

test("Tenant Detail and short record groups use the shared root", () => {
  for (const source of [tenants, tasks, expenses, payments, properties]) {
    assert.match(source, /compact-action-grid/);
  }
  assert.match(tenants, /className="compact-action-grid tenant-detail-actions"/);
  assert.doesNotMatch(tenants, /tenant-detail-action-spacer|tenant-detail-actions-row/);
});

test("semantic two-action and modal groups remain outside the compact three-column root", () => {
  assert.match(css, /\.tenant-debt-action-buttons\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.reminder-rent-actions\s*\{[\s\S]*?display:\s*flex/);
  assert.match(css, /\.property-multi-select-modal > \.modal-actions/);
  const modalBlocks = [...css.matchAll(/\.modal-actions\s*\{([\s\S]*?)\}/g)].map((match) => match[1]);
  assert.ok(modalBlocks.length > 0);
  assert.ok(modalBlocks.every((block) => !/grid-template-columns:\s*repeat\(3/.test(block)));
});

test("compact action root does not impose desktop-only or overflow-prone fixed columns", () => {
  const root = css.match(/\.compact-action-grid\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(root, /minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(root, /width\s*:\s*\d+px/);
  assert.doesNotMatch(root, /overflow\s*:\s*(?:scroll|auto)/);
});

test("the compact action root is documented and its semantic exclusions remain explicit", () => {
  assert.match(componentMap, /Compact Action Grid Root/);
  assert.match(componentMap, /\.compact-action-grid/);
  assert.match(componentMap, /modal-actions/);
  assert.match(designSystem, /Compact Action Grid Contract/);
  assert.match(designSystem, /three equal columns/);
});
