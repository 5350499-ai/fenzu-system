import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const map = readFileSync(join(root, "UI_COMPONENT_MAP.md"), "utf8");
const design = readFileSync(join(root, "UI_DESIGN_SYSTEM.md"), "utf8");
const contract = readFileSync(join(root, "RESPONSIVE_CONTRACT.md"), "utf8");

const viewports = [320, 360, 375, 390, 393, 414, 430, 480, 600, 640, 641, 720, 768, 820, 900, 980, 981, 1024, 1100, 1101, 1180, 1280, 1440];

test("final responsive viewport matrix has three exclusive Shell ranges", () => {
  assert.deepEqual(viewports, [320, 360, 375, 390, 393, 414, 430, 480, 600, 640, 641, 720, 768, 820, 900, 980, 981, 1024, 1100, 1101, 1180, 1280, 1440]);
  const mode = (width: number) => width <= 640 ? "PHONE" : width <= 1100 ? "MEDIUM" : "DESKTOP";
  assert.equal(mode(640), "PHONE");
  assert.equal(mode(641), "MEDIUM");
  assert.equal(mode(1100), "MEDIUM");
  assert.equal(mode(1101), "DESKTOP");
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1100px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1101px\)/);
  assert.match(contract, /320, 360, 375[\s\S]*1100, 1101/);
});

test("final shell-row, modal and overflow owners are documented and present", () => {
  assert.match(css, /--ui-mobile-nav-structural-height:\s*66px/);
  assert.match(css, /--ui-mobile-nav-overlay-gap:\s*18px/);
  assert.match(css, /--ui-mobile-nav-overlay-offset:\s*calc\(var\(--ui-mobile-nav-structural-height\)\s*\+\s*var\(--ui-mobile-nav-overlay-gap\)\s*\+\s*env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.mobile-nav\s*\{[\s\S]*?position:\s*relative[\s\S]*?grid-row:\s*2/);
  assert.equal((css.match(/^\.modal-backdrop\s*\{/gm) || []).length, 1);
  assert.equal((css.match(/^\.modal-card\s*\{/gm) || []).length, 1);
  assert.match(css, /\.table-wrap\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(css, /\.tenant-svg-scroll\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/);
  assert.match(map, /High-risk layout ownership - 2\.6/);
});

test("frozen business contracts and BUG-01 remain guarded", () => {
  assert.match(css, /\.tenant-list-identity-row/);
  assert.match(css, /\.tenant-list-rent-row/);
  assert.match(css, /\.tenant-status-row/);
  assert.match(map, /Tenant Status Five-Slot Ownership/);
  assert.match(design, /Tenant List Rent Row Contract/);
  assert.match(css, /\.check-in-form-grid\s*>\s*\.collapsible-attachments\s*\{\s*overflow:\s*visible;/);
  assert.match(contract, /IPHONE_MANUAL_VALIDATION_PASSED/);
});

test("responsive layout anti-patterns are absent from application layout sources", () => {
  const sourceFiles: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(tsx?|css)$/.test(entry.name)) sourceFiles.push(relative);
    }
  };
  for (const directory of ["app", "components", "lib"]) walk(directory);
  const layoutSources = sourceFiles.filter((file) => file !== join("components", "client-error-reporter.tsx") && !file.endsWith(".css"));
  const source = layoutSources.map((file) => readFileSync(join(root, file), "utf8")).join("\n");
  assert.doesNotMatch(source, /window\.innerWidth|screen\.width|devicePixelRatio/);
  assert.doesNotMatch(css, /\bzoom\s*:/);
});
