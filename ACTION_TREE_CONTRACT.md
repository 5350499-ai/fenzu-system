# Action Tree Ownership Contract

Status: active governance contract
Owner: this document is the single source of truth for business Action ownership.
Scope: entry points, UI orchestration, action roots, persistence, feedback, refresh, permissions and risk.

This contract records the current implementation. It does not authorize a production behavior change. A future migration must update the registry and tests before changing an Action root.

## Contract layers

```text
ENTRY
  -> UI_ORCHESTRATION
  -> ACTION_ROOT
  -> DOMAIN_SERVICE
  -> API_OR_RPC
  -> PERSISTENCE
  -> DERIVED_STATE_CACHE
  -> USER_FEEDBACK
```

Pages and components may collect input, perform presentation validation, open confirmation UI, and request an Action. They must not add a second cross-table write sequence. Server/API/RPC layers own authorization, authoritative validation, persistence and business invariants. Database/RPC transactions own atomicity where an Action is declared atomic.

New mutation Actions must be registered here before implementation. New UI entry points must reuse the registered Action root; a new API with the same business meaning is prohibited.

## Registry fields

Each registry row uses these fields:

- `Action ID`: stable semantic identifier; never based on file line numbers.
- `Types`: one or more of `NAVIGATION`, `UI_STATE`, `CREATE`, `UPDATE`, `FINANCIAL`, `LIFECYCLE`, `DESTRUCTIVE`, `DATA_ADMIN`, `BULK`.
- `Pending`: `UI_PENDING_GUARD`, `CLIENT_REQUEST_ID`, `SERVER_IDEMPOTENCY`, `DATABASE_CONSTRAINT`, or `NONE`.
- `Atomicity`: `ATOMIC`, `COMPENSATABLE`, `PARTIAL_SUCCESS_ALLOWED`, or `PARTIAL_SUCCESS_RISK`.
- `Confirmation`: `NO_CONFIRM_REQUIRED`, `SIMPLE_CONFIRM`, `CONSEQUENCE_CONFIRM`, `TYPED_CONFIRM`, `PREVIEW_AND_CONFIRM`, or `REASON_REQUIRED`.
- `Feedback`: `ALERT`, `INLINE`, `NOTICE`, `TOAST`, `SILENT`, or `CONSOLE_ONLY`.
- `Refresh`: `LOCAL_STATE`, `CACHE_INVALIDATION`, `REFETCH`, `ROUTER_REFRESH`, `RELOAD`, `REDIRECT`, or `NONE`.
- `Migration`: `STABLE`, `MIGRATION_PENDING`, `LEGACY_COMPAT`, `DO_NOT_EXTEND`, or `DEPRECATED`.

## Action Registry

