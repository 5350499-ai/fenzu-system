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
