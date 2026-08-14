# UI Component Map

## UI implementation ownership

本文件是项目的 UI 实现定位地图，不是视觉规范或变更日志。

使用顺序：先阅读 `UI_DESIGN_SYSTEM.md` 了解视觉契约，再阅读本文件定位已有组件、semantic class、CSS owner 和允许修改范围。UI 修改应优先修改已有 owner，不得通过全局覆盖或平行组件重新实现。

## Global UI Roots

### Verified responsive status

- `BUG-01 = FIXED_AND_IPHONE_VERIFIED`; the check-in deposit selector keeps the shared `SearchableSelect` / `DropdownListbox` path and the local advanced-options overflow owner.
- `SHELL-REVIEW-01 = ACCEPTED_STRUCTURAL_TRANSITION`; the 1100px-to-1101px rail/sidebar change is a deliberate Shell transition with no reported usability regression.

### Shared responsive primitive map

- `--ui-space-*` owns the shared spacing scale; form rows/columns consume the existing form spacing aliases.
- `--ui-grid-gap` is the shared spacing owner for the generic `.grid` primitive. Business-specific grids retain their own layout ownership and may consume shared spacing without inheriting generic columns.
- `--ui-bottom-nav-clearance`, `--ui-mobile-nav-structural-height` and `--ui-mobile-nav-content-gap` remain the dedicated App Shell clearance owners.
- Page padding, card padding, modal padding, fixed-overlay offsets and business slot contracts remain separate unless their semantic ownership is identical and covered by a contract test.

| 页面/能力 | 实现 owner | Semantic class / selector | 责任 | 修改边界 |
|---|---|---|---|---|
| 全局视觉规范 | `UI_DESIGN_SYSTEM.md` | 规范章节与 shared tokens | 定义视觉、间距、触控和响应式契约 | 修改跨页面规则前必须更新并验证 |
| 全局 CSS | `app/globals.css` | `:root`、shared semantic selectors | 执行全局 token 和已有组件样式 | 不用全局 selector 修复单页问题 |
| shared primitives | `components/ui.tsx` | `SectionCard`、`DetailCard`、`CompactDetail*`、buttons | 提供共享 UI 原语 | 不为单页复制 primitive |
| 房源范围选择 | `components/property-multi-select.tsx`, `lib/property-scope.ts` | `PropertyMultiSelect`, `property-scope` | 统一房源查询范围 | 禁止页面建立平行房源范围选择器 |
| 下拉/选择 | `components/searchable-select.tsx`, `components/dropdown-listbox.tsx`, `components/tap-select.tsx` | shared listbox/select classes | 统一手势、滚动和选择行为 | 禁止页面自己实现 dropdown/listbox |

## Tenant List Root

| 层级 | Owner |
|---|---|
| 页面/组件 | `app/tenants/page.tsx` → tenant list rendering |
| 列表容器 | `.tenant-compact-list` |
| 三行纵向容器 | `.tenant-list-row-stack` |
| 身份行 | `.tenant-list-identity-row` |
| 租金信息行 | `.tenant-list-rent-row` |
| 状态行 | `.tenant-status-row` |
| 房间短展示 | `.tenant-list-room` |

职责：使用固定三行 Tenant List Row Contract 展示租客名、房源、房间、租金信息和状态 badge；`.tenant-list-row-stack` 是唯一纵向父级，三个 row 必须是它的直接子元素。

移动端固定为：身份行、租金信息行、状态行。状态不得通过普通 flex-wrap 在三行之间随机流动；current、moved-out 和 archive 来源必须消费同一 renderer。

列表房间名是 presentation-only 规则：约 `10ch`、`min-width: 0`、单行 ellipsis。详情房间名使用 `.tenant-detail-room`，必须保留原值并允许自然换行，不能继承列表规则。

允许修改：列表 row 的限定布局和响应式宽度。禁止修改：租金/债务状态计算、共享 DebtCase、Reminder Engine。

Current Tenant 与 Moved-out Tenant 必须共享同一个 Tenant List Row Contract。生命周期只能改变状态内容，不能改变 row renderer、主行/第二行槽位、grid 结构或状态容器；不要为 moved-out 建立额外 wrapper 或专属 row CSS。

## Tenant Detail Root

页面 owner：`app/tenants/page.tsx` → `TenantDetail`。

根节点：`.record-detail-panel.tenant-detail-panel`。

