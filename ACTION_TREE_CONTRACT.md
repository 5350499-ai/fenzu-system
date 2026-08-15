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
| `ACTION.TENANT.MOVE_OUT` | Move out | LIFECYCLE, FINANCIAL | Tenant Detail / `moveOut` | `/api/tenants/move-out` -> `move_out_tenant_atomic` | UI_PENDING_GUARD; final-state replay | CONSEQUENCE_CONFIRM | ALERT / REFETCH + CACHE_INVALIDATION | archive permission | HIGH | server lifecycle RPC | `move_out_tenant_atomic` | COMPLETE |
| `ACTION.TENANT.ARCHIVE` | Tenant archive/restore | LIFECYCLE, UPDATE | Tenant Detail | `persistAll` -> `tenants` | UI_PENDING_GUARD | CONSEQUENCE_CONFIRM for archive; NO_CONFIRM_REQUIRED for restore | ALERT / LOCAL_STATE | archive permission | HIGH | tenant page | tenant lifecycle service | MIGRATION_PENDING |
| `ACTION.TENANT.DELETE` | Empty tenant delete | DESTRUCTIVE | Tenant Detail | `business-data` + tenant delete check | UI_PENDING_GUARD | TYPED_CONFIRM | ALERT / LOCAL_STATE | delete permission + empty-shell guard | HIGH | tenant page/API | destructive action service | MIGRATION_PENDING |
| `ACTION.DEBT.WAIVE` | Waive rent collection | FINANCIAL, UPDATE | Tenant and Reminder pages | `/api/rent-collection` -> audit log | UI_PENDING_GUARD; SERVER_IDEMPOTENCY via audit duplicate check | CONSEQUENCE_CONFIRM | ALERT / LOCAL_STATE + cache invalidation | rent payment edit permission + property access + audit | HIGH | rent-collection API | financial action service | MIGRATION_PENDING |
| `ACTION.RENT_PAYMENT.SAVE` | Rent/payment save | CREATE, UPDATE, FINANCIAL | Rent Payments, Tenant Detail | `saveBusinessData` -> `/api/business-data` -> `rent_payments` | UI_PENDING_GUARD; workspace-scoped persisted `client_request_id` | NO_CONFIRM_REQUIRED | ALERT / core local state + targeted side-effect refresh | payment permission | HIGH | generic root + database identity | persisted payment identity | COMPLETE |
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
| `ACTION.SETTLEMENT.CONFIRM` | Settlement snapshot | CREATE, FINANCIAL, BULK | Settlement page | one client batch execution grouping independent `/api/partner-settlements` calls | `SETTLEMENT_CLIENT_PENDING_GUARD`; client batch UUID; no server batch key | CONSEQUENCE_CONFIRM | INLINE per-property result / local state | owner/sensitive permission | HIGH | settlement page/API | settlement batch service | PARTIAL_SUCCESS_RISK |
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

- `PROPERTY_NOTES`: user-visible failure and stale optimistic state were hardened in the 3.x closeout (`PROPERTY_NOTES_USER_VISIBLE_FAILURE_FIXED`).
- `DEBT_WAIVER`: server duplicate detection exists and the tenant page now has a payment-specific pending/disabled guard (`CLIENT_PENDING_GAP = RESOLVED`).

These are registration facts; the Debt Waiver client guard was hardened in 3.2a and the Rent Payment core/side-effect feedback boundary was hardened in 3.2b.

## Lifecycle Action Root (3.3a)

Lifecycle actions are classified by their authoritative business boundary, not by
the number of UI buttons that expose them. Pages may collect input, confirm a
consequence and display pending state; the API/RPC or registered action root owns
authorization, preconditions, cross-record ordering and the final lifecycle fact.

