-- Retain only canonical non-contact booking details while choosing a restaurant.
create or replace function public.valid_whatsapp_pending_intent(p_text text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_text is null or (char_length(p_text)<=200 and (p_text in
    ('reservar','cambiar reserva','cancelar reserva','carta','horario','direccion','persona')
    or p_text ~ '^reservar(?: para (?:cenar|comer|desayunar))?(?: para \d{1,3} personas)?(?: (?:hoy|manana|pasado manana|el (?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)))?(?: a las \d{1,2}:[0-5]\d)?$'));
$$;
revoke all on function public.valid_whatsapp_pending_intent(text) from public,anon,authenticated;
grant execute on function public.valid_whatsapp_pending_intent(text) to service_role;
alter table public.whatsapp_inbox_contacts drop constraint whatsapp_inbox_contacts_pending_intent_check;
alter table public.whatsapp_inbox_contacts add constraint whatsapp_inbox_contacts_pending_intent_check
  check(public.valid_whatsapp_pending_intent(pending_intent));

create or replace function public.complete_whatsapp_inbox_selection(p_phone_number_id text,p_contact_phone text,
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
  if p_pending_intent is not null and not public.valid_whatsapp_pending_intent(p_pending_intent) then return false; end if;
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
