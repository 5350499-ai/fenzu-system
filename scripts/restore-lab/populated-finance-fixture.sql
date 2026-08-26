-- Local-only populated Restore acceptance fixture. Never run against a linked
-- or Production database. Values are synthetic and intentionally cover the
-- separated, legacy-mixed, renewal, void and deleted-receipt contracts.
begin;
insert into auth.users (id, email, deleted_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'restore-owner@example.invalid', null)
on conflict (id) do nothing;
insert into public.user_profiles (auth_user_id, workspace_owner_id, username, display_name, account_type, status, property_access_mode, account_plan)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','restore-owner','Restore owner','owner','active','all','free_single')
on conflict (auth_user_id) do update set status='active', account_type='owner', account_plan='free_single';

insert into public.properties (id,user_id,landlord_name,name,address,city,property_type,sublet_allowed,notes)
values ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Synthetic','Restore Lab','Local','Madrid','测试',true,'restore acceptance fixture');
insert into public.rooms (id,user_id,property_id,name,room_number,monthly_rent,deposit_amount,status,notes) values
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Room A','A',10,20,'已租','separated'),
 ('22222222-2222-4222-8222-222222222223','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Room B','B',1,2,'已租','one-click'),
 ('22222222-2222-4222-8222-222222222224','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Room C','C',3,4,'已租','legacy-mixed renewal');
insert into public.tenants (id,user_id,property_id,room_id,name,phone,status,monthly_rent,deposit_amount,notes) values
 ('33333333-3333-4333-8333-333333333331','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','Tenant A','000','在租',10,20,'normal'),
 ('33333333-3333-4333-8333-333333333332','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','Tenant B','001','在租',1,2,'separated'),
 ('33333333-3333-4333-8333-333333333333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222224','Tenant C','002','在租',3,2,'legacy mixed');
insert into public.contracts (id,user_id,property_id,room_id,tenant_id,start_date,monthly_rent,deposit_amount,status,notes) values
 ('44444444-4444-4444-8444-444444444441','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333331','2026-08-01',10,20,'有效','normal'),
 ('44444444-4444-4444-8444-444444444442','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','33333333-3333-4333-8333-333333333332','2026-08-01',1,2,'有效','separated'),
 ('44444444-4444-4444-8444-444444444443','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222224','33333333-3333-4333-8333-333333333333','2026-08-01',3,2,'有效','legacy mixed');
insert into public.deposits (id,user_id,tenant_id,property_id,room_id,transaction_type,amount,transaction_date,status,notes) values
 ('66666666-6666-4666-8666-666666666661','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333331','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','收取',20,'2026-08-01','已收','normal'),
 ('66666666-6666-4666-8666-666666666662','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','收取',2,'2026-08-01','已收','separated'),
 ('66666666-6666-4666-8666-666666666663','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222224','收取',2,'2026-08-01','已收','legacy mixed'),
 ('66666666-6666-4666-8666-666666666665','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','收取',4,'2026-09-01','已收','renewal'),
 ('66666666-6666-4666-8666-666666666664','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333331','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','收取',5,'2026-08-02','已作废','void');
insert into public.rent_payments (id,user_id,tenant_id,property_id,room_id,rent_month,amount_due,amount_paid,amount_unpaid,payment_date,payment_status,income_type,income_item,source_deposit_id,notes) values
 ('55555555-5555-4555-8555-555555555551','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333331','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-08-01',10,10,0,'2026-08-01','已收','房租收入','rent','66666666-6666-4666-8666-666666666661','normal'),
 ('55555555-5555-4555-8555-555555555552','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','2026-08-01',1,1,0,'2026-08-01','已收','房租收入','rent','66666666-6666-4666-8666-666666666662','separated'),
 ('55555555-5555-4555-8555-555555555553','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333332','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222223','2026-09-01',3,3,0,'2026-09-01','已收','房租收入','renewal','66666666-6666-4666-8666-666666666665','renewal rent'),
 ('55555555-5555-4555-8555-555555555554','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222224','2026-08-01',3,3,0,'2026-08-01','已收','房租收入','legacy','66666666-6666-4666-8666-666666666663','legacy mixed'),
 ('55555555-5555-4555-8555-555555555555','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333331','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','2026-10-01',5,5,0,'2026-10-01','已作废','房租收入','void',null,'void');
