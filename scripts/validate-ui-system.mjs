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
const expensePage = readFileSync(resolve(root, "app/expenses/page.tsx"), "utf8");
const expenseTypePresets = readFileSync(resolve(root, "lib/expense-type-presets.ts"), "utf8");
const paymentMethodPresets = readFileSync(resolve(root, "lib/payment-method-presets.ts"), "utf8");
const tenantsPage = readFileSync(resolve(root, "app/tenants/page.tsx"), "utf8");
const tenantSorting = readFileSync(resolve(root, "lib/tenant-sorting.ts"), "utf8");
const businessData = readFileSync(resolve(root, "lib/business-data.ts"), "utf8");
const checkInPage = readFileSync(resolve(root, "app/check-in/page.tsx"), "utf8");
const propertyProfitsPage = readFileSync(resolve(root, "app/property-profits/page.tsx"), "utf8");
const cacheManager = readFileSync(resolve(root, "lib/cache/cache-manager.ts"), "utf8");
const dashboardPage = readFileSync(resolve(root, "app/page.tsx"), "utf8");

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
  [guide, "Date Field Contract", "UI guide must define the shared date-field contract"],
  [guide, "WebKit vertical alignment", "UI guide must define WebKit date-value alignment"],
  [guide, "Shared business preset contract", "UI guide must define shared business presets"],
  [guide, "Tenant list time-sort contract", "UI guide must define tenant record-time sorting"],
  [guide, "Form Grid / Field Box Contract", "UI guide must define the Field Box contract"],
  [guide, "Semantic Form Row and Date Field Box Contract", "UI guide must define semantic form rows and full-width date boxes"],
  [guide, "Property-profit information order", "UI guide must define the property-profit information order"],
  [guide, "Section / Card Stack Gap Contract", "UI guide must define the card stack gap"],
  [guide, "Tenant room-sort contract", "UI guide must define natural tenant room sorting"],
  [guide, "Shared tenant contact contract", "UI guide must define the existing tenant contact mapping"],
  [claude, "UI_DESIGN_SYSTEM.md", "CLAUDE.md must require the UI guide"],
  [architecture, "UI_DESIGN_SYSTEM.md", "ARCHITECTURE.md must identify the UI guide"],
  [css, "--ui-check-control-size: 18px", "CSS must define the checkbox/radio token"],
  [css, "--ui-control-height-mobile: 44px", "CSS must define the mobile control token"],
  [css, "--ui-editable-font-size-mobile: 16px", "CSS must define the mobile editable font token"],
  [css, "--ui-section-stack-gap", "CSS must define the shared section stack token"],
  [css, ".form-grid-row", "CSS must define the shared semantic form-row primitive"],
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
  [searchableSelect, "DropdownListbox", "SearchableSelect must reuse the shared listbox primitive"],
  [expensePage, "EXPENSE_TYPE_PRESETS", "Expense entry must use the shared type presets"],
  [expenseTypePresets, '["房租", "电费", "其他"]', "Expense type presets must remain compact and shared"],
  [paymentMethodPresets, '["现金", "转账", "其他"]', "Payment method presets must remain compact and shared"],
  [paymentMethodPresets, "paymentMethodOptions", "Historical payment methods must have a non-destructive display compatibility helper"],
  [tenantsPage, 'label="时间"', "Tenant list must expose the record-time sort"],
  [tenantSorting, '"time"', "Tenant sorting must support the record-time mode"],
  [tenantSorting, "compareRoomLabels", "Tenant room sorting must use natural labels"],
  [businessData, 'createdAt: row.created_at', "Tenant mappings must expose the immutable database creation time"],
  [cacheManager, "db.onversionchange", "IndexedDB cache must invalidate a connection on versionchange"],
  [cacheManager, "database connection is closing", "IndexedDB cache must recognize closing connection errors"],
  [cacheManager, "attempt < 2", "IndexedDB cache self-heal must have a single retry limit"]
];

const failures = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, , message]) => message);

if (/touch-action\s*:\s*none/i.test(css)) {
  failures.push("Global CSS must not disable touch scrolling with touch-action:none");
}

if (/\.field\s+input\[type="date"\][\s\S]{0,500}?(?:appearance\s*:\s*none|line-height\s*:\s*normal)/i.test(css)) {
  failures.push("Date fields must not retain legacy field-level appearance or line-height overrides");
}

if (!/::-webkit-datetime-edit[\s\S]*?--ui-date-content-height/is.test(css) || !/::-webkit-datetime-edit-fields-wrapper[\s\S]*?--ui-date-content-height/is.test(css)) {
  failures.push("Date fields must align Safari's WebKit edit tree through the shared date-content height");
}

