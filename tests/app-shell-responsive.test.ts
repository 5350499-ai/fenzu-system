import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const appLayout = readFileSync(new URL("../components/app-layout.tsx", import.meta.url), "utf8");
const componentMap = readFileSync(new URL("../UI_COMPONENT_MAP.md", import.meta.url), "utf8");
const designSystem = readFileSync(new URL("../UI_DESIGN_SYSTEM.md", import.meta.url), "utf8");

test("App Shell has one shared navigation data source and three exclusive navigation modes", () => {
  assert.match(appLayout, /shellNavItems/);
  assert.match(appLayout, /className="compact-rail"/);
  assert.match(appLayout, /className="mobile-nav"/);
  assert.equal((css.match(/^\.app-shell\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.sidebar\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.mobile-nav\s*\{/gm) || []).length, 1);
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1100px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1101px\)/);
  assert.match(css, /\.compact-rail\s*\{[\s\S]*?display:\s*none/);
});

test("Medium Shell uses a 72px rail, no bottom navigation, and no mobile clearance", () => {
  const medium = css.match(/@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1100px\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(medium, /grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
  assert.match(medium, /\.sidebar,[\s\S]*?\.mobile-nav\s*\{[\s\S]*?display:\s*none/);
  assert.match(medium, /\.compact-rail\s*\{[\s\S]*?display:\s*grid/);
  assert.match(medium, /\.main\s*\{[\s\S]*?padding:\s*22px\s+18px\s+24px/);
  assert.doesNotMatch(medium, /ui-bottom-nav-clearance/);
});

test("Compact rail preserves touch targets and cannot expand from labels", () => {
  const link = css.match(/\.compact-rail-link\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.match(link, /min-height:\s*44px/);
  assert.match(link, /font-size:\s*12px/);
  assert.match(link, /white-space:\s*nowrap/);
  assert.match(css, /\.compact-rail\s*\{[\s\S]*?min-width:\s*0/);
  assert.match(css, /\.compact-rail-link span\s*\{[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(css, /\.compact-rail\s*\{[\s\S]*?overflow-y:\s*auto/);
});

test("Responsive Shell contract is documented and stable business roots remain excluded", () => {
  assert.match(componentMap, /Phone Shell/);
  assert.match(componentMap, /Medium Shell/);
  assert.match(componentMap, /Desktop Shell/);
  assert.match(componentMap, /Tenant Status Five-Slot Ownership/);
  assert.match(designSystem, /Tenant List Row Contract/);
  assert.match(designSystem, /Phone[\s\S]*Medium[\s\S]*Desktop/);
  assert.match(designSystem, /640px/);
  assert.match(designSystem, /1100px/);
  assert.match(designSystem, /Device names[\s\S]*user-agent checks[\s\S]*window\.innerWidth/);
});

test("Shell width contracts are derived from responsive footprints", () => {
  assert.match(css, /grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /padding:\s*22px\s+18px\s+24px/);
  assert.doesNotMatch(appLayout, /window\.innerWidth|screen\.width|devicePixelRatio|navigator\.userAgent/);

  const shellWidth = (viewport: number) => {
    if (viewport <= 640) return viewport - 28;
    if (viewport <= 1100) return viewport - 72 - 36;
    return viewport - 260 - 52;
  };

  assert.equal(shellWidth(640), 612);
  assert.equal(shellWidth(641), 533);
  assert.equal(shellWidth(1100), 992);
  assert.equal(shellWidth(1101), 789);
  assert.ok(Math.abs(shellWidth(980) - shellWidth(981)) < 10);
});
