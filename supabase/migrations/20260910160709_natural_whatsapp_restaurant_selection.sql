-- Natural restaurant selection. Only a short intent and restaurant IDs are retained.
alter table public.whatsapp_inbox_contacts
  add column remembered_restaurante_id uuid references public.restaurantes(id) on delete set null,
  add column suggested_restaurante_id uuid references public.restaurantes(id) on delete set null,
  add column pending_intent text check (pending_intent in ('reservar','cambiar reserva','cancelar reserva','carta','horario','direccion','persona'));

create or replace function public.begin_whatsapp_inbox_turn(p_phone_number_id text,p_contact_phone text,
  p_message_id text,p_lock_token uuid,p_test boolean,p_message_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.whatsapp_inbox_contacts%rowtype; m public.whatsapp_inbox_messages%rowtype; v_active boolean;
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
  v_active := c.expires_at>now() and (c.last_message_at at time zone 'Europe/Madrid')::date=(now() at time zone 'Europe/Madrid')::date;
  return jsonb_build_object('status','acquired',
    'restaurantId',case when v_active then c.restaurante_id else null end,
    'lastRestaurantId',case when c.last_message_at>now()-interval '7 days' then coalesce(c.restaurante_id,c.remembered_restaurante_id) else null end,
    'suggestedRestaurantId',case when v_active then c.suggested_restaurante_id else null end,
    'pendingIntent',case when v_active then c.pending_intent else null end,
    'awaitingRestaurantName',coalesce(v_active and c.restaurante_id is null and c.suggested_restaurante_id is null,false));
end;
$$;


-- The existing completion function remains available for deployments rolling out or rolling back.
create function public.complete_whatsapp_inbox_selection(p_phone_number_id text,p_contact_phone text,
  p_message_id text,p_lock_token uuid,p_test boolean,p_restaurante_id uuid,
  p_suggested_restaurante_id uuid,p_pending_intent text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_inbox_contacts%rowtype;
begin
  select * into c from public.whatsapp_inbox_contacts where phone_number_id=p_phone_number_id
    and contact_phone=p_contact_phone and test_mode=p_test and lock_token=p_lock_token and locked_until>now() for update;
  if not found then return false; end if;
  if p_restaurante_id is not null and p_suggested_restaurante_id is not null then return false; end if;
  if p_suggested_restaurante_id is not null and not exists(select 1 from public.list_whatsapp_restaurants(p_contact_phone) r
    where r.restaurante_id=p_suggested_restaurante_id) then return false; end if;
  if p_pending_intent is not null and p_pending_intent not in
    ('reservar','cambiar reserva','cancelar reserva','carta','horario','direccion','persona') then return false; end if;
  if not public.complete_whatsapp_inbox_turn(p_phone_number_id,p_contact_phone,p_message_id,p_lock_token,p_test,p_restaurante_id)
    then return false; end if;
  update public.whatsapp_inbox_contacts set
    remembered_restaurante_id=coalesce(p_restaurante_id,c.restaurante_id,c.remembered_restaurante_id),
    suggested_restaurante_id=p_suggested_restaurante_id,pending_intent=p_pending_intent
    where phone_number_id=p_phone_number_id and contact_phone=p_contact_phone and test_mode=p_test;
  return true;
end;
$$;
revoke all on function public.complete_whatsapp_inbox_selection(text,text,text,uuid,boolean,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.complete_whatsapp_inbox_selection(text,text,text,uuid,boolean,uuid,uuid,text) to service_role;

create or replace function public.purge_expired_chatbot_sessions()
returns integer language plpgsql security definer set search_path='' as $$
declare v_deleted integer;
begin
  delete from public.whatsapp_inbox_messages where created_at<now()-interval '7 days';
  update public.whatsapp_inbox_contacts set suggested_restaurante_id=null,pending_intent=null
    where expires_at<now() and (suggested_restaurante_id is not null or pending_intent is not null)
      and (locked_until is null or locked_until<now());
  delete from public.whatsapp_inbox_contacts where expires_at<now()-interval '7 days'
    and (locked_until is null or locked_until<now());
  delete from public.chatbot_sessions where expires_at<now() and (locked_until is null or locked_until<now());
  get diagnostics v_deleted=row_count;
  return v_deleted;
end;
$$;
