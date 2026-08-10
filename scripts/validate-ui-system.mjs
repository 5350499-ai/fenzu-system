import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const guide = readFileSync(resolve(root, "UI_DESIGN_SYSTEM.md"), "utf8");
const claude = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
const architecture = readFileSync(resolve(root, "ARCHITECTURE.md"), "utf8");

const required = [
  [guide, "--ui-control-height-mobile", "UI guide must define the mobile control height"],
  [guide, "Checkbox/Radio 本体固定 18px", "UI guide must isolate checkbox/radio sizing"],
  [guide, "关闭时只能看到一个主控件边框", "UI guide must forbid nested closed-control borders"],
  [claude, "UI_DESIGN_SYSTEM.md", "CLAUDE.md must require the UI guide"],
  [architecture, "UI_DESIGN_SYSTEM.md", "ARCHITECTURE.md must identify the UI guide"],
  [css, "--ui-check-control-size: 18px", "CSS must define the checkbox/radio token"],
  [css, "--ui-control-height-mobile: 44px", "CSS must define the mobile control token"],
  [css, ".ui-combobox-input", "Searchable controls must use the shared inner-input reset"],
  [css, ".pagination-size-select", "Pagination size controls must use the shared control style"],
  [css, ".modal-backdrop", "Modal surfaces must use the shared backdrop"]
];

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , message]) => message);

if (/touch-action\s*:\s*none/i.test(css)) {
  failures.push("Global CSS must not disable touch scrolling with touch-action:none");
}

if (failures.length) {
  console.error("UI design-system validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI design-system validation passed.");
