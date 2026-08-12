# UI Design System V1

状态：公共 Token、表单控件、Modal、筛选/分页、状态标签与移动端规则已进入执行阶段；历史页面按公共规则持续收敛。

本规范保留现有分租管理系统的深色/浅色视觉方向，是项目唯一 UI 规范来源。公共 Token 和组件负责执行规范；页面不得另建一套控件尺寸。历史页面迁移必须逐页验证，不改变业务逻辑。

## 1. Design principles

- 保持清晰、高信息密度、移动端优先。
- Responsive ≠ Smaller Typography：窄屏优先调整布局、间距和次要信息，不自动缩小普通文字。
- 先保护房源、房间、租客、日期、金额、状态和核心操作。
- 视觉语义优先于页面局部装饰。
- 新页面优先使用 Token 和共享组件，不新增局部视觉体系。

## 2. Font family

正式字体栈：

```css
ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
"Segoe UI", "Microsoft YaHei", sans-serif
```

当前没有额外加载 Inter 网络字体，因此该声明依赖设备可用字体并自动 fallback。不得在单个页面新增其它 `font-family`，也不得为统一视觉引入网络字体依赖。

## 3. Typography

| Token | 值 | 用途 |
|---|---:|---|
| `--ui-font-size-display` | 34px | Dashboard 主指标/大型展示数字 |
| `--ui-font-size-page-title` | 24px | 页面主标题 |
| `--ui-font-size-section-title` | 18px | Section/Panel 标题 |
| `--ui-font-size-card-title` | 16px | 卡片标题 |
| `--ui-font-size-body` | 14px | 普通业务正文、列表主信息 |
| `--ui-font-size-secondary` | 13px | 日期、说明、辅助信息 |
| `--ui-font-size-caption` | 12px | 表头、标签、低强调辅助信息 |
| `--ui-font-size-button` | 14px | 按钮文字 |
| `--ui-font-size-navigation` | 13px | 导航文字 |
| `--ui-font-size-amount` | 20px | 普通金额/指标 |
| `--ui-font-size-amount-large` | 28px | 页面核心金额/指标 |

正式字重仅使用：

| Token | 值 | 用途 |
|---|---:|---|
| `--ui-font-weight-regular` | 400 | 正文 |
| `--ui-font-weight-medium` | 500 | 次要强调 |
| `--ui-font-weight-semibold` | 600 | 控件和重要辅助信息 |
| `--ui-font-weight-bold` | 700 | 标题、按钮、状态 |
| `--ui-font-weight-extrabold` | 800 | 页面标题、核心指标 |

普通业务文字原则上不低于 12px。不得使用 8–11px 缩小普通内容；图表轴标签等特殊数据可保留更小字号，但必须是明确的图表例外。

行高 Token：

- `--ui-line-height-tight`: 1.2
- `--ui-line-height-normal`: 1.45
- `--ui-line-height-relaxed`: 1.55

金额必须使用数字等宽特征（`font-variant-numeric: tabular-nums`），并按右侧对齐规则显示。

## 4. Color system

### Light theme

| Token | HEX | 用途 |
|---|---|---|
| `--ui-color-bg` | `#f6f7f9` | 页面背景 |
| `--ui-color-surface` | `#ffffff` | 主卡片/控件背景 |
| `--ui-color-surface-soft` | `#f9fafb` | 子卡片/列表背景 |
| `--ui-color-surface-hover` | `#f3f4f6` | hover/selected 弱背景 |
| `--ui-color-border` | `#e5e7eb` | 边框 |
| `--ui-color-text-primary` | `#111827` | 主文字 |
| `--ui-color-text-secondary` | `#4b5563` | 次级文字 |
| `--ui-color-text-muted` | `#6b7280` | 辅助文字 |
| `--ui-color-primary` | `#111827` | 主按钮/主操作 |
| `--ui-color-primary-text` | `#ffffff` | 主按钮文字 |
| `--ui-color-info` | `#2563eb` | 信息、链接、选中 |
| `--ui-color-success` | `#16a34a` | 成功、收入、盈利 |
| `--ui-color-warning` | `#f59e0b` | 警告、待处理 |
| `--ui-color-danger` | `#dc2626` | 删除、失败、不可逆操作 |
| `--ui-color-focus` | `#2563eb` | 键盘/控件焦点 |

### Dark theme

