-- A review worker can spend time checking the connected device. Recheck the
-- visit and permission immediately before handing the message to that device.
-- This does not reacquire or replace the original single-use delivery token.
create or replace function public.recheck_visit_review_delivery(
  p_event_id text, p_lock_token uuid, p_restaurante_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  d public.reservation_webhook_deliveries%rowtype;
  r public.reservas%rowtype;
  c public.clientes%rowtype;
  q public.visit_review_requests%rowtype;
  a public.automatizaciones_config%rowtype;
  v_url text;
  v_name text;
begin
  if p_lock_token is null or p_restaurante_id is null then
    return jsonb_build_object('allowed',false,'reason','delivery_lock_lost');
  end if;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id;
  if d.event_type is distinct from 'visit.review_request' or d.restaurante_id is distinct from p_restaurante_id then
    return jsonb_build_object('allowed',false,'reason','review_not_found');
  end if;
  -- Match the original delivery RPC's lock order.
  select * into r from public.reservas where id=d.reservation_id for update;
  select * into c from public.clientes where id=r.cliente_id and restaurante_id=r.restaurante_id for update;
  select * into q from public.visit_review_requests where reserva_id=r.id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id for update;
  select * into a from public.automatizaciones_config where restaurante_id=r.restaurante_id;
  if d.status is distinct from 'processing' or d.lock_token is distinct from p_lock_token
    or q.active_delivery_token is distinct from p_lock_token then
    return jsonb_build_object('allowed',false,'reason','delivery_lock_lost');
  end if;
  if q.id is null or d.payload->>'reviewRequestId' is distinct from q.id::text then
    return jsonb_build_object('allowed',false,'reason','legacy_review_request');
  end if;
  if c.id is null or q.cliente_id is distinct from c.id or d.cliente_id is distinct from c.id
    or q.restaurante_id is distinct from p_restaurante_id or r.restaurante_id is distinct from p_restaurante_id
    or d.restaurante_id is distinct from p_restaurante_id then
    return jsonb_build_object('allowed',false,'reason','review_customer_changed');
  end if;
  if q.sent_at is not null or q.status in ('prepared','uncertain','cancelled') or c.ya_dejo_resena is true then
    return jsonb_build_object('allowed',false,'reason','review_already_handled');
  end if;
  if r.atendida is not true or lower(coalesce(r.estado,'')) not in ('pendiente','confirmada','confirmado','ha venido','completada','completado') then
    return jsonb_build_object('allowed',false,'reason','visit_not_completed');
  end if;
  if q.scheduled_for is null or q.scheduled_for>now() then
    return jsonb_build_object('allowed',false,'reason','review_not_due');
  end if;
  if q.scheduled_for<now()-interval '24 hours' then
    return jsonb_build_object('allowed',false,'reason','review_delivery_expired');
  end if;
  if review_private.has_consent(r.restaurante_id,c.id) is not true then
    return jsonb_build_object('allowed',false,'reason','review_consent_missing');
  end if;
  if a.enabled is not true or a.review_enabled is not true or a.whatsapp_enabled is not true
    or a.delivery_mode is distinct from d.delivery_mode
    or not exists(select 1 from public.restaurante_modulos
      where restaurante_id=r.restaurante_id and resenas is true and automatizaciones is true) then
    return jsonb_build_object('allowed',false,'reason','review_automatic_disabled');
  end if;
  select google_review_url,nombre into v_url,v_name from public.restaurantes where id=r.restaurante_id;
  if review_private.valid_google_url(v_url) is not true then
    return jsonb_build_object('allowed',false,'reason','review_google_url_missing');
  end if;
  return jsonb_build_object('allowed',true,'token',q.public_token,'name',coalesce(c.nombre,r.nombre_cliente,'Cliente'),
    'phone',coalesce(c.telefono,r.telefono),'restaurantName',v_name,'deliveryMode',d.delivery_mode);
end;
$$;

revoke all on function public.recheck_visit_review_delivery(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.recheck_visit_review_delivery(text,uuid,uuid) to service_role;

-- Reconcile an authenticated provider ACK after a timeout or lost HTTP reply.
-- The outbox row provides the original event and delivery lock; neither comes
-- from untrusted WhatsApp message text. No new message is sent here.
create or replace function public.reconcile_waha_review_ack(p_message_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  m public.whatsapp_channel_messages%rowtype;
  d public.reservation_webhook_deliveries%rowtype;
  q public.visit_review_requests%rowtype;
  v_restaurante_id uuid;
  v_receipt text;
begin
  select * into m from public.whatsapp_channel_messages where id=p_message_id;
  if m.id is null or m.direction<>'outbound' or m.purpose<>'review' or m.ack<1 or m.status<>'sent'
    or nullif(m.outgoing_message_id,'') is null or m.engine_response->>'automationEventId' is distinct from m.provider_message_id then return false; end if;
  select restaurante_id into v_restaurante_id from public.whatsapp_channels where id=m.channel_id;
  select * into d from public.reservation_webhook_deliveries where event_id=m.provider_message_id;
  if d.event_type is distinct from 'visit.review_request' or d.restaurante_id is distinct from v_restaurante_id
    or d.delivery_mode is distinct from 'live' then return false; end if;
  perform 1 from public.reservas where id=d.reservation_id for update;
  perform 1 from public.clientes where id=d.cliente_id for update;
  select * into q from public.visit_review_requests where reserva_id=d.reservation_id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=m.provider_message_id for update;
  select * into m from public.whatsapp_channel_messages where id=p_message_id for update;
  if q.id is null or q.restaurante_id is distinct from v_restaurante_id or q.cliente_id is distinct from d.cliente_id
    or d.restaurante_id is distinct from v_restaurante_id or d.event_type is distinct from 'visit.review_request'
    or d.payload->>'reviewRequestId' is distinct from q.id::text
    or m.status<>'sent' or m.ack<1 or nullif(m.outgoing_message_id,'') is null then return false; end if;
  v_receipt:='waha:'||m.outgoing_message_id;
  if q.sent_at is not null then return q.provider_message_id=v_receipt; end if;
  if q.active_delivery_token is null or q.active_delivery_token::text is distinct from m.engine_response->>'reviewLockToken' then return false; end if;
  update public.visit_review_requests set status=case when status='cancelled' then status else 'sent' end,
    sent_at=now(),send_method='whatsapp',provider_message_id=v_receipt,active_delivery_token=null,last_error=null,updated_at=now() where id=q.id;
  update public.reservation_webhook_deliveries set status='delivered',delivered_at=now(),http_status=200,last_error=null,
    locked_at=null,lock_token=null,updated_at=now() where event_id=d.event_id;
  update public.reservas set resena_solicitada=true where id=d.reservation_id and restaurante_id=v_restaurante_id;
  return true;
end;
$$;

-- Only a known pre-send failure may be rescheduled. A sending/uncertain ledger
-- row, exhausted attempt limit or a review more than a day late cannot retry.
create or replace function public.defer_visit_review_delivery(
  p_event_id text,p_lock_token uuid,p_restaurante_id uuid,p_error text
)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  d public.reservation_webhook_deliveries%rowtype;
  q public.visit_review_requests%rowtype;
  a public.automatizaciones_config%rowtype;
begin
  if p_lock_token is null or p_restaurante_id is null then return 'refused'; end if;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id;
  if d.event_type is distinct from 'visit.review_request' or d.restaurante_id is distinct from p_restaurante_id then return 'refused'; end if;
  perform 1 from public.reservas where id=d.reservation_id for update;
  perform 1 from public.clientes where id=d.cliente_id for update;
  select * into q from public.visit_review_requests where reserva_id=d.reservation_id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id for update;
  select * into a from public.automatizaciones_config where restaurante_id=p_restaurante_id;
  if d.status is distinct from 'processing' or d.lock_token is distinct from p_lock_token
    or q.active_delivery_token is distinct from p_lock_token or q.id is null
    or q.sent_at is not null or q.status in ('uncertain','cancelled','prepared') then return 'refused'; end if;
  if exists(select 1 from public.whatsapp_channel_messages m join public.whatsapp_channels c on c.id=m.channel_id
    where c.restaurante_id=p_restaurante_id and m.provider_message_id=p_event_id and m.purpose='review'
      and (m.status in ('sending','sent','uncertain') or m.ack>=1)) then return 'refused'; end if;
  if q.scheduled_for<now()-interval '24 hours' or d.attempts>=least(coalesce(a.max_attempts,5),12) then
    perform public.complete_visit_review_delivery(p_event_id,p_lock_token,'blocked',null,'waha_retry_limit_reached');
    return 'blocked';
  end if;
  update public.visit_review_requests set active_delivery_token=null,last_error=left(coalesce(p_error,'waha_temporarily_unavailable'),120),updated_at=now() where id=q.id;
  update public.reservation_webhook_deliveries set status='retrying',next_attempt_at=now()+interval '5 minutes',
    last_error=left(coalesce(p_error,'waha_temporarily_unavailable'),120),locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
  return 'deferred';
end;
$$;

revoke all on function public.reconcile_waha_review_ack(uuid),public.defer_visit_review_delivery(text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_waha_review_ack(uuid),public.defer_visit_review_delivery(text,uuid,uuid,text) to service_role;