| Action | Current boundary | Atomicity | Risk / status | Contract result |
|---|---|---|---|---|
| `ACTION.CHECK_IN.CREATE` | `/api/check-in` -> `create_atomic_check_in` RPC; optional contact update is separate | ATOMIC core + side effect | HIGH / NO_CHANGE_REQUIRED | `clientRequestId`, submit lock, disabled state and visible contact-side-effect warning remain required. Core failure stops dependent client work. |
| `ACTION.MOVE_ROOM.UPDATE` | `/api/tenants/move-room` -> `update_tenant_current_assignment` RPC | ATOMIC | HIGH / NO_CHANGE_REQUIRED | One server boundary owns tenant assignment and room occupancy; no second page writer is registered. |
| `ACTION.ROOM.SET_VACANT` | Rooms page sequentially persists room, tenant and contract snapshots | NON_ATOMIC | HIGH / SAFE_TO_HARDEN_LATER | Existing saving guard and consequence confirmation remain; cross-record transaction migration is out of 3.3a scope. |
| `ACTION.TENANT.ARCHIVE` | Tenant page `persistAll` for tenant archive state | NON_ATOMIC for the page persistence boundary | HIGH / NO_CHANGE_REQUIRED | Archive is presentation-only and preserves business history; restore is reversible and needs no destructive confirmation. |
| `ACTION.PROPERTY.ARCHIVE` | Property Detail `saveBusinessData` note marker | NON_ATOMIC | HIGH / SAFE_TO_HARDEN | Property lifecycle actions now have a dedicated client lock and disabled controls; no business semantics changed. |
| `ACTION.TENANT.DELETE` / property/room delete | permission + relation/empty-shell checks, then generic business writer | NON_ATOMIC | HIGH / NO_CHANGE_REQUIRED | Permanent deletion remains a destructive boundary and is not part of lifecycle migration. |
| `ACTION.TENANT.MOVE_OUT` | historical client plan; superseded by `move_out_tenant_atomic` | ATOMIC | CLOSED / BETA_2A | RPC owns lifecycle transaction; UI refresh follows commit. |

### Lifecycle confirmation decisions

- Archive: `CONSEQUENCE_CONFIRM` because it changes visibility/management state but preserves history.
- Restore: `NO_CONFIRM_REQUIRED / REVERSIBLE`; it restores the lifecycle presentation state without deleting, overwriting or creating financial facts.
- Permanent delete: `TYPED_CONFIRM` or `CONSEQUENCE_CONFIRM` with permission and relation protection; this remains a Destructive Action boundary for 3.4.

### Move Out boundary for 3.3b

`buildTenantMoveOutPlan` derives the lifecycle facts for tenant, room, contract and
deposit. The current Move Out plan passes those four collections to `persistAll`,
which writes them sequentially in the order tenants, rooms, contracts, deposits
(the generic helper also supports payments, but Move Out does not currently pass
that collection). A failure can leave earlier writes committed while the UI keeps
the detail open only when `persistAll` returns false; the current flow still has a
`UI_STATE_DIVERGENCE_RISK` around partial success and refresh/close semantics. No client request id or server Move Out
idempotency key is proven, and no existing Move Out RPC was found. Move Out is
therefore explicitly deferred to 3.3b.

Recommendation: `MOVE_OUT_RECOMMENDATION_B` — first establish a server-side Move
Out action root that owns validation, ordering, result reporting and retry-safe
reconciliation; only then decide whether a new atomic RPC/transaction is needed.
Do not begin with a client-only whole-batch retry.

## Move Out Action Root (3.3b)

### Current contract

The active owner remains the Tenant Detail page:

```text
Tenant Detail / moveOut
  -> buildTenantMoveOutPlan
  -> client submission guard
  -> persistAll
  -> saveBusinessData(tenants)
  -> saveBusinessData(rooms)
  -> saveBusinessData(contracts)
  -> saveBusinessData(deposits)
  -> local state update
  -> deposit reload and success feedback
```

`/api/business-data` is a generic snapshot-diff persistence endpoint. It is not a
Move Out domain Action Root: it accepts client-built operations, performs a
separate lookup/permission/write path per operation, and has no Move Out request
identity or durable idempotency record. The client guard prevents concurrent
clicks in one browser, but it is not server idempotency.

The current boundary is therefore unchanged:

- `ATOMICITY`: `NON_ATOMIC`.
- `PARTIAL_SUCCESS`: `PARTIAL_SUCCESS_RISK`.
- `UI_STATE_DIVERGENCE_RISK`: remains registered; earlier resource writes can
  remain committed when a later `persistAll` write fails.
- `SERVER_IDEMPOTENCY`: `SERVER_PERSISTENT_IDEMPOTENCY_PENDING`.
- `CLIENT_REQUEST_ID`: not present for the current Move Out action.
- `CLIENT_PENDING`: existing `createMoveOutSubmissionGuard` plus `saving`.

The current implementation does not add rent payment, debt, reminder,
attachment, settlement or audit-log mutations to the Move Out plan. Those remain
separate Action Roots and are not implicitly included in this contract.

### 3.3b target boundary (design only)

