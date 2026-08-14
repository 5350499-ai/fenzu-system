# Data / State / Derivation Tree Contract

This is the single ownership contract for the fourth governance step. It
describes where a business fact comes from, which layer derives it, and which
cache or refresh boundary may present it. It does not change financial rules,
historical data, permissions, schema, or RPC behavior.

## Ownership layers

```text
CURRENT_FACT / HISTORICAL_SNAPSHOT
  -> API / repository read
  -> domain derivation
  -> scoped cache
  -> page state / UI
```

Pages may collect input and render state. They must not become a new canonical
writer or recreate a governed financial derivation.

## Source-of-truth registry

| DATA_ID | Business fact | Source of truth | Read owner | Write owner | Derived owner | Cache / invalidation | Compatibility / restore | Risk | Status |
|---|---|---|---|---|---|---|---|---|---|
| `DATA.PROPERTY` | Property identity, metadata, notes | `properties` via `business-data` API | `loadBusinessData(propertyKey)` | business-data API / property action | property metrics | scoped business cache; property invalidates related views | `v1-properties` compatibility; restore mapping | MEDIUM | GOVERNED_WITH_COMPATIBILITY |
| `DATA.ROOM` | Room metadata and stored status | `rooms` via `business-data` API | `loadBusinessData(roomKey)` | business-data API / room action | `roomOccupancyStatus` | scoped business cache; room invalidates related views | canonical key; restore mapping | HIGH | GOVERNED |
| `DATA.TENANT` | Tenant identity, assignment and lifecycle | `tenants` via authorized RPC/API | `loadBusinessData(tenantKey)` | business-data API or lifecycle RPC | tenant status/deep-link selectors | scoped business cache; tenant invalidates related views | canonical key; restore mapping | HIGH | GOVERNED |
| `DATA.CONTRACT` | Contract relationship and dates | `contracts` via business-data API | `loadBusinessData(contractKey)` | business-data API / lifecycle RPC | contract flow and expiry metrics | scoped business cache; contract invalidates financial views | canonical key; restore mapping | HIGH | GOVERNED |
| `DATA.RENT_PAYMENT` | Payment ledger facts and coverage | `rent_payments` via business-data API | payment pages/shared loaders | business-data API / rent action root | RentPeriodState, profit, DebtCase | payment invalidates deposit/metrics views | canonical key; historical rows preserved | HIGH | GOVERNED_WITH_DEFERRED_RISK |
| `DATA.EXPENSE` | Expense ledger facts | `expenses` via business-data API | expense/profit loaders | business-data API / expense action root | profit and settlement calculations | expense invalidates metrics/settlement views | canonical key; restore mapping | HIGH | GOVERNED |
| `DATA.DEPOSIT` | Deposit ledger and status | `deposits` via business-data API | deposit/tenant/dashboard loaders | business-data API / deposit action root | return reminders and metrics | deposit invalidates metrics | canonical key; restore mapping | HIGH | GOVERNED |
| `DATA.RENT_PERIOD_STATE` | Current coverage and payment-period state | pure `lib/rent-period-state.ts` derivation | tenant/debt/reminder consumers | none | `inspectTenantRentState`, latest/open selectors | recomputed from refreshed inputs | restore recomputes | HIGH | GOVERNED |
| `DATA.DEBT_CASE` | Payment-specific open collection event | pure `lib/debt-case.ts` derivation | debt display/dashboard/reminders | waiver action writes audit state only | `getDebtCases` / tenant selectors | inputs plus waiver invalidate dashboard | restore recomputes; no debt rewrite | HIGH | GOVERNED_WITH_DEFERRED_RISK |
| `DATA.REMINDER` | Operational reminder presentation | `buildEffectiveReminders` plus waiver/settings facts | dashboard/reminder center | waiver/task actions only | reminder engine | dashboard derived cache | restore recomputes | HIGH | GOVERNED |
| `DATA.VIEWING_APPOINTMENT` | Appointment record | `viewing_appointments` | appointments page | business-data API | grouped calendar display | appointment-scoped cache | canonical key; restore mapping | MEDIUM | GOVERNED |
| `DATA.TASK` | Task record | server repository when enabled; local key otherwise | tasks page/repository | TasksServerManager or legacy CrudPage | task status presentation | task cache/migration state | `v1-tasks` compatibility | HIGH | GOVERNED_WITH_COMPATIBILITY |
| `DATA.PARTNER` | Partner identity and account mapping | partner API/tables | partner directory hooks | partner API | labels/options | `partners` scoped cache | restore/API contract | HIGH | GOVERNED |
| `DATA.PARTNER_SHARE` | Share-plan terms | partner share API/tables | partner/settlement loaders | partner share API | settlement allocation inputs | settlement cache invalidation | restore/API contract | HIGH | GOVERNED |
| `DATA.SETTLEMENT_CURRENT` | Current-period calculation | current payments, expenses, properties, share plan | settlement page | partner-settlement API per property | `buildSettlement` | settlement cache/history refresh | not historical | HIGH | GOVERNED_WITH_DEFERRED_RISK |
| `DATA.SETTLEMENT_SNAPSHOT` | Confirmed historical facts | settlement snapshot tables/API | history/detail | confirm/reverse RPC boundary | detail presentation only | settlement cache invalidation | restore snapshot parents/children | HIGH | GOVERNED |
| `DATA.ATTACHMENT` | File metadata and storage object | metadata table + storage provider | attachment helpers/API | storage/file API roots | attachment lists/reports | list refetch after mutation | cleanup/restore mapping | HIGH | GOVERNED |
| `DATA.ACCOUNT_PERMISSION` | Account status and permissions | server account API/Auth/RLS | AccountAccess snapshot + server guards | account management API | navigation/action visibility | account-scoped snapshot; clear on switch | snapshot never authority | P0-sensitive | GOVERNED |
| `DATA.DASHBOARD_METRICS` | Dashboard totals/reminders | refreshed canonical inputs | dashboard aggregate loader | none | dashboard loader + profit/reminder helpers | `dashboard-v3` | recomputed after restore | HIGH | GOVERNED_WITH_DEFERRED_RISK |
| `DATA.PROPERTY_METRICS` | Property profit/occupancy views | canonical business inputs | profit/analytics loaders | none | `lib/profit.ts`, operations analytics | related business invalidation | recomputed after restore | HIGH | GOVERNED_WITH_DEFERRED_RISK |
| `DATA.TENANT_METRICS` | Tenant payment/status presentation | tenant/payment/debt inputs | tenant list/detail loaders | none | RentPeriodState/DebtCase adapters | tenant/payment invalidation | recomputed after restore | HIGH | GOVERNED |
| `DATA.BACKUP_RESTORE_STATE` | Backup/restore operation status | server backup/restore report | Data Center | backup/restore API | report/cache reset | restore clears global cache | backup is not current fact | HIGH | GOVERNED |

