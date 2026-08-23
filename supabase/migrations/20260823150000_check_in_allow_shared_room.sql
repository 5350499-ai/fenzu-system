-- Restore the product rule that any non-archived room may receive another tenant.
-- This is intentionally a fail-closed in-place function correction: it reads the
-- current 19-argument canonical function and changes only the bad eligibility
-- predicates. No business rows are modified and the occupant-count wrapper is
-- not touched.

begin;

do $$
declare
  v_function text;
  v_normalized text;
  v_old text := 'if not found or coalesce(v_room.status, '''') in (''已租'', ''occupied'') or exists ( select 1 from public.tenants where room_id = p_room_id and status in (''在租'', ''current'') ) or coalesce(v_room.status, '''') like';
  v_new text := 'if not found or coalesce(v_room.status, '''') like';
begin
  select pg_get_functiondef(
    'public.create_atomic_check_in(uuid,uuid,uuid,text,text,text,numeric,numeric,numeric,smallint,date,date,date,date,text,text,text,text,text)'::regprocedure
  ) into v_function;

  if v_function is null then
    raise exception 'canonical create_atomic_check_in function was not found';
  end if;
  v_normalized := regexp_replace(v_function, '\s+', ' ', 'g');

  if position(v_old in v_normalized) = 0
     or position('from public.rooms where id = p_room_id and property_id = p_property_id and user_id = v_actor.workspace_owner_id for update' in v_normalized) = 0
     or position('coalesce(v_room.status, '''') like ''%归档%''' in v_normalized) = 0
     or position('v_has_rent_state := v_rent_due > 0 or v_rent_paid > 0 or v_rent_unpaid > 0' in v_normalized) = 0
     or position('if v_has_rent_state then insert into public.rent_payments' in regexp_replace(v_normalized, '\s+', ' ', 'g')) = 0
     or position('insert into public.deposits' in v_normalized) = 0
     or position('rent_payment_id = v_payment_id' in v_normalized) = 0 then
    raise exception 'canonical create_atomic_check_in reviewed structure does not match; refusing to alter unknown function';
  end if;

  v_function := regexp_replace(
    v_function,
    'if not found\s+or coalesce\(v_room\.status, ''''\) in \(''已租'', ''occupied''\)\s+or exists \(\s+select 1 from public\.tenants\s+where room_id = p_room_id\s+and status in \(''在租'', ''current''\)\s+\)\s+or coalesce\(v_room\.status, ''''\) like',
    'if not found or coalesce(v_room.status, '''') like',
    1,
    1
  );

  if position(v_old in regexp_replace(v_function, '\s+', ' ', 'g')) > 0 then
    raise exception 'canonical create_atomic_check_in eligibility blockers were not fully removed';
  end if;

  execute v_function;
end;
$$;

commit;