if (/\.field\s+input:not\(\[type=["']checkbox["']\]\):not\(\[type=["']radio["']\]\)(?!:not\(\.ui-combobox-input\))/i.test(css)) {
  failures.push("Broad .field input rules must explicitly exclude .ui-combobox-input");
}
if (/indexedDB\.deleteDatabase\s*\(/.test(cacheManager)) {
  failures.push("IndexedDB lifecycle repair must not delete the cache database");
}
if (/dataError\s*\|\|\s*["'].*Failed to execute.*IDBDatabase/is.test(dashboardPage)) {
  failures.push("Dashboard must not expose raw IndexedDB implementation errors to users");
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
if (!/input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)[\s\S]*?font-size\s*:\s*var\(--ui-editable-font-size-mobile,\s*16px\)\s*!important/is.test(mobileRules)) {
  failures.push("The actual mobile editable elements must enforce the 16px font token");
}

const dateFieldRule = css.match(/input\[type="date"\],[\s\S]*?input\[type="time"\]\s*\{([\s\S]*?)\}/i)?.[1] || "";
for (const [pattern, message] of [
  [/height\s*:\s*var\(--ui-form-control-height/i, "Date fields must use the shared desktop control height"],
  [/width\s*:\s*100%/i, "Date fields must fill their Field Box width"],
  [/inline-size\s*:\s*100%/i, "Date fields must fill the inline size of their Field Box"],
  [/min-width\s*:\s*0/i, "Date fields must be allowed to shrink inside a grid cell"],
  [/min-inline-size\s*:\s*0/i, "Date fields must be allowed to shrink inline inside a grid cell"],
  [/max-inline-size\s*:\s*100%/i, "Date fields must not exceed their Field Box inline size"],
  [/justify-self\s*:\s*stretch/i, "Date fields must stretch across their Field Box"],
  [/padding-block\s*:\s*0/i, "Date fields must not use vertical padding"],
  [/font-variant-numeric\s*:\s*tabular-nums/i, "Date fields must use stable tabular numerals"]
]) {
  if (!pattern.test(dateFieldRule)) failures.push(message);
}

const finalMobileContract = css.slice(css.lastIndexOf("/* The focused HTML element itself"));
const mobileDateFieldRule = finalMobileContract.match(/input\[type="date"\],[\s\S]*?input\[type="time"\]\s*\{([\s\S]*?)\}/i)?.[1] || "";
if (!/height\s*:\s*var\(--ui-control-height-mobile/i.test(mobileDateFieldRule)) {
  failures.push("Date fields must use the shared mobile control height");
}

if (!/--ui-date-content-height\s*:\s*var\(--ui-control-height-mobile/i.test(mobileDateFieldRule)) {
  failures.push("Mobile date fields must give Safari's value tree the shared 44px content height");
}

if (!/\.main\s*>\s*:is\(section\.card, section\.panel, \.ui-section-card\)\s*\+\s*:is\(section\.card, section\.panel, \.ui-section-card\)/.test(css)) {
  failures.push("Direct page card stacks must use the shared section gap contract");
}

if (!checkInPage.includes("wechat: form.wechat") || !checkInPage.includes('label="WhatsApp / 其他"')) {
  failures.push("One-click check-in must reuse the existing tenant contact field and label");
}

const checkInCoverageRow = checkInPage.match(/data-layout-row="coverage"([\s\S]*?)data-layout-row="payment-attribution"/)?.[1] || "";
if (!/租金覆盖开始日期[\s\S]*?租金覆盖结束日期/.test(checkInCoverageRow)) {
  failures.push("One-click check-in coverage dates must remain in one explicit left-to-right row");
}

const checkInIncomeRow = checkInPage.match(/data-layout-row="income"([\s\S]*?)data-layout-row="coverage"/)?.[1] || "";
if (!/本次合计收入[\s\S]*?每月缴费日/.test(checkInIncomeRow)) {
  failures.push("One-click check-in total income must remain the left field of its semantic row");
}

if (/每月缴费日（可选）/.test(checkInPage) || /每月缴费日（可选）/.test(tenantsPage)) {
  failures.push("Ordinary payment-day labels must not repeat a redundant optional suffix");
}

const profitScopeIndex = propertyProfitsPage.indexOf("profit-filter-panel");
const profitTimeControlsIndex = propertyProfitsPage.indexOf("profit-time-controls-panel");
const profitOverviewIndex = propertyProfitsPage.indexOf("profit-overview-card");
const profitPropertiesIndex = propertyProfitsPage.indexOf("property-profit-panel");
const profitMonthlyResultsIndex = propertyProfitsPage.indexOf("global-monthly-profit-panel");
if (!(profitScopeIndex < profitTimeControlsIndex && profitTimeControlsIndex < profitMonthlyResultsIndex && profitMonthlyResultsIndex < profitOverviewIndex && profitOverviewIndex < profitPropertiesIndex)) {
  failures.push("Property profits must keep the scope-to-time-to-results information order");
}

for (const { path, source } of uiSources) {
  if (path.endsWith("app\\globals.css")) continue;
  if (/input\s*\[type\s*=\s*["'](?:date|datetime-local|month|time)["']\][\s\S]{0,240}?(?:width|min-width|max-width|inline-size|justify-self)\s*:/i.test(source)) {
    failures.push(`Page/component CSS must not override shared Date Field Box sizing: ${path.replace(root, "")}`);
  }
}

for (const { path, source } of uiSources) {
  if (/<(?:input|textarea|select)[\s\S]{0,700}style=\{\{[^}]*fontSize\s*:\s*(?:1[0-5]|[0-9])(?:px)?/i.test(source)) {
    failures.push(`Editable controls must not use an inline font size below 16px: ${path.replace(root, "")}`);
  }
}

for (const { path, source } of uiSources) {
  if (/\bBizum\b/.test(source)) {
    failures.push(`Pages must not hard-code the retired Bizum payment preset: ${path.replace(root, "")}`);
  }
}

for (const page of ["app/check-in/page.tsx", "app/expenses/page.tsx", "app/rent-payments/page.tsx", "app/properties/[id]/page.tsx"]) {
  const source = readFileSync(resolve(root, page), "utf8");
  if (!source.includes("paymentMethodOptions")) failures.push(`Payment form must use shared payment presets: ${page}`);
}

if (/sortKey === "status"|toggleSort\("status"/.test(tenantsPage)) {
  failures.push("Tenant list must not expose status as the record sorting control");
}

if (failures.length) {
  console.error("UI design-system validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI design-system validation passed.");
