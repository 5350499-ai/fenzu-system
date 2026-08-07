# UI Design System V1

状态：基础规范已建立，逐页面迁移尚未开始。

本规范保留现有分租管理系统的深色/浅色视觉方向，目标是减少未来新增页面的临时字号、颜色、圆角和间距决定。现有业务页面暂不批量迁移；迁移必须逐页验证，不改变业务逻辑。

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
- 正文输入字号不低于 14px，避免 iPhone Safari 因过小文字触发非必要放大。
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
- Filter controls use an auto-fit grid on larger screens and a single orderly column on narrow mobile screens. Height is unified; width remains content-dependent.
- Room cards use the same information grid at every breakpoint: room first, property second, status and amounts aligned, with secondary unpaid/expiry information retained without absolute positioning.
- Modal overlays lock the page behind them. The modal surface owns vertical scrolling, uses dynamic viewport and safe-area insets, and keeps the header/close action reachable on mobile Safari.
- This shared foundation is the effective baseline for new pages. Existing page-specific legacy rules remain only for compatibility and should not introduce new control dimensions.