| Token | HEX | 用途 |
|---|---|---|
| `--ui-color-bg` | `#0f172a` | 页面背景 |
| `--ui-color-surface` | `#111827` | 主卡片/控件背景 |
| `--ui-color-surface-soft` | `#1f2937` | 子卡片/列表背景 |
| `--ui-color-surface-hover` | `#273449` | hover/selected 弱背景 |
| `--ui-color-border` | `#374151` | 边框 |
| `--ui-color-text-primary` | `#f9fafb` | 主文字 |
| `--ui-color-text-secondary` | `#d1d5db` | 次级文字 |
| `--ui-color-text-muted` | `#9ca3af` | 辅助文字 |
| `--ui-color-primary` | `#f9fafb` | 主按钮/主操作 |
| `--ui-color-primary-text` | `#111827` | 主按钮文字 |
| `--ui-color-info` | `#60a5fa` | 信息、链接、选中 |
| `--ui-color-success` | `#22c55e` | 成功、收入、盈利 |
| `--ui-color-warning` | `#fbbf24` | 警告、待处理 |
| `--ui-color-danger` | `#f87171` | 删除、失败、不可逆操作 |
| `--ui-color-focus` | `#60a5fa` | 键盘/控件焦点 |

透明背景 Token（如需要）必须由对应语义色派生，不得另写近似红/绿/蓝/黄。Danger 只有 `--ui-color-danger` 一个正式基准；删除文字、按钮、确认操作和危险提示均从它派生。

## 5. Spacing

正式间距只有：

| Token | 值 |
|---|---:|
| `--ui-space-1` | 4px |
| `--ui-space-2` | 8px |
| `--ui-space-3` | 12px |
| `--ui-space-4` | 16px |
| `--ui-space-5` | 20px |
| `--ui-space-6` | 24px |
| `--ui-space-7` | 32px |

未来新增样式不得随意使用 7、9、11、13、15、18、22、26px 等 magic number。已有历史 CSS 暂不批量替换。

## 6. Radius

- `--ui-radius-sm`: 8px，小型控件。
- `--ui-radius-md`: 12px，Button、Input、子卡片。
- `--ui-radius-lg`: 16px，主要 Card/Panel/Detail Card。
- `--ui-radius-xl`: 20px，Modal 和特殊大型容器。
- `--ui-radius-pill`: 999px，Badge、Pill、圆形语义。

## 7. Button system

正式语义：Primary、Secondary、Ghost/Text、Danger、Icon Button。

- 默认高度：42px；独立可点击控件的有效点击区域目标：至少 44px。
- 字号：14px；字重：600–700；不得在窄屏自动缩小。
- 圆角：12px；水平 padding：14px；图标：18px；图标与文字间距：8px。
- 两个按钮放不下时改为纵向排列，不压缩文字。
- Danger 统一使用 `--ui-color-danger` 及其派生弱背景。
- Focus 必须有统一 focus ring；disabled 必须降低对比度并禁止交互。

## 8. Card system

### Main Card

主业务容器，16px radius，20px padding；移动端可使用 14px padding。

### Sub Card

嵌套信息块，12px radius，使用 `surface-soft`，不与主卡片争夺视觉焦点。

### Metric Card

突出一个统计值；label 次级，数字主要；金额右对齐并使用 tabular numbers。

### Detail Card

统一采用标题 → 说明 → 内容 → 操作结构。多个 Label/Value 优先使用左右或两列布局。

同一级 Card 必须保持相同的 border、radius、padding 和 gap；业务内容可以不同。

## 9. Form system

- Input、Select、Textarea、Date、Time、Number、Currency 使用统一控件风格。
- 默认控件高度：42px；移动端有效点击区域目标：至少 44px。
- 桌面正文输入字号不低于 14px；`≤640px` 的真实可编辑控件必须不低于 16px，避免 iPhone Safari 因过小文字触发自动放大。
- Label 使用 Secondary/Caption 语义，错误信息使用 Danger，helper 使用 Muted。
- Focus 使用 `--ui-color-focus`；disabled 必须清晰体现不可编辑。
- 金额输入允许合法的 0，不得用 falsy 判断代替空值判断。

## 10. Responsive rules

只使用少量布局断点，不为每个设备型号单独建立断点：

- `≤640px`：手机单列、操作区纵向排列、卡片收紧 padding，但不缩小普通文字。
- `641–980px`：平板/窄桌面，隐藏桌面侧栏，使用移动导航，必要时 1–2 列。
- `>980px`：桌面布局，侧栏可见，页面内容使用合理宽度，不无限拉伸。
- 设计验收宽度：320、360、375、390、430px，以及平板和桌面。

### 信息优先级

手机优先保护：房源、房间、租客、日期、金额、状态、核心操作。

### 溢出规则