```text
TenantDetail
├─ .tenant-detail-expiry-summary
├─ .tenant-detail-actions
├─ .tenant-core-detail-group
│  └─ .tenant-core-detail-grid
│     ├─ 房源 | 房间
│     ├─ 入住人数 | 每月缴费日
│     ├─ 月租标准 | 最近一次实收
│     ├─ 押金标准 | 已收押金
│     ├─ .tenant-coverage-field
│     ├─ .tenant-note-field
│     └─ .tenant-details-toggle
├─ .tenant-lifecycle-status-area
│  └─ .deposit-status-detail
├─ .tenant-performance-section
│  └─ .tenant-performance-summary
├─ .tenant-timeline-section
│  └─ .tenant-monthly-payment-panel
│     └─ .tenant-combined-chart-frame
├─ .payment-history-panel
│  └─ .payment-history-toggle / .payment-history-line
└─ .contract-attachments-panel
```

### Tenant Detail Density Ownership

- Current and moved-out tenants both render through the same `TenantDetail` component and `.record-detail-panel.tenant-detail-panel` shell. Moved-out status/date content may add rows inside `.tenant-lifecycle-status-area`, but must not introduce a second detail shell or a looser padding wrapper.

- 基础资料内部密度 owner：`.tenant-core-detail-group`、`.tenant-core-detail-grid`、`.compact-detail-row`。当前 core row gap 约为 `0.35em`，`compact-detail-row` 的 `padding-block` 为 `0`。基础资料过松时先检查这里，不要修改全局 compact token。
- Tenant Detail direct-child section rhythm owner：`.record-detail-panel.tenant-detail-panel`。它负责 action、基础资料、押金、付款摘要、图表和历史记录之间的 section gap；它不负责 core rows。
- 押金状态 owner：`.tenant-lifecycle-status-area`、`.deposit-status-detail`。嵌套押金块必须从这里处理，不能只写 `.tenant-detail-panel > .deposit-status-detail`。
- 付款摘要 owner：`.tenant-performance-section`、`.tenant-performance-summary`。负责标题、四项指标和内部密度，不负责付款计算。
- 趋势图 owner：`components/tenant-monthly-payment-panel.tsx`、`.tenant-timeline-section`、`.tenant-monthly-payment-panel`、`.tenant-combined-chart-frame`。负责年份选择、图例/说明和 chart frame，不修改业务计算。
- 原始收款记录 owner：`.payment-history-panel`、`.payment-history-toggle`、`.payment-history-line`。负责折叠入口与记录行密度。

允许修改：上述 owner 的展示布局、间距和响应式规则。禁止修改：RentPeriodState、DebtCase、Open Debt、Reminder Engine、收款、押金业务规则和租客真实数据。

## Tenant Debt Action Root

`lib/debt-case.ts` 的 `DebtCase` 只负责 debt domain fact；Tenant Detail 的 `.tenant-detail-actions` 只负责 action placement。

- 正数欠费：`续交房租` + `放弃追缴`。
- 有效 €0 欠费：仅 `放弃追缴`。
- 多期欠费：每个 action 仍绑定自己的 `paymentId`。
- 禁止重新建立独立 Debt Card / DebtActionPanel 大卡片。

## Compact Action Grid Root

| Owner | Semantic class | Scope |
|---|---|---|
| `app/globals.css` shared root | `.compact-action-grid` | Short, independent business actions on mobile; three equal columns with `minmax(0, 1fr)` and a minimum 44px touch target |
| Tenant Detail | `.compact-action-grid.tenant-detail-actions` | Current and moved-out tenant actions; buttons flow naturally without spacer items |
| Task cards | `.compact-action-grid.task-actions` | Short task actions such as complete, edit and delete |
| Expense/rent-payment detail | `.compact-action-grid.expense-detail-actions` | Short record actions such as edit, void and permanent delete |
| Property detail | `.compact-action-grid.property-management-actions` | Short property actions such as edit, archive/restore and permanent delete |

This root does not own `modal-actions`, confirmation/cancel footers, form submission actions,
`PropertyMultiSelect` confirmation, long CTAs, or payment-specific two-action rows such as
`.tenant-debt-action-buttons` and `.reminder-rent-actions`. Those groups retain their own
semantic layout because two-column or single-column presentation is part of their meaning.

The shared compact root uses a narrow mobile column gap and compact button internals while
preserving the 44px touch target. Tenant Detail and other short-action owners must not add a
page-local gap or nowrap/overflow variant.

## Reminder UI Root

`Reminder Engine` 是提醒业务真源；shared Reminder Display Model / row 是展示真源。首页和 `/reminders` 必须消费同一 collection，不得页面级重新计算租金或欠费状态。

## Property Scope Root

`components/property-multi-select.tsx` 的 `PropertyMultiSelect` 与 `lib/property-scope.ts` 的 `property-scope` 是跨房源查询范围的唯一 owner。列表、统计、利润和结算页面不得建立平行的房源范围选择器。

## Modal / Dropdown Root

`Modal Layer Manager` 负责 modal backdrop/document scroll；`DropdownListbox`、`TapSelect`、`SearchableSelect` 各自负责下拉列表手势与滚动。Modal body scroll 不得由页面另行锁定或创建平行 manager。

