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
| Branch | `fix/free-single-settlement-auth` |
| Current application release HEAD | `fe23649f36e0f2a0bb8ff409b2131d7e6383b3e6` |
| Commit author | `5350499-ai <5350499@qq.com>` |
| Tracked worktree | Clean at handoff creation |
| Production URL | `https://fenzu-system.vercel.app` |
| Production deployment | `dpl_EkpZSGWL3Jxs468FAKwPhaEXsqpL` |
| Production deployment URL | `https://fenzu-system-1rrgavc4w-5350499-ais-projects.vercel.app` |
| Production status | `READY` |
| Latest useful Preview | `dpl_BZeXKk6t2UQdbPa6C7McpRD6mDNB` — `https://fenzu-system-kuyokc3pw-5350499-ais-projects.vercel.app` |
| Latest Preview status | `READY; superseded by accepted Production release` |
| Preview / Production provenance | Preview and Production were deployed from the final release checkout; the dated checkpoint records the exact release HEAD, deployment IDs and migration registry version. |

`APPLICATION_RELEASE_HEAD == PRODUCTION_HEAD: YES`, based on the direct Production deploy of `fe23649f…`; Vercel CLI deployment inspection exposes status/alias but does not independently display a Git SHA. The release was built from a clean HEAD-only staging export, and the dated governance checkpoint records the exact accepted release identity.

Preserved untracked directories: `design/`, `public/bee-rental-bee-shape-exploration/`, `public/bee-rental-icon-exploration/`, `public/bee-rental-icon-final-v2/` through `final-v8/`, and `supabase/.temp/`. Do not reset, clean, delete, or stage these as part of unrelated work.

Latest Production smoke evidence from the authorized release: `/`, `/login`, `/data-center`, `/tenants`, `/rent-payments` and `/expenses` returned HTTP 200; unauthenticated `/api/data-restore/current-summary` and `/api/accounts` returned 401; the deployment was `READY` with zero runtime error logs. The user's final mobile Backup/Restore acceptance passed.

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
6. The current task-relevant contract/policy owner
7. The latest release checkpoint
8. For UI work: `UI_DESIGN_SYSTEM.md`, `UI_COMPONENT_MAP.md`, and `RESPONSIVE_CONTRACT.md`
9. For data/security work: `ACTION_TREE_CONTRACT.md`, `DATA_STATE_TREE_CONTRACT.md`, `DOMAIN_RULE_CONTRACT.md`, `SECURITY_BOUNDARY_CONTRACT.md`, `SERVER_BOUNDARY_CONTRACT.md`, and the relevant Data Resilience documents.

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
| Backup | JSON is the restore source; CSV/Excel are reporting exports. | `lib/data-export.ts`, Data Resilience contracts | Accepted | Free users keep the file locally; platform cloud backup retention is not provided. |
| Restore | Preview, immutable target, real rehearsal, mandatory local current-data backup, then canonical transactional Restore. | `app/api/data-restore/route.ts`, `lib/restore-capability.ts`, Data Resilience contracts | Production mobile acceptance PASS | Free users do not receive a mandatory cloud recovery point; Internal Full retains cloud recovery capability. |
| Partnership | Partners, shares, name history, settlement batches and snapshots are implemented and tested. | `lib/partners.ts`, partner routes, `lib/partner-settlement.ts`, partner/settlement migrations | Existing implemented capability | Free Single remains single-operator; no partner-count limit is decided. |
| Attachments | Attachment metadata/storage providers, private access, export and cleanup paths exist and are tested. | Attachment routes/helpers and `ARCHITECTURE.md` | Technical capability implemented/tested; product OFF for Free and Paid | Binary Backup/Restore remains separate/out of scope; Internal Full may use it for internal testing. |
| Data export | Export is separate from Restore; handoff to iOS/browser is not proof the file was saved. | `lib/data-export.ts`, data center | Released | Do not claim native save completion from browser handoff. |
| Cache | `CacheManager` owns IndexedDB lifecycle; dashboard uses `dashboard-v4` stale-while-revalidate. | `lib/cache/cache-manager.ts` | Released with follow-up | Cold-start auth-gate-before-cache behavior is a performance task, not a proven correctness failure. |

## 6. Backup / Restore — explicit safety status

### Final accepted evidence

- Data export, dry-run, Restore mapping, BeforeRestore, checksum/format gates, workspace ownership and recovery-point contracts exist in the current code and documents.
- Current automated suite includes restore mapping, data resilience, backup reminder, server-source, security/server-boundary and contract coverage.
- Local Restore Lab completed five full Dry Run rounds, five full Restore rounds, populated 18-table/finance/idempotency/failure-injection acceptance, and normal-business regression.
- Production completed the final mobile flow: Preview, recovery rehearsal, mandatory local pre-Restore backup, confirmation, and formal Restore; the user accepted the result as PASS.
- Production smoke was PASS.

`REAL_WORLD_DESTRUCTIVE_RESTORE_RETEST_AFTER_RECENT_CHANGES: COMPLETE / PASS`