- `single-line`：短金额、短日期、房间号、短状态、短按钮。
- `numeric-nowrap`：金额、关键数字和短日期。
- `action-nowrap`：查看、删除、确认等核心操作。
- `two-line`：重要但可能较长的租客姓名、卡片标题、房源描述。
- `wrap`：必须完整理解的业务说明。
- `ellipsis`：超长房源名、文件名、非关键标识；必须通过 title、详情或查看操作保留完整内容。

禁止使用 `transform: scale()` 或动态缩小字体解决普通文本溢出。空间不足时优先调整布局、减少非必要空白、换行或隐藏低优先级信息。

## 11. Navigation and touch targets

- 页面标题和描述优先使用统一 Page Header。
- 返回、查看、删除、Checkbox、Icon Button、底部导航和 Modal action 的有效点击区域目标为 44px。
- 底部导航必须使用 safe-area，并为页面内容预留空间。
- 导航 active、inactive、focus 状态必须使用统一语义色。

## 12. Rules for new pages

新页面必须：

1. 优先使用本文件中的 Token 和共享组件。
2. 不自行新增颜色、字号、圆角或 spacing magic number。
3. 明确每段文本采用 single-line、two-line、wrap 或 ellipsis。
4. 明确手机、平板、桌面的布局变化。
5. 保证核心业务信息和操作不被长文本挤掉。
6. 在 320–430px 宽度下检查横向溢出、底部导航和 Modal。

禁止：

- 页面自行声明另一套 `font-family`；
- 通过缩小字体解决窄屏；
- 为同一语义硬编码多套颜色；
- 随意新增 radius 或 spacing；
- 为视觉规范修改业务逻辑、数据结构或权限逻辑；
- 一次性批量迁移所有历史页面而不做逐页回归。

## 13. Migration policy

本阶段只建立 Token 和规范，不批量修改现有业务页面。旧变量和历史 CSS 保留，后续按页面逐步迁移。每次迁移必须单独验证功能、主题、窄屏布局和可访问操作。

## 14. Effective shared layout rules

- Standard single-line controls use the same 42px base height, 12px radius, 14px text size, shared border and shared horizontal padding. On mobile, the usable touch target is at least 44px.
- Native selects, searchable selects, money/date inputs and search controls must use the shared control rules; textarea remains the intentional multi-line exception.
- Detail grids are content-driven. They use two columns only when each column can preserve readable labels and values; at narrow widths they fall back to one column instead of creating single-character vertical labels.
- Detail labels keep a readable minimum width, values use the remaining width, money uses tabular numerals and nowrap where required, and long text wraps normally rather than using `break-all`.
- Filter controls use an auto-fit grid on larger screens and a single orderly column on narrow mobile screens. Height is unified; each control fills its assigned grid column and must not shrink to its text width.
- Room cards use the same information grid at every breakpoint: room first, property second, status and amounts aligned, with secondary unpaid/expiry information retained without absolute positioning.
- Modal overlays lock the page behind them. The modal surface owns vertical scrolling, uses dynamic viewport and safe-area insets, and keeps the header/close action reachable on mobile Safari.
- This shared foundation is the effective baseline for new pages. Existing page-specific legacy rules remain only for compatibility and should not introduce new control dimensions.

## 15. Compact density for display data

- Interactive controls keep the 42px visual height and 44px mobile touch target. Display rows are not controls and must not inherit that height.
- Use a compact detail group for related business data. A group owns one card, while its label/value rows use 8px vertical padding and separators instead of nested cards.
- Use content-driven grids: short fields may share a row, long property names and notes use the full row, and narrow screens fall back to one column before text becomes unreadable.
- List summaries should use one to three effective rows. Empty fields do not reserve a visual row.
- Dates, amounts and status badges remain intact with tabular numerals/nowrap where appropriate; long descriptions wrap or ellipsize according to their importance. Never reduce normal text size or scale content to create density.

## 16. Mandatory UI preflight

Before any frontend UI change, read this document and inspect the existing shared
component or token first. New pages and component changes must reuse the shared
tokens below. A different size, color, radius, spacing or responsive behavior is
allowed only for a documented business reason; add that exception here before
implementing it.

`UI_DESIGN_SYSTEM.md` is the sole UI specification. `UI_DESIGN_STANDARD.md` is a
historical compatibility pointer and must not receive new rules.

## 17. Effective mobile layout contract

### Page, safe area and navigation

- Page content uses `--ui-page-padding-inline` (20px) on larger screens and
  `--ui-page-padding-inline-mobile` (14px) on phones.
- Cards use `--ui-card-padding` (20px) or `--ui-card-padding-mobile` (14px).
- Mobile content reserves `--ui-bottom-nav-clearance`, including
  `env(safe-area-inset-bottom)`, so the fixed bottom navigation never covers a
  final field or action.