The safe target is `MOVE_OUT_RECOMMENDATION_B`:

```text
Tenant Detail
  -> Move Out command
  -> POST /api/tenants/move-out (proposed; not implemented)
  -> shared server Move Out service (proposed; not implemented)
  -> authoritative validation and permission
  -> existing persistence primitives
  -> structured step results
  -> targeted refresh
  -> full/partial/failure feedback
```

The proposed request contains only authoritative inputs: tenant identity,
move-out date, deposit decision, expected assignment identity when required by
the existing rules, and one stable `clientRequestId`. The client must not send a
complete replacement snapshot for tenant, room, contract or deposit.

The proposed result has three batch states:

- `MOVE_OUT_FULL_SUCCESS`: all required lifecycle facts succeeded.
- `MOVE_OUT_PARTIAL_SUCCESS`: at least one fact succeeded and at least one fact
  failed or was not attempted; each step is explicitly `SUCCESS`, `FAILED` or
  `NOT_ATTEMPTED`.
- `MOVE_OUT_FULL_FAILURE`: no lifecycle fact succeeded.

The proposed step set is `TENANT`, `ROOM`, `CONTRACT` and `DEPOSIT`. The current
client order is preserved as evidence, not as a guarantee for a future server
orchestrator. Before implementation, the dependency policy must be decided for
each failure: a tenant failure is `FAIL_FAST`; room/contract/deposit continuation
cannot be declared safe without proving the existing lifecycle invariants and
must not be guessed. This is the implementation gate for the server root.

### Implementation safety boundary

This phase is contract-only. A server root is not safely implementable by
calling the existing HTTP endpoint from the server or by duplicating its table
writes. Before production implementation, the repository must provide or
extract a server-callable persistence/domain function that preserves:

1. account and property authorization;
2. existing resource-key compatibility and row ownership checks;
3. current validation and `updatedAt`/version behavior;
4. the existing tenant, room, contract and deposit write semantics; and
5. a durable idempotency boundary for `clientRequestId`.

The repository currently proves none of those as one reusable Move Out service
with persistent request replay. No schema, RPC, migration or production route
was added in 3.3b. The next implementation review must therefore decide the
shared server persistence extraction and whether an atomic RPC is needed; it
must not silently promote the current non-atomic client sequence to an atomic
claim.

### Move Out invariants

The following are frozen for any future implementation and are enforced by the
contract tests: move-out date meaning; tenant lifecycle status; room occupancy;
contract end-date/status; deposit status; historical payments/contracts/deposits;
DebtCase; Reminder Engine; RentPeriodState; financial calculations;
archive/restore semantics; permissions; and one-effect-per-user-submission.

### Refresh and feedback target

After a successful server result, the client must refresh the authoritative
tenant, room, contract and deposit facts (and only their known derived views),
then close/update the Move Out UI. Partial success must keep the UI open or in a
recoverable result state, refresh the successful facts, identify failed and
unattempted steps, and must not invite a whole-form resubmission. Full failure
must keep the flow recoverable and visibly explain that no Move Out fact was
confirmed. These are target contracts, not claims about the current page.

`MOVE_OUT_ATOMIC_RPC_NOT_REQUIRED_YET` is the current design conclusion: first
establish the server Action Root and its durable idempotency/result contract;
only then decide whether the lifecycle facts require a separate transaction or
RPC. No atomic RPC is created by 3.3b.

## Financial Action Safety Matrix (3.2a)

| Action ID | Core write | Side effects | Pending / duplicate guard | Server idempotency | Atomicity | Partial-success status | Confirmation | Visible error | Refresh / audit |
|---|---|---|---|---|---|---|---|---|---|
| `ACTION.RENT_PAYMENT.SAVE` | `rent_payments` via `saveBusinessData` | optional linked deposit, tenant monthly rent, attachment upload | shared `saving`; persisted `client_request_id` | workspace unique identity (`RENT_PAYMENT_SERVER_IDEMPOTENCY_CLOSED`) | CORE_WRITE_IDEMPOTENT / side effects separate | `PARTIAL_SUCCESS_RISK`; core success is reported separately from side-effect failure | NO_CONFIRM_REQUIRED | visible full/partial/core-failure alerts | core payment local state first; targeted deposit/tenant refresh on side-effect failure |
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

## Settlement Action Root (3.2c)

