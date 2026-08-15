# Server Boundary Contract

Status: `SERVER_BOUNDARY_6X_COMPLETE_WITH_DEFERRED_RISKS`

This is the single governance owner for Persistence / API / Server Boundary.
It complements, and does not replace, the Action Tree, Data State, Domain Rule,
Restore, or Responsive contracts.

## Boundary layers

```text
Client/page -> API route -> account-auth -> service/repository or RPC
  -> Supabase/database/storage -> derived state/cache invalidation
```

Pages collect input and request actions. They are not authoritative owners of
authentication, account scope, permissions, database writes, transactions, or
server idempotency. `lib/server/account-auth.ts` owns authentication, account
scope and permissions. `apiErrorResponse` is the shared user-safe error edge.

## API route registry

There are 46 route files. Every route is listed here and is checked by
`validate:server-boundary`.

| Route | Class | Read/write | Server owner / scope | Status |
|---|---|---|---|---|
| `/api/accounts` | ACCOUNT | read/write | account management / owner | ACTIVE_CANONICAL |
| `/api/accounts/[id]` | ACCOUNT | write | account management / owner | ACTIVE_CANONICAL |
| `/api/accounts/[id]/security` | ACCOUNT | write | account management / owner | HIGH_RISK |
| `/api/accounts/[id]/share-login` | ACCOUNT | write | account management / owner | HIGH_RISK |
| `/api/accounts/me` | ACCOUNT | read | account auth / account | ACTIVE_CANONICAL |
| `/api/admin/attachments/cleanup` | ADMIN/ATTACHMENT | write | cleanup service / sensitive permission | HIGH_RISK |
| `/api/admin/attachments/cleanup-candidates` | ADMIN/ATTACHMENT | read | inventory service / sensitive permission | ACTIVE_CANONICAL |
| `/api/admin/attachments/export` | ADMIN/ATTACHMENT | read | export service / sensitive permission | ACTIVE_CANONICAL |
| `/api/admin/attachments/inventory` | ADMIN/ATTACHMENT | read | inventory service / sensitive permission | ACTIVE_CANONICAL |
| `/api/admin/attachments/summary` | ADMIN/ATTACHMENT | read | inventory service / sensitive permission | ACTIVE_CANONICAL |
| `/api/admin/google-attachment-migration/run` | ADMIN/ATTACHMENT | write | migration service / sensitive permission | HIGH_RISK |
| `/api/admin/google-attachment-migration/scan` | ADMIN/ATTACHMENT | read | migration service / sensitive permission | ACTIVE_CANONICAL |
| `/api/audit-logs` | ADMIN | read | audit repository / sensitive permission | ACTIVE_CANONICAL |
| `/api/auth/change-password` | AUTH | write | account auth/management | HIGH_RISK |
| `/api/auth/forgot-password` | AUTH | write | Supabase recovery | PUBLIC_AUTH_FLOW |
| `/api/auth/login` | AUTH | write | Supabase auth/session | PUBLIC_AUTH_FLOW |
| `/api/auth/logout` | AUTH | write | session revocation | ACTIVE_CANONICAL |
| `/api/auth/register` | AUTH | write | account management | PUBLIC_AUTH_FLOW |
| `/api/auth/restore-session` | AUTH | write | recovery ticket | PUBLIC_AUTH_FLOW |
| `/api/auth/revoke-after-recovery` | AUTH | write | recovery/session | PUBLIC_AUTH_FLOW |
| `/api/auth/verification-status` | AUTH | read | verification ticket | PUBLIC_AUTH_FLOW |
| `/api/business-data` | BUSINESS_DATA | write | compatibility mapper + account auth | LEGACY_CANONICAL_COMPATIBILITY_BOUNDARY |
| `/api/check-in` | LIFECYCLE | write | `create_atomic_check_in` RPC | ATOMIC_RPC |
| `/api/client-errors` | OBSERVABILITY | write/log | error-reporting sink | NO_BUSINESS_WRITE |
| `/api/data-backup` | BACKUP_RESTORE | read/export | backup service / owner + sensitive permission | HIGH_RISK |
| `/api/data-restore` | BACKUP_RESTORE | write | restore service + RPC | HIGH_RISK |
| `/api/debug/backup-trace` | OBSERVABILITY | write/log | non-production diagnostic | NON_PRODUCTION_ONLY |
| `/api/files/google-drive/complete` | ATTACHMENT | write | upload completion + owner | HIGH_RISK |
| `/api/files/google-drive/content` | ATTACHMENT | read/write | Drive service + attachment scope | ACTIVE_CANONICAL |
| `/api/files/google-drive/delete` | ATTACHMENT | write | Drive delete + sensitive permission | HIGH_RISK |
| `/api/files/google-drive/prepare` | ATTACHMENT | write/ticket | Drive upload ticket | ACTIVE_CANONICAL |
| `/api/files/google-drive/upload` | ATTACHMENT | write | Drive upload service | ACTIVE_CANONICAL |
| `/api/files/signed-url` | ATTACHMENT | read/ticket | signed-url service + owner | ACTIVE_CANONICAL |
| `/api/files/supabase-storage/complete` | ATTACHMENT | write | storage completion + owner | HIGH_RISK |
| `/api/files/supabase-storage/prepare` | ATTACHMENT | write/ticket | storage upload ticket | ACTIVE_CANONICAL |
| `/api/partners` | PARTNER | read/write | partner service / workspace | ACTIVE_CANONICAL |
| `/api/partners/[id]` | PARTNER | write | partner RPC/service / workspace | HIGH_RISK |
| `/api/partners/shares` | PARTNER | write | share-plan RPC / workspace | HIGH_RISK |
| `/api/partner-settlements` | SETTLEMENT | read/write | settlement RPC/service / workspace | PARTIAL_SUCCESS_RISK |
| `/api/partner-settlements/[id]` | SETTLEMENT | read/write | reversal RPC / workspace | HIGH_RISK |
| `/api/rent-collection` | FINANCIAL | read/write | rent service / property | PARTIAL_SUCCESS_RISK |
| `/api/tasks/migration` | TASK | write | task management | LEGACY_COMPATIBILITY |
| `/api/tasks/migration-preview` | TASK | read | task management | LEGACY_COMPATIBILITY |
| `/api/tasks/server` | TASK | read/write | task management | ACTIVE_CANONICAL |
| `/api/tenants/move-room` | LIFECYCLE | write | `update_tenant_current_assignment` RPC | ATOMIC_RPC |
| `/api/tenants/move-out` | LIFECYCLE | write | `move_out_tenant_atomic` RPC | ATOMIC_RPC |