## Derived-state contract

```text
Rent Payment facts
  -> inspectTenantRentState / RentPeriodState
  -> DebtCase (payment-specific)
  -> buildEffectiveReminders / display adapters
  -> dashboard, tenant, reminder and analytics consumers
```

`getLatestRentPeriodState` is current coverage. `getOpenRentDebtPeriodStates`
is historical follow-up. Pages must not replace either selector with local
date, amount, waiver, archive or room-occupancy logic. DebtCase does not rewrite
payment, deposit, contract or audit facts. Archive and move-out change lifecycle
presentation only; they do not settle debt.

Metrics remain separated by semantic owner: `lib/profit.ts` owns financial
aggregation, `lib/operations-analytics.ts` owns operational analytics, and the
settlement page owns its current-period calculation. Similar labels do not prove
identical filters or date ranges; future unification requires business review.

## Cache and refresh contract

`CacheManager` is the only IndexedDB/memory cache lifecycle owner. Business data
uses scoped keys and `CACHE_INVALIDATION`; dashboard uses `dashboard-v3`, and
partner settlement uses `partner-settlement-v3`. Cache is never source of truth:
a cache hit is stale-while-revalidate and authoritative refresh uses
`refreshBusinessData`.

| Cache root | Source | Write/read | Invalidate | Fallback |
|---|---|---|---|---|
| business data keys | Supabase/API or demo local data | `business-data.ts` | dependency map | demo/initial fallback only |
| `dashboard-v3` | business inputs + waiver API | dashboard loader | business mutations/waiver | revalidated snapshot |
| `partner-settlement-v3` | partner/payment/expense/share APIs | settlement loader | partner/share/payment/expense | current calculation separate from snapshots |
| `partners` | partner API | `lib/partners.ts` | partner mutations | empty directory, never synthetic partner |
| task migration keys | legacy local backup/state | task repository/migration | explicit migration | compatibility only |
| account access snapshot | server-verified metadata | `AccountAccess` | account switch/logout | shell visibility only |

After a confirmed write, use the existing dependency map or targeted refetch.
Full cache clear is reserved for account boundaries and restore reset. Pages may
not invent a second cache key for an existing canonical fact.

## Snapshot and restore contract

Current mutable facts, historical settlement snapshots, backup packages and
audit facts are separate categories. Settlement detail reads immutable snapshot
tables; it must not reconstruct confirmed history from current mutable payment
or expense rows. Restore maps canonical and compatibility keys, snapshot
parents/children and attachment rows, then clears global cache so derived state
is recomputed. `validate:restore-mapping` guards this boundary.

## Account and property scope

Server account/API/RLS checks are authoritative. AccountAccess snapshots only
control visibility and loading decisions. Business cache scope is tied to the
authenticated user; account changes clear in-memory/IndexedDB cache. Property
filters use the shared property-scope contract and never change stored
`property_id` attribution.

## Deferred risk register

| Risk | Level | Protection | Deferred reason | Future trigger | Guard |
|---|---|---|---|---|---|
| `DATA.CACHE.UNSCOPED_DIFF_BASELINE` | P1 | authoritative reads, scoped CacheManager, account cache clear | legacy localStorage migration sequence not proven | account/workspace-scoped diff-key migration | data-state contract |
| `DATA.METRIC.DERIVATION_BOUNDARY` | P2 | named pure helpers and semantic separation | filters/date ranges not proven identical | metric equivalence review | metric registry |
| `DATA.TASK.LEGACY_COMPATIBILITY` | P2 | feature flag, migration preview/backup/report | legacy data and restore compatibility | server-task migration | compatibility registry |
| `DATA.SNAPSHOT.RESTORE_COMPATIBILITY` | P2 | restore mapper and validation script | historical schema variants | executed migration evidence | restore mapping tests |

There are no active P0 risks. The only active P1 is the explicitly deferred
unscoped diff-baseline risk; no permission or cross-account read leakage was
found in this audit.

## Regression rules

- Canonical writes remain in API/RPC/repository boundaries.
- Pages and components must consume `RentPeriodState`, `DebtCase` and
  `buildEffectiveReminders`; they must not reimplement those derivations.
- Current facts must never overwrite historical settlement/backup/audit facts.
- Compatibility aliases are not new canonical writers.
- Account and property scope must be present on cache/read/write boundaries.
- Restore must clear/rebuild derived cache before presenting refreshed state.
- Local optimistic state must be confirmed, refetched or rolled back on failure.
- No financial formula, lifecycle rule, schema, RPC or historical data changes
  are authorized by this contract.

## Status

`DATA_STATE_4X_COMPLETE_WITH_DEFERRED_RISKS`
