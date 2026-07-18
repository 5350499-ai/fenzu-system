## 2026-07-15 - Room amount display mapping

- Fixed the room list to use the active tenant current monthly rent standard, falling back to the room standard only when no active tenant exists.
- Fixed room payment history: rent reads rent_payments.amount_due, deposit uses the linked deposit record when available and the existing legacy receipt compatibility mapping otherwise, and received total reads rent_payments.amount_paid.
- Database: no schema or data changes. Financial calculations, RLS, permissions, and historical records are unchanged.
- Files: app/rooms/page.tsx, CHANGELOG.md.

## 2026-07-13
- 优化租客手机列表主行：恢复房源简称，并将房源简称、房间简称拆为独立字段；房间号优先保留，长名称仅截断显示。
- 涉及文件：app/tenants/page.tsx、app/globals.css、CHANGELOG.md。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
- 新增迁移 `202607150003_stage3_tenant_rpc_grants.sql`，撤销 `PUBLIC/anon` 对租客脱敏 RPC 的执行资格，仅保留 `authenticated`；不改变 RPC 返回规则或任何业务数据。
- 数据库级权限验收：有效 custom 会话可读取授权的房源1、房间4、租客3、收款3、支出22；无房源编辑权限时更新0条，有支出编辑权限时事务内更新1条并回滚；已撤销会话读取房源和支出均为0。
- 安全复核：租客脱敏 RPC 的匿名执行权限已撤销；主管理员仍为 active owner/全部房源；迁移后业务数量与阶段三迁移前完全一致。
- 验证：`npm run build` 通过，共生成30个页面和服务端路由。
- 兼容性影响：仅调整租客列表主行显示，不影响租金、收款、押金和历史数据。
# CHANGELOG.md

所有修改记录只允许追加，不得覆盖历史。

## 2026-07-11

- 创建 `CLAUDE.md`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`、`CHANGELOG.md` 四个长期维护文档。
- 原因：建立项目永久开发规范、业务规则单一来源、架构说明和追加式变更历史，便于长期维护。
- 涉及文件：
  - `CLAUDE.md`
  - `BUSINESS_RULES.md`
  - `ARCHITECTURE.md`
  - `CHANGELOG.md`
- 是否修改数据库：否
- 是否新增业务规则：否
- 是否需要迁移数据：否
- 是否存在兼容性影响：否

## 2026-07-11

- 补充新开发任务的四文档预读流程：`CLAUDE.md`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`、`CHANGELOG.md`。
- 补充 Minimum Context、最小修改范围和最小影响范围要求。
- 明确跨模块影响必须先说明并等待确认，完成修改后必须追加更新 `CHANGELOG.md`。
- 明确 `BUSINESS_RULES.md` 为项目业务规则唯一可信来源。
- 是否修改数据库：否
- 是否新增业务规则：否，仅补充开发规范
- 是否需要迁移数据：否
- 是否存在兼容性影响：否
## 2026-07-12

- 修正收款管理主行金额：房租类收款显示房租金额，押金金额与本次合计收入仅在展开详情显示。
- 统一收款月份筛选、利润统计与合伙结算按收款日期计算；租金覆盖日期仅保留给覆盖期、欠费、续租和房间状态判断。
- 是否修改数据库：否
- 是否新增业务规则：是，补充收款日期为唯一财务归属日期与单笔流水只统计一次的规则。
- 是否需要迁移数据：否。历史缺少收款日期的记录继续使用原有财务月份作为兼容回退。
- 是否存在兼容性影响：否
## 2026-07-13

- 修复租客列表跨月后月租标准显示为 €0.00 的问题：列表继续读取租客资料的 monthlyRent，不再受当月收款筛选或本次实收影响。
- 续交房租表单拆分“当前月租标准”和“本次实收房租”：续交默认沿用原标准，只有手动修改标准才更新租客资料。
- 对历史自动创建且月租标准为 0 的租客，加载时仅从其最近一条房租流水的房租金额补齐标准；不修改任何收款、押金、财务统计或历史流水。
- 涉及文件：
  - app/rent-payments/page.tsx
  - app/tenants/page.tsx
  - lib/rent-coverage.ts
  - BUSINESS_RULES.md
  - CHANGELOG.md