- Use dynamic viewport units (`100dvh` with `100svh` fallback) for full-screen
  surfaces. Do not use a document-relative position for a modal.

### Typography and semantic colors

- Page title / section title / card title: 24px / 18px / 16px.
- Body / secondary / caption / button text: 14px / 13px / 12px / 14px.
- Amounts use the existing amount tokens and tabular numerals.
- Use only the existing semantic color tokens: background, surface,
  surface-soft, border, primary text, secondary text, muted text, primary,
  info, success, warning, danger, disabled and focus. Income and positive
  profit use success; expense keeps normal text; negative profit uses danger.

### Spacing, radius and cards

- Spacing scale: 4, 8, 12, 16, 20, 24 and 32px (`--ui-space-1` through
  `--ui-space-7`).
- Label-to-control gap: `--ui-field-gap` (8px). Standard grid gap:
  `--ui-grid-gap` (16px). Use the same scale for section and action gaps.
- Radius scale: 8px small, 12px control, 16px card, 20px modal, and 999px pill.
- A main card uses the shared surface, border and card padding. Do not create a
  visually separate card system for a single page.

## 18. Form-control contract

- Text, number, date, select, combobox, search/select and textarea must be
  allowed to shrink: `width:100%`, `max-width:100%`, `min-width:0` and
  `box-sizing:border-box`.
- Standard single-line visual height is `--ui-control-height` (42px); the
  mobile touch target is `--ui-control-height-mobile` (44px). Mobile editable
  controls use at least 16px text to avoid iPhone Safari focus zoom.
- Standard controls share 12px radius, 12px horizontal padding, shared border,
  surface background, focus treatment and disabled treatment. Textareas are the
  intentional multi-line exception and use the same visual language.
- Checkbox and radio are never ordinary full-width inputs. Their native visual
  box is 18px; the associated label supplies the 44px touch target.
- Grid and flex children containing controls must have `min-width:0`. Native
  selects must not be allowed to keep an intrinsic width that breaks a grid.

## 19. Modal and drawer contract

- A modal backdrop is viewport-bound (`position:fixed; inset:0`) and sits above
  the bottom navigation. It must not be positioned by page scroll or a parent
  transform.
- Opening a modal locks the background while preserving its scroll position.
  The modal surface or a named internal list owns vertical scrolling.
- Ordinary pages are vertically scrollable whenever their content exceeds the
  viewport. A scroll lock is modal-scoped only: the single global modal manager
  applies it while at least one dialog exists, then restores both the previous
  scroll position and all inline document styles when the final dialog closes.
- The modal maximum height uses `--ui-modal-max-height` and safe-area insets.
  Header and footer actions remain reachable; long middle content scrolls with
  `overflow-y:auto`, `overscroll-behavior:contain`, `touch-action:pan-y` and
  `-webkit-overflow-scrolling:touch`.
- Do not set `touch-action:none` on an interactive scroll surface. Closing a
  modal restores the prior page scroll position.

## 20. Responsive and verification rules

- Verify ordinary phone layouts at 320, 360, 375, 390, 393, 412 and 430px;
  tablet and desktop must remain usable.
- Use `minmax(0, 1fr)`, sensible grid fallbacks and wrapping/ellipsis rules
  before reducing type size. Do not use `transform:scale()` to solve overflow.
- Long critical detail text wraps; compact selector/list labels may use a
  single-line ellipsis only when the full value remains available in detail.
- For an interaction that depends on iOS Safari touch or the virtual viewport,
  static browser checks are not a substitute for real-device acceptance.

## 21. Enforceable component contracts

### Field anatomy

每个字段只允许采用以下结构之一：

1. field 容器内使用 label + control；
2. label.field 内使用 span + control；
3. 公共 SearchableSelect / OwnershipField 等完整字段组件。

Label 到控件固定使用 `--form-label-gap`（8px）。字段行列间距使用
`--form-row-gap` / `--form-column-gap`（桌面 16px，手机 12px），同一表单不得用页面级 margin 改写节奏。
Grid/Flex 字段和控件直接父级都必须允许 min-width:0。

### Closed select appearance

- Native select、SearchableSelect、Combobox 和自定义 Tap Select 关闭时只能看到一个主控件边框。
- 图标、输入文字、placeholder、清除按钮和下拉箭头都属于主控件内部，不得再获得第二层边框、背景或圆角。
- 下拉 panel 可以拥有独立边框；panel 只在展开状态出现。
- SearchableSelect 必须使用 combobox 外壳承载边框，内部 input 必须透明、无边框、无额外 padding。
- 自定义选择触发器统一使用共享控件高度、12px radius、12px 横向 padding 和全宽收缩规则。

