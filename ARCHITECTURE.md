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

## 6.1 UI Design Standard V1

项目级 UI 唯一规范为 `UI_DESIGN_SYSTEM.md`。本节仅保留架构摘要；任何前端 UI 任务在实现前必须先阅读并遵循该规范，并在完成后运行 `npm run validate:ui`。页面不得自行建立第二套 Form/Select/Modal 尺寸体系，也不得自行实现 `pointerdown/touchstart` 选项提交或 document scroll lock；所有自定义 Select/Combobox/Dropdown/Listbox 复用公共 `DropdownListbox` 手势与嵌套滚动契约。
日期/时间控件由全局 Date Field Contract 统一 WebKit 编辑树的高度、padding、垂直对齐和 Field Box 几何；重复业务预设由 `lib/` 的单一配置源提供，页面不得复制付款方式等选项数组。Form Grid / Field Box、Section / Card Stack、租客房间自然排序与既有联系方式映射由 `UI_DESIGN_SYSTEM.md` 定义，页面不得以局部 CSS 或重复数据模型替代。

全站业务页面遵循同一套产品级界面规范，新增页面不得另起一套卡片或金额样式。

- 详情信息使用“标题 / 副标题 / 内容 / 操作”的卡片层级，字段通过统一标签与内容间距呈现，避免把日期、比例和金额拼成一行长文字。
- 金额统一使用 `lib/format.ts` 的两位小数格式；收入使用绿色，支出保持默认文字色，盈利使用绿色，亏损使用红色；金额列右对齐并使用等宽数字。
- 公共交互组件集中在 `components/ui.tsx`，包括按钮、区块卡片、详情卡片、详情网格、金额值、状态标签、加载层和提示。
- 列表、详情和操作区使用统一圆角、边框、留白、按钮高度与状态颜色；移动端必须允许换行，不以横向滚动或极度缩小字体解决空间问题。
- 完成态使用自然语言按钮，例如“确认结算”“查看结算”；已完成记录不得继续使用“确认已结算”作为操作文案。
- 结算次数只代表仍有效的结算批次数，已撤销或无效记录不计入；详情页使用独立卡片展示周期、参与人、金额和转账建议。
- 高信息密度是全站默认原则：能一行显示就不拆行，能左右并排就不纵向堆叠；详情字段优先采用 Label / Value 左右布局，减少空白和滚动。
- 明细列表统一优先使用“日期｜负责人｜类型｜金额”四列结构，金额列固定右对齐；在小屏上允许内容自然换行，但不得用横向滚动或极小字号换取密度。
- 详情页不允许一项数据独占一整行造成大面积留白；收款、支出、租客、合同、房源、房间、结算、历史结算和待办详情均应复用公共详情样式。
- Partner Settlement Card V1：合伙人姓名与应收/应付标签位于卡片头部；代收、垫付、实际留存、应得利润固定为两列 Label / Value；结算余额独占一行并作为最重要金额；标签左对齐、金额右对齐，移动端不得横向滚动。

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
- owner 保持真实邮箱 主管理员保密邮箱（仅数据库与安全配置）；custom 账号生成 account-UUID@accounts.fenzu.invalid 作为仅服务器端可见的 Supabase Auth 邮箱。
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
- `lib/supabase.ts` 统一提供有效 Session：先恢复 localStorage 中的持久 Session，仅在 Access Token 即将到期或服务器返回 401 时单例刷新，避免多个恢复/保存请求并发轮换 Refresh Token。
- Provider 优先用有效 Token 读取 `/api/accounts/me`；仅在非明确撤销的 401 且刷新重试仍失败时调用 `POST /api/auth/restore-session`。补建只允许账号 active、JWT `session_id` 未被撤销且撤销时间边界允许的会话；已撤销会话和已停用账号不会被恢复。
- 站内路由切换直接复用同一快照，不在各业务页或 `AppLayout` 重复调用 `getSession`、`/api/accounts/me` 或注册 Session 监听。
- `SIGNED_IN` 在浏览器恢复焦点时可能再次出现，因此 `SIGNED_IN`、`TOKEN_REFRESHED`、`visibilitychange`、`pageshow` 和网络恢复事件全部走去重的静默校验；只保留一个全局 Auth 监听，不再用 `focus` 触发第二套校验。
- 静默校验期间保持已有账号、权限、房源范围和页面数据。网络暂时失败时保持已授权页面；账号停用、精确会话撤销或确认失效时才显示可返回或退出重登的恢复页。
- 首页业务读取与认证初始化分离：读取失败保留加载/错误状态，不把 RLS 或会话错误渲染成零金额。
- `AccountAccessProvider` 将可显示页面外壳与已完成服务端校验拆分：`restoring_snapshot` 从按账号隔离的 `localStorage` v2 快照恢复非敏感账号、菜单权限、房源 ID 范围和上次路径，`isServerVerified` 只有 `/api/accounts/me` 成功后才为真。旧的全局 v1 快照不再读取，登录切换、退出、停用和会话撤销会清除当前账号快照标记。
- 冷启动快照包含固定 `cacheVersion`、账号/工作区标识、公开账号资料、账号类型与 active 状态、模块及敏感权限布尔值、房源授权模式和 ID、上次验证时间、权限版本标记及上次路径；不复制 Supabase Access/Refresh Token，不缓存密码、Cookie、内部认证邮箱或业务敏感字段。
- `AppLayout` 在快照恢复期立即显示标题、导航和局部同步骨架，但不挂载业务页面；因此缓存不能触发读取敏感字段或任何写操作。真实 Session、应用会话、账号状态和权限在后台通过原有 `/api/accounts/me` 与必要时的 `/api/auth/restore-session` 校验。
- 主动退出、修改密码后的退出、明确 `SIGNED_OUT`、停用、撤销或确认无 Session 会清除快照。临时网络失败保留外壳和最近已验证快照，`online`、`pageshow`、`visibilitychange` 继续使用同一个去重请求静默重试。
- `app/global-error.tsx` 捕获未处理的客户端渲染异常，提供重新加载和退出重登入口，并只向 `POST /api/client-errors` 发送过滤后的错误摘要写入服务端运行日志；不返回堆栈、Token 或数据库错误给浏览器。
- 登录成功后的认证交接只由根级 `AccountAccessProvider` 完成。登录页写入 Supabase Session 后等待同一个去重的账号校验 Promise，校验成功后只执行一次路由跳转；`AppLayout` 不会在 `restoring_snapshot` 或 `refreshing` 期间反向跳回登录页。
- Provider 会合并首次恢复、`INITIAL_SESSION`、`SIGNED_IN` 与 `TOKEN_REFRESHED` 触发的并发校验，避免同一 Session 被多次提交状态。无权限路径回退使用稳定的授权路径列表和一次性重定向标记，防止 owner/custom 登录切换时形成路由循环。
- `components/client-error-reporter.tsx` 在根布局监听未捕获异常与 Promise rejection，只上报经过长度限制和脱敏的名称、消息、堆栈摘要、路径与浏览器标识；`global-error.tsx` 对非标准错误对象也使用安全默认值，错误恢复页本身不会再次抛错。
- PWA Service Worker 只缓存 manifest 与图标等明确的静态外壳资源，不再拦截 Next.js JavaScript chunk、RSC、API 或普通页面请求；注册时使用 `updateViaCache: none` 主动检查新版本，降低部署后 HTML 与旧 chunk 混用风险。