- 是否修改数据库：否。
- 是否新增业务规则：是，明确月租标准与实际收款必须分离。
- 是否需要迁移数据：否。历史为 0 的月租标准在下次页面加载时兼容补齐。
- 是否存在兼容性影响：否，不改变收款日期归属、押金统计或历史流水。
## 2026-07-13

- 继续修复租客月租标准：历史补齐改为按收款日期选择最新有效房租金额，严格使用房租金额字段，不读取押金或合计金额。
- 优化租客手机列表：房间名称/编号优先显示，房源名缩为辅助信息；压缩姓名列、房间列和状态标签间距，避免横向溢出和房间号被截断。
- 涉及文件：
  - app/tenants/page.tsx
  - app/globals.css
  - lib/rent-coverage.ts
  - BUSINESS_RULES.md
  - CHANGELOG.md
- 是否修改数据库：否。
- 是否需要迁移数据：否。
- 是否修改历史流水、押金统计或财务计算：否。
- 兼容说明：页面加载时会把月租标准为 0 且存在历史房租金额的租客补齐为最新收款日期对应的房租标准，并写回当前租客资料。
## 2026-07-13
- 修复历史自动创建租客月租标准未真正写回数据库的问题：仅对 tenants.monthly_rent 为 0 的租客，按其 tenant_id 关联的最新有效 rent_payments.amount_due 写回。
- 修复收款登记自动创建租客时，月租标准为 0 可能覆盖实际房租金额的问题；当标准值为空或 0 时使用本次房租金额。
- 修复租客手机列表主行显示：第二列直接绑定房间名称/编号，房源长名称不再占用主行空间，并压缩列宽避免横向溢出。
- 涉及文件：app/tenants/page.tsx、app/rent-payments/page.tsx、lib/rent-coverage.ts、app/globals.css、BUSINESS_RULES.md。
- 是否修改数据库：是，仅执行一次安全数据修复，将租客“临时租客”的 monthly_rent 从 0 更新为 350；未删除、覆盖或修改历史收款、押金和统计流水。
- 是否新增业务规则：是，补充月租标准与实际收款分离、房间号优先显示规则。
- 是否需要迁移数据：需要兼容性数据修复，不涉及表结构迁移。
- 兼容性影响：不改变收款日期归属、押金统计、历史流水或非零月租标准。
## 2026-07-13
- 补正租客主行的最终绑定：第二列只渲染房间名称/编号，不再渲染房源名称小字；房源名称仅保留在详情标题提示中。
- 涉及文件：app/tenants/page.tsx。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
- 兼容性影响：仅修正手机列表显示，不影响租客、房间、收款和财务数据。
## 2026-07-13
- 增强租客管理顶部搜索框：聚焦且未输入时显示真实房源选项，支持按 property_id 筛选租客。
- 保留原有文字搜索；房源选项支持名称、地址、城市过滤，点击后自动关闭，清空后恢复全部租客。
- 涉及文件：app/tenants/page.tsx、app/globals.css、CHANGELOG.md。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
- 兼容性影响：仅增加租客列表搜索框的房源筛选交互，不改变现有列表布局、排序、财务数据和房态逻辑。
- 2026-07-13：修复租客到期提醒与排序逻辑。到期提醒改为覆盖结束日期的31/30/16/15/1/0天分段；租客页默认按红、橙、黄、正常优先级排序；到期日、月租、房源、状态按钮改为真实比较当前筛选结果；展开详情增加距离租金到期；首页和提醒中心使用同一套覆盖期提醒阶段。涉及 `lib/rent-coverage.ts`、`app/tenants/page.tsx`、`app/page.tsx`、`app/reminders/page.tsx`、`app/globals.css`。未修改数据库结构、历史流水、金额、房态或现有列表字段；无需迁移数据。
- 2026-07-13：优化提醒展示层。首页收租提醒拆为房源/房间与独立到期状态两行，并显示租客和覆盖结束日期；租客列表将到期提醒移到主行下方，保留原有六列主信息。涉及 `app/page.tsx`、`app/reminders/page.tsx`、`app/tenants/page.tsx`、`app/globals.css`。未修改提醒计算、排序、收款、押金、房态或数据库；无需迁移数据。

