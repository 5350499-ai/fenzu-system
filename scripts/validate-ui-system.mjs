import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const guide = readFileSync(resolve(root, "UI_DESIGN_SYSTEM.md"), "utf8");
const claude = readFileSync(resolve(root, "CLAUDE.md"), "utf8");
const architecture = readFileSync(resolve(root, "ARCHITECTURE.md"), "utf8");
const searchableSelect = readFileSync(resolve(root, "components/searchable-select.tsx"), "utf8");
const ownershipField = readFileSync(resolve(root, "components/ownership-field.tsx"), "utf8");
const dropdownListbox = readFileSync(resolve(root, "components/dropdown-listbox.tsx"), "utf8");
const tapSelect = readFileSync(resolve(root, "components/tap-select.tsx"), "utf8");
const rentPayments = readFileSync(resolve(root, "app/rent-payments/page.tsx"), "utf8");

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:tsx?|css)$/.test(entry) ? [path] : [];
  });
}

const uiSources = [...sourceFiles(resolve(root, "app")), ...sourceFiles(resolve(root, "components"))]
  .map((path) => ({ path, source: readFileSync(path, "utf8") }));

const required = [
  [guide, "--ui-control-height-mobile", "UI guide must define the mobile control height"],
  [guide, "Checkbox/Radio 本体固定 18px", "UI guide must isolate checkbox/radio sizing"],
  [guide, "关闭时只能看到一个主控件边框", "UI guide must forbid nested closed-control borders"],
  [guide, "Single-line Control Contract", "UI guide must define the single-line control contract"],
  [guide, "Composite Select Contract", "UI guide must define the composite select contract"],
  [guide, "Mobile Dropdown Gesture Contract", "UI guide must define mobile dropdown gesture ownership"],
  [guide, "Nested Scroll Ownership", "UI guide must define nested scroll ownership"],
  [guide, "iOS Editable-Control Font Size Contract", "UI guide must define iOS editable-control sizing"],
  [claude, "UI_DESIGN_SYSTEM.md", "CLAUDE.md must require the UI guide"],
  [architecture, "UI_DESIGN_SYSTEM.md", "ARCHITECTURE.md must identify the UI guide"],
  [css, "--ui-check-control-size: 18px", "CSS must define the checkbox/radio token"],
  [css, "--ui-control-height-mobile: 44px", "CSS must define the mobile control token"],
  [css, ".ui-combobox-input", "Searchable controls must use the shared inner-input reset"],
  [css, ".ui-native-select", "Ownership selects must use the shared single-line control geometry"],
  [css, ".pagination-size-select", "Pagination size controls must use the shared control style"],
  [css, ".modal-backdrop", "Modal surfaces must use the shared backdrop"],
  [searchableSelect, "data-ui-control=\"composite-select\"", "SearchableSelect must declare its outer border owner"],
  [searchableSelect, "data-ui-composite-input", "SearchableSelect must identify its borderless inner input"],
  [ownershipField, "data-ui-control=\"single-line-select\"", "OwnershipField must use the single-line select contract"],
  [dropdownListbox, "data-ui-scroll-owner=\"dropdown\"", "DropdownListbox must declare dropdown scroll ownership"],
  [dropdownListbox, "onTouchMove", "DropdownListbox must distinguish touch scrolling"],
  [dropdownListbox, "event.preventDefault()", "DropdownListbox must contain boundary overscroll"],
  [tapSelect, "DropdownListbox", "TapSelect must reuse the shared listbox primitive"],
  [searchableSelect, "DropdownListbox", "SearchableSelect must reuse the shared listbox primitive"]
];

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , message]) => message);

if (/touch-action\s*:\s*none/i.test(css)) {
  failures.push("Global CSS must not disable touch scrolling with touch-action:none");
}

if (/\.field\s+input:not\(\[type=["']checkbox["']\]\):not\(\[type=["']radio["']\]\)(?!:not\(\.ui-combobox-input\))/i.test(css)) {
  failures.push("Broad .field input rules must explicitly exclude .ui-combobox-input");
}

const compositeInputRule = css.match(/\.field\.combobox-field\s*>\s*\.combobox\.ui-combobox-control\s*>\s*\.ui-combobox-input[\s\S]*?\{([\s\S]*?)\}/i)?.[1] || "";
for (const [pattern, message] of [
  [/border\s*:\s*0\s*;/i, "Composite inner inputs must be borderless"],
  [/border-radius\s*:\s*0\s*;/i, "Composite inner inputs must not draw a second radius"],
  [/background\s*:\s*transparent\s*;/i, "Composite inner inputs must keep a transparent background"],
  [/box-shadow\s*:\s*none\s*;/i, "Composite inner inputs must not draw a second focus shadow"],
  [/min-height\s*:\s*0\s*;/i, "Composite inner inputs must not impose their own control height"]
]) {
  if (!pattern.test(compositeInputRule)) failures.push(message);
}

if (/(?:input|select)[^\{]*\{[^\}]*\bwidth\s*:\s*(?:fit-content|min-content|max-content)\b/is.test(css)) {
  failures.push("Input/select controls must not use intrinsic content widths");
}

if (/matched\.slice\s*\(\s*0\s*,/i.test(searchableSelect)) {
  failures.push("SearchableSelect must not truncate long option lists");
}

if (/function\s+TapSelect\s*\(/.test(rentPayments)) {
  failures.push("Pages must use the shared TapSelect component");
}

for (const { path, source } of uiSources) {
  if (/role=["']option["'][\s\S]{0,500}onPointerDown\s*=/.test(source)) {
    failures.push(`Options must not select on pointerdown: ${path.replace(root, "")}`);
  }
  if (/\.ui-(?:combobox-input|dropdown-listbox)[^\{]*\{[^\}]*(?:border\s*:\s*(?!0)|height\s*:\s*\d+px)/is.test(source) && !path.endsWith("globals.css")) {
    failures.push(`Page/component CSS must not override composite internals: ${path.replace(root, "")}`);
  }
}

const mobileRules = css.match(/@media\s*\(max-width:\s*640px\)[\s\S]*$/i)?.[0] || "";
if (!/input:not\([^\}]*font-size\s*:\s*16px/is.test(mobileRules)) {
  failures.push("Mobile editable controls must have a 16px font size");
}

if (failures.length) {
  console.error("UI design-system validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI design-system validation passed.");
