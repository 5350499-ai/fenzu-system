-- Restore the product rule that any non-archived room may receive another tenant.
-- This is intentionally a fail-closed in-place function correction: it reads the
-- current 19-argument canonical function and changes only the bad eligibility
-- predicates. No business rows are modified and the occupant-count wrapper is
-- not touched.

begin;

do $$
declare
  v_function text;
  v_old text := $old$
if not found
     or coalesce(v_room.status, '') in ('已租', 'occupied')
     or exists (
       select 1 from public.tenants
       where room_id = p_room_id
         and status in ('在租', 'current')
     )
     or coalesce(v_room.status, '') like$old$;
  v_new text := $new$
if not found
     or coalesce(v_room.status, '') like$new$;
begin
  select pg_get_functiondef(
    'public.create_atomic_check_in(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint,date,date,date,date,text,text,text,text,text)'::regprocedure
  ) into v_function;

  if v_function is null then
    raise exception 'canonical create_atomic_check_in function was not found';
  end if;
  if position(v_old in v_function) = 0 then
    raise exception 'canonical create_atomic_check_in eligibility predicate does not match the reviewed Production shape';
  end if;

  v_function := replace(v_function, v_old, v_new);
  execute v_function;
end;
$$;

commit;
