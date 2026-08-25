# 蜜蜂分租 / fenzu-system — Current Project Handoff

Status: `AUTHORITATIVE_CURRENT_HANDOFF`

Generated: `2026-08-25`
Scope: repository, documented contracts, current test evidence, and live Vercel deployment metadata. This document is the current-session handoff; it does not replace the domain and security contracts named below.

Current release checkpoint: [`PRODUCTION_RESTORE_RELEASE_CHECKPOINT_20260825.md`](./PRODUCTION_RESTORE_RELEASE_CHECKPOINT_20260825.md)

## 1. Authoritative repository and deployment state

| Fact | Value |
|---|---|
| Product | 蜜蜂分租 / fenzu-system (`spanish-rental-manager`) |
| Canonical checkout | `C:\Users\a5350\Documents\Codex\2026-08-03\github-5350499-ai-fenzu-system-https` |
| Branch | `feat/global-cache-v3` |
| Current application release HEAD | `7c44eeeb4c53d00ea191f7bd93ddf4832519e2b8` |
| Commit author | `5350499-ai <5350499@qq.com>` |
| Tracked worktree | Clean at handoff creation |
| Production URL | `https://fenzu-system.vercel.app` |
| Production deployment | `dpl_GnUv1W5wUfTTQYWTbBYK9VTSJWG2` |
| Production deployment URL | `https://fenzu-system-ebu6wp1s0-5350499-ais-projects.vercel.app` |
| Production status | `READY` |
| Latest useful Preview | `dpl_CFJndnMxNHLmDkb7MnAj7pYXmm19` — `https://fenzu-system-hwlh5y9uv-5350499-ais-projects.vercel.app` |
| Latest Preview status | `READY` |
| Preview / Production provenance | Preview and Production were deployed from the final release checkout; the dated checkpoint records the exact release HEAD, deployment IDs and migration registry version. |

`APPLICATION_RELEASE_HEAD == PRODUCTION_HEAD: YES`, based on the direct Production deploy of `7c44eeeb…`; Vercel CLI deployment inspection exposes status/alias but does not independently display a Git SHA. The dated governance checkpoint records the exact release identity and migration registry version.

Preserved untracked directories: `design/`, `public/bee-rental-bee-shape-exploration/`, `public/bee-rental-icon-exploration/`, `public/bee-rental-icon-final-v2/` through `final-v8/`, and `supabase/.temp/`. Do not reset, clean, delete, or stage these as part of unrelated work.

Latest Production smoke evidence from the authorized release: all public routes requested for the release returned HTTP 200; unauthenticated `/api/accounts/me` and `/api/data-backup/status` returned 401. No real business write was performed.

## 2. Product positioning and stage

This is a real, long-lived rental-management product, not a demo or internal exercise.

Product path:

1. Chinese personal / ordinary-user version.
2. Small-scope real-user Beta.
3. Public Beta and commercial validation.
4. Mature multi-language and multi-currency support.
5. Partnership-operation and multi-member subscription edition.
6. Apple App Store / Google Play commercial release.

The long-term target is real users, sustained use, subscription/payment validation, and official mobile-store distribution.

## 3. Required reading order for the next Codex session

1. `CLAUDE.md`
2. `BUSINESS_RULES.md`
3. `ARCHITECTURE.md`
4. `CHANGELOG.md`
5. This handoff and `PROJECT_HANDOFF_CURRENT.json`
6. For UI work: `UI_DESIGN_SYSTEM.md`, `UI_COMPONENT_MAP.md`, and `RESPONSIVE_CONTRACT.md`
7. For data/security work: `ACTION_TREE_CONTRACT.md`, `DATA_STATE_TREE_CONTRACT.md`, `DOMAIN_RULE_CONTRACT.md`, `SECURITY_BOUNDARY_CONTRACT.md`, `SERVER_BOUNDARY_CONTRACT.md`, and the relevant Data Resilience documents.

`FINAL_GOVERNANCE_BASELINE.md` is a historical governance baseline. It remains useful for frozen roots and accepted risks, but its older release/Production statements are not the current deployment status; this handoff is the current status owner.

## 4. Completed major governance and product work