### Filter and pagination

- 搜索、筛选 select、日期筛选和分页 page-size select 均使用标准单行控件规格。
- 同一区域的 filter/select 不得因文字短而缩成窄框；filter grid 内必须占满自身列。
- 分页 page-size select 可以按内容宽度显示，但高度、字体、边框、radius 和 padding 必须与筛选控件一致。

### Badge and status list

- Badge 标准视觉高度为 28px、12px 字号、10px 水平 padding、pill radius。
- 同一移动端列表中的类型 Badge 必须使用稳定列宽；主体信息起点和尾部状态列不得随 Badge 文案长度漂移。
- 长主体名称在紧凑列表中允许单行省略，但完整值必须可在详情中查看。

### Buttons

- 默认 Button 为 42px，手机触摸目标至少 44px；Compact Button 仅用于低层级行内操作，不得代替表单主操作。
- 同一 action row 中相同层级按钮必须同高。确认/取消使用同一尺寸，只用颜色和层级区分。

### Exceptions

- Checkbox/Radio 本体固定 18px；44px 点击区域由 label 提供。
- Textarea 是多行控件，不强制 42/44px 高度。
- 数据展示行、Badge、图表控件和 Compact 行内操作不是普通表单控件，不应被强制为全宽。
- 任何新例外必须先在本节记录业务原因，再写页面样式。

## 22. UI change checklist

每次新增或修改 UI 前必须按顺序执行：

1. 阅读本文件；
2. 查找同语义公共组件与 Token；
3. 复用公共组件，禁止复制页面级 Select/Modal/Form primitive；
4. 在 320、360、375、390、393、412、430px 检查收缩、滚动和底部安全区；
5. 检查 light/dark、键盘 focus、disabled、error；
6. 检查普通页面滚动、Modal 背景锁定和关闭后的滚动恢复；
7. 确认没有新增 magic size、嵌套边框、checkbox/radio 放大或原生 select intrinsic width；
8. 运行项目 UI 规范校验、TypeScript、Build 和 diff-check。

## 23. Single-line Control Contract

- A standard editable single-line control uses the shared control tokens only:
  `--ui-form-control-height` (42px), `--ui-control-height-mobile` (44px),
  `--ui-radius-md` (12px), `--ui-control-padding-inline` (12px), the shared
  border, surface, text and focus colors.
- Every single-line control must be `width:100%`, `min-width:0`,
  `max-width:100%` and `box-sizing:border-box`. Its grid or flex parent must
  also allow shrinking with `min-width:0`.
- Native input/select, SearchableSelect, ownership select and a short custom
  select trigger must align to the same visual height. Textarea, file input,
  checkbox/radio and a documented multi-line trigger are explicit exceptions.
- Page CSS must not assign an intrinsic width (`auto`, `fit-content`,
  `min-content` or `max-content`) to a normal form control.

## 24. Composite Select Contract

- A composite select declares its outer border owner with
  `data-ui-control="composite-select"`. The outer element owns the only border,
  radius, background, height and focus treatment visible while closed.
- Its editable text element declares `data-ui-composite-input` and must remain
  borderless, transparent, unrounded and shadowless in normal, selected,
  empty, disabled, focus and WebKit autofill states.
- Broad selectors such as `.field input` must explicitly exclude
  `.ui-combobox-input`. New composite controls must not depend on source order
  to undo a broad field rule.
- Search/value text is a flexible `min-width:0` region. Search icon and clear
  button are fixed-size internal affordances and must not change the outer
  control height.
- A native ownership selector declares
  `data-ui-control="single-line-select"` and uses the same height, padding,
  width and focus tokens as ordinary native selects.
- Dropdown panels may own a separate border only while open. They are not part
  of the closed control border count.

## 25. Form Vertical Rhythm Contract

- 公共 Token：`--form-label-gap` 8px、`--form-row-gap` / `--form-column-gap`
  桌面 16px、手机 12px、`--form-section-gap` 20px、`--textarea-min-height` 96px。
- `Field` 负责 label → control；`FormGrid` 负责 field → field。页面不得用
  `:nth-child`、随机 margin 或局部 `!important` 调整普通字段间距。
- 两列字段使用 `minmax(0,1fr)` 等宽列。左右 label 从同一顶部开始，单行
  control 使用相同高度；业务上占整行的字段必须显式 full-span。
- Modal 表单和页面表单使用同一节奏与控件 Token，不建立 Modal 专用尺寸。

## 26. Mobile Dropdown Gesture Contract