### App Shell / Modal responsive ownership

- `app/layout.tsx` owns the viewport metadata (`device-width`, `initialScale: 1`, `viewportFit: cover`) and mounts the global providers.
- `components/app-layout.tsx` owns the `.app-shell` DOM: `.sidebar`, `.main`, `.topbar` and `.mobile-nav`.
- `app/globals.css` is the sole CSS owner for those shell selectors and the existing `980px` shell switch. `--ui-bottom-nav-clearance` remains the main-content clearance owner and is intentionally outside the 2.2 scope.
- `components/modal-layer-manager.tsx` owns document scroll locking and `scrollY` restoration. Pages and modal components must not add a second body-lock lifecycle.
- `app/globals.css` owns the shared `.modal-backdrop` and `.modal-card` base, dynamic viewport, safe-area and internal-scroll contract. Mobile overrides remain in the same CSS owner; a later precision block must not recreate a parallel modal base.

### Mobile main clearance ownership

- `.mobile-nav` remains owned by `components/app-layout.tsx` (DOM) and `app/globals.css` (layout). Its structural height is derived from the current 1px borders, 8px vertical padding and 48px navigation-link minimum height: `66px`.
- `--ui-mobile-nav-structural-height` and `--ui-mobile-nav-content-gap` are the responsive clearance inputs. `--ui-bottom-nav-clearance` is the single `.main` bottom-navigation avoidance contract: structural height + 18px content breathing room + `env(safe-area-inset-bottom)`.
- The `max-width: 980px` `.main` rule is the only mobile-shell consumer. The `max-width: 640px` block must not create a second bottom-clearance owner.
- Page-specific padding and fixed overlay offsets are separate ownership areas; they must not be folded into or duplicated as main bottom-navigation clearance.
- Bottom-spacing ownership is explicit: `.main` owns `MAIN_NAVIGATION_CLEARANCE`; `.data-center-page` and `.settlement-snapshot-page` own only normal `PAGE_VISUAL_SPACING`; `.mobile-nav` owns `NAV_INTERNAL_SAFE_AREA`; `.ui-toast` and `.attachment-upload-progress` own `FIXED_OVERLAY_OFFSET`; Modal surfaces own `MODAL_SAFE_AREA`.
- App Shell pages must not add page-level `safe-area-inset-bottom` or navigation-sized padding as a substitute for `.main` clearance. Fixed overlays may derive their mobile offset from the shared nav structural-height fact, but must keep their own visual gap semantics.
- `PropertyMultiSelect` owns only its bounded sheet internals (`.property-multi-select-backdrop`, `.property-multi-select-modal`); it does not own document scroll locking.

## High-risk layout ownership - 2.6

- `.table-wrap` is the shared table scroll owner. It is bounded by `min-width: 0` and `max-width: 100%`; the table may retain its business `min-width: 720px` and only the wrapper may scroll horizontally. The page and body must not become the table scroll surface.
- `.tenant-svg-chart-frame` owns chart framing and clipping; `.tenant-svg-scroll` is the sole SVG timeline scroll owner and is bounded by `width: 100%`, `min-width: 0` and `max-width: 100%`. The intentional SVG minimum drawing width remains a chart contract, not a page-width contract.
- Rent/expense, room, reminder, attachment and settlement rows retain their existing renderers and business field order. Their Medium contracts own shrink/ellipsis at the row root; fixed values remain only where they express touch targets, status/action minimums or semantic minimum content.
- `html, body { overflow-x: clip; }` is only a final guard. A business root must not rely on it to conceal overflow; table and chart wrappers own their own bounded scrolling.

## Ownership Change Rule

只有 ownership 发生变化时才需要同步更新本地图；普通数值调整不记录历史细节。若没有现有 owner，先说明缺口，再建立最小 shared root；不得以 duplicate selector 规避定位问题。
## Tenant List Identity and Vacant Room Reminder Display Contract

- `.tenant-list-identity-row` is the sole mobile identity-row owner. Its columns are `3fr / 4fr / 3fr` (30% / 40% / 30%), using the shared 14px body typography and child-level CSS ellipsis. The list room value is bounded by this grid; it does not receive a second fixed `10ch` cap. Current, moved-out and archived list rows share this rule; Tenant Detail remains the full-value wrapping owner.
- `lib/reminder-display.ts` is the sole vacant-room presentation model owner. A vacant reminder resolves `roomId` to `room.name` as the first-line identity, `propertyId` to `property.name` as the second line, and renders the `空置` badge beside the room name.
- `components/reminder-row.tsx` is the shared vacant-room row renderer consumed by both `components/homepage-reminder-row.tsx` and `app/reminders/page.tsx`. Neither surface may reconstruct room/property identity independently.

## Tenant Status Five-Slot Ownership