| Work | Status | Canonical owner / domain source | Test coverage | Known limitation |
|---|---|---|---|---|
| Responsive Batch 1 — App Shell | Complete; iPhone verified | `components/app-layout.tsx`, `app/globals.css`, `RESPONSIVE_CONTRACT.md` | `app-shell-responsive`, `responsive-regression-contract` | Tablet/foldable runtime acceptance is not claimed by static tests. |
| Responsive Batch 2 — Modal, Sheet, Account Center | Complete; iPhone verified | `ModalPortal` / `#app-overlay-root` for app dialogs; `ContentRegionPortal` for Account Center | `personal-center-modal-responsive`, `action-reachability-contract` | Do not merge the two modal semantics. |
| Responsive Batch 3 — dense finance / profit rows | Complete; iPhone verified | `.finance-line`, profit row semantic regions, `app/globals.css` | `batch3-high-density-rows`, `global-content-driven-responsive`, `content-driven-foundation-closeout` | Preserve the current content-driven owner; do not force phone rows to two lines. |
| Responsive Batch 4 — secondary page owners | Complete | Tenant, Property, Room, Settlement, Data Center owners in `UI_COMPONENT_MAP.md` / CSS | `batch4-secondary-page-layout` | Not a license for broad dead-CSS deletion. |
| Responsive Batch 5 — breakpoint/cascade closeout | Complete | `RESPONSIVE_CONTRACT.md`, shared tokens and scoped CSS owners | `batch5-css-cascade-closeout` | `globals.css` size is not itself a defect. Unknown CSS remains intentionally retained. |
| Final full-app root-cause audit | Complete | Contract docs and route/component owners | 367-test release audit followed by current 402-test suite | Future real-device reports may reopen only their proven owner. |
| Analytics scope-preserving drill-down | Complete | `lib/analytics-drilldown.ts`, existing scoped target pages | `analytics-scope-drilldown` | Pure metrics without a natural detail target remain non-clickable. |
| Finance search | Complete; Preview/iPhone accepted | `lib/finance-search.ts`, shared partner directory resolver | `finance-search`, content-driven tests | Local presentation filtering only; it does not mutate totals or records. |
| Pending-deposit metric/detail parity | Complete; Preview fixed | `lib/deposit-pending.ts` selectors shared by analytics and deposits | `deposit-pending-parity` | Runtime data parity remains a regression-sensitive domain contract. |
| Global action reachability / modal safe area | Complete; Preview/iPhone accepted | `ModalPortal`, modal CSS tokens, `ContentRegionPortal` distinction | `action-reachability-contract` | Use runtime geometry for any future iOS reachability report. |
| Password clear | Complete; Preview/iPhone accepted | `components/password-input.tsx` | `password-clear-and-profit-badge` | Clear action is presentation-only; password/auth behavior is unchanged. |
| Property Profit profit/loss badge | Complete; Preview/iPhone accepted | `StatusBadge`, `app/property-profits/page.tsx` | `password-clear-and-profit-badge`, profit layout tests | Keep existing three semantic regions and amount alignment. |

## 5. Core business and safety contracts