## 2026-07-13

- 完成账号与权限功能阶段一：新增 `user_profiles`、`user_permissions`、`user_sensitive_permissions`、`user_property_access`、`app_sessions`、`audit_logs` 六张基础表，并为全部新表启用 RLS。
- 将邮箱 `主管理员保密邮箱（仅数据库与安全配置）`、Auth User ID `主管理员保密 Auth ID（仅数据库与安全配置）` 精确匹配的现有账号建立为固定 `owner`；赋予 14 个模块全部操作权限、全部敏感权限和全部房源访问模式，未修改 Auth 密码。
- 新增 `app_private` 私有权限函数、owner 保护触发器和 audit log 防修改触发器；`app_sessions` 只保存 JWT `session_id` 撤销信息，不保存 Refresh Token。
- 保留原 19 条业务 RLS 和 Storage 策略，额外为 12 张业务及附件元数据表增加 `stage1_owner_compatibility` 策略；未删除或替换任何旧策略。
- 保存迁移前 owner、业务数量和 RLS 基线，并提供只撤销兼容策略的非破坏性回滚 SQL。
- 修正 owner 显示名称的 SQL 传输编码，并补齐新权限表 6 个外键覆盖索引；Supabase 安全顾问对本阶段新增对象无安全告警。
- 事务内模拟 owner `authenticated` JWT，验证读取、临时新增和编辑房源成功；测试数据已回滚，线上业务数量仍为房源1、房间4、租客3、合同1、收款3、支出22、附件2。
- 涉及文件：`supabase/migrations/20260713154204_accounts_permissions_stage1.sql`、`supabase/migrations/20260713155640_accounts_permissions_stage1_owner_name_fix.sql`、`supabase/migrations/20260713160156_accounts_permissions_stage1_indexes.sql`、`supabase/backups/20260713_accounts_permissions_stage1_preflight.md`、`supabase/rollbacks/20260713154204_accounts_permissions_stage1_rollback.sql`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`、`CHANGELOG.md`。
- 是否修改数据库：是，只新增权限基础对象、owner 权限资料、兼容策略和索引；未修改业务表结构、金额、历史流水或附件。
- 是否新增业务规则：是，新增两类账号、固定 owner、最小权限、房源 ID 授权、Service Role 限制、会话撤销和日志防篡改规则。
- 是否需要迁移数据：仅为现有主管理员建立新的 owner 权限资料；无需迁移或改写任何业务数据。
- 兼容性影响：阶段一不修改登录页、数据层、页面按钮或现有业务访问流程。新旧 permissive 策略并存产生的性能提示是验收期内的临时兼容安排。

## 2026-07-13

- 完成账号与权限阶段二：新增自定义登录名映射、账号与权限页面、操作日志页面、服务端账号管理 Route Handlers、应用会话校验和基础安全日志。
- 新增阶段二迁移 20260713163836_accounts_permissions_stage2.sql：建立 account_auth_identities，为既有业务、文件元数据、权限表和三个业务 Storage bucket 的策略叠加启用账号与有效应用会话校验；不删除原策略或业务数据。
- 新增会话边界迁移 20260713165000_accounts_permissions_stage2_session_guard.sql：custom 账号以 JWT session_id 精确校验撤销状态，避免重新登录被同一秒的全局撤销时间误伤；owner 保持阶段一兼容会话路径。
- 主管理员身份已再次校验为 主管理员保密邮箱（仅数据库与安全配置） / 主管理员保密 Auth ID（仅数据库与安全配置），状态 active、owner、全部房源、14 个模块权限和全部敏感权限资料保持完整。
- 服务端仅在创建 Auth 用户、重置密码、停用或启用账号和必要账号维护时使用 SUPABASE_SERVICE_ROLE_KEY；业务页面未改为 Service Role 查询。
- 账号管理支持 custom 账号的最小权限创建、全部或指定房源 property_id 授权、模块与敏感权限保存、密码重置、停用或启用和强制退出全部设备。账号与权限和操作日志页面仅 owner 可访问。
- 安全日志已接入登录成功或失败、退出、创建账号、更新账号、修改权限、修改房源范围、重置密码、停用、启用和强制退出；日志不保存密码、Token、Cookie 或密钥。
- 涉及文件：app/login/page.tsx、components/app-layout.tsx、app/more/page.tsx、app/accounts/page.tsx、app/audit-logs/page.tsx、app/api/auth/*、app/api/accounts/*、app/api/audit-logs/route.ts、lib/account-permissions.ts、lib/supabase-admin.ts、lib/server/account-auth.ts、lib/server/account-management.ts、app/globals.css 和两份阶段二迁移。
- 是否修改数据库：是，新增登录映射表并安全叠加会话门槛；未修改、删除或重建任何业务表、金额、历史流水、附件或原主管理员密码。
- 是否新增业务规则：是，补充 custom 登录映射、服务端账号管理、app session 强制退出边界和阶段二或三职责边界。
- 是否需要迁移数据：仅为固定 owner 写入登录映射；已有业务数据无需迁移。
- 验证：生产构建 npm run build 通过；线上迁移成功；以模拟 owner JWT 验证 is_app_session_valid()=true，并可读取房源 1、收款 3。由于本机未配置 SUPABASE_SERVICE_ROLE_KEY，未在生产环境创建永久测试账号；部署前需在 Vercel 仅添加该服务器端变量。

## 2026-07-13

- 为阶段二验收补充“更多”页面的 owner 专属“操作日志”入口，与既有“账号与权限”入口并列。
- 涉及文件：`app/more/page.tsx`、`CHANGELOG.md`。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
- 兼容性影响：仅 owner 可见该入口；不改变任何业务页面、权限策略或数据。

## 2026-07-15

- 完成账号与权限第三阶段接入：新增全局账号权限上下文，桌面菜单、手机菜单、更多页面和直接路由按模块查看权限控制；利润、合伙结算、操作日志同时校验敏感权限。
- 房源、房间、租客、收款、支出、押金、待办、一键入住、设置和房源详情页的新增、编辑、归档、永久删除、导出及附件操作按权限隐藏；房源详情子模块独立加载和控制，备注在无编辑权限时只读。
- 新增统一业务写接口 `app/api/business-data/route.ts`：服务端验证真实 Supabase Token、有效应用会话、模块操作、workspace owner 和房源范围，再使用当前用户 JWT 执行写入并由 RLS 二次校验；未使用 Service Role 执行普通业务写操作。
- `lib/business-data.ts` 改为只提交相对远端快照发生变化的记录，避免只读或仅新增账号对未修改历史行发起更新；custom 账号写入仍归属主管理员 workspace owner。
- 新增附件签名链接接口并接入合同、收款、支出附件的查看、下载、上传、替换和删除权限；附件元数据与 Storage bucket 同时受会话、敏感权限、owner 路径和房源范围控制。
- 新增租客数据库脱敏 RPC：电话、微信和备注根据敏感权限返回完整值、脱敏值或空值；RPC字段已按线上 `tenants` 实际16列校准。
- 操作日志查询开放给同时具有日志模块查看和敏感日志查看权限的账号，并限制为当前 workspace；账号管理仍只允许 owner。业务表与附件元数据新增追加式审计触发器。
- 应用并验证 Supabase 迁移 `202607150001_account_permissions_stage3.sql`，线上登记版本为 `20260715113733 account_permissions_stage3`；新增60条策略、21个权限/审计触发器和1个租客脱敏RPC。
- 迁移前后业务数量完全一致：房源1、房间4、租客3、合同1、收款3、支出22、押金0、合同附件0、收款附件0、支出附件2；未修改金额、历史流水、现有附件或主管理员密码。
- 涉及文件：`components/account-access.tsx`、`components/app-layout.tsx`、主要业务页面、`app/api/business-data/route.ts`、`app/api/files/signed-url/route.ts`、`app/api/accounts/me/route.ts`、`app/api/audit-logs/route.ts`、`lib/account-permissions.ts`、`lib/business-data.ts`、`lib/server/account-auth.ts`、`lib/storage-files.ts`、`supabase/migrations/202607150001_account_permissions_stage3.sql`、三份长期文档。
- 是否修改数据库：是，仅新增阶段三函数、RLS策略和触发器；未修改业务表结构或数据。
- 是否新增业务规则：是，补充全业务模块/敏感权限、owner workspace、指定房源、脱敏、附件和审计规则。
- 是否需要迁移数据：否。
- 兼容性影响：阶段一、二兼容策略继续保留；owner维持全部权限。受限账号只读取已授权模块和房源，不再拥有前端按钮或直接接口绕过路径。
- 验证：`npm run build` 通过；数据库迁移成功并完成策略、触发器、RPC及业务数量核对。线上账号矩阵与浏览器交互验收将在本次部署后继续执行。

## 2026-07-15

- 完成阶段三提交前安全收尾：审计日志查询允许 owner 查看登录失败等完整安全事件，自定义账号仍只可查看同一 workspace 的账号日志。
- 新增迁移 `202607150002_stage3_audit_sensitive_filter.sql`，从业务审计快照中移除租客备注、租客跟进内容、电话、微信、证件号及认证密钥类字段；迁移只替换审计函数，不修改业务表结构、历史金额或业务记录。
- 设置页按当前账号已有的模块查看权限加载备份与导出数据，避免局部授权账号因无权模块导致整页加载失败。
- 是否修改数据库：是，仅替换审计函数；未修改任何业务表或历史数据。
- 是否需要迁移数据：否。

## 2026-07-15

- 修复站内导航重复整屏显示“正在检查登录状态…”：移除页面级 `AppLayout` 的重复 `getSession`、`/api/accounts/me` 请求和重复 Session 监听；根级 `AccountAccessProvider` 仅在首次恢复会话或刚登录时阻塞初始化，站内切换复用已有权限快照。
- Provider 现在对焦点恢复和 Supabase Token 事件执行静默权限校验。临时网络失败时保留当前已授权页面；会话被撤销、账号停用或权限失效时显示明确恢复页面，不再陷入无限认证加载。
- 无权限和会话失效页面新增“返回首页”“返回上一页”“退出并重新登录”入口；账号与权限页复用全局 owner 状态，不再额外请求 `/api/accounts/me`。
- 涉及文件：`components/account-access.tsx`、`components/app-layout.tsx`、`app/accounts/page.tsx`、`ARCHITECTURE.md`、`CHANGELOG.md`。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
- 兼容性影响：不修改模块权限、敏感权限、RLS、房源隔离、业务数据或既有会话安全校验；仅消除站内重复认证等待并补全无权限页出口。


## 2026-07-15

- 修复收款管理列表主行金额：由只显示 `amount_due` 的房租金额，改为显示该笔 `amount_paid` 的本次合计收入。
- 收款详情继续拆分显示房租金额、押金金额和本次合计收入；未修改收款统计、利润、合伙结算、租金覆盖、历史流水、权限或数据库记录。
- 涉及文件：`app/rent-payments/page.tsx`、`BUSINESS_RULES.md`、`CHANGELOG.md`。
- 是否修改数据库：否。
- 是否新增业务规则：是，明确收款列表主金额为本次合计收入。
- 是否需要迁移数据：否。
- 兼容性影响：仅修正收款列表的显示字段。

## 2026-07-15 - 分享登录信息与自助修改密码

- 原因：主管理员需要安全分享自定义账号登录方式，所有启用账号需要能在不依赖管理员的情况下修改自己的密码。
- 涉及文件：`app/accounts/page.tsx`、`components/app-layout.tsx`、`components/account-center.tsx`、`components/account-access.tsx`、`app/api/auth/change-password/route.ts`、`app/api/accounts/[id]/share-login/route.ts`、`app/globals.css`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`。
- 数据库：未修改表、字段、RLS、房源授权或业务数据；复用现有 `user_profiles`、`account_auth_identities`、`app_sessions` 和 `audit_logs`。
- 安全：分享内容不含密码、内部邮箱或 token；自助改密必须验证当前密码，并撤销应用会话、记录已过滤的成功/失败安全日志。
- 兼容性：未变更现有 owner 重置其他账号密码、权限矩阵、房源隔离或业务模块。

