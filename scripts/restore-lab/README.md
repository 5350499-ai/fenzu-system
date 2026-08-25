# Local Restore acceptance lab

This directory is the local-only entry point for the Restore architectural
acceptance environment. It is intentionally separate from Production and does
not create or link a cloud Supabase project.

The repository migrations remain the Production upgrade path. A fresh local
bootstrap must additionally pass the gates in `bootstrap-manifest.json`; it
must not seed the Production owner identity or silently apply historical SQL
patches. A failed gate is a bootstrap failure, not a Restore pass.

Required evidence for release is generated only after a fresh empty database
has passed schema parity, the 18-table Restore, populated finance fixtures,
replay tests, and rollback injection. Existing local volumes are retained as
historical evidence, not used to claim a clean rebuild.

## Automated acceptance runner

With a local project running and `RESTORE_LAB_SERVICE_ROLE_KEY` set to the
local-only Storage secret, run:

```powershell
$env:RESTORE_LAB_API_URL = "http://127.0.0.1:54321"
$env:RESTORE_LAB_DB_CONTAINER = "supabase_db_fenzu-restore-clean-bootstrap-15"
npm run test:restore-lab
```

The runner writes only local evidence under `reports/restore-lab/`. It creates
and downloads a BeforeRestore recovery point, verifies its SHA-256, uses the
downloaded bytes as the Restore input, runs five full Dry Run/Restore rounds,
and records rollback diagnostics outside the database transaction. It must not
be pointed at a linked or Production project.
