create or replace function app_private.validate_partner_count()
returns trigger
language plpgsql
security invoker
set search_path = public, app_private
as $$
declare
  workspace_id uuid := coalesce(new.workspace_owner_id, old.workspace_owner_id);
  active_count integer;
begin
  select count(*) into active_count from public.partners
    where workspace_owner_id = workspace_id and is_active;
  if active_count > 10 then
    raise exception 'A workspace may have at most ten active partners';
  end if;
  if active_count < 1 then
    raise exception 'A workspace must keep at least one active partner';
  end if;
  if tg_op = 'delete' then return old; end if;
  return new;
end $$;
