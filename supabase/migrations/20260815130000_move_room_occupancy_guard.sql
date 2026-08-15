-- Reject moving a tenant into a room that already has an active tenant.
-- The existing atomic assignment RPC remains the canonical write path.

do $migration$
declare
  v_function text;
begin
  select pg_get_functiondef('public.update_tenant_current_assignment(uuid,uuid,uuid,text,text,text,text,numeric,numeric,smallint,text,text)'::regprocedure)
    into v_function;
  v_function := replace(
    v_function,
    '  update public.tenants' || E'\r\n  set',
    $replacement$  if v_new_room.id <> v_old_room.id and exists (
    select 1 from public.tenants
    where room_id = v_new_room.id
      and status in ('在租', 'current')
      and id <> p_tenant_id
  ) then
    raise exception using errcode = 'P0001', message = 'room unavailable';
  end if;

  update public.tenants
  set$replacement$
  );
  execute v_function;
end;
$migration$;