- Gesture starts inside dropdown: dropdown owns vertical scrolling; background
  page/modal must not scroll simultaneously.
- Gesture starts outside dropdown: page/modal owns scrolling. Dropdown 可随锚点移动或按
  outside interaction 关闭，但不得接管页面手势。
- Option is selected only by a completed tap/click gesture, not by
  `pointerdown`, `touchstart` or the beginning of a scroll gesture。
- 触点移动达到 8px 即进入 scroll 状态；该 gesture 不得选择起始 option、不得关闭
  dropdown，并必须抑制浏览器随后合成的 click。
- 键盘 Enter/Space 和桌面 click 继续选择当前 option；Escape 和 outside tap 按标准关闭。

## 27. Nested Scroll Ownership and Scroll Chaining Contract

- 下拉列表是具名独立滚动容器：有限 `max-height`、`overflow-y:auto`、
  `touch-action:pan-y`、`overscroll-behavior-y:contain` 和 iOS momentum scrolling。
- 列表中间的 vertical gesture 只滚列表；在顶部继续向下拖、底部继续向上拖时，
  必须阻断 overscroll chaining，不能把滚动交给 Modal 或页面。
- 不得为了锁背景而设置 dropdown `touch-action:none`，也不得让 Modal background lock
  同时锁死列表。5、10、20、50 项均必须从首项滚到末项再返回。
- Modal + Dropdown 嵌套时，唯一 `ModalLayerManager` 只负责 document 背景；dropdown
  负责自己的列表手势。组件不得另写 body/html scroll lock。

## 28. iOS Editable-Control Font Size Contract

- `≤640px` 时，所有会获得编辑焦点的 input（text/search/tel/email/password/number/date
  等）、textarea、combobox 内部 input 和 native select 的最终字号至少 16px。
- 该规则只防止 iPhone Safari focus zoom，不改变普通正文层级；禁止使用
  `user-scalable=no`、`maximum-scale=1` 或其它关闭无障碍缩放的 viewport hack。
- WebKit autofill 必须保持 composite inner input 透明、无第二边框和无独立圆角。

## 29. Shared primitive rule

- `SearchableSelect` 与 `TapSelect` 必须复用公共 `DropdownListbox` 手势层。
  新增 Combobox/Listbox/Dropdown 必须复用该 primitive 或先扩展本规范和公共测试。
- 页面 CSS 禁止直接覆盖 `.ui-dropdown-listbox`、`.ui-combobox-input` 或 option 的内部
  手势/边框结构；业务页面只可控制字段跨度和业务内容。
- `npm run validate:ui` 与交互测试是合并前强制门槛；grep 不能替代 tap-vs-swipe、
  nested scroll 和 duplicate-submit 的真实状态机测试。

## 30. Date Field Contract

- `date`、`datetime-local`、`month` 与 `time` 都是标准单行控件：桌面使用
  `--ui-form-control-height`（42px），移动端使用
  `--ui-control-height-mobile`（44px）。它们与同一 FormRow 的普通输入框
  共享 padding、radius、border、字号和 label rhythm。
- Date Field 使用 `padding-block:0`、共享 line-height 与 `tabular-nums`，避免
  WebKit 内部日期值因纵向 padding 或 intrinsic metrics 偏上/偏下。不要在页面
  CSS 单独设置 date control 的 height、padding 或 font-size。
- 在 `≤640px` 时，所有真实可获得编辑焦点的 `input`、`textarea`、`select` 以及
  composite control 内部 input 的最终 computed `font-size` 必须不小于 16px。
  该规则必须落在实际 HTML element 上，而非仅由外层容器继承；focus 和 WebKit
  autofill 状态也不得降低字号。
- 此契约只能由共享全局 CSS 实现。页面不得使用 `user-scalable=no`、
  `maximum-scale=1` 或其它禁用浏览器无障碍缩放的方式规避 iPhone Safari zoom。

### WebKit vertical alignment

- The shared Date Field Contract is the sole owner of `date`, `datetime-local`,
  `month` and `time` control geometry. It sets `padding-block:0`, the shared
  control height and a date-content line height equal to that height.
- Safari renders the visible value inside a WebKit date edit tree. The shared
  rules for `::-webkit-date-and-time-value`, `::-webkit-datetime-edit` and
  `::-webkit-datetime-edit-fields-wrapper` must use that same content height
  and zero vertical padding. Page CSS must not override date `appearance`,
  height, line-height or vertical padding.
- Static checks establish the shared contract; the final visual centering of a
  native WebKit date value still requires real iPhone Safari acceptance.

## 31. Shared business preset contract

