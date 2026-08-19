# Domain Rule Contract

This is the Step 5 ownership contract for domain rules, calculations, status
derivations and business metrics. It does not change business semantics,
database schema, RPC signatures, historical data or permissions.

## Rule ownership vocabulary

- `CANONICAL`: the authoritative domain owner for a business rule.
- `DERIVED_DISPLAY`: a read-only presentation derived from canonical facts.
- `COMPATIBILITY`: a legacy adapter retained for old callers or data.
- `SNAPSHOT`: an immutable historical or audit representation.
- `SEMANTICALLY_DIFFERENT`: similar-looking logic with a different business
  meaning, filter, period or lifecycle boundary.
- `DEFERRED`: a known boundary that requires business or data-safety evidence
  before changing.

## Domain rule registry

| ID | Domain / concept | Canonical owner | Inputs / outputs | Persistence | Compatibility / snapshot | Scope | Risk | Status |
|---|---|---|---|---|---|---|---|---|
| `RULE.PROPERTY` | Property identity and metadata | `business-data` property resource/API | property row -> property model | persisted | restore mapping, `v1-properties` alias | account/property | MEDIUM | CANONICAL |
| `RULE.ROOM` | Room identity and stored metadata | `business-data` room resource/API | room row -> room model | persisted | restore mapping | account/property | HIGH | CANONICAL |
| `RULE.TENANT` | Tenant identity and lifecycle facts | tenant resource plus lifecycle action roots | tenant row -> tenant model | persisted | restore mapping | account/property | HIGH | CANONICAL |
| `RULE.CONTRACT` | Tenancy relationship and dates | contract resource and lifecycle owners | contract row -> contract model | persisted | historical rows retained | account/property | HIGH | CANONICAL |
| `RULE.CHECK_IN` | Atomic initial occupancy creation | `create_atomic_check_in` RPC via `/api/check-in` | validated form -> tenant/room/contract/payment/deposit | persisted | RPC boundary | account/property | HIGH | CANONICAL |
| `RULE.MOVE_ROOM` | Existing tenant room transfer | `/api/tenants/move-room` and its RPC/domain boundary | tenant + old/new room -> transfer result | persisted | transaction boundary | account/property | HIGH | CANONICAL |
| `RULE.MOVE_OUT` | Rental relationship termination | current client plan; future server action root | tenant/room/contract/deposit plan -> step result | persisted non-atomic | deferred action contract | account/property | HIGH | DEFERRED |
| `RULE.RENT_PAYMENT` | Received rent/payment ledger | rent-payment action root and `business-data` resource | payment -> ledger fact | persisted | historical rows immutable | account/property | HIGH | CANONICAL_WITH_DEFERRED_IDEMPOTENCY |
| `RULE.RENT_PERIOD` | Coverage, current period and open historical periods | `lib/rent-period-state.ts` | tenant + payments + waiver IDs -> `RentPeriodState` | derived | recomputed after restore | account/property | HIGH | CANONICAL |
| `RULE.DEBT` | Outstanding/overdue financial fact | rent facts through `RentPeriodState` | payment coverage and paid/unpaid facts -> debt fact | derived | historical payment facts retained | account/property | HIGH | CANONICAL |
| `RULE.DEBT_CASE` | Payment-specific actionable collection case | `lib/debt-case.ts` | rent reconciliation -> `DebtCase` | derived | waiver audit state only | account/property | HIGH | CANONICAL |
| `RULE.DEBT_WAIVER` | Payment-specific follow-up closure | waiver action/API and audit log | payment ID + reason -> waiver audit fact | persisted audit | never rewrites payment | account/property | HIGH | CANONICAL |
| `RULE.DEPOSIT` | Deposit ledger/status | deposit resource and deposit action root | deposit row -> deposit fact | persisted | restore mapping | account/property | HIGH | CANONICAL |
| `RULE.EXPENSE` | Expense ledger | expense resource and expense action root | expense row -> expense fact | persisted | restore mapping | account/property | HIGH | CANONICAL |
| `RULE.REMINDER` | Operational reminder collection | `lib/reminder-engine.ts` | canonical facts -> reminders | derived | settings/waiver inputs | account/property | HIGH | CANONICAL |
| `RULE.VIEWING_APPOINTMENT` | Viewing appointment record | appointment resource/API | appointment row -> appointment model | persisted | restore mapping | account/property | MEDIUM | CANONICAL |
| `RULE.PARTNER` | Partner identity and account mapping | partner API/tables | partner row -> partner model | persisted | API/restore mapping | account | HIGH | CANONICAL |
| `RULE.PARTNER_SHARE` | Effective partner share plan | partner share API/tables | dated share rows -> effective plan | persisted/derived | historical effective dates | account/property | HIGH | CANONICAL |
| `RULE.SETTLEMENT` | Current-period settlement calculation | `lib/partner-settlement.ts` / settlement action root | scoped facts + share segments -> settlement result | derived then persisted snapshot | batch idempotency deferred | account/property | HIGH | CANONICAL_WITH_DEFERRED_IDEMPOTENCY |
| `RULE.SETTLEMENT_REVERSAL` | Reversal of confirmed settlement | `reverse_partner_settlement` RPC | settlement ID + reason -> reversal result | persisted | historical snapshot retained | account/property | HIGH | CANONICAL |
| `RULE.DASHBOARD_METRICS` | Dashboard aggregates | dashboard loader using profit/reminder helpers | scoped canonical facts -> metrics | derived/cache | `dashboard-v3` | account/property | HIGH | DERIVED_DISPLAY |
| `RULE.PROPERTY_METRICS` | Property profit/operations metrics | `lib/profit.ts`, `lib/operations-analytics.ts` | scoped facts + date range -> metrics | derived/cache | semantic owners remain separate | account/property | HIGH | SEMANTICALLY_DIFFERENT |
| `RULE.OCCUPANCY` | Historical occupancy/vacancy rate | `lib/room-occupancy.ts` plus current room status helper | dated tenant/contract/payment intervals -> rate | derived | no stored metric authority | account/property | HIGH | CANONICAL |
| `RULE.INCOME_EXPENSE_PROFIT` | Income, expense and net profit | `lib/profit.ts` | accounting-date facts -> totals | derived | formatting via `lib/format.ts` | account/property | HIGH | CANONICAL |
| `RULE.ATTACHMENT_OWNERSHIP` | Business attachment relation | attachment management rules + resource APIs | owner type/id -> metadata/storage relation | persisted | cleanup/restore compatibility | account/property | HIGH | CANONICAL |
| `RULE.BACKUP_RESTORE_MAPPING` | Export/restore business mapping | data export/restore services and validation script | export payload -> canonical/compatibility rows | persisted operation | historical snapshot mapping | account | HIGH | CANONICAL |
| `RULE.ACCOUNT_PERMISSION_SCOPE` | Account and permission boundary | server account API/Auth/RLS | session/account -> allowed scope | persisted/server | AccountAccess is visibility snapshot only | account | P0-SENSITIVE | CANONICAL |

