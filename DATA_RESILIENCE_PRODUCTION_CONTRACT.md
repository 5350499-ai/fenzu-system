# Production Data Resilience Contract

## User and server layers

The official JSON download is the user-controlled complete business backup. CSV/Excel exports are reports, not restore sources. Server recovery points are private, workspace-scoped JSON objects with checksum, format/schema versions, and metadata. Attachments are not part of ordinary Beta backup.

## Scheduler

The Vercel Cron route is server-only, requires `CRON_SECRET`, and is disabled unless `DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED=true`. A UTC date is the schedule slot. The database uniqueness boundary is `(workspace_owner_id, schedule_slot)` for scheduled points. Runs are recorded separately so retries are observable and idempotent.

## Health

HEALTHY means a recent successful scheduled point. WARNING means more than one daily period is overdue or a recent partial failure exists. ERROR means two consecutive failures or more than 48 hours without success. CRITICAL means scheduler/storage/metadata infrastructure failure. The owner-only health endpoint returns aggregate metadata only.

## Support recovery

Closed Beta support recovery remains an operationally gated capability: list metadata, dry-run, and actual restore require server-verified target workspace, mandatory reason, second confirmation, and audit logging. No operator may edit Supabase business rows manually. A full support impersonation endpoint is not enabled by this contract until its operator role and audit boundary are separately authorized.

## Account deletion

Recommended design: deletion request, seven-day cancellation window, no new writes while pending, final recovery point before cleanup, live-data cleanup, recovery-point retention for 30 days, audit logs for 90 days, and Auth deletion last. Self-service permanent deletion is out of scope for Closed Beta.