`ACTION.SETTLEMENT.CONFIRM` has one current UI Action Root in
`app/partnership-settlement/page.tsx`. The page owns local trial/build,
presentation validation, confirmation and one shared pending guard; each property
is persisted through the existing `/api/partner-settlements` endpoint and the
existing `confirm_partner_settlement` RPC.

### Batch and transaction contract

- `ONE_USER_BATCH_ACTION`: one user confirmation over the selected property IDs,
  date range and trial result.
- `MULTIPLE_INDEPENDENT_PROPERTY_TRANSACTIONS`: each property POST/RPC commits
  independently. No schema, RPC or amount-calculation change was made in 3.2c.
- The client creates a UUID `clientBatchId` only to group this execution and its
  displayed result; it is not a server idempotency key.
- The database exclusion constraint protects confirmed overlapping periods for the
  same workspace/property, but does not provide batch request deduplication.

### Result state machine

Each selected property is tracked as exactly one of `SUCCESS`, `FAILED` or
`NOT_ATTEMPTED`. The batch outcome is one of:

- `BATCH_FULL_SUCCESS`: every property succeeded.
- `BATCH_PARTIAL_SUCCESS`: at least one succeeded and at least one failed or was not attempted.
- `BATCH_FULL_FAILURE`: no property succeeded.

Independent properties continue after an individual failure, so later properties
are not incorrectly marked failed. A successful property is appended to local
settlement state immediately and is never removed because a later property fails.

### Recovery and feedback

Partial feedback lists successful and unfinished properties and explicitly tells
the user not to resubmit successful properties. Safe recovery is manual selection
of only failed/not-attempted properties; there is no automatic whole-batch retry.
`SETTLEMENT_BATCH_SERVER_IDEMPOTENCY_PENDING` remains active because the server
does not accept or persist the client batch UUID. The property-period exclusion
rejects duplicate confirmed overlap, but is conflict protection rather than a
complete batch idempotency contract.

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

## Action Tree Governance Closeout (3.x)

This section is the final 3.x governance closeout. It locks the remaining
low-risk contracts without claiming that deferred transaction/idempotency work
is complete.

### Confirmation Policy

| Level | Meaning | Contract |
|---|---|---|
| `LEVEL_0` | Navigation and UI state | No confirmation |
| `LEVEL_1` | Ordinary reversible create/update | No confirmation by default |
| `LEVEL_2` | Lifecycle or financial consequence | Explicit consequence confirmation where required |
| `LEVEL_3` | Destructive, overwrite or irreversible action | Explicit consequence/typed confirmation |
| `LEVEL_4` | High-risk data administration | Preview/dry-run plus explicit confirmation |

Archive and restore remain separate from destructive actions. Restore is
`NO_CONFIRM_REQUIRED / REVERSIBLE` while it only restores lifecycle visibility
and does not overwrite or recreate financial facts.

### Destructive Action Contract

Tenant/property/room permanent delete, payment/expense void or delete, deposit
delete, attachment delete, partner destructive operations, account destructive
operations, task delete and restore/overwrite operations must each have a
permission boundary, consequence-aware confirmation, pending protection,
visible failure, authoritative refresh and an explicit recovery or
irreversibility classification. Existing relation guards and typed confirmation
remain the owner for permanent tenant/property/room deletion. This contract
does not add a second confirmation UI or alter business semantics.

### Data Admin Action Root

Data Restore is `DATA_RESTORE_NO_CHANGE_REQUIRED`: it retains permission checks,
dry-run validation, before-restore backup, restore RPC, consistency validation,
structured report and rollback/unchanged reporting. Attachment cleanup requires
managed-account/sensitive permission, explicit confirmation, an auditable report
and per-item failure details. Google attachment migration requires a signed
preview token, feature flag, confirmation modal, progress/result report and
per-item outcomes. These roots are not reimplemented in 3.x.

### Attachment Action Root

Upload/prepare/complete failures remain distinct from the parent business write;
the established payment/expense partial-success feedback is preserved. Property,
tenant, rent-payment and expense attachment deletion have visible failure
feedback; rent-payment and expense deletion additionally use a local in-flight
guard, and a failed delete never removes the file from local state. Bulk cleanup
retains its preview/confirmation/report root.
`ATTACHMENT_DELETE_FEEDBACK_FIXED` is the current status.

### Feedback Contract