- Repeated business choices have one source of truth in `lib/`. Payment method
  entry presets use `PAYMENT_METHOD_PRESETS`: `现金`, `转账`, `其他`.
- Historical stored values remain readable and editable. A form may append its
  current stored value to the displayed options only when that value is not in
  the shared entry presets; it must never rewrite historical data merely to
  match a new preset list.
- Tenant contact labels are presentation-only. The shared display label for the
  existing contact field is `WhatsApp / 其他`; its database key is unchanged.

## 32. Form Grid / Field Box Contract

- A semantic form row uses `minmax(0, 1fr)` columns. Every field wrapper and
  its visible single-line control uses `width:100%`, `min-width:0`,
  `max-width:100%` and `box-sizing:border-box`.
- Native `date`, `datetime-local`, `month` and `time` inputs are full-width
  Field Box controls. Their WebKit intrinsic value width must never decide a
  grid column width or make a date box narrower than an adjacent text/select
  control.
- Pages must not add local width, height, padding or `justify-self` overrides
  to ordinary Field Box controls. Checkbox/radio and multiline textarea remain
  explicit, documented exceptions.

## 33. Section / Card Stack Gap Contract

- Direct sibling page sections use `--ui-section-stack-gap` (8px) between
  cards/panels. Borders must never touch or overlap because a page omitted a
  local margin.
- The stack gap belongs to the shared layout layer. Pages must not recreate it
  with random per-section `margin-bottom` values.

## 34. Tenant room-sort contract

- The tenant `房间` sort uses the room's stable `room_number`, falling back to
  its name only when no room number exists. It uses numeric natural collation
  (`1, 2, 3, 10`; `A2, A10`) in both directions.
- Records without a room assignment remain last in both ascending and
  descending room sort. Status is only a room-sort tie-breaker.

## 35. Shared tenant contact contract

- The existing `tenants.wechat` field is the single persistence mapping for
  the presentation label `WhatsApp / 其他`, including one-click check-in and
  tenant create/edit. No parallel contact column may be introduced for this
  label.
- A plain optional field does not need a repeated `（可选）` suffix. Retain the
  suffix only when optionality changes the business meaning, such as an
  intentionally unlinked room or tenant relationship.

## 36. Profit analysis information order

- Property profit analysis is ordered as: statistics scope (date + property),
  time controls, profit overview, property results, then monthly results.
  Time controls and result output must be structurally separate so a user can
  choose scope before seeing the result cards.

## 37. Tenant list time-sort contract

- The tenant list `时间` sort uses the immutable `tenants.created_at` mapping
  (`BusinessTenant.createdAt`), never `updated_at`, move-in date, coverage date
  or client-side time.
- `时间 ↑` means oldest record first and `时间 ↓` means newest record first.
  Status remains a display/filter concern, not a substitute time-sort control.

## 38. Semantic Form Row and Date Field Box Contract

- When fields have a business-defined left/right relationship, pages must use
  the shared `.form-grid-row` primitive instead of relying on CSS Grid auto
  placement. A new optional field must never change a later field's column.
- A two-column semantic row uses `repeat(2, minmax(0, 1fr))`; each row and
  each child use `width:100%`, `min-width:0` and `max-width:100%`. A documented
  single-field row uses `.form-grid-row--single`.
- Native `date`, `datetime-local`, `month` and `time` controls are complete
  Field Boxes: `width` and `inline-size` are `100%`, min sizes are `0`, max
  sizes are `100%`, `box-sizing` is `border-box`, and `justify-self` is
  `stretch`. WebKit intrinsic date sizing must never shorten a control inside
  a Form Grid cell.
- Page CSS must not add date-width workarounds or rely on auto-flow ordering
  for semantically paired business fields. Reuse the shared row and Date Field
  contracts so the rule applies globally.

## 40. Native Date Field Box Contract

- The outer date Field Box and its Form Grid cell must share the same stretch
  contract as text, number and select controls. The shared rule owns both
  physical and logical width, including the wrapper/cell, not only the WebKit
  date-value pseudo-elements.
- Native date/time controls use the shared CSS box model and neutralized native
  appearance so Safari cannot paint a shorter intrinsic-width frame. The
  WebKit date edit tree remains governed by the existing vertical-centering
  rules; page CSS must not override it.

## 41. Profit Result Row Contract

- Monthly and yearly operating-result rows use the same responsive three-column
  primitive: the period/occupancy column receives the largest share, the
  income/expense column stays compact with labels and amounts aligned, and the
  net-profit/status column remains readable.
