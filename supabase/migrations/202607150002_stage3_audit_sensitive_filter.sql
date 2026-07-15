-- Stage 3 follow-up: keep business audit data useful without copying sensitive tenant content.
-- Additive/replacement-only migration. It does not alter business tables or historical rows.

create or replace function app_private.audit_business_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  module_key text := tg_argv[0];
  before_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  source_data jsonb := coalesce(after_data, before_data);
  actor public.user_profiles%rowtype;
  action_name text := lower(tg_op);
  entity_uuid uuid := nullif(source_data->>'id','')::uuid;
  property_uuid uuid;
begin
  select * into actor from public.user_profiles where auth_user_id = (select auth.uid());
  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  property_uuid := case
    when tg_table_name = 'properties' then entity_uuid
    else nullif(source_data->>'property_id','')::uuid
  end;

  if tg_op = 'UPDATE' and (
    coalesce(before_data->>'status','') is distinct from coalesce(after_data->>'status','')
    or coalesce(before_data->>'notes','') is distinct from coalesce(after_data->>'notes','')
  ) and (
    coalesce(after_data->>'status','') ~ '归档|退租|结束|作废'
    or coalesce(after_data->>'notes','') ~ '归档|退租|结束|作废'
  ) then
    action_name := 'archive';
  end if;

  before_data := before_data - array[
    'phone','wechat','passport_number','nie_number','password','access_token',
    'refresh_token','service_role_key','authorization','cookie'
  ];
  after_data := after_data - array[
    'phone','wechat','passport_number','nie_number','password','access_token',
    'refresh_token','service_role_key','authorization','cookie'
  ];

  if tg_table_name = 'tenants' then
    before_data := before_data - 'notes';
    after_data := after_data - 'notes';
  elsif tg_table_name = 'tenant_notes' then
    before_data := before_data - 'content';
    after_data := after_data - 'content';
  end if;

  insert into public.audit_logs (
    log_category, actor_user_id, actor_username, actor_display_name, session_id,
    action_type, module_key, entity_type, entity_id, property_id, room_id, tenant_id,
    before_data, after_data, amount, description, success
  ) values (
    'business', actor.auth_user_id, actor.username, actor.display_name, (select auth.jwt()->>'session_id'),
    action_name, module_key, tg_table_name, entity_uuid, property_uuid,
    nullif(source_data->>'room_id','')::uuid, nullif(source_data->>'tenant_id','')::uuid,
    before_data, after_data,
    case
      when source_data ? 'amount_paid' then nullif(source_data->>'amount_paid','')::numeric
      when source_data ? 'amount' then nullif(source_data->>'amount','')::numeric
      else null
    end,
    tg_table_name || ' ' || action_name, true
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
