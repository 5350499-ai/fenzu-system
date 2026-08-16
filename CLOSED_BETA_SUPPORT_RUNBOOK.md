# Closed Beta Support Runbook

Scope: 5–10 Closed Beta users. This is an operational guide, not a substitute for the server security boundary. Never request a password, access token, JWT, backup payload, passport/NIE image or full tenant export from a user.

## First response

Record UTC time, account email in masked form, page/route, device/browser, user action, expected result, actual result, screenshot if available, and whether the issue is reproducible. Do not ask the user to retry a destructive action repeatedly.

Check in this order:

1. Production URL and deployment status.
2. Vercel runtime logs for the matching UTC window and route.
3. Supabase Auth/Database/Storage health.
4. Authenticated account/workspace identity and account status.
5. Relevant API response status/code, without exposing payloads.
6. Audit log and recovery-health aggregate where authorized.

## Common incidents

| User report | First checks | Canonical root | Read-only support action | User authorization / forbidden action |
| --- | --- | --- | --- | --- |
| 登录不了 | Login page, Auth status, account disabled/session revoked, rate limit | Auth login + account access | Check masked account state and logs | User must control credentials; never ask for password |
| 密码邮件没收到 | SMTP status, Auth log, email verified state, rate-limit result | Forgot-password/Auth provider | Explain current SMTP blocker and record timestamp | Do not resend repeatedly or change Auth directly |
| 房源/租客不见了 | Workspace identity, filters, archive/move-out state, API status | Business data ownership/read path | Verify account/workspace and audit metadata | No direct table edits or cross-workspace lookup |
| 收租重复了 | Payment request ID, response code, audit log, current payment state | `rent_payments` idempotency root | Compare aggregate/payment identity only | Do not delete or manually merge payments |
| 退租状态不对 | Move-out response, room occupancy, contract/lifecycle state | Move Out atomic route/RPC | Inspect transaction result and audit log | No manual tenant/room updates |
| 换房失败 | Target room occupancy, HTTP status/code, route logs | Move Room RPC and `room_unavailable` mapping | Confirm 409 vs 5xx and retry eligibility | Never bypass occupancy guard |
| 备份失败 | Backup route status, export permission, browser download/save result | Official JSON backup route | Retry once after session/network check; record error | Do not call hidden/debug export routes |
| 恢复失败 | Dry-run report, BeforeRestore status, point/file integrity | Safe Restore + Restore RPC | Stop, preserve BeforeRestore and diagnostics | No actual Restore without successful dry-run |
| 误删房源 | Account/workspace, audit log, recovery-point metadata | Destructive recovery point + Restore | List eligible metadata and dry-run | Owner must perform authenticated Restore; no manual SQL |
| 页面一直转圈 | Browser console summary, API pending/5xx, network state | Page loader/fetch owner | Refresh once, capture timestamp and route | Do not repeatedly submit financial actions |
| 手机打不开 | Production URL, viewport/browser, network, PWA cache | Responsive/PWA/runtime shell | Try private tab and network change; record device | No credential sharing or cache deletion as first step |
| 两个账号数据串了 | Logout/re-login, account snapshot key, `/api/accounts/me`, cache scope | Account access/cache isolation | Freeze further writes, capture IDs only, escalate P0 | No cross-account browsing or Restore |

## Recovery support workflow

User reports data anomaly → verify authenticated owner/workspace → list only recovery metadata → inspect integrity/eligibility → dry-run → show summary → obtain explicit owner confirmation → owner performs authenticated Safe Restore → verify counts/ownership/consistency → audit outcome.

Support may recommend and dry-run. Support may not directly edit business tables, download payloads, use service-role to impersonate a user, or restore another workspace. Preserve `account_recovery_points`, Storage objects, BeforeRestore evidence and audit logs during investigation.

## Operational recovery inventory

Read only: `workspace_owner_id` only after authorized target verification, `source`, `status`, `created_at`, `expires_at`, `size_bytes`, `record_count`, `storage_path` metadata, checksum/integrity result, eligibility and failure classification. Never expose payload, signed URL, tenant fields or secrets.

## Severity contract

- **P0**: cross-account data exposure, broad real-data loss, or login system unavailable for all users. Freeze writes/Restore expansion and escalate immediately.
- **P1**: duplicate financial write, Restore safety failure, lifecycle partial state, or core function unavailable for affected users. Stop the affected operation and preserve evidence.
- **P2**: single-page defect, recoverable API failure, confusing error or non-core feature failure. Triage in the next maintenance cycle.
- **P3**: cosmetic or minor usability issue without data/security impact.

## Abuse and rate-limit register

- Login/register/forgot-password: Supabase/Auth provider limits plus local forgot-password request limiter; SMTP is currently blocked and must not be retried repeatedly.
- Backup/Restore: authenticated permission boundary; Restore requires preview/dry-run and BeforeRestore. Monitor repeated failures and unusual volume.
- Scheduler: `CRON_SECRET` plus disabled feature flag; real workspace processing remains OFF.
- Admin/recovery routes: owner/admin server boundary; unauthenticated requests must fail closed.
- Destructive routes: server authorization, confirmation and recovery protection; no client-only authority.

Do not add Redis or a new abuse platform for this beta without a separate scope decision.

## Emergency account disable

Authorized owner/admin: verify target account → record reason → disable account → revoke sessions → confirm new writes are rejected → preserve business data and audit history. Do not delete Auth rows or business rows. If the account is not unambiguously identified, stop.

## Restore emergency freeze

Keep scheduler disabled, stop new Restore attempts, preserve metadata/objects/audit logs, and escalate. Do not drop recovery tables, delete objects, or hand-edit business data. Resume only after dry-run, ownership and integrity checks pass.

## Monitoring map

- Vercel logs: route status, runtime exceptions, timeout and deployment errors.
- Supabase Auth logs: login, verification and recovery acceptance/delivery errors.
- Supabase Database/Storage logs: availability, permission, quota and object failures.
- Application audit logs: authorized business actions and account security actions.
- `/api/admin/recovery-health`: aggregate recovery status only; no payloads or signed URLs.

## User feedback template

Ask only for: page, action, expected result, actual result, approximate time/timezone, phone/computer and optional screenshot. Never ask for passwords, tokens, identity documents, backup payloads or full database exports.