- The period heading and first metric share a common first-row baseline. The
  occupancy detail may wrap within its left column, but it must not be hidden
  or truncated to make room for amounts. This contract applies at 320px–430px
  mobile widths without global font shrinking or horizontal overflow.

## 39. Property-profit information order

- Property profit analysis always renders: statistics scope, time controls,
  monthly operating results, profit overview, then property results and any
  remaining detail sections. This is presentation order only; it must not
  change financial calculation or filtering semantics.

## 42. Property scope filter contract

- Any query, list, analytics, profit or settlement range filter across
  properties must use the shared `PropertyMultiSelect` component and the
  shared `lib/property-scope.ts` semantics.
- The default selection is every available property. A single selection and
  any multi-property combination are both valid; applying the selection must
  filter the data query, not only change the label.
- `全部房源` means the concrete set of all available property IDs. It is not a
  fake property ID and it must not be stored in business filter arrays.
- Clearing the draft selection is allowed while editing, but applying an
  empty range must be rejected with a clear user message and must not silently
  revert to all properties. Reopening the selector must show the applied set.
- A business record's own `property_id` attribution remains a single-value
  field. This contract applies only to cross-property query scope filters.
- Pages must not create another property range selector or a single-select
  replacement for a query scope.

## 43. Tenant history and archive viewing contract

- Historical tenant business data must never be removed as a side effect of deleting a tenant. Permanent deletion is allowed only for a completely empty tenant shell; contracts, payments, deposits, settlements, attachments and other tenant-linked records make deletion ineligible.
- Tenant management has two mutually exclusive modes: normal mode shows only unarchived tenants, while archive mode shows only archived tenants. Search, the shared `PropertyMultiSelect`, and applicable sorting continue to operate inside the active mode and must not merge the two datasets.

## 44. Tenant reminder and archive contract

### Archive vs Debt Contract

- Archiving is a visibility/management state, not a financial or lease-settlement action. It must not change historical payments, debt, contracts, deposits, move-out history, profit, statistics or settlement records.
- Unresolved tenant debt remains a debt fact across current, moved-out and archived tenant states until an explicit supported business action settles it or waives collection. Daily reminder presentation is separate: archived tenants are muted; restored archived tenants and unarchived moved-out tenants with unresolved debt remain reminder candidates.
- Archive, restore archive and move-out must not change the debt amount, historical payment facts, waiver facts or collection state. A waiver closes only the payment-specific follow-up; it does not rewrite the historical payment or create financial entries.
- A tenant-subject reminder must navigate by stable `tenant_id` to the tenant detail, never by the tenant's mutable room assignment. This includes archived tenants; the tenant page must enter its archive mode for a deep link when necessary.
- A rent-debt reminder must place the tenant name in its primary visual line and the payment-owned property/room context in the supporting line, so users can distinguish historical tenants from a room's current occupant.

## 45. Rent Reminder Display Contract

### Lifecycle-aware details

- Shared rent reminder rows show `在租` or `已退租` lifecycle context and, for
  debt events, `当前欠租` or `历史欠费`. These are derived metadata, not financial
  mutations, and remain visible alongside the full coverage-end facts.
- Reminder deep links use the shared lifecycle plan: moved-out targets expand
  the retired group in normal mode; archived targets enter archive mode; target
  cards scroll below header/safe-area space only after mount.

- Dashboard cards and reminder-center rows must reuse the shared rent reminder
  formatter. They render identity (`tenant | property | room`) first, followed
  by a separate facts line containing the full `coverageEnd`, period status and
  amount where relevant.
- Coverage end is a primary operating fact. Rent reminder UI must wrap rather
  than truncate it with a single-line ellipsis; action buttons occupy their own
  row/space and never compete with coverage facts.

## 46. Debt Row and Debt Focus Contract

- Actionable rent debt surfaces reuse `DebtRow` and `DebtDisplayModel`.
- Line one is identity plus lifecycle/debt-kind badges; line two contains full coverage end, overdue days and amount. Critical facts may wrap but may not ellipsize.

## 47. Tenant Information Display Contract

- Tenant-subject reminder rows reuse the current tenant-list typography and density tokens for tenant names, property/room context, supporting facts and lifecycle/debt badges.
- Pages may choose compact or full row structure, but must not define a separate tenant-name font, supporting-text scale, badge height or badge padding for the same semantic content.
- Positive debt rows expose the existing collection action with the tenant-facing label `续交房租` plus `放弃追缴`; a valid zero-amount debt exposes only `放弃追缴`. Both actions continue to use the existing business entry points.
- A positive debt exposes collection and waiver; a valid €0 debt exposes waiver only. A debt focus link opens only the compact Debt Action Panel.
