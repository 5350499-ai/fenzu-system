-- Phase 2 follow-up: custom accounts use exact app-session revocation.
-- Owner legacy sessions retain the timestamp guard until all owner logins have
-- passed through the Phase 2 login route.

begin;

create or replace function app_private.is_app_session_valid()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles p
    where p.auth_user_id = (select auth.uid())
      and p.status = 'active'
      and (
        p.account_type = 'custom'
        or p.sessions_revoked_at is null
        or (
          nullif((select auth.jwt() ->> 'iat'), '') is not null
          and to_timestamp(((select auth.jwt() ->> 'iat'))::double precision)
            > p.sessions_revoked_at
        )
      )
      and not exists (
        select 1
        from public.app_sessions revoked_session
        where revoked_session.session_id = (select auth.jwt() ->> 'session_id')
          and revoked_session.user_id = p.auth_user_id
          and revoked_session.status = 'revoked'
      )
      and (
        p.account_type = 'owner'
        or exists (
          select 1
          from public.app_sessions active_session
          where active_session.session_id = (select auth.jwt() ->> 'session_id')
            and active_session.user_id = p.auth_user_id
            and active_session.status = 'active'
        )
      )
  );
$$;

revoke all on function app_private.is_app_session_valid() from public;
grant execute on function app_private.is_app_session_valid() to authenticated;

commit;
