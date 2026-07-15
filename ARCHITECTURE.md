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

## 7. 账号与权限基础（阶段一）

### 数据表

- `user_profiles`：Auth 用户对应的应用账号资料，保存 `owner/custom` 类型、启停状态、房源授权模式和全设备会话撤销时间。
- `user_permissions`：模块与查看、新增、编辑、归档、永久删除权限矩阵。
- `user_sensitive_permissions`：租客敏感字段、附件、导出、利润、结算、日志、账号和设置权限。
- `user_property_access`：`selected` 模式下按真实 `property_id` 保存房源授权。
- `app_sessions`：按 Supabase JWT `session_id` 保存应用会话状态，不保存 Refresh Token。
- `audit_logs`：追加式业务和安全日志基础表；阶段二才接入服务端日志写入。

### 私有权限函数

- `app_private.is_active_account()`：检查当前 Auth 用户资料是否启用。
- `app_private.is_owner()`：检查当前用户是否为启用的 owner。
- `app_private.current_workspace_owner_id()`：返回当前账号所属 owner。
- `app_private.has_module_permission()`：检查模块操作权限。
- `app_private.has_sensitive_permission()`：检查敏感权限。
- `app_private.can_access_property()`：按 `property_id` 检查房源范围。
- `app_private.is_app_session_valid()`：检查账号状态、全设备撤销时间和 `session_id` 撤销状态；阶段一尚未接入原业务策略。

函数位于非公开 `app_private` schema，使用固定空 `search_path`，并只向 `authenticated` 授予必要执行权限。

### RLS 兼容方式

- 原业务表的 `auth.uid() = user_id` 策略保持不变。
- 阶段一为 12 张业务及附件元数据表新增 `stage1_owner_compatibility` permissive 策略。
- 兼容策略只允许数据库中启用的 owner 访问 owner 名下数据。
- Storage 原有私有 bucket 和 owner 路径策略完全不变。
- 新旧策略同时存在会产生临时的多 permissive 策略性能提示，这是阶段验收期间避免管理员锁定的有意安排；安全替换旧策略必须在后续阶段另行迁移。

### 迁移与回滚

- 主迁移：`supabase/migrations/20260713154204_accounts_permissions_stage1.sql`
- owner 名称编码修复：`supabase/migrations/20260713155640_accounts_permissions_stage1_owner_name_fix.sql`
- 外键索引补充：`supabase/migrations/20260713160156_accounts_permissions_stage1_indexes.sql`
- 迁移前基线：`supabase/backups/20260713_accounts_permissions_stage1_preflight.md`
- 非破坏性回滚：`supabase/rollbacks/20260713154204_accounts_permissions_stage1_rollback.sql`

回滚只移除新增兼容策略，不删除新表、owner 资料或任何业务数据，原 RLS 会立即继续生效。

## 8. 账号与权限（阶段二）

### 新增接口与页面