## 2026-07-15 - 登录页隐私提示修复

- 登录账号输入框改为通用提示，不再公开主管理员真实邮箱。
- 清理公开维护文档与阶段一备份说明中的主管理员邮箱和 Auth ID，后端权限身份识别与登录能力不变。
- 未修改认证、RLS、房源隔离或业务数据。

## 2026-07-17 - Fix expense creation pre-save lookup

- Fixed the unified business write handler for `expenses`: it now looks up only `id`, `notes`, and `property_id`, because the `expenses` table has no `status` column.
- This prevents new expense creation from failing before the INSERT with "读取现有记录失败"; no attachment remains a valid optional state.
- Successful business writes now return persisted row IDs to the client. Existing database audit triggers continue recording creates and edits without requiring `before_data` for new rows.
- Files: `app/api/business-data/route.ts`, `CHANGELOG.md`.
- Database schema/data: unchanged. No historical expense, financial amount, permission, RLS policy, or attachment was changed.

## 2026-07-18 - Restore persistent application sessions

- Added a server-side restore step for persisted Supabase sessions. A missing `app_sessions` row is recreated only for an active account with a valid, non-revoked Supabase session; revoked rows and disabled accounts remain blocked.
- The account provider now restores the application session before loading its permission snapshot and distinguishes unauthenticated, revoked, disabled, forbidden, and network-error states.
- Home data loading now waits for an authenticated account, keeps a local loading/error state, and no longer displays failed data reads as zero financial figures or labels a read failure as a save-permission failure.
- Files: `components/account-access.tsx`, `lib/server/account-auth.ts`, `app/api/auth/restore-session/route.ts`, `lib/business-data.ts`, `app/page.tsx`, `CHANGELOG.md`.
- Database schema and business records: unchanged.

