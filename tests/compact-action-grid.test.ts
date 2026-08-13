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
const modalManager = readFileSync(new URL("../components/modal-layer-manager.tsx", import.meta.url), "utf8");

test("compact action grid owns three equal mobile columns and preserves touch targets", () => {
  assert.match(css, /\.compact-action-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /\.compact-action-grid\s*\{[\s\S]*?column-gap:\s*var\(--ui-compact-action-grid-gap/);
  assert.match(css, /\.compact-action-grid\s*>\s*\.btn,[\s\S]*?min-height:\s*var\(--ui-touch-target/);
  assert.match(css, /\.compact-action-grid\s*>\s*\.btn,[\s\S]*?gap:\s*5px[\s\S]*?padding-inline:\s*6px[\s\S]*?white-space:\s*nowrap/);
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

test("app shell and modal responsive roots have one authoritative CSS owner", () => {
  assert.equal((css.match(/^\.modal-backdrop\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.modal-card\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.app-shell\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.mobile-nav\s*\{/gm) || []).length, 1);
  assert.match(css, /\.modal-backdrop\s*\{[\s\S]*?height:\s*100dvh[\s\S]*?min-height:\s*100svh/);
  assert.match(css, /\.modal-card\s*\{[\s\S]*?max-height:\s*calc\(100dvh/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.mobile-nav\s*\{/);
  assert.match(css, /--ui-mobile-nav-structural-height:\s*66px/);
  assert.match(css, /--ui-mobile-nav-content-gap:\s*18px/);
  assert.match(css, /--ui-bottom-nav-clearance:\s*calc\(var\(--ui-mobile-nav-structural-height\)\s*\+\s*var\(--ui-mobile-nav-content-gap\)\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.main\s*\{[\s\S]*?padding-bottom:\s*calc\(128px/);
  assert.match(css, /\.data-center-page\s*\{[\s\S]*?padding-bottom:\s*var\(--ui-space-4,\s*16px\)/);
  assert.match(css, /\.settlement-snapshot-page\{padding-bottom:var\(--ui-space-4,16px\)\}/);
  const dataCenterBlock = css.match(/\.data-center-page\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(dataCenterBlock, /safe-area-inset-bottom/);
  assert.doesNotMatch(css, /\.settlement-snapshot-page\{padding-bottom:110px\}/);
  assert.match(modalManager, /body\.style\.position\s*=\s*"fixed"/);
});

test("page visual spacing and fixed overlay offsets have separate owners", () => {
  assert.match(css, /\.attachment-upload-progress\s*\{[\s\S]*?bottom:\s*16px/);
  assert.match(css, /\.ui-toast\s*\{[\s\S]*?bottom:\s*16px/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.attachment-upload-progress\s*\{[\s\S]*?var\(--ui-mobile-nav-structural-height\)\s*\+\s*6px\s*\+\s*env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.ui-toast\s*\{[\s\S]*?var\(--ui-mobile-nav-structural-height\)\s*\+\s*var\(--ui-mobile-nav-content-gap\)\s*\+\s*env\(safe-area-inset-bottom\)/);
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