### 业务写入与租客列权限兼容（2026-07-18）

- 租客敏感列不向浏览器授予普通 `SELECT`，因此统一业务写接口不得对租客使用需要额外列读取权限的 `UPSERT ... ON CONFLICT`。
- `app/api/business-data` 根据已经校验的旧记录明确拆分 `INSERT` 与 `UPDATE`，继续使用当前用户 JWT 并接受模块、房源、workspace 和 RLS 双重校验；不使用 Service Role 执行业务写入。

### 自助密码与登录分享（2026-07-15）

- `components/account-center.tsx` 由全局 `AppLayout` 的头像入口加载，展示当前已验证 profile 的显示名称、登录账号、账号类型与状态，并调用 `POST /api/auth/change-password`。
- `POST /api/auth/change-password` 使用当前 Bearer Token 调用 `requireActiveAccount`，从仅服务端可见的 `account_auth_identities` 读取认证邮箱，再以非持久化 Supabase Auth 客户端验证当前密码。服务端随后更新 Auth 密码、撤销 Supabase refresh token 和应用会话，并写入过滤后的安全日志。
- `POST /api/accounts/[id]/share-login` 仅接受 owner；只允许目标为 custom 账号，且仅记录“复制”或“系统分享”动作。登录信息始终在浏览器中按固定正式 URL 和 username 生成，不读取或返回内部认证邮箱。

