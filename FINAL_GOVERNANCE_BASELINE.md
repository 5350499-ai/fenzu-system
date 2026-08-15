# Final Governance Baseline

Status: `FINAL_1_RELEASE_READY_WITH_ACCEPTED_DEFERRED_RISKS`

Baseline commit: `4531918 test: lock security boundary governance contracts`

## Original six-step status

1. Rent Period State Root — `COMPLETE`
2. Reminder Root — `COMPLETE`
3. Action Tree Root — `COMPLETE_WITH_ACCEPTED_DEFERRED_RISKS`
4. Cache / Refresh Root — `COMPLETE_WITH_ACCEPTED_DEFERRED_RISKS`
5. Tenant Lifecycle + Deposit Root — `COMPLETE_WITH_ACCEPTED_DEFERRED_RISKS`
6. Date + Financial Statistics Root — `COMPLETE_WITH_ACCEPTED_DEFERRED_RISKS`

Blocking gate: `P0 = 0`, `P1 = 0`.

## Canonical roots

- Rent period: `lib/rent-period-state.ts`
- Reminder: `lib/reminder-engine.ts`, consuming `DebtCase` and `RentPeriodState`
- Actions: `ACTION_TREE_CONTRACT.md`, server/API and RPC boundaries
- Cache/refresh: `CacheManager`, `CACHE_INVALIDATION`, `saveBusinessData`, `refreshBusinessData`
- Lifecycle/deposit: Check-in RPC, Move Room RPC, lifecycle roots and Deposit action root
- Financial/date: `lib/profit.ts`, `paymentAccountingDate`, `rentIncomeForPayment`, settlement helpers
- Security: `SECURITY_BOUNDARY_CONTRACT.md` and server account/permission guards

## Accepted deferred risks

| Risk | Classification | Why it does not block release | Reopen trigger |
|---|---|---|---|
| Move Out non-atomic and persistent idempotency pending | CLOSED in FEATURE-PUBLIC-BETA.2A | `move_out_tenant_atomic` owns the authenticated lifecycle transaction and safe final-state replay | Regression only |
| Rent Payment server idempotency pending | CLOSED in FEATURE-PUBLIC-BETA.2A | Workspace-scoped `client_request_id` unique boundary replays exact retries and rejects changed payloads | Regression only |
| Settlement batch idempotency pending | Architecture deferred | Per-property transaction and result states are explicit | Batch idempotency design |
| diff-baseline localStorage account isolation | Data/cache maintenance | Not canonical business data; authoritative reads and scoped cache remain protected | Account-scoped migration with rollback |
| UTC-derived page default dates | Date maintenance | No current proven data corruption; risk is boundary-specific | Europe/Madrid date fixture audit and Preview |
| rent-coverage compatibility | Legacy compatibility keep | Canonical new callers use `RentPeriodState` | All legacy callers migrated |
| Tasks legacy owner | Legacy compatibility keep | Migration/backup compatibility remains active | Server task migration proof |
| `business-*` / `v1-*` resources | Legacy compatibility keep | Restore and historical compatibility depend on them | Caller and restore dependency proof |
| Dependency advisories (`next`, `nanoid`, `postcss`, `sharp`) | Security maintenance | No force upgrade authorized in this release gate; build passes | Compatible dependency remediation plan |
| Security headers | Security maintenance | Deployment-aware CSP/header review remains necessary | Header policy compatible with Auth/Storage/OAuth |
| Bulk/admin rate limiting | Security maintenance | Existing auth, permission, pending and idempotency guards remain | Abuse/rate-limit design |
| Metric semantic boundaries | Future optimization | Separate metric owners are documented; no proven contradictory result | Product/financial metric equivalence decision |

## Frozen contracts

- Phone `<=640px`, Medium `641–1100px`, Desktop `>=1101px`.
- Phone bottom navigation, Medium 72px rail, Desktop 260px sidebar.
- Tenant List three-row/five-slot contract, Modal ownership, safe-area ownership.
- BUG-01: `FIXED_AND_IPHONE_VERIFIED`.
- Table wrapper 720px intentional scroll and Chart wrapper 768px intentional scroll.
- Action, Data State, Domain, Server Boundary and Security contracts remain parallel governance roots.

## Release evidence

- iPhone manual validation passed for 2.3d, 2.4c and BUG-01.
- Tablet runtime validation is not claimed.
- No Production data was accessed or changed.
- No schema, RLS, RPC signature or authentication architecture change was made.
- Required validation commands passed: TypeScript, build, UI, restore mapping,
  responsive, actions, data-state, domain, server-boundary, security and diff check.

## Production release procedure

FINAL.1 only establishes release readiness. FINAL.2 must separately verify the
intended release target, environment configuration and deployment approval,
then deploy Production under the approved release procedure. No Production
deployment is authorized by this document.

## Post-release Beta 2A write hardening

`RENT_PAYMENT_SERVER_IDEMPOTENCY_CLOSED`

`MOVE_OUT_ATOMIC_TRANSACTION_CLOSED`

The Beta 2A implementation is additive: rent-payment retry identity is
workspace-scoped, and Move Out uses the authenticated
`move_out_tenant_atomic` transaction boundary. The migration has not been
executed against Production; no Production data, deployment, Restore or
Cleanup was performed.