`BACKUP_RESTORE_FINAL_STATUS: CLOSED / ACCEPTED`

The final phone acceptance confirmed the real flow and core post-Restore
pages/amounts. Future destructive tests still require explicit scope and a
dedicated test/small account; never manually repair business rows in Supabase
to make a test pass.

## 7. Readiness assessment

| Gate | Status | Reason |
|---|---|---|
| Private real-user Beta | `YES` | Production Backup/Restore closure and final mobile acceptance passed; start only with a very small trusted cohort. |
| Public Beta | `NO` | Requires private Beta evidence, feedback/support process, legal/privacy readiness and broader operational validation. |
| Paid commercial release | `NO` | Subscription/plan enforcement and commercial validation are not complete. |
| App Store / Google Play | `NO` | Native packaging, store/legal/commercial readiness and real Beta evidence are not complete. |

## 8. Backlog and priority

### Private Beta validation

- Recruit 1–3 trusted friends/real landlords; this is not Public Beta.
- Test normal daily use only: login, properties, rooms, tenants, check-in, payments, expenses, tasks, reminders, viewing appointments, single-owner results and ordinary Backup.
- Do not ask beta users to run destructive Restore, database administration, internal diagnostics, hidden attachment paths or cloud recovery.
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

## 9.1 Product capability and entitlement policy

`FREE_SINGLE_MODEL` is the current ordinary-user model: one operator, 100%
own operation/economic attribution, no multi-member partnership entry point,
local Backup under the user's control, mandatory local pre-Restore backup, and
no platform cloud backup hosting.

Partnership is not a future placeholder. The implemented capability includes
partner creation/deletion/rename history, effective property share plans,
percentage validation, proportional settlement, settlement records and
historical partner/segment/transfer snapshots. No maximum partner count is
decided or promised.

The capability owner is `lib/restore-capability.ts` and the existing account,
permission and module-boundary model. Do not hard-code a user ID. `free_single`
has cloud recovery, history recovery and automatic cloud backup disabled and
requires the local pre-Restore gate. Internal Full retains cloud recovery,
recovery metadata, diagnostics and future historical-recovery capability.
Future Premium packaging is not commercialized or exposed in this release.

Attachment technical capability remains implemented/tested through the existing
metadata, private-storage/provider, export and cleanup owners. Attachment
product access is OFF for Free and Paid in this phase because of capacity,
hosting, privacy and data-responsibility costs; Internal Full may retain it for
internal testing. Attachment policy is separate from ordinary Backup/Restore.

## 9.2 Deployment and browser-authorization policy

The Vercel login method is recorded only as `Google`. Credentials, passwords,
tokens, cookies, OAuth secrets/codes and sessions must never be written to the
repository, governance files or logs.

For Vercel, GitHub, Supabase and deployment authorization: use CLI/API/connector
first, then the CodeDesk internal controlled browser when browser interaction is
needed. Do not control desktop Chrome. Before browser automation, account for
possible desktop auto-login/fingerprint conflicts. For CLI OAuth localhost
callbacks, test internal-browser access first; user intervention is last resort
and is limited to one minimal official account-holder confirmation. Prefer the
current Vercel Device Flow; do not use the deprecated `vercel login --github`
flow.

## 9.3 Local Restore/Migration Lab policy

`scripts/restore-lab/`, `supabase/bootstrap/`, fixtures, bootstrap manifest,
runner and generated evidence form the long-term `LOCAL_RESTORE_LAB` asset.
Migrations, Restore, triggers, permissions, schema, finance parity and
idempotency changes require `LOCAL_ISOLATED_ACCEPTANCE_FIRST`. The lab may be
stopped to save resources, but its bootstrap/config/fixture/runner/evidence
must not be casually deleted. Production is never the trial environment.

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

1. Read `CLAUDE.md`, `BUSINESS_RULES.md`, `ARCHITECTURE.md`, this handoff, the task-relevant contract/policy, and the latest release checkpoint.
2. Verify checkout HEAD and the Production alias before any release work.
3. Run the 1–3 person private-beta normal-use validation and collect structured feedback.
4. Do not ask private-beta users to perform destructive Restore or internal-only tests.
5. Use evidence to decide whether Public Beta is justified; only then advance commercial and App Store / Google Play work.

## 11. Current validation evidence

- Current accepted application commit `fe23649f36e0f2a0bb8ff409b2131d7e6383b3e6` passed `534/534` regression checks before Production release.
- TypeScript, Production build, Responsive, UI, UI interaction, Security, Server Boundary, Actions, Domain, Data State, Backup/Restore and `git diff --check` passed in that release closeout.
- Production `dpl_EkpZSGWL3Jxs468FAKwPhaEXsqpL` is `READY`; the formal alias is confirmed by Vercel inspection.
- Final mobile Backup/Restore acceptance is `PASS`, including the mandatory local pre-Restore backup gate and post-Restore core-page/amount check.

## 12. Handoff boundaries

- This governance closeout changes no business code, database, schema, migration, scheduler, SMTP or real-user data.
- This document intentionally does not authorize a deployment. It is a state record for the next Codex session.
