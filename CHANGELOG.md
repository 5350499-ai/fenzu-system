## 2026-07-13
- 优化租客手机列表主行：恢复房源简称，并将房源简称、房间简称拆为独立字段；房间号优先保留，长名称仅截断显示。
- 涉及文件：app/tenants/page.tsx、app/globals.css、CHANGELOG.md。
- 是否修改数据库：否。
- 是否新增业务规则：否。
- 是否需要迁移数据：否。
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
- 将邮箱 `5350499@qq.com`、Auth User ID `57b1a78b-d3fe-4e6f-bd9a-055ce1527936` 精确匹配的现有账号建立为固定 `owner`；赋予 14 个模块全部操作权限、全部敏感权限和全部房源访问模式，未修改 Auth 密码。
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
- 主管理员身份已再次校验为 5350499@qq.com / 57b1a78b-d3fe-4e6f-bd9a-055ce1527936，状态 active、owner、全部房源、14 个模块权限和全部敏感权限资料保持完整。
- 服务端仅在创建 Auth 用户、重置密码、停用或启用账号和必要账号维护时使用 SUPABASE_SERVICE_ROLE_KEY；业务页面未改为 Service Role 查询。
- 账号管理支持 custom 账号的最小权限创建、全部或指定房源 property_id 授权、模块与敏感权限保存、密码重置、停用或启用和强制退出全部设备。账号与权限和操作日志页面仅 owner 可访问。
- 安全日志已接入登录成功或失败、退出、创建账号、更新账号、修改权限、修改房源范围、重置密码、停用、启用和强制退出；日志不保存密码、Token、Cookie 或密钥。
- 涉及文件：app/login/page.tsx、components/app-layout.tsx、app/more/page.tsx、app/accounts/page.tsx、app/audit-logs/page.tsx、app/api/auth/*、app/api/accounts/*、app/api/audit-logs/route.ts、lib/account-permissions.ts、lib/supabase-admin.ts、lib/server/account-auth.ts、lib/server/account-management.ts、app/globals.css 和两份阶段二迁移。
- 是否修改数据库：是，新增登录映射表并安全叠加会话门槛；未修改、删除或重建任何业务表、金额、历史流水、附件或原主管理员密码。
- 是否新增业务规则：是，补充 custom 登录映射、服务端账号管理、app session 强制退出边界和阶段二或三职责边界。
- 是否需要迁移数据：仅为固定 owner 写入登录映射；已有业务数据无需迁移。
- 验证：生产构建 npm run build 通过；线上迁移成功；以模拟 owner JWT 验证 is_app_session_valid()=true，并可读取房源 1、收款 3。由于本机未配置 SUPABASE_SERVICE_ROLE_KEY，未在生产环境创建永久测试账号；部署前需在 Vercel 仅添加该服务器端变量。