Mutation feedback uses semantic states rather than one mandatory visual control:
`SUCCESS`, `PARTIAL_SUCCESS`, `FAILURE`, `WARNING`, `PENDING`, represented by
`TOAST`, `INLINE`, `NOTICE`, `ALERT`, `MODAL_RESULT`, `PROGRESS` or
`STRUCTURED_REPORT`. A user-triggered write must not have `CONSOLE_ONLY` as its
only failure path. Partial success must identify completed and incomplete work;
destructive failure must be visible; retry guidance must not imply that a
successful core record should be submitted again.

`PROPERTY_NOTES_USER_VISIBLE_FAILURE_FIXED`: Property Notes now refetches the
authoritative property snapshot on the current request's failure and rolls back
to the prior value if that recovery read also fails. Stale failures from an
older keystroke cannot overwrite a newer request's state.

### Refresh / Cache Contract

| Refresh class | Owner rule |
|---|---|
| `LOCAL_STATE_ONLY` | Only when the server fact is already confirmed and no derived view is stale |
| `TARGETED_REFETCH` | Preferred for lifecycle/status confirmation and attachment lists |
| `CACHE_INVALIDATION` | Use the existing business-data dependency map after a confirmed write |
| `ROUTER_REFRESH` | Use only when the route is the established authoritative owner |
| `FULL_RELOAD_REQUIRED` | Reserved for existing data-admin restore/report reset behavior |

High-risk actions keep their existing owners: check-in RPC result plus targeted
cache invalidation; Deposit final-state refetch; Settlement per-property local
result and history refresh; Move Out's future refresh contract remains design-only.
No random full reload is introduced.

### Pending / double-submit Contract

Every governed mutation has one pending owner. Existing guards remain the
authority for Check-in, Move Out, Rent Payment, Debt Waiver, Settlement and
Property lifecycle. Attachment deletion now adds a local in-flight guard in the
Rent Payment and Expense roots while reusing their existing `saving` state;
Property and Tenant attachment roots retain their existing guarded callers.
No competing pending state or Enter-specific bypass is introduced.

### Idempotency Registry

| Action | Client pending | Client request ID | Server idempotency | DB constraint | Atomicity | Partial success | Retry policy |
|---|---|---|---|---|---|---|---|
| `ACTION.CHECK_IN.CREATE` | `UI_PENDING_GUARD` | `CLIENT_REQUEST_ID` | `IDEMPOTENT` via atomic RPC | request record | `ATOMIC` | not applicable to core | safe replay |
| `ACTION.TENANT.MOVE_OUT` | `UI_PENDING_GUARD` | none required; final-state replay | `MOVE_OUT_ATOMIC_TRANSACTION_CLOSED` | tenant row lock and workspace ownership | `ATOMIC_RPC` | no partial core state | return `alreadyMovedOut` |
| `ACTION.RENT_PAYMENT.SAVE` | `UI_PENDING_GUARD` | `client_request_id` | `RENT_PAYMENT_SERVER_IDEMPOTENCY_CLOSED` | `(user_id, client_request_id)` unique index | core write idempotent | side effects remain explicitly partial | same payload replays; changed payload conflicts |
| `ACTION.SETTLEMENT.CONFIRM` | `UI_PENDING_GUARD` | client batch grouping only | `BATCH_IDEMPOTENCY_PENDING` | property-period conflict only | `NON_ATOMIC` | `PARTIAL_SUCCESS_RISK` | retry failed/unattempted properties only |
| `ACTION.DEBT.WAIVE` | `UI_PENDING_GUARD` | none | `DB_CONSTRAINT_PROTECTED` by audit duplicate check | audit duplicate check | `ATOMIC` action boundary | none proven | safe duplicate rejection |
| `ACTION.MOVE_ROOM.UPDATE` | `UI_PENDING_GUARD` | none | `DB_CONSTRAINT_PROTECTED` by RPC transaction | RPC boundary | `ATOMIC` | not applicable | safe retry after authoritative refresh |
| `ACTION.DEPOSIT.SAVE` | `UI_PENDING_GUARD` | none | `UNKNOWN` | none proven | `NON_ATOMIC` | none in simple record path | refetch before retry |
| `ACTION.DATA.RESTORE` | restoring guard | operation/report identity | `DB_CONSTRAINT_PROTECTED` by restore transaction | restore RPC | `ATOMIC` restore import | explicit report | preview before retry |

Client disabled state is never treated as server idempotency. Settlement batch
idempotency remains deferred; Rent Payment and Move Out now have their own
server persistence/transaction boundaries documented above.

