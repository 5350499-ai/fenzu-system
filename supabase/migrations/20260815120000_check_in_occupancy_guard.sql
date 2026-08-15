-- Prevent a second active tenancy from being created for an occupied room.
-- The existing atomic check-in transaction remains the canonical write path.

do $$
declare
  v_function text;
begin
  select pg_get_functiondef('public.create_atomic_check_in(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint,date,date,date,date,text,text,text,text,text)'::regprocedure)
    into v_function;
  v_function := replace(
    v_function,
    'if not found or coalesce(v_room.status, '''') like',
    $replacement$if not found
     or coalesce(v_room.status, '') in ('已租', 'occupied')
     or exists (
       select 1 from public.tenants
       where room_id = p_room_id
         and status in ('在租', 'current')
     )
     or coalesce(v_room.status, '') like$replacement$
  );
  execute v_function;
end;
$$;