insert into public.expenses (id,user_id,property_id,expense_month,category,amount,payment_date,is_paid,notes) values ('77777777-7777-4777-8777-777777777777','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','2026-08-01','测试支出',5,'2026-08-01',true,'fixture');
insert into public.check_in_requests (client_request_id,actor_user_id,workspace_owner_id,tenant_id,contract_id,rent_payment_id,deposit_id,result,completed_at) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333332','44444444-4444-4444-8444-444444444442','55555555-5555-4555-8555-555555555552','66666666-6666-4666-8666-666666666662','{"receiptDeleted":false,"tenantId":"33333333-3333-4333-8333-333333333332"}'::jsonb,now()),
 ('dddddddd-dddd-4ddd-8ddd-ddddddddddde','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444443','55555555-5555-4555-8555-555555555554','66666666-6666-4666-8666-666666666663','{"receiptDeleted":false,"legacyMixed":true}'::jsonb,now()),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,null,null,null,'{"receiptDeleted":true,"paymentId":null,"depositId":null}'::jsonb,now());
insert into public.tenant_create_requests (client_request_id,actor_user_id,workspace_owner_id,tenant_id,contract_id,rent_payment_id,deposit_id,result,completed_at) values
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333331','44444444-4444-4444-8444-444444444441','55555555-5555-4555-8555-555555555551','66666666-6666-4666-8666-666666666661','{"tenantId":"33333333-3333-4333-8333-333333333331","contractId":"44444444-4444-4444-8444-444444444441","rentPaymentId":"55555555-5555-4555-8555-555555555551","depositId":"66666666-6666-4666-8666-666666666661"}'::jsonb,now());
insert into public.viewing_appointments (id,user_id,property_id,room_id,appointment_date,appointment_time,contact_name,contact_whatsapp,contact_phone,status,notes)
values ('88888888-8888-4888-8888-888888888881','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222224','2026-08-05','10:00','Prospect','+34000000000','600000000','已完成','fixture appointment');
insert into public.tasks (id,user_id,task_type,title,description,due_date,status,priority,property_id,room_id,tenant_id,contract_id,rent_payment_id,deposit_id,notes)
values ('99999999-9999-4999-8999-999999999991','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','maintenance','Fixture task','Restore acceptance task','2026-08-10','待办','高','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333331','44444444-4444-4444-8444-444444444441','55555555-5555-4555-8555-555555555551','66666666-6666-4666-8666-666666666661','fixture task');
insert into public.partners (id,workspace_owner_id,legacy_code,display_name,color_key,sort_order,is_active)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','P-A','Partner A','blue',1,true);
insert into public.partners (id,workspace_owner_id,legacy_code,display_name,color_key,sort_order,is_active)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','P-B','Partner B','green',2,true);
insert into public.partner_property_shares (id,workspace_owner_id,property_id,partner_id,percentage,effective_from)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaad','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',50,'2026-08-01');
insert into public.partner_property_shares (id,workspace_owner_id,property_id,partner_id,percentage,effective_from)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaae','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac',50,'2026-08-01');
insert into public.partner_name_history (id,workspace_owner_id,partner_id,old_display_name,new_display_name,changed_at,changed_by_account_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaf','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','Partner Old','Partner A','2026-08-01','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.partner_settlement_batches (id,workspace_owner_id,property_id,period_start,period_end,status,total_income,total_expense,net_profit,currency,confirmed_by_account_id,property_name_snapshot)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaba','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','2026-08-01','2026-08-31','confirmed',17,5,12,'EUR','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Restore Lab');
insert into public.partner_settlement_partner_snapshots (id,settlement_batch_id,partner_id,partner_display_name_snapshot,actual_collected,actual_paid,actual_retained,profit_entitlement,settlement_balance,share_segments_snapshot)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaabb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaba','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','Partner A',17,0,17,6,6,'[{"percentage":50}]'::jsonb);
insert into public.partner_settlement_segment_snapshots (id,settlement_batch_id,segment_start,segment_end,total_income,total_expense,net_profit,shares_snapshot)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaabc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaba','2026-08-01','2026-08-31',17,5,12,'[{"partnerId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab","percentage":50},{"partnerId":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac","percentage":50}]'::jsonb);
insert into public.partner_settlement_transfer_snapshots (id,settlement_batch_id,from_partner_id,to_partner_id,from_name_snapshot,to_name_snapshot,amount,currency)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaabd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaba','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaac','Partner A','Partner B',1,'EUR');
commit;