- app/accounts/page.tsx：仅 owner 使用的账号列表、新建或编辑权限、房源范围和安全操作页面。
- app/audit-logs/page.tsx：仅 owner 查询的追加式操作和安全日志页面。
- app/api/auth/login：使用自定义登录名映射至内部 Supabase Auth 邮箱，成功后写入 app_sessions。
- app/api/auth/logout：撤销当前应用会话并清除浏览器 Supabase 会话。
- app/api/accounts/*：owner 专用的账号、权限、房源范围、密码、启停与强制退出 Route Handlers。
- app/api/audit-logs：owner 专用日志查询。

### 服务端鉴权流

1. 浏览器携带当前 Supabase Access Token 调用 Route Handler。
2. 服务端用 anon 客户端的 auth.getUser(token) 验证 Token。
3. 服务端通过 Service Role 读取 user_profiles、检查启停状态、owner 身份和精确 app_sessions.session_id。
4. 账号管理接口只接受 owner；浏览器传入的 owner、actor、权限提升字段不被信任。
5. 服务端以已验证上下文写入 audit_logs，并过滤密码、Token、Cookie、密钥等敏感字段。

### 自定义登录映射

- account_auth_identities.normalized_username 是唯一、不区分大小写的登录标识。
- owner 保持真实邮箱 5350499@qq.com；custom 账号生成 account-UUID@accounts.fenzu.invalid 作为仅服务器端可见的 Supabase Auth 邮箱。
- 内部邮箱不出现在任何浏览器接口、账号页面或日志中。

### 阶段二 RLS 会话门槛

- 既有业务策略和阶段一兼容策略仍保留，但均叠加 app_private.is_app_session_valid()。
- active custom 账号必须匹配 app_sessions 中未撤销的 JWT session_id；owner 暂兼容既有会话。
- disabled 状态会直接阻断 RLS；custom 的旧会话也会被精确 session 撤销阻断。
- 阶段三才将模块权限和 property_id 过滤全面接入每一条业务页面、关联查询、Storage 签名链接与统计。

## 9. 全业务权限接入（阶段三）

### 页面与权限上下文

- `components/account-access.tsx` 在应用根布局加载 `/api/accounts/me`，向菜单和业务页面提供模块权限、敏感权限、owner workspace ID 与授权房源 ID。
- `components/app-layout.tsx` 统一隐藏未授权桌面与手机菜单，并阻止直接打开无查看权限页面；利润、合伙结算和日志额外检查敏感权限。
- 各业务页面只显示获准的新增、编辑、归档、永久删除和附件操作；房源详情页的子标签和操作按钮按对应模块独立判断。

### 业务读写数据流

1. 读取使用浏览器当前 Supabase 会话，由数据库 RLS 按 active session、workspace owner、模块查看权限和 `property_id` 过滤。
2. 租客读取使用 `public.get_authorized_tenants()`，在数据库内按敏感权限返回完整或脱敏电话、微信和备注。
3. `lib/business-data.ts` 只提交相对最近一次远端快照发生变化的记录，避免只读或仅新增账号重复更新未修改数据。
4. 写入统一发送到 `app/api/business-data/route.ts`；Route Handler 验证真实 Token、app session、模块操作、workspace owner 和房源范围，再用当前用户 JWT 执行 upsert/delete，RLS 进行第二次校验。
5. 业务数据继续保存固定 owner 的 `user_id`，custom 账号通过 `current_workspace_owner_id()` 访问同一数据空间。

### RLS、附件和审计

- `202607150001_account_permissions_stage3.sql` 为 properties、rooms、tenants、contracts、rent_payments、expenses、deposits、tasks、tenant_notes 增加 custom 模块操作和房源范围策略，不删除阶段一、二兼容策略。
- 更新权限触发器区分普通编辑与归档；业务审计触发器记录新增、修改、归档和删除，并从日志快照移除租客电话、微信和证件类字段。
- 合同、收款和支出附件元数据及三个私有 Storage bucket 同时检查附件模块、敏感附件权限、有效 app session、owner 路径和关联房源。
- `app/api/files/signed-url/route.ts` 使用当前用户 JWT生成短时签名链接；查看和下载分别校验权限并写入真实操作人日志。
- `app/api/audit-logs/route.ts` 校验日志模块与敏感日志权限，并只返回当前 workspace 内账号产生的日志。日志表继续禁止更新和删除。
- `202607150002_stage3_audit_sensitive_filter.sql` 在不改变业务表的前提下替换审计函数，额外从租客与跟进记录快照中移除备注、沟通内容和认证字段；owner 保留完整安全日志查询，自定义账号仍限制在当前 workspace。
- `202607150003_stage3_tenant_rpc_grants.sql` 显式撤销租客脱敏 RPC 的匿名执行资格，仅允许通过有效 Supabase 登录会话调用。

### 迁移与兼容

- 阶段三迁移仅增加函数、策略和触发器，不新增或修改业务表字段，不改写任何业务记录。
- 迁移应用前后核对基线均为房源1、房间4、租客3、合同1、收款3、支出22、支出附件2；押金、合同附件和收款附件记录数量保持原值。
- owner 继续由数据库 `user_profiles.account_type=owner` 识别并保留全部权限；Service Role 仍只用于账号管理和服务端日志等管理操作。

## 10. 认证状态体验

- `AccountAccessProvider` 位于根 `app/layout.tsx`，首次打开、硬刷新恢复会话或刚完成登录时加载一次账号资料与权限快照。
- 站内路由切换直接复用同一快照，不在各业务页或 `AppLayout` 重复调用 `getSession`、`/api/accounts/me` 或注册 Session 监听。
- 浏览器重新聚焦及 Supabase Token 事件仅执行静默校验；网络暂时失败时保持已授权页面，账号停用、会话撤销或权限失效时显示可返回或退出重登的恢复页。
