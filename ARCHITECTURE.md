# ARCHITECTURE.md

本文件记录本项目当前架构。新增模块或调整结构时应同步更新。

## 1. 项目概览

- 框架：Next.js App Router
- 语言：TypeScript
- 样式：全局 CSS + 组件化样式
- 数据：Supabase Auth + Supabase Storage + Supabase 云数据库
- 部署：Vercel
- 运行形态：Web 优先，Mobile First，同时兼容桌面端

## 2. 目录结构

### 页面层

- `app/page.tsx`：首页仪表盘
- `app/login/page.tsx`：登录页
- `app/check-in/page.tsx`：一键入住
- `app/properties/page.tsx`：房源管理
- `app/properties/[id]/page.tsx`：房源详情
- `app/rooms/page.tsx`：房间管理
- `app/tenants/page.tsx`：租客管理
- `app/contracts/page.tsx`：合同入口或占位模块
- `app/rent-payments/page.tsx`：收款管理
- `app/expenses/page.tsx`：支出管理
- `app/deposits/page.tsx`：押金管理
- `app/reminders/page.tsx`：提醒中心
- `app/property-profits/page.tsx`：房源利润分析
- `app/property-profits/[id]/page.tsx`：单房源利润详情
- `app/analytics/page.tsx`：统计分析
- `app/partnership-settlement/page.tsx`：合伙结算
- `app/tasks/page.tsx`：待办管理
- `app/archive/page.tsx`：档案中心
- `app/settings/page.tsx`：设置中心
- `app/more/page.tsx`：更多菜单

### 组件层

- `components/app-layout.tsx`：全局布局、导航、登录态守卫
- `components/page-shell.tsx`：页面壳
- `components/metric-card.tsx`：首页指标卡
- `components/searchable-select.tsx`：可搜索下拉选择
- `components/ownership-field.tsx`：A/B/自定义归属输入
- `components/money-input.tsx`：金额输入
- `components/pagination-controls.tsx`：分页
- `components/status-badge.tsx`：状态标签
- `components/crud-page.tsx`：通用 CRUD 页面壳

### 业务库

- `lib/business-data.ts`：业务数据模型、加载、保存、归档、删除、默认数据
- `lib/profit.ts`：利润、统计、时间范围
- `lib/rent-coverage.ts`：租金覆盖期、欠费、提醒规则
- `lib/partner-settings.ts`：合伙人配置
- `lib/format.ts`：金额和文本格式
- `lib/supabase.ts`：Supabase 客户端
- `lib/storage-files.ts`：通用 Storage 文件逻辑
- `lib/rent-payment-files.ts`：收款附件
- `lib/expense-files.ts`：支出附件
- `lib/contract-files.ts`：合同附件

### 静态资源

- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icons/*`

### Supabase

- `supabase/migrations/*`：数据库迁移
- `supabase-schema.sql`：schema 汇总或初始化参考
- `supabase/run_in_sql_editor.sql`：手动执行参考 SQL

## 3. 数据流

1. 页面加载时通过 `lib/business-data.ts` 读取业务数据。
2. 如果已配置 Supabase，则从云端读取；否则回落到本地演示数据。
3. 页面编辑后通过业务数据层保存。
4. 附件通过 Storage 处理，元数据写回业务记录。
5. 首页、利润、提醒、房间状态均基于业务流水动态计算。

## 4. 页面关系

- 首页负责总览和快捷入口。
- 房源管理负责单房源基础信息和进入详情。
- 房间管理负责房间状态与基础资料。
- 租客管理负责租客、合同附件、收款历史、退租和归档。
- 收款管理负责登记房租、续交、赔偿与其他收入。
- 支出管理负责经营支出和附件。
- 押金管理负责押金记录与提醒。
- 提醒中心负责欠费、到期、押金、空置等系统提醒。
- 利润分析与统计分析负责经营分析，不作为录入主入口。

## 5. 关键依赖关系

- `rent-payments` 是收款流水主入口。
- `tenants`、`rooms`、`property-profits`、`reminders`、`page` 都依赖 `rent-payments` 的覆盖期和金额重新计算。
- `check-in` 会同时创建或更新房源、房间、租客、收款和附件关系。
- `settings` 负责导出、备份和合伙人比例配置。

## 6. 更新原则

- 新增页面先确认是否已有现成模块可复用。
- 新增业务规则要同步写入 `BUSINESS_RULES.md`。
- 结构变化要同步写入本文件。
- 修改完成后要更新 `CHANGELOG.md`。
