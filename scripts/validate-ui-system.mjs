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
const remindersPage = readFileSync(resolve(root, "app/reminders/page.tsx"), "utf8");
const propertyMultiSelect = readFileSync(resolve(root, "components/property-multi-select.tsx"), "utf8");
const propertyScope = readFileSync(resolve(root, "lib/property-scope.ts"), "utf8");
const tenantDelete = readFileSync(resolve(root, "lib/tenant-delete.ts"), "utf8");
const tenantArchive = readFileSync(resolve(root, "lib/tenant-archive.ts"), "utf8");
const reminderNavigation = readFileSync(resolve(root, "lib/reminder-navigation.ts"), "utf8");
const reminderEngine = readFileSync(resolve(root, "lib/reminder-engine.ts"), "utf8");
const rentCoverage = readFileSync(resolve(root, "lib/rent-coverage.ts"), "utf8");
const rentPeriodState = readFileSync(resolve(root, "lib/rent-period-state.ts"), "utf8");
const tenantRentStateDisplay = readFileSync(resolve(root, "lib/tenant-rent-state-display.ts"), "utf8");
const tenantDeepLink = readFileSync(resolve(root, "lib/tenant-deep-link.ts"), "utf8");
const reminderEntityConsistency = readFileSync(resolve(root, "lib/reminder-entity-consistency.ts"), "utf8");
const tenantDeleteApi = readFileSync(resolve(root, "app/api/business-data/route.ts"), "utf8");
const dashboardRuntime = dashboardPage.split("/* Retired page-local reminder builders")[0];
const remindersRuntime = remindersPage.split("/* Retired page-local reminder builder")[0];

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
  [guide, "Profit Result Row Contract", "UI guide must define the shared profit result-row contract"],
  [guide, "Native Date Field Box Contract", "UI guide must define the outer native date Field Box contract"],
  [guide, "Section / Card Stack Gap Contract", "UI guide must define the card stack gap"],
  [guide, "Tenant room-sort contract", "UI guide must define natural tenant room sorting"],
  [guide, "Shared tenant contact contract", "UI guide must define the existing tenant contact mapping"],
  [claude, "UI_DESIGN_SYSTEM.md", "CLAUDE.md must require the UI guide"],
  [architecture, "UI_DESIGN_SYSTEM.md", "ARCHITECTURE.md must identify the UI guide"],
  [guide, "Tenant history and archive viewing contract", "UI guide must define tenant history protection and archive modes"],
  [claude, "Tenant history is immutable", "CLAUDE.md must define tenant history protection"],
  [architecture, "Tenant deletion is fail-closed", "ARCHITECTURE.md must define server-side tenant deletion checks"],
  [css, "--ui-check-control-size: 18px", "CSS must define the checkbox/radio token"],
  [css, "--ui-control-height-mobile: 44px", "CSS must define the mobile control token"],
  [css, "--ui-editable-font-size-mobile: 16px", "CSS must define the mobile editable font token"],
  [css, "--ui-section-stack-gap", "CSS must define the shared section stack token"],
  [css, ".form-grid-row", "CSS must define the shared semantic form-row primitive"],
  [css, "grid-template-columns: minmax(0, 1.7fr)", "Profit result rows must give the period column readable space"],
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
  ,[propertyMultiSelect, "PropertyMultiSelect", "Property scope filters must use the shared PropertyMultiSelect"],
  [propertyScope, "isAllPropertyScope", "Property scope semantics must be shared"],
  [tenantsPage, "selectedPropertyIds", "Tenant list must use the shared property scope state"],
  [reminderNavigation, "tenantReminderHref", "Tenant reminders must use a stable tenant navigation helper"],
  [reminderEngine, "buildEffectiveReminders", "A shared Reminder Engine must build the effective reminder collection"],
  [reminderEngine, "getRentPeriodState", "Reminder debt candidates must consume RentPeriodState"],
  [reminderEngine, "navigationTarget", "Reminder items must include a stable navigation target"],
  [reminderEngine, "availableActions", "Reminder items must expose shared action metadata"],
  [reminderEngine, "propertyId: payment.propertyId", "Payment-backed reminders must preserve the payment property ID"],
  [reminderEngine, "roomId: payment.roomId", "Payment-backed reminders must preserve the payment room ID"],
  [tenantsPage, "getTenantRentDisplay", "Tenant rent labels must use the shared RentPeriodState presentation adapter"],
  [tenantRentStateDisplay, "getLatestRentPeriodState", "Tenant rent display must consume the shared RentPeriodState"],
  [tenantRentStateDisplay, "getOpenRentDebtPeriodStates", "Tenant rent display must disclose historical open debt from the shared domain selector"],
  [rentPeriodState, "getOpenRentDebtPeriodStates", "Rent period domain must expose payment-specific open debt periods"],
  [rentPeriodState, "Europe/Madrid", "Rent period today must use the shared business-local calendar"],
  [reminderEngine, "getOpenRentDebtPeriodStates", "Reminder debt candidates must consume open debt periods rather than only latest coverage"],
  [tenantsPage, "planTenantDeepLink", "Tenant deep links must use the shared visibility plan"],
  [tenantsPage, "scrollIntoView", "Tenant deep links must scroll the mounted target into view"],
  [tenantDeepLink, "tenantDeepLinkScrollTargetId", "Tenant deep-link helper must expose a stable scroll target"],
  [css, ".tenant-deep-link-target", "Tenant deep-link target must reserve a shared safe-area scroll margin"],
  [reminderEntityConsistency, "validateReminderEntityConsistency", "Reminder entity consistency must have a reusable invariant checker"],
  [reminderEntityConsistency, "payment-tenant-mismatch", "Reminder consistency must verify payment-to-tenant identity"],
  [reminderEntityConsistency, "payment-room-mismatch", "Reminder consistency must verify payment-owned room context"],
  [reminderEngine, '${type}:${payment.id}', "Debt reminder IDs must be payment-specific and stable"],
  [dashboardRuntime, "buildEffectiveReminders", "Dashboard runtime must consume the shared Reminder Engine"],
  [remindersRuntime, "buildEffectiveReminders", "Reminder center runtime must consume the shared Reminder Engine"],
  [guide, "Archive vs Debt Contract", "UI guide must define archive versus debt presentation behavior"],
  [rentPeriodState, "hasOpenDebtFollowUp", "Rent period state must expose a debt follow-up candidate without final reminder presentation"],
  [rentCoverage, 'state.lifecycle === "archived"', "Archived tenant debt reminders must be muted by the compatibility policy bridge"],
  [rentCoverage, "fixedTenantRentDebtReminderStage", "Tenant debt reminder staging must remain in the compatibility bridge pending Reminder Engine"],
  [rentCoverage, "hasUnresolvedTenantRentDebt", "Tenant debt status must distinguish unresolved debt from archive state"],
  [rentCoverage, "shouldShowTenantRentReminder", "Tenant reminder visibility must respect explicit waiver actions"],
  [remindersPage, "refreshBusinessData", "Reminder center must refresh authoritative business sources"],
  [remindersPage, "dataStatus !== \"ready\"", "Reminder center must gate first render until authoritative state is ready"],
  [remindersPage, "DASHBOARD_CACHE_KEY", "Reminder mutation must identify the dashboard derived cache"],
  [remindersPage, "cacheManager.invalidate", "Reminder mutation must invalidate derived reminder cache"],
  [readFileSync(resolve(root, "app/expenses/page.tsx"), "utf8"), "PropertyMultiSelect", "Expense list property scope must use the shared selector"],
  [readFileSync(resolve(root, "app/rent-payments/page.tsx"), "utf8"), "PropertyMultiSelect", "Rent payment list property scope must use the shared selector"],
  [readFileSync(resolve(root, "app/partner-settlements/page.tsx"), "utf8"), "PropertyMultiSelect", "Settlement history property scope must use the shared selector"]
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
  [/-webkit-appearance\s*:\s*none/i, "Date fields must neutralize intrinsic native appearance at the shared contract"],
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

