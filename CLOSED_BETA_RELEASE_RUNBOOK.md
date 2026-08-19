# Closed Beta Release and Rollback Runbook

## Before release

- Confirm repository, branch, exact HEAD and clean workspace.
- Confirm Vercel project `fenzu-system`, domain `https://fenzu-system.vercel.app`, and Supabase project ref `wyeavtvksjjubicnyoje`.
- Run the complete validation gate, TypeScript, build, UI interaction tests and `git diff --check`.
- Review migration inventory; never run unknown or destructive migrations.
- Confirm `DATA_RESILIENCE_SCHEDULED_BACKUP_ENABLED=false` and real workspace scheduled backup is OFF.
- Record the verified Brevo Custom SMTP sender (`蜜蜂分租` / `s641776255s@outlook.com`) without recording credentials. Password reset and email-confirmation E2E are verified; never revert to an unverified sender.
- Confirm no secrets, logs, local DB files, credentials or backup payloads are in the commit.

## After Preview/Production deployment

- Check deployment status and public `/`, `/login`, `/register`.
- Check unauthenticated protected API semantics: 401/403 as expected.
- Check Vercel startup/runtime logs for 500, timeout, Auth, Storage, cache and recovery errors.
- Check aggregate schema/recovery health read-only; do not create points or Restore.
- Compare aggregate business row counts where authorized; do not inspect user payloads.
- Confirm Scheduler remains disabled and no scheduler run/point was created unexpectedly.
- Read-only confirm Supabase Auth Custom SMTP remains enabled with the verified sender; do not send test mail during release smoke.
- Preserve deployment ID, time window and observed status in the release record.

## Rollback

1. Stop rollout and set the scheduler feature flag OFF.
2. Disable/stop the affected Cron processing if it was enabled.
3. Roll back the Vercel deployment to the last known-good deployment using the Vercel control plane.
4. Preserve migrations, recovery metadata, Storage objects and audit logs.
5. Do not drop migration history, delete recovery objects, or manually edit business rows.
6. Re-run public and unauthorized API smoke checks.
7. Reproduce locally, patch minimally, validate, and obtain explicit authorization before another Production deployment.

## Release decision

Release is blocked by any cross-account anomaly, unexpected business-data change, failed Restore safety gate, repeated 5xx, secret exposure, or unexpected Scheduler activation. SMTP and the Production Synthetic Drill remain separate blockers and are not bypassed by this runbook.