### 一键入住原子事务（2026-07-18）

- `app/check-in/page.tsx` 只向 `POST /api/check-in` 提交一次完整入住请求，不再从浏览器依次写入租客、房间、合同和收款。
- `app/api/check-in/route.ts` 验证 Supabase Token、应用会话、账号状态、模块权限、房源范围及输入字段，然后使用当前登录用户 JWT 调用 `public.create_atomic_check_in`；普通业务写入不使用 Service Role。
- `public.create_atomic_check_in` 在单个 PostgreSQL 事务中锁定目标房间，创建租客、合同、收款和押金记录，更新房态与租金标准，并写入安全摘要审计日志。函数内部再次校验应用会话、账号状态、模块权限和 `property_id`。
- `public.check_in_requests` 保存服务端幂等结果。浏览器和普通角色无表级访问权；独立 `client_request_id` 重复提交时返回同一组业务 ID，不重复写入。
- 合同和收款附件仍在业务事务成功后通过现有 Storage 权限接口上传；附件失败不会伪装为入住失败，页面会提示用户在详情中重试附件。

### 租客当前调房事务（2026-07-18）

- `app/tenants/page.tsx` 编辑已有租客时调用 `lib/tenant-room-move.ts`，不再把租客、房间、最新合同和历史收款组成多次独立保存。
- `POST /api/tenants/move-room` 验证当前 Supabase Token、有效应用会话、租客编辑权限、房间编辑权限和目标房源范围，再使用当前用户 JWT 调用数据库 RPC。
- `public.update_tenant_current_assignment` 锁定目标租客及新旧房间，在一个 PostgreSQL 事务内更新 `tenants`、当前有效 `contracts`、当前有效 `deposits`、最新覆盖周期 `rent_payments`、两间房状态和审计日志。
- 当前有效关系按业务状态和覆盖期筛选；已结束/归档合同、旧覆盖周期收款和已退押金不更新。RPC 不修改任何金额、覆盖日期或 `rooms.monthly_rent`。
- `app/rooms/page.tsx` 以 `tenants.room_id + status=在租` 生成房间当前租客、月租合计、押金合计和房态；合同与收款只提供当前期限信息和逐笔历史，不再决定“当前租客”。
- `lib/rent-coverage.ts` 的房态函数及 `lib/profit.ts`、首页均使用当前在租租客集合，保证房间列表、首页入住率和空置数口径一致。
- 迁移：`supabase/migrations/20260718190000_move_active_rental_relationship.sql`；非破坏性回滚为重新应用前一版 `20260718163321_atomic_tenant_room_move.sql` 函数定义。
- 移动端全局导航固定在底部并包含 `env(safe-area-inset-bottom)`；主内容底部预留导航高度和安全区，房间操作按钮保持普通文档流。
# 2026-07-22 - Google Drive attachment provider (Preview only)