const formRowRule = css.match(/\.form-grid-row\s*\{([\s\S]*?)\}/i)?.[1] || "";
const formRowChildRule = css.match(/\.form-grid-row\s*>\s*\*\s*\{([\s\S]*?)\}/i)?.[1] || "";
for (const [source, message] of [
  [formRowRule, "Semantic form rows must define logical inline sizing"],
  [formRowChildRule, "Semantic form row children must stretch their grid cell"]
]) {
  if (!/inline-size\s*:\s*100%/i.test(source) || !/min-inline-size\s*:\s*0/i.test(source) || !/justify-self\s*:\s*stretch/i.test(source)) failures.push(message);
}

const profitResultRule = css.match(/\.unified-monthly-row\s*\{([\s\S]*?)\}/i)?.[1] || "";
if (!/1\.7fr[\s\S]*?\.9fr[\s\S]*?\.9fr/i.test(profitResultRule)) failures.push("Monthly and yearly profit results must use the shared readable three-column contract");
if (!/\.unified-monthly-occupancy[\s\S]*?white-space\s*:\s*normal/i.test(css)) failures.push("Profit result occupancy details must be allowed to wrap instead of being truncated");

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

const rentPaymentCoverageStart = rentPayments.indexOf('data-layout-row="coverage"');
const rentPaymentCoverageRow = rentPaymentCoverageStart >= 0 ? rentPayments.slice(rentPaymentCoverageStart, rentPaymentCoverageStart + 1500) : "";
if (!rentPaymentCoverageRow.includes("租金覆盖开始日期") || !rentPaymentCoverageRow.includes("租金覆盖结束日期")) {
  failures.push("Rent payment and rent-collection coverage dates must remain in one explicit semantic row");
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

if (!tenantDelete.includes("tenantHasBusinessData") || !tenantDelete.includes("tenantDeleteBusinessDataMessage")) {
  failures.push("Tenant permanent deletion must use the shared business-history guard");
}
if (!tenantDeleteApi.includes("assertTenantHasNoBusinessData") || !tenantDeleteApi.includes("dryRun")) {
  failures.push("Tenant permanent deletion must have a server-side preflight and final recheck");
}
if (!tenantArchive.includes("filterTenantsByArchiveMode") || !tenantsPage.includes("filterTenantsByArchiveMode")) {
  failures.push("Tenant normal/archive modes must share one archive filter primitive");
}
const tenantDeleteFunction = tenantsPage.match(/async function permanentlyDeleteTenant\([\s\S]*?\n  \}/)?.[0] || "";
if (tenantDeleteFunction.includes("saveBusinessData(rentPaymentKey") || tenantDeleteFunction.includes("saveBusinessData(depositKey") || tenantDeleteFunction.includes("saveBusinessData(contractKey")) {
  failures.push("Tenant permanent deletion must not delete historical child records");
}
if (!tenantsPage.includes("filterTenantsByArchiveMode(tenants, showArchived)")) {
  failures.push("Tenant normal/archive modes must use mutually exclusive data sources");
}
if (!tenantsPage.includes("setShowArchived(isArchivedTenantStatus(requestedTenant?.status || \"\"))")) {
  if (!tenantsPage.includes("archiveModeForTenantDeepLink(repairedTenants, requestedTenantId)")) {
    failures.push("Tenant deep links must enter archive mode for archived tenants");
  }
}
if (/href:\s*`\/rooms\?roomId=\$\{encodeURIComponent\(tenant\.roomId\)\}`/.test(dashboardPage)) {
  failures.push("Dashboard tenant reminders must not navigate by room ID");
}

if (failures.length) {
  console.error("UI design-system validation failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI design-system validation passed.");