| Area | Current model | Canonical source | Release status | Known risk / boundary |
|---|---|---|---|---|
| Tenant lifecycle | Active, moved-out and archived lifecycle are distinct; history is preserved. | `BUSINESS_RULES.md`, lifecycle action contract | Released | Permanent delete remains restricted to an empty shell. |
| Rent payment | Historical payment facts are immutable; latest valid coverage is selected separately from historic open debt. | `lib/rent-period-state.ts`, payment action contract | Released | Do not recompute coverage in pages. |
| Expense | Expense records are business facts; finance presentation/search never changes values. | expense action contract, `lib/profit.ts` | Released | Search is local presentation only. |
| DebtCase | Payment-backed and stable derived periods are distinct DebtCases. | `lib/debt-case.ts` | Released | Pages must not derive debt from raw dates/amounts. |
| €0 DebtCase | An active tenant with expired coverage and zero expected rent can have an actionable derived zero DebtCase/reminder; count can change while financial amount remains zero. | `lib/debt-case.ts`, `expired-coverage-derived-debt` | Released | No income, expense or profit effect. |
| Waive | Append-only, payment/period-specific, non-financial; stable identity prevents one period from suppressing another. | `lib/debt-case.ts`, waiver API/audit contract | Released | Never write a derived ID into UUID `audit_logs.entity_id`. |
| New period after waive | A waived earlier period does not suppress a later derived period for an active tenant. | `lib/debt-case.ts` | Released | Regression covered by derived-debt tests. |
| Historical debt / move-out | Existing payment-backed unpaid debt survives move-out; moved-out/inactive tenants do not generate new derived future periods. | `lib/debt-case.ts`, lifecycle contracts | Released | Lifecycle never auto-settles debt. |
| Reminder engine | Home and reminder center consume one effective reminder set with stable subjects/navigation/actions. | `lib/reminder-engine.ts`, `buildEffectiveReminders` | Released | Archive mutes daily presentation; it is not settlement. |
| Deposit | Pending deposit means a moved-out tenant with a non-void `待退` deposit; count and detail reuse one selector and property scope. | `lib/deposit-pending.ts` | Released | Do not create missing deposit records to force parity. |
| Settlement | Existing scoped settlement action is preserved; per-property results/partial success remain explicit. | `lib/partner-settlement.ts`, settlement action contract | Released with recorded architecture boundary | Batch-wide server idempotency remains a separately documented design concern. |
| Property Profit | Income/expense/profit calculation stays in shared helpers; monthly UI has period/status/financial semantic regions and status badge. | `lib/profit.ts`, property-profit page | Released | Presentation must not alter calculations. |
| Analytics | Metrics navigate only through scope-preserving query adapters; property scope is retained. | `lib/analytics-drilldown.ts`, `lib/property-scope.ts` | Released | Server/page permission checks still own data access. |
| Workspace isolation | Query parameters only affect display; server auth/RLS and ownership checks remain authority. | security/server contracts | Released | Never trust a client property/workspace ID for authorization. |
| Auth | Supabase session plus application account/session verification; password values are never exposed. | `components/account-access.tsx`, server auth | Released | Cold-start cache behavior remains a performance follow-up. |
| Backup | JSON is the restore source; CSV/Excel are reporting exports. | `lib/data-export.ts`, Data Resilience contracts | Code/audit released | User download is not guaranteed server retention. Attachments are excluded from ordinary Beta backup. |
| Restore | Dry-run, ownership checks, BeforeRestore safety package, then canonical transactional restore. | `app/api/data-restore/route.ts`, Data Resilience contracts | Code/automated contract released | Real-world destructive retest after recent changes is not completed. |
| Data export | Export is separate from Restore; handoff to iOS/browser is not proof the file was saved. | `lib/data-export.ts`, data center | Released | Do not claim native save completion from browser handoff. |
| Cache | `CacheManager` owns IndexedDB lifecycle; dashboard uses `dashboard-v4` stale-while-revalidate. | `lib/cache/cache-manager.ts` | Released with follow-up | Cold-start auth-gate-before-cache behavior is a performance task, not a proven correctness failure. |

## 6. Backup / Restore — explicit safety status

### Code and automated evidence

- Data export, dry-run, Restore mapping, BeforeRestore, checksum/format gates, workspace ownership and recovery-point contracts exist in the current code and documents.
- Current automated suite includes restore mapping, data resilience, backup reminder, server-source, security/server-boundary and contract coverage.
- Production release smoke was non-destructive; no Backup, Restore, delete or business mutation was executed during the current release.

### Mandatory uncompleted real-world validation

`REAL_WORLD_DESTRUCTIVE_RESTORE_RETEST_AFTER_RECENT_CHANGES: NOT YET COMPLETED`

This must not be described as complete merely because automated tests pass. The next authorized real-flow test must use a test/small account, not an ordinary user workspace:

1. Create a fresh current backup and record a baseline.
2. Deliberately modify/delete a small, known set of test data.
3. Perform the canonical Restore only after dry-run and BeforeRestore succeed.
4. Compare tenants, rooms, rent payments, expenses, deposits, reminders, analytics/statistics and their associations.
5. Confirm the restored workspace is coherent and audit/recovery evidence is present.

Never manually repair business rows in Supabase to make this test pass.

## 7. Readiness assessment

| Gate | Status | Reason |
|---|---|---|
| Private real-user Beta | `NO — gated` | Production is stable and the main flows have current test/Preview/iPhone evidence, but the destructive Backup → Restore closure after recent changes has not been executed. Run that test first. |
| Public Beta | `NO` | Requires private Beta evidence, feedback/support process, legal/privacy readiness and broader operational validation. |
| Paid commercial release | `NO` | Subscription/plan enforcement and commercial validation are not complete. |
| App Store / Google Play | `NO` | Native packaging, store/legal/commercial readiness and real Beta evidence are not complete. |

