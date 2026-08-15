# Data Resilience Contract

Status: `LOCAL_FOUNDATION_IMPLEMENTED_WITH_PRODUCTION_ACTIVATION_PENDING`

This contract extends the existing Backup/Restore root. It does not create a second restore engine and Excel/CSV exports are not restore sources.

## Three layers

1. **User-controlled backup**: the official checksummed JSON file downloaded by the current user. It is an independent copy with no guaranteed server retention.
2. **Account recovery points**: server-owned JSON payloads in private `system-backups`, indexed by `account_recovery_points`. The workspace owner is stored in metadata and the Storage path is generated server-side. `before_restore` points are recorded through the existing BeforeRestore flow.
3. **Platform disaster recovery**: Supabase database/Auth/Storage backup and restore facilities. Frequency, retention, PITR, plan support and operators require Production read-only verification; they are not inferred here.

## Contracts

- JSON backup contains the current official collections, format/schema version, checksum, record count, size and timezone metadata.
- Excel/CSV are reporting exports only.
- Ordinary Beta backups exclude attachment binary and restricted Partner/Settlement/account/admin data. Server-owned restricted data is not accepted from user-uploaded JSON.
- Recovery point payloads are private and server-owned. Direct anonymous/authenticated table access is denied; support access must use an audited server boundary.
- Restore eligibility requires an available point, checksum, known format/schema and server-owned path. Existing workspace remapping and transactional Restore remain canonical.
- Before Restore records a recovery point before database mutation; a failed metadata write blocks Restore instead of silently losing the safety net.

## Retention proposal

- scheduled daily points: 7 days;
- weekly roll-up points: 8 weeks;
- before-restore, before-destructive and manual support points: 30 days;
- maximum inventory: 40 points per workspace.

These are local-foundation defaults, not a Production SLA. Storage sizing must be measured against real Beta payload sizes before activation.

## Support recovery workflow

Verify workspace, list only its eligible points, dry-run, show record deltas, create a fresh BeforeRestore point, obtain explicit confirmation, run the canonical Restore RPC, verify counts/ownership and write an audit record. Operators must never edit business rows manually in Supabase.

## Recovery granularity

Current minimum is whole-workspace Restore plus existing archive/void semantics. Record/property-level undo is future work where a high-value hard delete cannot be recovered without rolling back unrelated work. Project/database recovery is a platform operation, not an application route.

## Health and compatibility

The inventory records source, checksum, size, schema/format, status and expiry. A future scheduler must report last success, last failure, consecutive failures, overdue state and storage usage. Unknown format/schema versions must be rejected or handled by an explicit adapter.

## Production activation pending

Verify Supabase plan-level database/Auth/Storage backup frequency, retention, PITR and operator permissions; confirm the private bucket policy; enable one scheduler; add alert ownership; test a synthetic account recovery point; and document account-deletion retention. None of those Production actions were performed by this change.