Auth/recovery routes intentionally have a public protocol where appropriate.
The backup trace route is disabled in Production and is not a business write.

## Write boundary registry

| Action / data | Canonical server owner | Persistence boundary | Classification |
|---|---|---|---|
| Property, room, tenant, contract CRUD | `/api/business-data` + account auth | Supabase tables | LEGACY_CANONICAL_COMPATIBILITY_BOUNDARY |
| Rent payment edit/void | `/api/rent-collection` or compatibility path | `rent_payments` + audit | SERVER_REPOSITORY_WRITE / NON_ATOMIC |
| Check-in | `/api/check-in` | `create_atomic_check_in` | RPC_WRITE / ATOMIC_RPC |
| Move room | `/api/tenants/move-room` | `update_tenant_current_assignment` | RPC_WRITE / ATOMIC_RPC |
| Move out | `/api/tenants/move-out` | `move_out_tenant_atomic` | RPC_WRITE / ATOMIC_RPC |
| Deposit | deposit action owner | `deposits` | CANONICAL_SERVER_WRITE |
| Expense | compatibility write path | `expenses` | CANONICAL_SERVER_WRITE |
| Debt waiver | debt action API/service | debt + audit boundary | CANONICAL_SERVER_WRITE |
| Settlement confirm | `/api/partner-settlements` | `confirm_partner_settlement` | RPC_WRITE / batch non-atomic |
| Settlement reversal | `/api/partner-settlements/[id]` | `reverse_partner_settlement` | RPC_WRITE / single RPC |
| Partner/share plan | partner routes | partner RPCs/tables | RPC_WRITE |
| Tasks | `/api/tasks/server` + migration routes | task service | SERVER_REPOSITORY_WRITE |
| Attachments | file prepare/complete/delete routes | storage + attachment table | SERVER_REPOSITORY_WRITE |
| Backup/restore | backup and restore routes | storage + restore RPCs | RPC_WRITE |
| Account administration | account routes + account management | auth/profile/permission tables | SERVER_REPOSITORY_WRITE |

