import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync("app/globals.css", "utf8");
const componentMap = readFileSync("UI_COMPONENT_MAP.md", "utf8");
const designSystem = readFileSync("UI_DESIGN_SYSTEM.md", "utf8");

test("shared grid primitive consumes the existing grid spacing token", () => {
  assert.match(css, /--ui-grid-gap:\s*16px/);
  assert.match(css, /\.grid\s*\{[\s\S]*?gap:\s*var\(--ui-grid-gap,\s*16px\)/);
  assert.match(designSystem, /--ui-grid-gap/);
});

test("shared primitive convergence preserves frozen responsive roots", () => {
  assert.match(css, /@media\s*\(max-width:\s*640px\)/);
  assert.match(css, /@media\s*\(min-width:\s*641px\)\s*and\s*\(max-width:\s*1100px\)/);
  assert.match(css, /@media\s*\(min-width:\s*1101px\)/);
  assert.match(css, /\.check-in-form-grid\s*>\s*\.collapsible-attachments\s*\{\s*overflow:\s*visible;/);
  assert.match(componentMap, /BUG-01: check-in deposit selector ownership/);
});