## Settlement product semantics

Settlement is one product concept with two deliberately distinct calculation
and permission paths:

- A single-owner (`free_single`) account is treated as 100% owner, profit and
  expense recipient. The homepage `结算` entry points to the existing
  `/property-profits` personal operating-results view.
- A managed/partner account with `canViewPartnershipSettlement` uses the
  existing `/partnership-settlement` flow, which applies partner shares and
  persisted settlement snapshots.
- The single-owner homepage entry does not grant or imply partnership
  settlement permission. Server-side free-single restrictions remain
  authoritative.

## Canonical calculation boundaries

### Rent and debt

`lib/rent-period-state.ts` owns coverage chronology, current period selection,
payment-specific open debt, waiver interpretation and amount normalization.
`lib/debt-case.ts` converts those facts into actionable cases. The Reminder
Engine consumes those cases and does not recalculate debt. Pages must not build
another debt, coverage or waiver selector.

`lib/rent-coverage.ts` remains a compatibility layer for older callers. Its
legacy selectors and status helpers are not a second authority for new domain
work. `lib/tenant-timeline.ts` payment-performance calculations are a separate
display metric with timing/completeness rules, not a rent-period or debt rule.

### Money

- Payment income is `amountPaid`, through `rentIncomeForPayment` in
  `lib/profit.ts`.
- Accounting date is `paymentDate`, with the documented legacy `rentMonth`-
  first-day fallback, through `paymentAccountingDate` in `lib/profit.ts`.
- Settlement rounds monetary segment/stat values through its existing
  `roundMoney`; this is calculation precision, not display formatting.
- `lib/format.ts` formats values for display and is not a source of financial
  facts.
