# Data Resilience Production Activation Runbook

This runbook is a design artifact only. No step is active until explicitly authorized.

## Activation order and migration checkpoints

1. Read-only preflight: confirm project identity, plan, bucket, migration status, secrets, and a clean release commit.
2. Apply `20260815140000_account_recovery_points.sql` and `20260815150000_recovery_scheduler_foundation.sql` during an approved maintenance window.
3. Verify table constraints, service-role grants, private `system-backups`, and the partial schedule-slot uniqueness index.
4. Deploy the application code with `DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED=false`.
5. Verify the scheduler route returns `SCHEDULER_DISABLED` without changing data.
6. Configure `CRON_SECRET` and keep the feature flag disabled.
7. Perform a separately approved synthetic-account drill: scheduled point, dry-run restore, equivalence check, and cleanup.
8. Verify owner-only health endpoint and logs; do not expose payloads or signed URLs.
9. Enable the flag only after an explicit activation checkpoint, then observe one UTC daily slot.
10. Expand to Beta workspaces after the first successful health window.

## Rollback

Disable the feature flag and Cron invocation. Preserve recovery metadata and objects. Do not manually edit business rows. Investigate failed or orphaned objects with the integrity report before any cleanup.

## Production activation requirements

- Explicit authorization for both migrations, application deployment, Cron configuration, `CRON_SECRET`, and feature-flag enablement.
- Confirmed Supabase Free-plan residual risk acceptance or approved Pro/PITR upgrade.
- Confirmed support recovery operator and audit process.
- A synthetic workspace and a tested restore plan.

## Closed Beta defaults

- UTC daily schedule, with deterministic workspace staggering in the worker.
- Daily retention 7 days, event retention 30 days, weekly policy reserved for future scheduled expansion, maximum 40 points per workspace.
- Retry failed workspaces on the next invocation; one workspace failure must not abort the batch.
