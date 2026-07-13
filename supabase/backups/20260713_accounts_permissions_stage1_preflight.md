# Stage 1 Preflight Baseline

Captured: 2026-07-13 before applying the accounts and permissions migration.

## Migration State

- Supabase migration history returned no registered migrations.
- Existing SQL files were previously applied manually through SQL Editor.
- The new migration is additive and contains its own fixed-owner identity guard.

## Fixed Owner

- Email: `5350499@qq.com`
- Auth user ID: `57b1a78b-d3fe-4e6f-bd9a-055ce1527936`
- Auth row is present, not deleted, and not banned.
- Email and Auth user ID matched in both lookup directions.

## Business Row Counts

| Table | Rows |
| --- | ---: |
| properties | 1 |
| rooms | 4 |
| tenants | 3 |
| contracts | 1 |
| rent_payments | 3 |
| expenses | 22 |
| deposits | 0 |
| tasks | 0 |
| tenant_notes | 0 |
| contract_files | 0 |
| rent_payment_files | 0 |
| expense_files | 2 |
| relevant storage.objects | 2 |

All existing business rows are owned by the fixed owner Auth user ID.

## Existing Permission Objects

Before Phase 1, these objects did not exist:

- `user_profiles`
- `user_permissions`
- `user_sensitive_permissions`
- `user_property_access`
- `app_sessions`
- `audit_logs`

## Existing RLS Baseline

Core business tables use the permissive policy `Users can manage own rows`:

```sql
using (auth.uid() = user_id)
with check (auth.uid() = user_id)
```

This policy exists on `properties`, `rooms`, `tenants`, `contracts`,
`rent_payments`, `expenses`, `deposits`, `tasks`, and `tenant_notes`.

File metadata tables use separate owner-only SELECT, INSERT, UPDATE where
present, and DELETE policies with the same `auth.uid() = user_id` rule:

- `contract_files`
- `rent_payment_files`
- `expense_files`

Private Storage objects use bucket-specific policies and require the first path
segment to equal `auth.uid()::text` for `contract-files`,
`rent-payment-files`, and `expense-files`.

Phase 1 does not remove, rename, or replace any of these policies. It only adds
the `stage1_owner_compatibility` policy to public business and file metadata
tables. Storage policies are left unchanged.

## Rollback

Run `supabase/rollbacks/20260713154204_accounts_permissions_stage1_rollback.sql`.
It removes only the new compatibility policies. It does not drop tables,
truncate data, modify Auth users, alter passwords, or delete the seeded owner
profile.