- The three existing attachment metadata tables remain the attachment index. `storage_provider` distinguishes historical `supabase` rows from new `google_drive` rows, and `provider_file_id` stores only a Drive file ID; Google IDs are not written into legacy `storage_path` or `file_url` fields.
- New uploads use a server-authorized Google Drive resumable session. The browser sends bounded file bytes through the same-origin, permission-checked relay, then the server verifies the resulting file ID, MIME type, size, parent relationship and server-created upload marker before inserting the attachment index.
- Existing Supabase attachments still use `/api/files/signed-url`. Google Drive view/download uses an application-controlled authenticated content route; Drive OAuth credentials and access tokens never reach the browser. Google deletion uses `trashed=true` before the metadata row is removed.
- Google Drive configuration is server-only: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`. The configured root must be the private “分租管理” folder; its category folders are created lazily. This implementation is Preview-only until explicit user acceptance and does not migrate or delete historical files.
- Google Drive attachment bytes are returned through an authenticated application route. To avoid relying on unverified large-response streaming behavior on Vercel, the new-provider limit is 4MB for JPEG, PNG, HEIC, HEIF and PDF and is validated in the browser, upload preparation, relay and completion routes.
- Contract, rent-payment and expense pages use the same small add-control after their parent record has been saved. It selects one file and explicitly appends one independent attachment index row; parent-record edits do not replace or remove attachments.
## 2026-07-22 - Google Drive attachment upload transport

- Google Drive resumable sessions are still created and finalized server-side. To avoid browser cross-origin failures while retaining the Vercel response safety budget, the already enforced 4MB maximum is relayed through a same-origin, permission-checked upload route. That route accepts only a validated Google resumable session URL, re-checks the normal application permissions and owner record, and never returns Google credentials to the browser.
- After a bounded relay upload returns a Google file ID, the server stamps the application-private upload marker before completion. Completion verifies that marker and the expected per-record folder before it can create a Supabase attachment index.

## 2026-07-29 - Supabase Storage attachment uploads (Preview only)

- New contract, rent-payment and expense attachments use a server-authorized, short-lived Supabase signed upload capability. Browser file bytes go directly to the existing private Storage buckets; the application server verifies the signed upload ticket, parent-record permission, bucket, object path, size and MIME before it writes an attachment index.
- New rows are `storage_provider = 'supabase'` with a private Storage path. Existing `google_drive` rows remain readable through their controlled content route and are neither migrated nor changed by this upload-path switch.
- HEIC/HEIF input is always converted in the browser to JPEG before upload. The final provider allowlist remains PDF, JPEG and PNG, with the existing 4MB application limit.

## Global Cache V3（统一缓存架构）

Global Cache V3 establishes one CacheManager boundary for browser business-data reads and writes. The intended flow is UI → CacheManager → business repository → Supabase; pages must not create their own cache or data-fetching policy. `CacheManager` is the only IndexedDB connection owner: it invalidates and closes its cached connection on `versionchange`, never lets a closing connection remain cached, and allows only one cache-only reconnect retry for an explicit closing-connection race. Pages, React cleanups and lifecycle handlers must never close the shared database directly.

### Shared form layout boundary

`UI_DESIGN_SYSTEM.md` owns the shared Form Grid, semantic `.form-grid-row` and
Date Field Box contracts. Pages may compose those primitives but must not use
CSS Grid auto-placement for fields with defined left/right business meaning or
add local native-date sizing overrides. This keeps WebKit intrinsic date sizing
from changing a Form Grid column and ensures a newly inserted field cannot
move an unrelated later field.

Profit monthly and yearly result rows also share one responsive result-row
contract: period/occupancy receives the readable space, financial columns use
compact aligned values, and the first-row baselines remain aligned. Layout
changes must not alter the calculation or filtering layer.

Cross-property query scope is one shared UI/data contract: pages use
`components/property-multi-select.tsx` with `lib/property-scope.ts` for all,
single, or multi-property filtering. Record attribution fields such as a
tenant's or payment's `property_id` remain single-value business fields and
are not range filters.

- Why one CacheManager: one place owns cache versioning, account isolation, TTL, invalidation, cross-tab events and diagnostics, so new modules do not drift into incompatible cache behavior.
- Why two layers: memory cache makes in-app navigation fast, while IndexedDB survives browser restarts without placing business records in localStorage.
- Why SWR: cached data can render first and server reconciliation runs in the background, avoiding a blank page while still converging on current data.
- Why module invalidation: a mutation invalidates only its affected module and derived summaries instead of forcing every page to reload.
- Restore, login, logout and account switching clear or isolate caches so stale data and one account's records cannot leak into another session.
- Cache version invalidates old entries after structural changes; TTL marks stale entries for background refresh while retaining the last usable value.
- Startup warmup and route prefetch are best-effort background work and never block the first screen.
- BroadcastChannel/storage events notify other tabs of writes and invalidations.
- Force Disable Cache and Cache Monitor remain development-only diagnostics; Production never exposes them.
- Future attachments, repairs, bills, notifications and chat must use CacheManager rather than implementing a separate cache.

## Roadmap

Completed: Backup / Restore V4; dynamic partners; Production release.

In progress: Global Cache V3; Product Roadmap.

Planned: local attachment import/export; full-app navigation optimization; UI detail refinement; multi-property support; membership/subscription system (not open); cloud backup; enhanced historical restore; attachment capacity management; multi-person collaboration for advanced partners.

The static `/roadmap` page is a product-planning surface only. All current roadmap items remain free, with no payment or subscription flow connected.

## Attachment archive and cleanup

Tenant deletion is fail-closed: the client may preflight, but the server must recheck every tenant-linked business relation immediately before deleting. A successful permanent deletion may remove only a tenant with no business data; it must never delete contracts, payments, deposits, settlements, attachments or other historical rows to satisfy a foreign key. Tenant archive is a management view state, not deletion, and normal/archive tenant list modes are mutually exclusive.

Tenant-subject reminders navigate by stable `tenant_id` to the tenant detail,
including archived tenants. Archive does not settle or remove debt, but it does
mute daily reminder presentation. Move-out ends the rental relationship without
settling debt: an unarchived, unresolved historical debt remains a reminder
candidate until a supported payment or waiver action.

Reminder derived state is authoritative-state-first: a cache snapshot known to
be stale must not render as valid operating reminders while waiver or payment
state is still being revalidated. Reminder pages may show loading until current
business sources and waiver actions are available. Mutations that change a
reminder must invalidate the affected derived reminder caches together with the
client state update.

Attachment handling is intentionally independent from Backup V1 and Restore V4. The business-data JSON remains database-only; attachment export produces a separate ZIP for local archiving. Attachment Restore V1 was cancelled as a product direction and its UI, APIs and server implementation were removed.

- Export V2 keeps `manifest.json` as the machine-readable index and uses human-readable paths such as `附件归档/房源/<房源>/<房间>/<租客>/合同/` and `附件归档/房源/<房源>/房屋支出/`.
- Names preserve the user's original language. Invalid path characters are sanitized, blank names get safe fallbacks, and collisions receive a stable short attachment suffix without overwriting another file.
- Tenant folders use the earliest valid `rent_payments.coverage_start_date` for that tenant. No contract start date, payment creation date or upload/export date is used; when no coverage start date exists, the folder uses `未知日期-tenant name`. The folder format is `YYYY.MM.DD-tenant name`.
- Manifest entries retain attachment UUID, parent IDs, provider identity, original filename, MIME, size, upload time, checksum, export status and the actual `archiveRelativePath`.
- Export reads `contract_files`, `rent_payment_files` and `expense_files`; one missing or unreadable file is recorded and skipped while the rest of the archive is generated.
- Cleanup is a separate, explicit action. It supports multi-select by concrete attachment and by moved-out tenant. Both paths use the same per-file deletion service: remove the Supabase Storage object before deleting its metadata, continue after individual failures, and report released/unreleased capacity.
- Google Drive attachments are never deleted automatically by cleanup; they are reported for manual handling because provider deletion authority is not guaranteed.
- Data Backup/Restore and attachment archive/cleanup are separate products. No Backup V1 or Restore V4 schema or flow is changed.

Attachment cleanup V2 keeps the four-category model and adds a compact two-line inventory: business ownership is shown first, while date and a shortened filename are secondary. Each item can be viewed through the existing authenticated private-storage/provider path or selected for the existing safe cleanup service; single-item deletion and batch deletion share the same Storage-before-metadata safety rule.

## Attachment taxonomy V1 (2026-08-07)

The user-facing attachment model is now four categories: property, tenant, income, and expense attachments. Existing `contract_files`, `rent_payment_files`, and `expense_files` rows and Storage objects remain in place. Historical contract attachments are shown from the tenant attachment entry when the real `tenant_id` or contract-to-tenant relationship exists; records without a reliable relationship remain untouched.

Property-level files use the additive `property_files` table and private `property-files` bucket. This structure does not alter Backup V1 or Restore V4. The property detail page reuses the existing upload, view, download, and delete security path.

Attachment archives remain independent from data Backup/Restore. The ZIP has human-readable four-category paths and retains `manifest.json` with stable attachment IDs, business relationships, provider information, checksums, and actual archive paths. Cleanup filters the same four categories; moved-out tenant cleanup only targets tenant attachments, and Google Drive originals are never automatically deleted.

## Rent / Debt Domain Contract

`lib/rent-period-state.ts` is the pure, payment-specific source of truth for
rent-period facts and collection state. It selects the latest valid rent period
and exposes coverage dates, expiry/overdue values, normalized due/paid/remaining
amounts, historical debt facts, payment-specific waiver state and an open
debt-follow-up candidate. It does not decide whether a UI should display a
reminder.

The contract separates immutable facts from current handling: a waiver is read
from the append-only audit-log projection, applies only to its `rent_payment_id`,
does not alter the original payment, and creates neither income nor expense.
An expired zero-balance period remains a historical event and may be waived;
remaining balance is not a precondition for waiver. Tenant archive, archive
restore and move-out do not rewrite historical debt facts. Reminder presentation
is a separate derived concern: archive mutes daily presentation, while move-out
does not by itself mute an unresolved debt. The future Reminder Engine will own
that policy by consuming this state.

Pages and domain helpers must not independently recompute rent debt from
coverage dates, payment status, remaining amounts and waiver IDs. They must use
`getRentPeriodState` (or its explicit compatibility wrapper in
`lib/rent-coverage.ts`) so the same payment period has one definition.

## Reminder Engine Contract

`lib/reminder-engine.ts` is the only aggregation boundary for operational
reminders. It is a pure function over a business snapshot, RentPeriodState,
payment-specific waiver facts and maintenance settings. It returns stable
`ReminderItem` records with a semantic `type`, stable ID, entity IDs,
navigation target and available action metadata. It does not mutate data,
perform API calls, or decide UI layout.

The dashboard and reminder center must consume the same effective collection;
they may choose different presentation density, but may not construct their own
rent, contract, deposit, room, or backup reminder rules. Tenant-subject
reminders navigate through the shared tenant navigation helper. Room-subject
reminders carry their room ID. Reminder IDs use type plus the stable business
entity or period ID, never an array index or display text.

Debt State remains separate from Reminder State: archive mutes daily
tenant-bound reminders without settling debt; a moved-out but unarchived tenant
with an open historical debt can still produce a debt reminder; waiver and a
settled collection remove only their relevant period reminder. Future rent
collection reminders are limited to current tenancies. The Reminder Engine may
describe `collect` and `waive` actions, while their implementation remains in
the existing action/API layer until the separate Action Tree Root phase.
## 附件原文件与多选上传（2026-07-22）

共享 `AttachmentAddControl` 使用 `File[]` 保存一次选择的文件，并以串行 `for...of` 调用现有三类附件上传函数。每个文件仍经过现有权限、4MB、Google Drive 完成核验和 Supabase 索引流程；单文件失败不会影响同批其他文件。上传 provider、Google Drive 私有目录、旧 Supabase 双读取、RLS 和数据库结构不变。4MB 以内保留原始 MIME、文件名和字节内容；超限图片仅在明确提示后生成清晰 JPEG 副本，PDF 不压缩。