No page or ordinary client component is a canonical Supabase business write
owner. New direct client database writes are forbidden.

Static audit classifications are explicit: `CANONICAL_SERVER_WRITE`,
`RPC_WRITE`, `SERVER_REPOSITORY_WRITE`, `COMPATIBILITY_WRITE`,
`CLIENT_ORCHESTRATED_SERVER_WRITE`, `DIRECT_CLIENT_DB_WRITE`, and
`UNKNOWN_WRITE`. No new `DIRECT_CLIENT_DB_WRITE` was found in pages or ordinary
components. `CLIENT_ONLY_CRITICAL_VALIDATION`, `OVERPOSTING_RISK` and
`ACCOUNT_SCOPE_BYPASS` remain prohibited regression categories; the current
full-row compatibility protocol is recorded as deferred overposting risk.

## Validation, scope and overposting

- Client validation is UX only. API validation is the security boundary.
- `requireActiveAccount` resolves the authenticated user and workspace owner.
- `requireModulePermission` and `requireSensitivePermission` own permissions.
- `requirePropertyAccess` owns delegated property scope checks.
- Resource IDs are re-read server-side before business update/delete operations.
- Server-owned fields (`user_id`, `workspace_owner_id`, audit and derived fields)
  must be derived or checked server-side.
- Full-row `saveBusinessData` remains a compatibility protocol, not a new
  canonical command API. Field-by-field overposting/lost-update migration is
  deferred until all callers and restore mappings are inventoried.

## RPC and transaction map

| RPC | Caller | Role | Classification |
|---|---|---|---|
| `create_atomic_check_in` | `/api/check-in` | check-in transaction | ATOMIC_RPC |
| `update_tenant_current_assignment` | `/api/tenants/move-room` | move-room transaction | ATOMIC_RPC |
| `move_out_tenant_atomic` | `/api/tenants/move-out` | tenant lifecycle transaction | ATOMIC_RPC |
| `confirm_partner_settlement` | settlement route | one settlement batch persistence | NON_ATOMIC batch |
| `reverse_partner_settlement` | settlement detail route | reversal | SINGLE_SERVER_WRITE |
| `restore_workspace_backup` | `/api/data-restore` | restore persistence | RESTORE_RPC |
| `restore_workspace_backup_dry_run` | `/api/data-restore` | restore validation | DRY_RUN_RPC |
| partner/share-plan RPCs | partner routes | history-preserving mutations | RPC_WRITE |

RPC signatures and semantics are frozen in this step. No migration or RPC
change is part of this contract.

## Error contract

`AccountApiError` and `apiErrorResponse` are the shared normalization edge:

| Class | Status | Meaning |
|---|---:|---|
| VALIDATION | 400 | client-correctable input |
| UNAUTHENTICATED | 401 | missing/expired session |
| FORBIDDEN | 403 | permission or scope denied |
| NOT_FOUND | 404 | target absent or inaccessible |
| CONFLICT | 409 | duplicate or state conflict |
| SERVER_FAILURE | 5xx | user-safe response; details stay server-side |