- `lib/tenant-status-slots.ts` owns the presentation-only `getTenantStatusSlots()` mapping for the Tenant List third row.
- `.tenant-status-row` owns one responsive five-track grid in this fixed order: lifecycle, current debt, historical debt, payment performance, deposit status.
- Empty slots return `null` and retain their grid track without rendering text, border, background or placeholder. Current, moved-out and archived tenants use the same mapping and renderer; no auto-pack, flex-wrap or fixed-pixel columns are allowed.

## Tenant List Rent Row Ownership

- The second row is owned by `.tenant-list-rent-row` in `app/tenants/page.tsx` and uses the shared `tenantRentRowLabel()` / `tenantRentRowTone()` presentation adapters from `lib/tenant-debt-display.ts`.
- Its responsive semantic slots are received amount, coverage/due status and coverage date, using proportional `31fr / 25fr / 44fr` tracks with no fixed pixel column widths.
- Current, moved-out and archived tenants use the same rent-row renderer; coverage facts and threshold levels remain owned by RentPeriodState/TenantDebtDisplay.

## App Shell Three-Mode Ownership

- `app/layout.tsx` owns viewport metadata; `components/app-layout.tsx` owns the shared navigation data, permission filtering and active-route behavior for every shell mode.
- Phone Shell: `@media (max-width: 640px)` uses `.mobile-nav` and `--ui-bottom-nav-clearance`; `.sidebar` and `.compact-rail` are hidden.
- Medium Shell: `@media (min-width: 641px) and (max-width: 1100px)` uses the 72px `.compact-rail`; `.mobile-nav` and `.sidebar` are hidden. The rail is presentation-only and consumes the same `navGroups` and `canOpenModule()` ownership as the full sidebar.
- Desktop Shell: `@media (min-width: 1101px)` uses the existing 260px `.sidebar`; `.compact-rail` and `.mobile-nav` are hidden. Desktop navigation content, permissions, destinations and active state remain unchanged.
- `app/globals.css` is the sole layout owner for `.app-shell`, `.sidebar`, `.compact-rail`, `.main` and `.mobile-nav`. No page may add a second shell breakpoint or device-specific navigation rule.
- The Medium Shell changes only the outer shell. Tenant List identity/rent/five-slot contracts, Tenant Detail, Reminder, Modal, table and chart ownership remain page/component-specific and are not reinterpreted here.

## Medium Business Layout Ownership — 2.4c First Batch

- `app/globals.css` owns the scoped `641px–1100px` Medium contracts for `.rent-finance-line`, `.expense-finance-line`, `.room-finance-line`, `.room-current-tenant`, shared reminder rows, attachment inventory/file rows, partner management rows and settlement summary rows/cards.
- Finance rows use proportional/shrinkable text tracks; amounts and status remain intact, while date/partner/description and long names receive explicit `min-width: 0` plus ellipsis where the field is single-line.

- Room rows preserve room/property/current-tenant ownership and use shrinkable names; status, rent and coverage remain separate fields. No room occupancy or payment logic is changed.
- Reminder, attachment, partner and settlement roots keep their existing renderers and actions. Only Medium width allocation, shrink and overflow ownership is changed; no reminder engine, storage, settlement formula or business data source is changed.
- Phone (`<=640px`) and Desktop (`>=1101px`) rules remain owned by their existing roots. BUG-01 (check-in deposit selector clipping) and SHELL-REVIEW-01 (Medium/Desktop handoff) are explicitly outside this batch.

## Medium Business Layout Ownership - 2.4c Second Batch

- `app/globals.css` owns the second-batch Medium content-capacity rules for Dashboard metrics/panels, Property Detail metric panels and Data Center module grids.
- These roots use proportional `auto-fit`/`minmax(0, ...)` tracks between 641px and 1100px so the 640/641 and 980/981 transitions do not restore a fixed desktop column count prematurely.
- Shared `mobile-record-*`, property-detail and data-center text owners keep `min-width: 0` and may wrap long descriptive values without changing business field order.
- Tasks, Tenant Detail, shared form grids and intentional table/chart scroll roots were audited and require no second-batch layout change. Their existing owners remain authoritative.
- Phone, Desktop, Tenant List, Reminder Engine, Modal, Shell, data and business contracts remain frozen. BUG-01 and SHELL-REVIEW-01 remain outside scope.

### BUG-01: check-in deposit selector ownership

`app/check-in/page.tsx` uses the shared `SearchableSelect` for 收款状态、付款方式和押金状态; all three consume `DropdownListbox` for the floating option layer. The check-in advanced-options field is the local overflow owner: its mobile `.collapsible-attachments` wrapper must remain `overflow: visible` so the shared dropdown is not clipped by the following optional-attachments section. This is presentation-only; deposit values, enums, persistence and save behavior remain unchanged.