### Legacy / duplicate owner disposition

| Owner group | Disposition | Rule |
|---|---|---|
| `CrudPage` / `TasksServerManager` | `LEGACY_COMPATIBILITY` | Keep compatibility; do not extend the legacy writer |
| `business-*` / `v1-*` keys | `DATA_COMPATIBILITY_LAYER` | Preserve restore/read compatibility; new work uses current keys |
| Page-level payload orchestration | `MIGRATION_PENDING` | Existing paths remain; no new cross-table sequence may be added |
| Move Out page sequence | `GOVERNED_WITH_DEFERRED_RISK` | Do not add a second owner until server persistence/idempotency is proven |

### Final risk register

| Risk ID | Action | Risk | Current protection | Deferred reason | Future trigger | Guard |
|---|---|---|---|---|---|---|
| `RISK.MOVE_OUT.NON_ATOMIC` | Move Out | CLOSED | authenticated atomic RPC and transaction rollback | none for current scope | regression only | Move Out atomicity tests |
| `RISK.MOVE_OUT.IDEMPOTENCY` | Move Out | CLOSED | safe already-moved-out replay under locked tenant row | no separate request table; final-state conflict protection is sufficient | regression only | Move Out atomicity tests |
| `RISK.RENT_PAYMENT.IDEMPOTENCY` | Rent Payment | CLOSED | workspace-scoped persisted request identity and payload conflict check | historical rows intentionally remain nullable | regression only | rent-payment idempotency tests |
| `RISK.SETTLEMENT.BATCH_IDEMPOTENCY` | Settlement | P1 | property conflict protection and per-property result state | no batch server key | batch idempotency design | settlement tests |
| `RISK.PROPERTY_NOTES.FEEDBACK` | Property Notes | FIXED | refetch/rollback plus visible alert | none | regression only | action-tree test |
| `RISK.ATTACHMENT_DELETE.FEEDBACK` | Attachment delete | FIXED | visible error and local in-flight guard | none | regression only | attachment/action tests |

There are no active P0 risks. Remaining deferred P1 risks are explicit,
bounded and regression-protected; the Rent Payment and Move Out risks above
are closed by the Beta 2A write boundaries.

### 3.x closeout status

`ACTION_TREE_3X_COMPLETE_WITH_DEFERRED_RISKS`

`MOVE_OUT_3_3B_CONTRACT_ONLY` remains the historical pre-implementation status.

`FEATURE_PUBLIC_BETA_2A_WRITE_HARDENING_COMPLETE`

This status means ownership, safety contracts, feedback, refresh, pending,
idempotency and deferred risks are governed. It does not authorize Production
deployment or imply that Move Out, Rent Payment or Settlement have become
atomic/idempotent.

## FEATURE-PUBLIC-BETA.2A closeout

The following implementation supersedes the earlier deferred status for the two
authorized Beta blockers:

| Action | Current canonical boundary | Idempotency / atomicity | Status |
|---|---|---|---|
| `ACTION.RENT_PAYMENT.SAVE` | `saveBusinessData` -> `/api/business-data` -> `rent_payments` | `rent_payments.client_request_id` with workspace-scoped unique index; same payload replays, changed payload conflicts | `RENT_PAYMENT_SERVER_IDEMPOTENCY_CLOSED` |
| `ACTION.TENANT.MOVE_OUT` | `/api/tenants/move-out` -> `move_out_tenant_atomic` | One authenticated database transaction for tenant, active contract, room and current deposit state | `MOVE_OUT_ATOMIC_TRANSACTION_CLOSED` |

Existing rows without `client_request_id` remain valid. The new identity is
assigned only to newly created generic rent-payment writes; historical payment
semantics are not rewritten. Move Out retries return the current final state
with `alreadyMovedOut` and do not repeat lifecycle mutations.

Cache invalidation and consumer refresh occur after successful RPC completion;
they are intentionally outside the database transaction. No Reminder,
RentPeriodState, financial calculation, Partner/Settlement or attachment root
is included in the transaction.

## Frozen parallel contract

This Action contract is independent from the responsive contract. It must not change:

- Phone `<=640px`, Medium `641–1100px`, Desktop `>=1101px`;
- navigation, safe-area, modal, table/chart scroll ownership;
- Tenant List three-row/five-slot contract;
- BUG-01 selector ownership;
- DebtCase, RentPeriodState, Reminder Engine, database, schema, RLS, permissions or real data.