New business routes must not return 200 for failed mutations or raw SQL/
Supabase errors as the only user-facing response.

## Idempotency and atomicity registry

| Action | Client pending | Request ID | Server/DB protection | Atomicity |
|---|---|---|---|---|
| Check-in | guarded | present | atomic RPC request identity | ATOMIC_RPC |
| Move room | guarded | route contract | RPC conflict protection | ATOMIC_RPC |
| Move out | guarded | none required; final-state replay | `move_out_tenant_atomic` ownership/row lock | ATOMIC_RPC |
| Rent payment | guarded | `client_request_id` | workspace unique index + replay/conflict check | CORE_WRITE_IDEMPOTENT |
| Debt waiver | guarded | action contract | server dedupe | SINGLE_SERVER_WRITE |
| Settlement confirm | guarded | client batch identity | BATCH_IDEMPOTENCY_PENDING | NON_ATOMIC batch |
| Settlement reversal | guarded | action contract | RPC/state conflict | SINGLE_SERVER_WRITE |
| Restore | owner-only pending | restore request | dry-run + RPC | RESTORE_RPC |
| Attachment cleanup | sensitive pending | report/task identity | report contract | MULTI_STEP_NON_ATOMIC |
| Account destructive | owner pending | action request | permission + audit | MULTI_STEP_NON_ATOMIC |

Client disabled/pending is not server idempotency. Settlement batch protection
remains deferred; Rent Payment and Move Out have the server boundaries recorded
above.

## Attachment and restore boundary

Attachment prepare/complete routes issue or verify server-owned tickets,
re-check parent ownership and write metadata only at completion. Delete and
cleanup are sensitive-permission guarded; storage and metadata remain possible
partial states and must report failure.

Backup/restore is owner-only and sensitive-permission guarded. Existing
dry-run, before-restore backup, consistency validation, restore RPC and mapping
validation remain canonical. This contract performs no restore or cleanup.

## Compatibility and deferred risks

- `business-*` is the compatibility write boundary; `v1-properties` and
  `v1-tasks` remain compatibility aliases.
- Tasks migration and the `TasksServerManager`/`CrudPage` split remain
  `LEGACY_COMPATIBILITY_KEEP` until callers and historical dependencies are
  proven absent.
- Full-row `saveBusinessData` overposting and lost-update hardening are deferred.
- Move Out server persistent idempotency is closed by `move_out_tenant_atomic`.
- Rent Payment server idempotency is closed by `client_request_id` and its
  workspace-scoped unique index.
- Settlement batch idempotency is deferred.
- Step 4/5 diff-baseline account scope and UTC page-date risks remain owned by
  their original contracts.

No P0 cross-account write was proven by this static audit. A credible future
cross-account path is a stop-the-line review item.

## FEATURE-PUBLIC-BETA.2A write hardening

- `POST /api/business-data` remains the compatibility route for rent-payment
  writes. New payment creates carry `client_request_id`; the database enforces
  `(user_id, client_request_id)` uniqueness. A duplicate with the same business
  payload replays the existing row, while a changed payload returns conflict.
- `POST /api/tenants/move-out` is the sole Move Out API write entry. It requires
  authenticated account context and tenant archive permission, then calls
  `move_out_tenant_atomic`. The RPC derives workspace ownership from the
  authenticated actor and locks/updates lifecycle rows in one transaction.
- The old client-side Move Out multi-write path is no longer used.

`RENT_PAYMENT_SERVER_IDEMPOTENCY_CLOSED`

`MOVE_OUT_ATOMIC_TRANSACTION_CLOSED`

The migration is additive and was not executed against Production. No
Production data was modified.

## Final status

`SERVER_BOUNDARY_6X_COMPLETE_WITH_DEFERRED_RISKS`

`FEATURE_PUBLIC_BETA_2A_WRITE_HARDENING_COMPLETE`