## 8. Backlog and priority

### Release before Private Beta

- Execute the real Backup → destructive test → Restore closure above on a dedicated test/small account.
- Record exact results in `CLOSED_BETA_HUMAN_VALIDATION_CHECKLIST.md` or a dated evidence report; do not use Production customer data destructively.

### Private Beta validation

- Recruit a very small set of friends/real landlords after the Restore gate passes.
- Collect structured feedback, support/error evidence, and real device/browser results.
- Observe cold-start cache performance; treat it as a scoped performance investigation, not a reason to change Auth/Cache preemptively.

### Public Beta

- Privacy policy, user terms, onboarding/help, error-feedback/support entry, and beta-feedback collection.
- Expand real-user validation only after the private cohort evidence is satisfactory.

### Commercialization

- Multi-language rollout.
- Multi-currency commercial validation.
- Partnership-operation/multi-member subscription edition.
- Subscription plans, entitlement and permission model.

### App Store / Google Play

- Native packaging/distribution plan, store assets/compliance, store policies, and paid-product operational readiness.

### Optional polish (not a release prerequisite)

- Cold-start cache performance.
- Additional search or input ergonomics only when real users demonstrate need.
- Do not reopen completed responsive batches for cosmetic cleanup.

## 9. Long-term governance rules

```text
ROOT_CAUSE_FIRST = TRUE
PATCH_FIRST = FALSE
CONTENT_DRIVEN_LAYOUT = TRUE
DEVICE_SPECIFIC_LAYOUT_PATCH = FORBIDDEN
ONE_SEMANTIC_COMPONENT_ONE_CANONICAL_OWNER = TRUE
BUSINESS_DOMAIN_SINGLE_SOURCE = TRUE
REAL_USER_DATA_PROTECTION = STRICT
DATABASE_CHANGE_REQUIRES_EXPLICIT_SCOPE = TRUE
PRODUCTION_DEPLOY_REQUIRES_EXPLICIT_RELEASE_STEP = TRUE
SMALL_LOW_RISK_UI_CHANGES_CAN_USE_PREVIEW_THEN_RELEASE = TRUE
BACKUP_RESTORE_CHANGES_REQUIRE_EXTRA_CAUTION = TRUE
```

Operational interpretation:

- Start from a real user symptom, runtime evidence or a named canonical contract; find the shared owner before changing a page.
- Do not add magic margin/padding, device-width CSS, one-off z-index, or local domain derivations as a first response.
- Do not mechanically delete unknown CSS or reopen stable Responsive Batches 1–5 simply because `globals.css` is large.
- For every material change: root cause → shared/canonical fix → regression test → Preview → real-device/real-flow acceptance → explicit Production release.
- Database, schema, migration, scheduler, SMTP, subscriptions and real-user data each need their own explicit scope. A release request does not authorize them automatically.

## 10. NEXT SESSION START HERE

1. Verify checkout branch/HEAD and confirm Production still aliases the expected deployment.
2. Execute the authorized real Backup → destructive test → Restore closure using a dedicated test/small account.
3. If it passes, mark the evidence and reassess `READY_FOR_PRIVATE_REAL_USER_BETA`.
4. Prepare a small real-user/private-landlord cohort; do not start broad feature work first.
5. Collect real feedback and support evidence.
6. Use that evidence to decide whether Public Beta is justified.
7. Only then advance multi-language, commercial subscription and App Store / Google Play roadmap work.

## 11. Current validation evidence

- Current final application commit `fe3ef91…` passed `402/402` Node tests before Production release.
- TypeScript, Production build, Responsive, UI, UI interaction, Security, Server Boundary, Actions, Domain, Data State, Backup/Restore and `git diff --check` passed in that release closeout.
- Production `dpl_4GN7…` is `READY`; the formal alias is confirmed by Vercel inspection.
- iPhone acceptance is recorded for the responsive architecture, partner first-paint parity, Property Profit three-region layout, finance search, action reachability, password clear and profit/loss badge. It is not a substitute for the uncompleted destructive Restore test.

## 12. Handoff boundaries

- No code, database, schema, migration, scheduler, SMTP or real-user data changed by this handoff audit.
- This document intentionally does not authorize a deployment. It is a state record for the next Codex session.