- Monthly rent is a reference/display field; it does not create income.
- Deposit income/refund and linked rent-deposit rules remain separate from rent
  income.

The exact duplicate settlement helpers for received amount and accounting date
now consume the canonical `lib/profit.ts` helpers. Other similar calculations
remain separate where their filters, date ranges or presentation semantics
differ.

### Dates

Business dates are ISO `YYYY-MM-DD` values and must retain date-only semantics.
`lib/rent-period-state.ts`, `lib/rent-coverage.ts` and `lib/room-occupancy.ts`
use date-only comparisons/UTC-midnight arithmetic for interval math;
`lib/profit.ts` owns the Europe/Madrid calendar boundary for financial ranges.
Display timestamps may use localised `Date` formatting, but must not replace a
business date. Existing UTC-derived page defaults and mixed date helpers are a
deferred boundary risk until all entry points are reviewed together.

## Status machine ownership

Existing status values are data/business contracts, not new enum proposals:

- Tenant: active/current, moved-out/ended, archived and restored presentation.
- Room: occupied/current relationship, vacant, maintenance/stopped and archived.
- Contract: active/valid, ended, void/archived where the existing resource uses
  them.
- Deposit: existing received/return/pending/void status values.
- Rent: paid/outstanding/overdue/waived as derived from payment facts,
  `RentPeriodState` and payment-specific waiver state.
- Settlement: confirmed/reversed at the persisted batch/snapshot boundary.

Pages may display these values but may not invent a new state or infer one from
display text when a shared owner exists. Historical inconsistent records are
`DATA_INTEGRITY_REVIEW_REQUIRED`; this contract does not repair them.

## Metrics and scope

`lib/profit.ts` owns financial aggregation. `lib/operations-analytics.ts` owns
operational metrics. `lib/room-occupancy.ts` owns dated occupancy intervals.
Dashboard and property pages consume these outputs; equal labels do not imply
equal filters or date ranges. Metric equivalence requires a separate business
review.

All domain helpers consume already account/property-scoped inputs or an
explicitly scoped repository result. Server account/API/RLS checks remain
authoritative. No helper may merge records across accounts or promote a cache,
local state, compatibility key or historical snapshot to canonical authority.

## Compatibility and snapshot policy

Keep `business-*` canonical resources, `v1-*` compatibility keys, legacy task
owners, old local-storage compatibility and restore mappings until production
callers, historical data, restore dependencies, migration and rollback are all
proven safe. Confirmed settlement, backup, audit, historical payment and
historical contract records are snapshots/audit facts; current mutable rows may
not overwrite them.

## Deferred risk register

| Risk | Level | Current protection | Why deferred | Future trigger |
|---|---|---|---|---|
| `DOMAIN.CACHE.UNSCOPED_DIFF_BASELINE` | P1 | scoped CacheManager and authoritative reads | localStorage diff-key migration is not proven | account-scoped key migration with rollback |
| `DOMAIN.DATE.UTC_PAGE_DEFAULTS` | P1 | shared pure date helpers in core derivations | all date-entry defaults need one coordinated review | date-boundary audit with fixtures and Preview |
| `DOMAIN.RENT_COVERAGE_COMPATIBILITY` | P2 | canonical new selectors plus existing tests | legacy callers still exist | caller migration proof |
| `DOMAIN.METRIC_SEMANTIC_BOUNDARY` | P2 | named owners and separate tests | filters/date ranges are not proven equivalent | product/financial metric equivalence review |
| `DOMAIN.TASK_COMPATIBILITY` | P2 | migration preview/backup and dual owner register | legacy data/restore compatibility | completed task migration |

No P0 was found in this static audit. The P1 risks are explicitly deferred,
not silently normalized.

## Regression rules

- `RentPeriodState`, `DebtCase` and `Reminder Engine` remain unique canonical
  derivation owners.
- New pages must not recreate amount, date, debt, occupancy or status rules.
- Settlement and profit must share the canonical payment amount/accounting-date
  helpers where semantics are identical.
- Formatting functions cannot become financial calculation owners.
- Current facts, snapshots and compatibility data remain distinct.
- Account/property scope is required at read, write, cache and derived boundaries.
- No new domain change may modify schema, RPC semantics, historical data or
  frozen responsive/action contracts without a separate authorized phase.

## Status

`DOMAIN_RULE_5X_COMPLETE_WITH_DEFERRED_RISKS`
