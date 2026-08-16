# Production Data Resilience Contract

## User and server layers

The official JSON download is the user-controlled complete business backup. CSV/Excel exports are reports, not restore sources. Server recovery points are private, workspace-scoped JSON objects with checksum, format/schema versions, and metadata. Attachments are not part of ordinary Beta backup.

## Scheduler

The Vercel Cron route is server-only, requires `CRON_SECRET`, and is disabled unless `DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED=true`. A UTC date is the schedule slot. The database uniqueness boundary is `(workspace_owner_id, schedule_slot)` for scheduled points. Runs are recorded separately so retries are observable and idempotent.

## Health

HEALTHY means a recent successful scheduled point. WARNING means more than one daily period is overdue or a recent partial failure exists. ERROR means two consecutive failures or more than 48 hours without success. CRITICAL means scheduler/storage/metadata infrastructure failure. The owner-only health endpoint returns aggregate metadata only.

## Support recovery

Closed Beta support recovery remains an operationally gated capability: list metadata, dry-run, and actual restore require server-verified target workspace, mandatory reason, second confirmation, and audit logging. No operator may edit Supabase business rows manually. A full support impersonation endpoint is not enabled by this contract until its operator role and audit boundary are separately authorized.

The local/Closed Beta support API therefore exposes only owner-scoped metadata and dry-run. The authenticated workspace owner performs any actual Restore through the existing Restore route. This is the intentional least-privilege alternative.

Storage integrity states are `HEALTHY`, `ERROR`, `ORPHAN_REVIEW_REQUIRED`, `CORRUPT`, `EXPIRED`, and `SECURITY_ERROR`. Orphans are reported and never automatically deleted.

## Account deletion

Recommended design: deletion request, seven-day cancellation window, no new writes while pending, final recovery point before cleanup, live-data cleanup, recovery-point retention for 30 days, audit logs for 90 days, and Auth deletion last. Self-service permanent deletion is out of scope for Closed Beta.

## Operational failure matrix

| Condition | User impact | Automatic protection | Support action | Retry/Restore | Stop condition |
| --- | --- | --- | --- | --- | --- |
| Storage object missing | Point unavailable | Eligibility becomes false | Verify metadata/path; do not download payload | Retry only after infrastructure check; no Restore | Latest usable point is unavailable |
| Checksum mismatch or corrupt JSON | Point unavailable | Server-side Restore rejection | Mark corrupt and preserve evidence | No Restore; use another eligible point | Any candidate is corrupt |
| Schema/format mismatch | Restore blocked | Compatibility gate rejects unknown version | Record version and escalate to adapter owner | No retry loop; no Restore | Unknown format is selected |
| Storage unavailable | Backup/recovery point may fail | Per-workspace failure isolation | Check Storage health/logs and retry once after recovery | Retry allowed; no manual object edits | Repeated permission/quota failure |
| Database unavailable | API operation unavailable | Transaction/error boundary | Check Supabase health and Vercel logs | Retry only after availability returns | Broad outage or repeated 5xx |
| Restore dry-run failure | No data mutation | Dry-run gate blocks Restore | Capture code/summary, verify workspace and point | No actual Restore until dry-run passes | Any cross-workspace or integrity error |
| BeforeRestore failure | Restore blocked | Restore must not continue | Preserve current data and metadata; escalate | No Restore retry until cause is known | Safety point cannot be created |
| Metadata insert failure | Point incomplete | Upload compensation or integrity review | Do not report success; inspect orphan state | Retry after cleanup/reconciliation | Orphan cannot be explained |
| Partial scheduler failure | One workspace may miss a point | Other workspaces continue | Review aggregate counts and failed workspace metadata | Retry failed workspace only | Cross-workspace anomaly or global failure |
| Account/workspace mismatch | Restore must be denied | Server ownership check | Re-verify authenticated owner context | No retry with a different client-supplied ID | Any forged target is accepted |

Support must never repair business rows directly in Supabase. Preserve metadata and Storage evidence until the incident is closed.