| Action ID | Name / domain | Types | Entry / UI handler | Action root / persistence | Pending / idempotency | Confirmation | Feedback / refresh | Permission / audit | Risk | Current owner | Target owner | Migration |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ACTION.AUTH.LOGIN` | Login | NAVIGATION, UPDATE | `app/login/page.tsx` / submit | `/api/auth/login` / auth session | SERVER_IDEMPOTENCY | NO_CONFIRM_REQUIRED | INLINE / REDIRECT | auth / audit log | MEDIUM | auth route | auth service | STABLE |
| `ACTION.AUTH.LOGOUT` | Logout | NAVIGATION, UPDATE | `components/app-layout.tsx`, `account-center.tsx` | `/api/auth/logout` | NONE | NO_CONFIRM_REQUIRED | NOTICE / REDIRECT | auth / audit log | LOW | shared auth UI | auth service | STABLE |
| `ACTION.ACCOUNT.SAVE` | Account create/update | CREATE, UPDATE | `app/accounts/page.tsx` / `saveAccount` | `/api/accounts`, `/api/accounts/[id]` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | NOTICE / REFETCH | accounts permission / audit log | HIGH | accounts API | account service | STABLE |
| `ACTION.ACCOUNT.SECURITY` | Account security | UPDATE, DESTRUCTIVE | `app/accounts/page.tsx` / `accountSecurity` | `/api/accounts/[id]/security` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | NOTICE / REFETCH | accounts permission / audit log | HIGH | security API | account security service | STABLE |
| `ACTION.PASSWORD.CHANGE` | Password change | UPDATE | Account Center, Security | `/api/auth/change-password` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | NOTICE / REDIRECT | auth / audit log | HIGH | auth route | auth service | STABLE |
| `ACTION.PROPERTY.SAVE` | Property create/update | CREATE, UPDATE | property pages / submit | `saveBusinessData` -> `/api/business-data` -> `properties` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE + CACHE_INVALIDATION | properties permission | MEDIUM | generic business-data root | property action service | MIGRATION_PENDING |
| `ACTION.PROPERTY.ARCHIVE` | Property archive/restore | LIFECYCLE, UPDATE | `app/properties/[id]/page.tsx` | `saveBusinessData` -> `properties` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM for archive; NO_CONFIRM_REQUIRED for restore | ALERT / LOCAL_STATE + CACHE_INVALIDATION | archive permission | HIGH | property page | property lifecycle service | MIGRATION_PENDING |
| `ACTION.PROPERTY.DELETE` | Empty property delete | DESTRUCTIVE | property detail | `saveBusinessData` -> `properties` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / REDIRECT | delete permission + relation guard | HIGH | property page | destructive action service | MIGRATION_PENDING |
| `ACTION.ROOM.SAVE` | Room create/update | CREATE, UPDATE | `app/rooms/page.tsx` | `saveBusinessData` -> `rooms` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE + CACHE_INVALIDATION | rooms permission | MEDIUM | room page | room action service | MIGRATION_PENDING |
| `ACTION.ROOM.SET_VACANT` | Set room vacant | LIFECYCLE, UPDATE | `app/rooms/page.tsx` / `setVacant` | sequential `saveBusinessData` for room, tenant, contract | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | rooms/tenant permissions | HIGH | room page | lifecycle action service | MIGRATION_PENDING |
| `ACTION.ROOM.DELETE` | Empty room delete | DESTRUCTIVE | `app/rooms/page.tsx` | `saveBusinessData` -> `rooms` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | delete permission + relation guard | HIGH | room page | destructive action service | MIGRATION_PENDING |
| `ACTION.TENANT.SAVE` | Tenant create/update | CREATE, UPDATE | `app/tenants/page.tsx` | `saveBusinessData` -> `tenants` and related records | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE + CACHE_INVALIDATION | tenant permission | HIGH | tenant page | tenant action service | MIGRATION_PENDING |
| `ACTION.CHECK_IN.CREATE` | Atomic check-in | CREATE, FINANCIAL, LIFECYCLE | `app/check-in/page.tsx` / submit | `/api/check-in` -> `create_atomic_check_in` RPC; optional contact update | CLIENT_REQUEST_ID + UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT/status / cache invalidation | check-in + tenant/room/payment/deposit permissions | HIGH | check-in API/RPC | check-in action root | STABLE |
| `ACTION.MOVE_ROOM.UPDATE` | Move current tenant room | UPDATE, LIFECYCLE | tenant/property detail | `lib/tenant-room-move.ts` -> `/api/tenants/move-room` -> RPC | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE | tenant/room permissions | HIGH | move-room RPC | tenant assignment service | STABLE |
| `ACTION.TENANT.MOVE_OUT` | Move out | LIFECYCLE, FINANCIAL | Tenant Detail / `moveOut` | `buildTenantMoveOutPlan` -> repeated `saveBusinessData` for tenant/room/contract/deposit | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | archive permission | HIGH | tenant page | lifecycle action service/RPC | MIGRATION_PENDING |
| `ACTION.TENANT.ARCHIVE` | Tenant archive/restore | LIFECYCLE, UPDATE | Tenant Detail | `persistAll` -> `tenants` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM for archive; NO_CONFIRM_REQUIRED for restore | ALERT / LOCAL_STATE | archive permission | HIGH | tenant page | tenant lifecycle service | MIGRATION_PENDING |
| `ACTION.TENANT.DELETE` | Empty tenant delete | DESTRUCTIVE | Tenant Detail | `business-data` + tenant delete check | UI_PENDING_GUARD | TYPED_CONFIRM | ALERT / LOCAL_STATE | delete permission + empty-shell guard | HIGH | tenant page/API | destructive action service | MIGRATION_PENDING |
| `ACTION.DEBT.WAIVE` | Waive rent collection | FINANCIAL, UPDATE | Tenant and Reminder pages | `/api/rent-collection` -> audit log | UI_PENDING_GUARD; SERVER_IDEMPOTENCY via audit duplicate check | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE + cache invalidation | rent payment edit permission + property access + audit | HIGH | rent-collection API | financial action service | MIGRATION_PENDING |
| `ACTION.RENT_PAYMENT.SAVE` | Rent/payment save | CREATE, UPDATE, FINANCIAL | Rent Payments, Tenant Detail | `saveBusinessData` -> `rent_payments`, optional deposit/tenant updates | UI_PENDING_GUARD; no action-level key | NO_CONFIRM_REQUIRED | ALERT / core local state + targeted side-effect refresh | payment permission | HIGH | payment pages + generic root | rent payment action service | MIGRATION_PENDING |
| `ACTION.RENT_PAYMENT.VOID` | Void payment | UPDATE, FINANCIAL, DESTRUCTIVE | Rent Payments | `saveBusinessData` marking void | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | archive permission | HIGH | payment page | financial action service | MIGRATION_PENDING |
| `ACTION.RENT_PAYMENT.DELETE` | Delete payment | DESTRUCTIVE, FINANCIAL | Rent Payments | file delete + `saveBusinessData` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | delete permission | HIGH | payment page | destructive action service | MIGRATION_PENDING |
| `ACTION.DEPOSIT.SAVE` | Deposit create/update/status | CREATE, UPDATE, FINANCIAL | Deposit pages, Tenant Detail | `saveBusinessData` -> `deposits` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE + refresh verification | deposit permission | HIGH | deposit pages | deposit action service | MIGRATION_PENDING |
| `ACTION.DEPOSIT.DELETE` | Void/delete deposit | FINANCIAL, DESTRUCTIVE | Deposit page | `saveBusinessData` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | archive/delete permission | HIGH | deposit page | destructive action service | MIGRATION_PENDING |
| `ACTION.EXPENSE.SAVE` | Expense create/update | CREATE, UPDATE, FINANCIAL | Expenses, Property Detail | `saveBusinessData` -> `expenses` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE + CACHE_INVALIDATION | expense permission | HIGH | expense pages | expense action service | MIGRATION_PENDING |
| `ACTION.EXPENSE.VOID_DELETE` | Void/delete expense | FINANCIAL, DESTRUCTIVE | Expenses | `saveBusinessData` plus files | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | archive/delete permission | HIGH | expense page | financial destructive service | MIGRATION_PENDING |
| `ACTION.ATTACHMENT.UPLOAD` | Upload attachment | CREATE, DATA_ADMIN | detail pages / `AttachmentAddControl` | prepare/complete storage APIs | upload state; provider ticket | NO_CONFIRM_REQUIRED | ALERT/progress / LOCAL_STATE + refetch | attachment permissions | MEDIUM | file APIs | attachment service | STABLE |
| `ACTION.ATTACHMENT.DELETE` | Delete attachment | DESTRUCTIVE | detail pages | provider delete API | UI_PENDING_GUARD | SIMPLE_CONFIRM | ALERT / LOCAL_STATE | attachment delete permission | HIGH | file APIs + page | attachment service | MIGRATION_PENDING |
| `ACTION.ADMIN_ATTACHMENT_CLEANUP.RUN` | Bulk attachment cleanup | DESTRUCTIVE, DATA_ADMIN, BULK | Admin Attachments | `/api/admin/attachments/cleanup` | cleaning guard | PREVIEW_AND_CONFIRM | INLINE/report / REFETCH | sensitive permission + audit | HIGH | admin cleanup API | cleanup service | STABLE |
| `ACTION.GOOGLE_ATTACHMENT_MIGRATION.RUN` | Google attachment migration | DATA_ADMIN, BULK | Admin Migration | scan token -> migration API | running guard + preview token | PREVIEW_AND_CONFIRM | INLINE/report / REFETCH | admin permission | HIGH | migration API | migration service | STABLE |
| `ACTION.TASK.SAVE` | Task create/update | CREATE, UPDATE | Tasks | Server Task Repository or legacy `CrudPage` | UI_PENDING_GUARD + server idempotency for create | NO_CONFIRM_REQUIRED | INLINE / LOCAL_STATE | tasks permission | MEDIUM | dual task owners | task service | LEGACY_COMPAT |
| `ACTION.TASK.DELETE` | Task delete | DESTRUCTIVE | Tasks | `/api/tasks/server` or generic root | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | INLINE / LOCAL_STATE | tasks delete permission | HIGH | dual task owners | task service | MIGRATION_PENDING |
| `ACTION.PARTNER.SAVE` | Partner create/update/disable/delete | CREATE, UPDATE, DESTRUCTIVE | Partners | `/api/partners/*` | working guard | CONSEQUENCE_CONFIRM for disable/delete | INLINE / REFETCH | settings/account permissions + audit | HIGH | partners API | partner service | STABLE |
| `ACTION.PARTNER_SHARE.SAVE` | Share plan save/cancel/adjust | CREATE, UPDATE, DESTRUCTIVE, FINANCIAL | Partners | `/api/partners/shares` | working guard | CONSEQUENCE_CONFIRM for cancel/adjust | INLINE / REFETCH | sensitive partner permission + audit | HIGH | partner share API | partner share service | STABLE |
| `ACTION.SETTLEMENT.CONFIRM` | Settlement snapshot | CREATE, FINANCIAL, BULK | Settlement page | loop of `/api/partner-settlements` | busy guard; no batch key | CONSEQUENCE_CONFIRM | INLINE / LOCAL_STATE | owner/sensitive permission | HIGH | settlement page/API | settlement batch service | PARTIAL_SUCCESS_RISK |
| `ACTION.SETTLEMENT.REVERSE` | Settlement reversal | UPDATE, FINANCIAL, DESTRUCTIVE | Settlement Detail / `reverse` | `/api/partner-settlements/[id]` -> `reverse_partner_settlement` RPC | busy not explicit in handler | REASON_REQUIRED | INLINE / LOCAL_STATE | owner/sensitive permission + API audit boundary | HIGH | reversal API | settlement reversal service | STABLE |
| `ACTION.DATA.BACKUP` | Backup/export | DATA_ADMIN | Data Center | `/api/data-backup`, export builders | backup state machine | NO_CONFIRM_REQUIRED | INLINE/status / download | sensitive export permission | HIGH | data center/API | backup service | STABLE |
| `ACTION.DATA.RESTORE` | Restore workspace | DATA_ADMIN, DESTRUCTIVE, BULK | Data Center | dry-run + `/api/data-restore` -> restore RPC | restoring guard + before-restore backup | PREVIEW_AND_CONFIRM | INLINE/report / reload or state reset | owner/sensitive permission + diagnostics | HIGH | restore API/RPC | restore service | STABLE |
| `ACTION.VIEWING_APPOINTMENT.SAVE` | Viewing appointment create/update | CREATE, UPDATE | Viewing Appointments | `saveBusinessData` | UI_PENDING_GUARD | NO_CONFIRM_REQUIRED | ALERT / LOCAL_STATE | viewing permission | MEDIUM | appointment page | appointment service | MIGRATION_PENDING |
| `ACTION.VIEWING_APPOINTMENT.DELETE` | Delete viewing appointment | DESTRUCTIVE | Viewing Appointments | `saveBusinessData` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE | delete permission | HIGH | appointment page | appointment service | MIGRATION_PENDING |

## High-risk register

The following remain explicitly registered as `PARTIAL_SUCCESS_RISK` until a future action-root migration proves otherwise:

- `ACTION.TENANT.MOVE_OUT`: tenant, room, contract and deposit writes are currently orchestrated through repeated `saveBusinessData` calls.
- `ACTION.RENT_PAYMENT.SAVE`: payment, optional deposit, tenant rent update and attachments can complete in separate steps.
- `ACTION.SETTLEMENT.CONFIRM`: multi-property confirmation is a loop of independent POST requests without a batch-level idempotency key.

Additional known gaps:

- `PROPERTY_NOTES`: local state may lead the server and failure can be console-only (`USER_VISIBLE_ERROR_GAP`).
- `DEBT_WAIVER`: server duplicate detection exists and the tenant page now has a payment-specific pending/disabled guard (`CLIENT_PENDING_GAP = RESOLVED`).

These are registration facts; the Debt Waiver client guard was hardened in 3.2a and the Rent Payment core/side-effect feedback boundary was hardened in 3.2b.

## Financial Action Safety Matrix (3.2a)

| Action ID | Core write | Side effects | Pending / duplicate guard | Server idempotency | Atomicity | Partial-success status | Confirmation | Visible error | Refresh / audit |
|---|---|---|---|---|---|---|---|---|---|
| `ACTION.RENT_PAYMENT.SAVE` | `rent_payments` via `saveBusinessData` | optional linked deposit, tenant monthly rent, attachment upload | shared `saving`; no action-level request key | none proven (`RENT_PAYMENT_SERVER_IDEMPOTENCY_PENDING`) | NON_ATOMIC | `PARTIAL_SUCCESS_RISK`; core success is reported separately from side-effect failure | NO_CONFIRM_REQUIRED | visible full/partial/core-failure alerts | core payment local state first; targeted deposit/tenant refresh on side-effect failure |
| `ACTION.EXPENSE.SAVE` | one `expenses` collection write | optional attachment upload | shared `saving` | none proven | NON_ATOMIC | attachment failure is explicitly reported after core success | NO_CONFIRM_REQUIRED | ALERT | local state; file refresh is separate |
| `ACTION.DEPOSIT.SAVE` | one `deposits` collection write | none in the simple deposit page; tenant detail status update has final-state verification | shared `saving` | none proven | NON_ATOMIC | no cross-table transaction in the simple record path | NO_CONFIRM_REQUIRED | ALERT | refetch/final-state verification in tenant-detail status path |
| `ACTION.DEBT.WAIVE` | append-only audit log through `/api/rent-collection` | derived debt/reminder presentation changes | tenant payment-specific pending/disabled guard; server audit duplicate check | SERVER_IDEMPOTENCY via audit duplicate check | ATOMIC at the single audit action boundary | none proven for the single action | CONSEQUENCE_CONFIRM | ALERT | local waived-payment state plus server audit |
| `ACTION.SETTLEMENT.CONFIRM` | one `confirm_partner_settlement` RPC per property | batch UI state and snapshot list | page `busy`; no batch key | no batch idempotency key | NON_ATOMIC | `PARTIAL_SUCCESS_RISK` | CONSEQUENCE_CONFIRM | INLINE message | local batch state; each RPC creates its own snapshot |
| `ACTION.SETTLEMENT.REVERSE` | one `reverse_partner_settlement` RPC | reversal metadata and snapshot status | no explicit action-level client key; button requires reason | single RPC boundary; server idempotency not separately proven | UNKNOWN | no separate batch loop | REASON_REQUIRED | INLINE message | local snapshot state; RPC/audit boundary |

### Financial recommendations

- `RENT_PAYMENT_TRANSACTION_RECOMMENDATION`: keep the current core-payment-first behavior in 3.2a. Treat the payment record as the core financial write and linked deposit, tenant monthly-rent update and attachments as explicitly reported side effects. A future atomic boundary should be designed around payment plus any required linked deposit/tenant facts; it requires a separate transaction/API decision and is not implemented here.
- `SETTLEMENT_TRANSACTION_RECOMMENDATION`: prefer **A. keep per-property settlement writes with a stable batch idempotency design** as the next investigation. Current evidence shows one RPC per property and no batch key; true atomic multi-property settlement would require a new server transaction/RPC. No redesign is implemented here.
- Deposit status update is the `FINANCIAL_ACTION_REFERENCE_PATTERN`: retain its pending, save, refetch and final-state verification behavior for simple status mutations, without applying it to multi-record payment or settlement transactions.
- Expense remains `NO_TRANSACTION_REFACTOR_REQUIRED` for 3.2a: its core write is one business record collection and optional attachments are already reported separately.

## Rent Payment Action Root (3.2b)

`ACTION.RENT_PAYMENT.SAVE` has one current UI Action Root in `app/rent-payments/page.tsx`.
The page owns presentation validation and the existing shared `saving` pending guard;
`saveBusinessData` remains the generic persistence boundary. No second payment writer,
RPC, schema change or server idempotency key was introduced in 3.2b.

### Core and side-effect contract

- `CORE_ACTION`: save the `rent_payments` collection and confirm the core write.
- `SIDE_EFFECTS`: linked deposit persistence, tenant monthly-rent persistence and optional
  attachment uploads. Cache invalidation performed by `saveBusinessData` and targeted
  recovery reads are consistency work, not additional payment records.
- Core failure stops dependent side effects and keeps the form available for retry.
- After core success, the payment list is updated before side effects run. A side-effect
  failure never reports the core payment as failed and never asks the user to resubmit the
  whole payment form.
- Deposit or tenant-update failure attempts a targeted authoritative refresh of that
  collection. Attachment failure preserves any files that did upload and reports the
  attachment step separately.

### Outcome contract

- `FULL_SUCCESS`: core payment and all requested side effects complete; show `收款保存成功。`.
- `CORE_SUCCESS_WITH_SIDE_EFFECT_FAILURE`: core payment is retained and visible; show the
  failed side-effect categories and explicitly tell the user not to resubmit the payment.
- `CORE_FAILURE`: no dependent payment side effects run; show `收款未保存，请重试。` and
  keep the form open.

`RENT_PAYMENT_SERVER_IDEMPOTENCY_PENDING` remains active: the existing UI `saving` guard
prevents local duplicate submit, but the generic business-data API does not prove a
server-side request key or database idempotency constraint. True retry of a failed
side-effect is therefore a separate action decision and must not recreate the core payment.

## Safety contract

- CREATE/UPDATE requires pending state, duplicate-submit protection, visible error feedback and deterministic success state.
- FINANCIAL additionally requires explicit write scope, idempotency strategy, partial-success semantics, refresh/invalidation and auditability.
- LIFECYCLE additionally requires preconditions, affected-domain inventory, transaction or compensation strategy and deterministic final state.
- DESTRUCTIVE additionally requires consequence-aware confirmation, permission, pending lock, visible failure, auditability and recovery/irreversibility classification.
- DATA_ADMIN requires preview/dry-run where applicable, confirmation, backup/rollback semantics, a report and explicit partial-success semantics.
- `UI_PENDING_GUARD` is not idempotency. Only a client request key, server idempotency, or database constraint qualifies as idempotency.
- `CONSOLE_ONLY` must never be the only user-facing error path for a new mutation.

## Legacy and duplicate owner register

| Owner | Status | Rule |
|---|---|---|
| `CrudPage` vs `TasksServerManager` | LEGACY_COMPAT / MIGRATION_PENDING | Keep the compatibility path working; do not extend the legacy task writer. |
| `business-*` vs `v1-*` resource keys | LEGACY_COMPAT / DO_NOT_EXTEND | Keep existing compatibility reads/writes; new resources use the current business key. |
| Page-level payload orchestration | MIGRATION_PENDING | Multiple entries may call one shared API, but new cross-table sequences must be added to this registry and target a shared Action Root. |

## Frozen parallel contract

This Action contract is independent from the responsive contract. It must not change:

- Phone `<=640px`, Medium `641–1100px`, Desktop `>=1101px`;
- navigation, safe-area, modal, table/chart scroll ownership;
- Tenant List three-row/five-slot contract;
- BUG-01 selector ownership;
- DebtCase, RentPeriodState, Reminder Engine, database, schema, RLS, permissions or real data.
