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
- New uploads use a server-authorized Google Drive resumable session. The browser sends file bytes directly to Google, then the server verifies the resulting file ID, MIME type, size, parent relationship and server-created upload marker before inserting the attachment index.
- Existing Supabase attachments still use `/api/files/signed-url`. Google Drive view/download uses an application-controlled authenticated content route; Drive OAuth credentials and access tokens never reach the browser. Google deletion uses `trashed=true` before the metadata row is removed.
- Google Drive configuration is server-only: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_ROOT_FOLDER_ID`. The configured root must be the private “分租管理” folder; its category folders are created lazily. This implementation is Preview-only until explicit user acceptance and does not migrate or delete historical files.
- Google Drive attachment bytes are returned through an authenticated application route. To avoid relying on unverified large-response streaming behavior on Vercel, the new-provider limit is 4MB for JPEG, PNG and PDF and is validated in the browser, upload preparation and completion routes.
- Contract, rent-payment and expense pages use the same small add-control after their parent record has been saved. It selects one file and explicitly appends one independent attachment index row; parent-record edits do not replace or remove attachments.
## 2026-07-22 - Google Drive attachment upload transport

- Google Drive resumable sessions are still created and finalized server-side. To avoid browser cross-origin failures while retaining the Vercel response safety budget, the already enforced 4MB maximum is relayed through a same-origin, permission-checked upload route. That route accepts only a validated Google resumable session URL, re-checks the normal application permissions and owner record, and never returns Google credentials to the browser.
- After a bounded relay upload returns a Google file ID, the server stamps the application-private upload marker before completion. Completion verifies that marker and the expected per-record folder before it can create a Supabase attachment index.
## 附件原文件与多选上传（2026-07-22）

共享 `AttachmentAddControl` 使用 `File[]` 保存一次选择的文件，并以串行 `for...of` 调用现有三类附件上传函数。每个文件仍经过现有权限、4MB、Google Drive 完成核验和 Supabase 索引流程；单文件失败不会影响同批其他文件。上传 provider、Google Drive 私有目录、旧 Supabase 双读取、RLS 和数据库结构不变。本次移除浏览器端图片压缩，保留原始 MIME、文件名和字节内容。
Google Drive 直传（仅 Preview 功能分支）

- prepare 在服务端校验会话、业务权限和目标目录，并返回短期 resumable session URL 与签名 upload job；浏览器只向 Google 直传文件字节，不获得 OAuth token。
- complete 重新读取 Google 元数据（MIME、大小、parents、私有 appProperties）后写入 Supabase 索引，并按 provider_file_id 幂等返回已有记录。
- Google 文件查看/下载仍通过受控服务端流式接口，转发 Range、Content-Range、Content-Length 和 416 状态；旧 Supabase 文件继续使用 signed URL。
- 当前改造仅部署 Preview，Production 保持 4MB 中转版本不变，未执行数据库迁移。
