-- One WhatsApp sender, explicit restaurant selection, private state and global dedupe.
create table public.whatsapp_restaurant_routes (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  routing_code text not null unique check (routing_code ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  enabled boolean not null default false,
  delivery_mode text not null default 'pilot' check (delivery_mode in ('pilot','live')),
  pilot_phones text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.whatsapp_inbox_contacts (
  phone_number_id text not null check (phone_number_id ~ '^[0-9]+$'),
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  test_mode boolean not null,
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  last_message_at timestamptz,
  expires_at timestamptz not null default now(),
  lock_token uuid,
  locked_until timestamptz,
  primary key (phone_number_id,contact_phone,test_mode)
);
create table public.whatsapp_inbox_messages (
  phone_number_id text not null,
  message_id text not null check (char_length(message_id) between 1 and 190),
  test_mode boolean not null,
  contact_phone text not null,
  message_at timestamptz not null,
  status text not null check (status in ('processing','completed','failed','stale')),
  restaurante_id uuid references public.restaurantes(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (phone_number_id,message_id,test_mode)
);
create index whatsapp_inbox_messages_retention on public.whatsapp_inbox_messages(created_at);
alter table public.whatsapp_restaurant_routes enable row level security;
alter table public.whatsapp_inbox_contacts enable row level security;
alter table public.whatsapp_inbox_messages enable row level security;
revoke all on public.whatsapp_restaurant_routes,public.whatsapp_inbox_contacts,public.whatsapp_inbox_messages from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_restaurant_routes,public.whatsapp_inbox_contacts,public.whatsapp_inbox_messages to service_role;

create function public.list_whatsapp_restaurants(p_contact_phone text)
returns table(restaurante_id uuid,display_name text,routing_code text,delivery_mode text)
language sql stable security definer set search_path='' as $$
  select r.id, r.nombre, c.routing_code, c.delivery_mode
  from public.whatsapp_restaurant_routes c
  join public.restaurantes r on r.id=c.restaurante_id
  join public.restaurante_modulos m on m.restaurante_id=r.id
  where c.enabled and m.chatbot and m.estado='activo'
    and (c.delivery_mode='live' or p_contact_phone=any(c.pilot_phones))
  order by c.routing_code;
$$;

create function public.begin_whatsapp_inbox_turn(p_phone_number_id text,p_contact_phone text,
  p_message_id text,p_lock_token uuid,p_test boolean,p_message_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_inbox_contacts%rowtype; m public.whatsapp_inbox_messages%rowtype;
begin
  if p_phone_number_id !~ '^[0-9]+$' or p_contact_phone !~ '^\+[1-9][0-9]{6,14}$'
    or char_length(coalesce(p_message_id,'')) not between 1 and 190 or p_lock_token is null
    or p_test is null or p_message_at is null then raise exception 'INVALID_INBOX_INPUT'; end if;
  insert into public.whatsapp_inbox_contacts(phone_number_id,contact_phone,test_mode)
    values(p_phone_number_id,p_contact_phone,p_test) on conflict do nothing;
  select * into c from public.whatsapp_inbox_contacts
    where phone_number_id=p_phone_number_id and contact_phone=p_contact_phone and test_mode=p_test for update;
  select * into m from public.whatsapp_inbox_messages
    where phone_number_id=p_phone_number_id and message_id=p_message_id and test_mode=p_test;
  if found and (m.contact_phone<>p_contact_phone or m.status in ('completed','stale')) then
    return jsonb_build_object('status','duplicate'); end if;
  if c.locked_until>now() then return jsonb_build_object('status','busy'); end if;
  if c.last_message_at is not null and p_message_at<c.last_message_at then
    return jsonb_build_object('status','stale'); end if;
  insert into public.whatsapp_inbox_messages(phone_number_id,message_id,test_mode,contact_phone,message_at,status)
    values(p_phone_number_id,p_message_id,p_test,p_contact_phone,p_message_at,'processing')
    on conflict(phone_number_id,message_id,test_mode) do update set status='processing'
    where public.whatsapp_inbox_messages.contact_phone=excluded.contact_phone;
  if not found then return jsonb_build_object('status','duplicate'); end if;
  update public.whatsapp_inbox_contacts set lock_token=p_lock_token,locked_until=now()+interval '2 minutes'
    where phone_number_id=p_phone_number_id and contact_phone=p_contact_phone and test_mode=p_test;
  return jsonb_build_object('status','acquired','restaurantId',case when c.expires_at>now() then c.restaurante_id else null end);
end;
$$;

create function public.complete_whatsapp_inbox_turn(p_phone_number_id text,p_contact_phone text,
  p_message_id text,p_lock_token uuid,p_test boolean,p_restaurante_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_message_at timestamptz;
begin
  perform 1 from public.whatsapp_inbox_contacts where phone_number_id=p_phone_number_id
    and contact_phone=p_contact_phone and test_mode=p_test and lock_token=p_lock_token and locked_until>now() for update;
  if not found then return false; end if;
  if p_restaurante_id is not null and not exists(select 1 from public.list_whatsapp_restaurants(p_contact_phone) r
    where r.restaurante_id=p_restaurante_id) then return false; end if;
  update public.whatsapp_inbox_messages set status='completed',restaurante_id=p_restaurante_id
    where phone_number_id=p_phone_number_id and message_id=p_message_id and test_mode=p_test
    and contact_phone=p_contact_phone and status='processing' returning message_at into v_message_at;
  if not found then return false; end if;
  update public.whatsapp_inbox_contacts set restaurante_id=p_restaurante_id,last_message_at=v_message_at,
    expires_at=now()+interval '30 minutes',lock_token=null,locked_until=null
    where phone_number_id=p_phone_number_id and contact_phone=p_contact_phone and test_mode=p_test;
  return true;
end;
$$;

create function public.fail_whatsapp_inbox_turn(p_phone_number_id text,p_contact_phone text,
  p_message_id text,p_lock_token uuid,p_test boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.whatsapp_inbox_contacts where phone_number_id=p_phone_number_id
    and contact_phone=p_contact_phone and test_mode=p_test and lock_token=p_lock_token for update;
  if not found then return false; end if;
  update public.whatsapp_inbox_messages set status='failed' where phone_number_id=p_phone_number_id
    and message_id=p_message_id and test_mode=p_test and contact_phone=p_contact_phone and status='processing';
  -- A failed switch must not leave the previous restaurant selected.
  update public.whatsapp_inbox_contacts set restaurante_id=null,lock_token=null,locked_until=null,expires_at=now()
    where phone_number_id=p_phone_number_id and contact_phone=p_contact_phone and test_mode=p_test;
  return true;
end;
$$;
revoke all on function public.list_whatsapp_restaurants(text),public.begin_whatsapp_inbox_turn(text,text,text,uuid,boolean,timestamptz),
  public.complete_whatsapp_inbox_turn(text,text,text,uuid,boolean,uuid),public.fail_whatsapp_inbox_turn(text,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.list_whatsapp_restaurants(text),public.begin_whatsapp_inbox_turn(text,text,text,uuid,boolean,timestamptz),
  public.complete_whatsapp_inbox_turn(text,text,text,uuid,boolean,uuid),public.fail_whatsapp_inbox_turn(text,text,text,uuid,boolean) to service_role;

create or replace function public.purge_expired_chatbot_sessions()
returns integer language plpgsql security definer set search_path='' as $$
declare v_deleted integer;
begin
  delete from public.whatsapp_inbox_messages where created_at<now()-interval '7 days';
  delete from public.whatsapp_inbox_contacts where expires_at<now()-interval '1 day'
    and (locked_until is null or locked_until<now());
  delete from public.chatbot_sessions where expires_at<now() and (locked_until is null or locked_until<now());
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$$;
