-- Correct the owner display name using ASCII-only Unicode escapes so the SQL
-- remains stable across PowerShell and SQL transport encodings.

update public.user_profiles
set
  display_name = U&'\4E3B\7BA1\7406\5458',
  updated_at = now(),
  updated_by = '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid
where auth_user_id = '57b1a78b-d3fe-4e6f-bd9a-055ce1527936'::uuid
  and account_type = 'owner';