## 2026-07-18 - Stabilize Safari/PWA session resume

- 修复真实原因：Supabase 在页面恢复时可能再次发送 `SIGNED_IN`，原 Provider 将其当成首次登录并把 `ready` 重置为 false；同时 `focus`、`visibilitychange` 和 Auth 事件并发校验，使业务保存可能继续使用刷新前的短期 Token。
- `AccountAccessProvider` 现在只在首次冷启动显示认证初始化；`SIGNED_IN`、`TOKEN_REFRESHED`、`visibilitychange`、`pageshow` 和网络恢复均使用去重的静默校验，网络瞬断不清空账号、权限、房源范围或当前页面数据。
- `lib/supabase.ts` 新增单例 Session 刷新流程。业务读取和写入统一先取得有效短期 Access Token；保存遇到 401 时只刷新并安全重试一次，不延长 Access Token 有效期。
- 修复 owner 一键入住写入的独立数据库兼容问题：租客敏感列采用列级 SELECT 授权，原 `upsert().select()` 因 `ON CONFLICT` 额外读取权限被 PostgreSQL 拒绝。统一业务写接口改为已校验后的显式 INSERT/UPDATE，仍使用当前用户 JWT 和原 RLS，不使用 Service Role。
- 错误提示区分会话失效、账号停用、管理员撤销、权限不足、网络异常和业务保存失败；读取失败不再提示“没有权限保存”。
- 验证：线上业务数量保持 1 套房源、4 个房间、3 个租客、3 笔收款、23 笔支出；owner 新增/编辑租客事务测试成功并回滚，测试行 0；只读 custom 的租客新增权限仍为 false；明确 revoked 会话仍被数据库拒绝。
- 涉及文件：`components/account-access.tsx`、`components/app-layout.tsx`、`lib/supabase.ts`、`lib/business-data.ts`、`lib/storage-files.ts`、`app/api/business-data/route.ts`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`、`CHANGELOG.md`。
- 数据库：无新 Migration、无结构修改、无业务数据修改、无需数据迁移。

## 2026-07-18 - Atomic and idempotent one-click check-in

- 修复统一业务写入路由：新增操作不再预读旧记录；更新、归档和删除才读取合法的表级字段。`rent_payments` 不再查询不存在的 `status` 字段，新增日志的 `before_data` 保持为空。
- 一键入住由四次独立浏览器写入改为一次 `POST /api/check-in`，再由 `public.create_atomic_check_in` 在单个 PostgreSQL 事务内创建租客、合同、收款、押金记录，更新房态和月租标准，并写入审计日志。
- 新增 `public.check_in_requests` 和独立 `client_request_id` 幂等机制；重复点击返回首次创建的业务 ID，不会生成第二套租客、合同、收款或押金记录。
- 新增迁移：`supabase/migrations/20260718154112_atomic_check_in.sql`、`supabase/migrations/20260718161200_atomic_check_in_indexes.sql`。回滚 SQL 已写在迁移文件末尾。
- 验证：owner 完整事务成功；重复请求只生成一组记录；模拟收款插入失败时全部回滚；只读 custom 被拒绝；临时授予完整必要权限的 custom 可执行；全部测试事务均已回滚，未污染正式数据。
- Aymane chakri 的现有租客、合同和 502 已租房态保持不变。本次真实房租金额无法从数据库、审计摘要、Vercel 请求日志或前端草稿可靠恢复，因此尚未补建收款、押金与覆盖记录，也未把月租写为猜测值。
- 涉及文件：`app/api/business-data/route.ts`、`lib/business-data.ts`、`app/api/check-in/route.ts`、`app/check-in/page.tsx`、两份迁移及三份长期文档。
- 兼容性：不修改既有收款、支出、租客、合同、房间或附件记录；不改变财务公式、权限矩阵、RLS 房源隔离或现有账号密码。

## 2026-07-18 - Repair incomplete Aymane check-in data

- 经用户确认本次房租为 €130，在写入前核对指定租客恰好1条、合同恰好1份、502房间仍为已租，且该租客收款和押金流水均为0条。
- 保留租客 `3b8570b5-23df-4aed-923c-08d046930e32`、合同 `b94a572b-db69-4cbd-a9c9-2af415957015` 和房间 `06d3c92a-6c99-4b55-a54d-02b7a583a16b`，仅把租客与房间月租标准补为 €130。
- 新增一笔收款 `7d5e2a7f-8df5-4206-80cf-c959b98f744d`：房租 €130、押金 €300、实收合计 €430、收款日期 2026-07-18、覆盖期 2026-07-18 至 2026-07-31、转账、归属A、已收、备注“包电费”。
- 新增一笔押金流水 `5c103b53-922e-4bc2-84fa-09ff93e9f982`：收取 €300、日期 2026-07-18、状态已收、归属A。
- 补齐操作在带锁和严格前置条件的单个事务中执行，并追加“修复并补齐一键入住残缺数据”审计日志；第一次缺少认证上下文的尝试被权限触发器拒绝并完整回滚，确认零写入后使用有效 owner 会话上下文成功执行。
- 验证：租客1条、合同1份、目标收款1笔、目标押金1笔、502仍为已租；系统总收入由 €1,530 增至 €1,960，7月新增 €430；其他房源、房间、租客、合同和23笔支出未变化。
- 代码与数据库结构：未修改；无需 Migration、构建或前端重新部署。

## 2026-07-18 - Atomic tenant room move and Aymane history repair

- 修复真实原因：编辑已有租客时，前端把租客、两间房、最新合同和最新收款组成四类独立保存；因此当前房间变化错误改写了合同与历史收款，并把租客月租写入旧房间标准。
- 新增 `public.update_tenant_current_assignment`：在单个事务中验证会话、租客/房间编辑权限和新旧房源范围，锁定租客与房间，仅更新租客当前资料、重新计算两间房状态并记录 `move_tenant_room` 日志。
- 编辑已有租客现在走 `POST /api/tenants/move-room`；合同、历史收款和押金不再进入租客编辑提交路径，房间自身月租标准也不会随租客搬动。
- 精确修复 Aymane 数据：当前租客继续关联504且月租 €130；合同和历史收款由504恢复502；押金继续关联502；502房间自身月租由 €130 恢复 €300；504房间自身月租保持 €0；两间房均保持已租。
- 修复没有新增或删除租客、合同、收款或押金，房租 €130、押金 €300、实收 €430 和覆盖期 2026-07-18 至 2026-07-31 均未改变；追加一条“修复调房数据错位”审计日志。
- 事务回归：模拟 Aymane 504→502 时504变空置、502因林仍在租而保持已租；移回504后502继续已租；合同、收款、押金及两间房自身月租全程不变，测试事务已回滚。只读 custom 调用被数据库拒绝。
- 涉及文件：`app/tenants/page.tsx`、`app/api/tenants/move-room/route.ts`、`lib/tenant-room-move.ts`、`supabase/migrations/20260718163321_atomic_tenant_room_move.sql`、`BUSINESS_RULES.md`、`ARCHITECTURE.md`、`CHANGELOG.md`。
- 数据库：新增一个事务 RPC，不新增业务表或字段；执行一次严格幂等的数据修复。现有权限矩阵、RLS、财务计算和其他业务记录不变。

## 2026-07-18 - Move the active rental relationship and unify room occupancy

- 按最新业务确认升级正式调房：当前在租租客、未结束的有效合同、尚未退还的押金和最新覆盖周期房租流水在同一 PostgreSQL 事务中整体迁移；已结束/归档合同、较早覆盖周期流水和已退押金保持不变。
- 精确修复 Aymane 当前关系：租客、合同 `b94a572b-db69-4cbd-a9c9-2af415957015`、收款 `7d5e2a7f-8df5-4206-80cf-c959b98f744d` 和押金 `5c103b53-922e-4bc2-84fa-09ff93e9f982` 全部归属504；金额 €130/€300/€430 与覆盖期未改变，未新增或删除业务记录。
- 房间当前租客和房态不再从最新合同或收款推断，只读取当前 `tenants` 关系；同房多人逐人显示，列表显示当前月租合计，详情显示月租与有效押金合计及逐人明细，历史收款继续逐笔显示。
- 首页入住率、空置提醒和房间页统一按当前在租租客计算。线上当前四个房间各有一名在租租客，口径为4/4、100%、空置0间。
- 修复移动端底部布局：全局导航固定并适配 iPhone 安全区，主内容增加导航高度加安全区的底部留白，房间详情操作按钮保持文档流且可完整滚动到导航上方。
- 事务回归已回滚：Aymane 504→502 时当前有效合同、押金和最新覆盖期收款同步迁移，504变空置，502因林仍在租保持已租；同房两人月租合计 €430，结束一人后另一人仍保持房间已租；只读 custom 被拒绝。
- 涉及文件：`app/rooms/page.tsx`、`app/tenants/page.tsx`、`app/page.tsx`、`app/globals.css`、`lib/rent-coverage.ts`、`lib/profit.ts`、`supabase/migrations/20260718190000_move_active_rental_relationship.sql`、三份长期文档。
- 数据库：替换现有 RPC 函数定义，不新增表或字段；一次严格前置检查的数据修复和一条明确审计日志。回滚不删除业务行。
