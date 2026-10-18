-- A queue item can finish when a provider accepts a request. The message has
-- its own lifecycle, fed by authenticated callbacks. No historical backfill.
begin;

alter table public.visit_review_requests drop constraint if exists visit_review_requests_status_check;
alter table public.visit_review_requests add constraint visit_review_requests_status_check
  check (status in ('scheduled','ready','prepared','accepted','sent','delivered','read','failed','blocked','uncertain','cancelled'));
alter table public.visit_review_requests add column if not exists accepted_at timestamptz;
alter table public.visit_review_requests add column if not exists delivered_at timestamptz;
alter table public.visit_review_requests add column if not exists read_at timestamptz;
alter table public.visit_review_requests add column if not exists failed_at timestamptz;

create table if not exists public.review_provider_messages (
  provider_message_id text primary key check (char_length(provider_message_id) between 7 and 512),
  request_id uuid unique references public.visit_review_requests(id) on delete cascade,
  restaurante_id uuid references public.restaurantes(id) on delete cascade,
  event_id text unique,
  status text not null check (status in ('accepted','sent','delivered','read','failed')),
  accepted_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint review_provider_message_binding_check check
    ((request_id is null and restaurante_id is null and event_id is null) or
     (request_id is not null and restaurante_id is not null and event_id is not null))
);
create index if not exists review_provider_messages_restaurant_idx
  on public.review_provider_messages(restaurante_id,request_id) where request_id is not null;
alter table public.review_provider_messages enable row level security;
revoke all on public.review_provider_messages from public,anon,authenticated;
grant all on public.review_provider_messages to service_role;

-- Only the server role calls this after validating the relay signature. Unknown
-- IDs are staged, so a provider status racing the send ACK is not lost.
create or replace function public.record_review_provider_status(
  p_message_id text,p_status text,p_event_at timestamptz
) returns text language plpgsql security invoker set search_path = '' as $$
declare m public.review_provider_messages%rowtype; q public.visit_review_requests%rowtype;
begin
  if (p_message_id !~ '^wamid\.[A-Za-z0-9._~+/=-]+$' and p_message_id !~ '^waha:.+$') or char_length(p_message_id)>512
    or p_status not in ('sent','delivered','read','failed') or p_event_at is null
    or p_event_at>now()+interval '5 minutes' then raise exception 'INVALID_REVIEW_PROVIDER_STATUS'; end if;
  insert into public.review_provider_messages(provider_message_id,status,
    sent_at,delivered_at,read_at,failed_at)
    values(p_message_id,p_status,
      case when p_status='sent' then p_event_at end,
      case when p_status='delivered' then p_event_at end,
      case when p_status='read' then p_event_at end,
      case when p_status='failed' then p_event_at end)
    on conflict(provider_message_id) do nothing;
  -- Match the send path's request -> message lock order when already bound.
  select * into m from public.review_provider_messages where provider_message_id=p_message_id;
  if m.request_id is not null then
    perform 1 from public.visit_review_requests where id=m.request_id for update;
  end if;
  select * into m from public.review_provider_messages where provider_message_id=p_message_id for update;
  update public.review_provider_messages set
    status=case
      when p_status='read' and (m.status<>'failed' or p_event_at>m.failed_at) then 'read'
      when p_status='delivered' and m.status<>'read' and (m.status<>'failed' or p_event_at>m.failed_at) then 'delivered'
      when p_status='failed' and m.status not in ('read','delivered')
        and (m.sent_at is null or p_event_at>=m.sent_at) then 'failed'
      when p_status='sent' and (m.status='accepted' or (m.status='failed' and p_event_at>m.failed_at)) then 'sent'
      else m.status end,
    sent_at=case when p_status='sent' then coalesce(m.sent_at,p_event_at) else m.sent_at end,
    delivered_at=case when p_status='delivered' then coalesce(m.delivered_at,p_event_at) else m.delivered_at end,
    read_at=case when p_status='read' then coalesce(m.read_at,p_event_at) else m.read_at end,
    failed_at=case when p_status='failed' and m.status not in ('read','delivered')
      and (m.sent_at is null or p_event_at>=m.sent_at) then coalesce(m.failed_at,p_event_at) else m.failed_at end,
    updated_at=now() where provider_message_id=p_message_id returning * into m;
  if m.request_id is not null then
    select * into q from public.visit_review_requests where id=m.request_id for update;
    if q.id is null or q.restaurante_id is distinct from m.restaurante_id or q.provider_message_id is distinct from m.provider_message_id then
      raise exception 'REVIEW_PROVIDER_BINDING_MISMATCH';
    end if;
    update public.visit_review_requests set status=m.status,accepted_at=m.accepted_at,
      sent_at=m.sent_at,delivered_at=m.delivered_at,read_at=m.read_at,failed_at=m.failed_at,
      last_error=case when m.status='failed' then 'provider_failed' else null end,updated_at=now() where id=q.id;
  end if;
  return case when m.request_id is null then 'staged' else 'recorded' end;
end;
$$;

-- A provider ACK is already an irreversible send attempt. Later reservation or
-- consent edits must not queue another request, even before a 'sent' callback.
create or replace function review_private.cancel_pending(p_cliente_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.visit_review_requests set status='cancelled',last_error=p_reason,updated_at=now()
    where cliente_id=p_cliente_id and provider_message_id is null and sent_at is null
      and status not in ('cancelled','uncertain');
  update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),
    locked_at=null,lock_token=null,last_error=p_reason,updated_at=now()
    where cliente_id=p_cliente_id and event_type='visit.review_request'
      and status in ('pending','processing','retrying');
end;
$$;

create or replace function review_private.ensure_request(p_reserva_id uuid,p_automatic boolean default false)
returns public.visit_review_requests language plpgsql security definer set search_path = '' as $$
declare r public.reservas%rowtype; c public.clientes%rowtype; q public.visit_review_requests%rowtype;
  a public.automatizaciones_config%rowtype; v_start timestamptz; v_due timestamptz;
  v_timezone text; v_consent boolean; v_url text; v_name text; v_reason text;
begin
  select * into r from public.reservas where id=p_reserva_id for update;
  if r.id is null then return null; end if;
  select * into c from public.clientes where id=r.cliente_id and restaurante_id=r.restaurante_id for update;
  select * into q from public.visit_review_requests where reserva_id=r.id for update;
  select * into a from public.automatizaciones_config where restaurante_id=r.restaurante_id;
  select coalesce(rc.zona_horaria,'Europe/Madrid'),rr.google_review_url,rr.nombre into v_timezone,v_url,v_name
    from public.restaurantes rr left join public.reservas_config rc on rc.restaurante_id=rr.id where rr.id=r.restaurante_id;
  v_start:=coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(v_timezone,'Europe/Madrid'));
  v_due:=v_start+make_interval(hours=>coalesce(a.review_delay_hours,3));
  v_consent:=review_private.has_consent(r.restaurante_id,r.cliente_id);
  v_reason:=case
    when q.id is not null and q.cliente_id is distinct from r.cliente_id then 'review_customer_changed'
    when r.atendida is not true or lower(coalesce(r.estado,'')) not in ('pendiente','confirmada','confirmado','ha venido','completada','completado') then 'visit_not_completed'
    when c.id is null then 'customer_missing'
    when c.ya_dejo_resena is true then 'review_confirmed'
    when v_start is null or v_start>now() then 'visit_not_completed'
    when not exists(select 1 from public.restaurante_modulos m where m.restaurante_id=r.restaurante_id and m.resenas is true) then 'review_disabled'
    else null end;
  if v_reason is not null then
    if q.id is not null and q.provider_message_id is null and q.sent_at is null then
      update public.visit_review_requests set status='cancelled',last_error=v_reason,updated_at=now() where id=q.id returning * into q;
    end if;
    update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error=v_reason,updated_at=now()
      where reservation_id=r.id and event_type='visit.review_request' and status in ('pending','processing','retrying');
    return q;
  end if;
  if q.id is not null and (q.provider_message_id is not null or q.sent_at is not null
    or q.status in ('prepared','uncertain','cancelled','failed')) then return q; end if;
  insert into public.visit_review_requests(restaurante_id,cliente_id,reserva_id,scheduled_for,status,sent_at,send_method,last_error)
  values(r.restaurante_id,c.id,r.id,v_due,
    case when r.resena_solicitada is true then 'sent' when not v_consent then 'blocked' when v_due>now() then 'scheduled' else 'ready' end,
    case when r.resena_solicitada is true then coalesce((select d.delivered_at from public.reservation_webhook_deliveries d where d.event_id='visit.review_request:'||r.id::text),r.updated_at,now()) end,
    case when r.resena_solicitada is true then 'manual' end,
    case when not v_consent then 'review_consent_missing' end)
  on conflict(reserva_id) do update set scheduled_for=excluded.scheduled_for,
    status=excluded.status,last_error=excluded.last_error,updated_at=now()
  returning * into q;
  if q.sent_at is not null or q.provider_message_id is not null then return q; end if;
  update public.visit_review_requests set status='cancelled',last_error='newer_visit',updated_at=now()
    where v_start<=now() and cliente_id=c.id and id<>q.id and provider_message_id is null
      and scheduled_for<=q.scheduled_for and sent_at is null and status in ('ready','scheduled','blocked');
  update public.reservation_webhook_deliveries d set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error='newer_visit',updated_at=now()
    where d.cliente_id=c.id and d.reservation_id<>r.id and d.event_type='visit.review_request' and d.status in ('pending','retrying','processing')
      and exists(select 1 from public.visit_review_requests oldq where oldq.reserva_id=d.reservation_id and oldq.last_error='newer_visit');
  if p_automatic and v_consent and review_private.valid_google_url(v_url)
    and v_start>=now()-interval '1 day' and a.review_enabled is true then
    perform public.enqueue_reservation_automation('visit.review_request:'||r.id::text,'visit.review_request',r.id,r.restaurante_id,c.id,v_due,
      jsonb_build_object('event','visit.review_request','reviewRequestId',q.id,'reviewPath','/r/'||q.public_token::text,
        'restaurantName',v_name,'customer',jsonb_build_object('id',c.id,'name',c.nombre,'phone',c.telefono)),'whatsapp');
    update public.reservation_webhook_deliveries set scheduled_for=v_due,
      payload=payload||jsonb_build_object('reviewRequestId',q.id,'reviewPath','/r/'||q.public_token::text),updated_at=now()
      where event_id='visit.review_request:'||r.id::text and status in ('pending','retrying');
  end if;
  return q;
end;
$$;

create or replace function public.get_visit_review_delivery(p_event_id text,p_lock_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare d public.reservation_webhook_deliveries%rowtype; r public.reservas%rowtype;
  c public.clientes%rowtype; q public.visit_review_requests%rowtype; a public.automatizaciones_config%rowtype; v_url text; v_name text;
begin
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id;
  if d.event_type is distinct from 'visit.review_request' then return jsonb_build_object('allowed',false,'reason','review_not_found'); end if;
  select * into r from public.reservas where id=d.reservation_id for update;
  select * into c from public.clientes where id=r.cliente_id and restaurante_id=r.restaurante_id for update;
  select * into q from public.visit_review_requests where reserva_id=r.id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id for update;
  select * into a from public.automatizaciones_config where restaurante_id=r.restaurante_id;
  if d.status<>'processing' or d.lock_token is distinct from p_lock_token then return jsonb_build_object('allowed',false,'reason','delivery_lock_lost'); end if;
  if q.id is null or d.payload->>'reviewRequestId' is distinct from q.id::text then return jsonb_build_object('allowed',false,'reason','legacy_review_request'); end if;
  if q.cliente_id is distinct from c.id or d.cliente_id is distinct from c.id or q.restaurante_id is distinct from r.restaurante_id then
    return jsonb_build_object('allowed',false,'reason','review_customer_changed'); end if;
  if q.active_delivery_token is not null then
    return jsonb_build_object('allowed',false,'reason',case when q.active_delivery_token=p_lock_token then 'review_delivery_in_progress' else 'review_delivery_uncertain' end); end if;
  if q.provider_message_id is not null or q.sent_at is not null or q.status in ('prepared','uncertain','cancelled','failed') or c.ya_dejo_resena is true then
    return jsonb_build_object('allowed',false,'reason','review_already_handled'); end if;
  if r.atendida is not true or lower(coalesce(r.estado,'')) not in ('pendiente','confirmada','confirmado','ha venido','completada','completado') then return jsonb_build_object('allowed',false,'reason','visit_not_completed'); end if;
  if q.scheduled_for>now() then return jsonb_build_object('allowed',false,'reason','review_not_due'); end if;
  if not review_private.has_consent(r.restaurante_id,c.id) then return jsonb_build_object('allowed',false,'reason','review_consent_missing'); end if;
  if a.enabled is not true or a.review_enabled is not true or a.whatsapp_enabled is not true or a.delivery_mode is distinct from d.delivery_mode
    or not exists(select 1 from public.restaurante_modulos where restaurante_id=r.restaurante_id and resenas is true and automatizaciones is true) then
    return jsonb_build_object('allowed',false,'reason','review_automatic_disabled'); end if;
  select google_review_url,nombre into v_url,v_name from public.restaurantes where id=r.restaurante_id;
  if not review_private.valid_google_url(v_url) then return jsonb_build_object('allowed',false,'reason','review_google_url_missing'); end if;
  update public.visit_review_requests set active_delivery_token=p_lock_token,updated_at=now() where id=q.id;
  return jsonb_build_object('allowed',true,'token',q.public_token,'name',coalesce(c.nombre,r.nombre_cliente,'Cliente'),
    'phone',coalesce(c.telefono,r.telefono),'restaurantName',v_name,'deliveryMode',d.delivery_mode);
end;
$$;

-- Keep the manual path, but never offer a second send after a provider ACK.
create or replace function review_private.action(p_reserva_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.reservas%rowtype; c public.clientes%rowtype; q public.visit_review_requests%rowtype; v_url text; v_name text;
begin
  select * into r from public.reservas where id=p_reserva_id for update;
  if r.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  perform review_private.assert_manager(r.restaurante_id);
  select * into c from public.clientes where id=r.cliente_id and restaurante_id=r.restaurante_id for update;
  if c.id is null then raise exception 'REVIEW_CUSTOMER_MISSING'; end if;
  if p_action='unconfirm' then
    update public.clientes set ya_dejo_resena=false,updated_at=now() where id=c.id;
    update public.visit_review_requests set confirmed_at=null,confirmed_by=null,updated_at=now() where cliente_id=c.id;
    return jsonb_build_object('ok',true);
  end if;
  q:=review_private.ensure_request(r.id,false);
  if q.id is null then raise exception 'REVIEW_VISIT_NOT_COMPLETED'; end if;
  if q.cliente_id is distinct from c.id then raise exception 'REVIEW_CUSTOMER_CHANGED'; end if;
  select google_review_url,nombre into v_url,v_name from public.restaurantes where id=r.restaurante_id;
  if p_action='confirm' then
    update public.clientes set ya_dejo_resena=true,updated_at=now() where id=c.id;
    update public.visit_review_requests set confirmed_at=now(),confirmed_by=auth.uid(),updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  elsif p_action='checked' then
    update public.visit_review_requests set checked_at=now(),updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  elsif p_action='not_sent' and q.status='uncertain' and q.provider_message_id is null then
    update public.visit_review_requests set status='ready',active_delivery_token=null,last_error=null,updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  end if;
  if c.ya_dejo_resena is true then raise exception 'REVIEW_ALREADY_CONFIRMED'; end if;
  if q.provider_message_id is not null or q.sent_at is not null
    or q.status in ('accepted','sent','delivered','read','failed') then raise exception 'REVIEW_ALREADY_SENT'; end if;
  if not review_private.has_consent(r.restaurante_id,c.id) then raise exception 'REVIEW_CONSENT_MISSING'; end if;
  if q.status='cancelled' or r.atendida is not true or lower(coalesce(r.estado,'')) not in ('pendiente','confirmada','confirmado','ha venido','completada','completado') then raise exception 'REVIEW_VISIT_NOT_COMPLETED'; end if;
  if q.scheduled_for>now() then raise exception 'REVIEW_NOT_DUE'; end if;
  if p_action='prepare' then
    if q.status='uncertain' or q.active_delivery_token is not null then raise exception 'REVIEW_DELIVERY_UNCERTAIN'; end if;
    if not review_private.valid_google_url(v_url) then raise exception 'REVIEW_GOOGLE_URL_MISSING'; end if;
    if exists(select 1 from public.reservation_webhook_deliveries where event_id='visit.review_request:'||r.id::text and status='processing') then raise exception 'REVIEW_SENDING'; end if;
    update public.visit_review_requests set status='prepared',last_error=null,updated_at=now() where id=q.id;
    update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error='manual_preparation',updated_at=now()
      where event_id='visit.review_request:'||r.id::text and status in ('pending','retrying','skipped','failed');
    return jsonb_build_object('ok',true,'token',q.public_token,'name',coalesce(c.nombre,r.nombre_cliente,'Cliente'),'phone',coalesce(c.telefono,r.telefono),'restaurantName',v_name);
  elsif p_action='sent' and q.status in ('prepared','uncertain') then
    update public.visit_review_requests set status='sent',sent_at=now(),send_method='manual',last_error=null,updated_at=now() where id=q.id;
    update public.reservas set resena_solicitada=true where id=r.id;
    update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error='manual_sent',updated_at=now()
      where event_id='visit.review_request:'||r.id::text and status in ('pending','retrying','processing');
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'INVALID_REVIEW_ACTION';
end;
$$;

-- WAHA's authenticated ACK uses the same request/message separation. This is
-- an internal correction to its ledger, not a change of transport selection.
create or replace function public.reconcile_waha_review_ack(p_message_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare m public.whatsapp_channel_messages%rowtype; d public.reservation_webhook_deliveries%rowtype;
  q public.visit_review_requests%rowtype; v_restaurante_id uuid; v_receipt text;
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
    or d.payload->>'reviewRequestId' is distinct from q.id::text
    or m.status<>'sent' or m.ack<1 or nullif(m.outgoing_message_id,'') is null then return false; end if;
  v_receipt:='waha:'||m.outgoing_message_id;
  if q.provider_message_id is not null then
    if q.provider_message_id<>v_receipt then return false; end if;
    if m.ack>=2 then
      perform public.record_review_provider_status(v_receipt,case when m.ack>=3 then 'read' else 'delivered' end,now());
    end if;
    return true;
  end if;
  if q.active_delivery_token is null or q.active_delivery_token::text is distinct from m.engine_response->>'reviewLockToken' then return false; end if;
  if not public.complete_visit_review_delivery(d.event_id,q.active_delivery_token,'sent',v_receipt,null) then return false; end if;
  if m.ack>=2 then
    perform public.record_review_provider_status(v_receipt,case when m.ack>=3 then 'read' else 'delivered' end,now());
  end if;
  return true;
end;
$$;

-- The panel reads request/message state only after restaurant authorization.
-- A legacy manual flag is used only when there is no request row at all.
create or replace function review_private.list_requests(p_restaurante_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.puede_acceder_restaurante(p_restaurante_id) then raise exception 'REVIEW_ACCESS_DENIED' using errcode='42501'; end if;
  select jsonb_build_object('restaurantName',rr.nombre,'settings',jsonb_build_object(
    'google_review_url',rr.google_review_url,'review_enabled',coalesce(a.review_enabled,true),
    'review_delay_hours',coalesce(a.review_delay_hours,3),
    'automation_ready',coalesce(a.enabled and a.delivery_mode='live' and a.whatsapp_enabled and m.automatizaciones and m.resenas,false)),
    'requests',coalesce((select jsonb_agg(item order by item->>'visit_at' desc) from (
      select jsonb_build_object('id',coalesce(q.id,r.id),'reserva_id',r.id,'cliente_id',c.id,
        'nombre',coalesce(c.nombre,r.nombre_cliente,'Cliente'),'telefono',coalesce(c.telefono,r.telefono),
        'visit_at',coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(rc.zona_horaria,'Europe/Madrid')),
        'scheduled_for',coalesce(q.scheduled_for,coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(rc.zona_horaria,'Europe/Madrid'))+make_interval(hours=>coalesce(a.review_delay_hours,3))),
        'status',coalesce(q.status,case when r.resena_solicitada then 'sent' else 'ready' end),
        'accepted_at',q.accepted_at,'sent_at',case when q.id is null and r.resena_solicitada then r.updated_at else q.sent_at end,
        'delivered_at',q.delivered_at,'read_at',q.read_at,'failed_at',q.failed_at,
        'google_opened_at',q.google_opened_at,'checked_at',q.checked_at,'confirmed',coalesce(c.ya_dejo_resena,false),
        'consent',review_private.has_consent(p_restaurante_id,c.id),'last_error',q.last_error,
        'previous_requests',(select count(*) from public.visit_review_requests prev where prev.cliente_id=c.id and prev.reserva_id<>r.id and prev.sent_at is not null and prev.scheduled_for<coalesce(q.scheduled_for,now()))) as item
      from public.reservas r join public.clientes c on c.id=r.cliente_id and c.restaurante_id=r.restaurante_id
      left join public.visit_review_requests q on q.reserva_id=r.id
      left join public.reservas_config rc on rc.restaurante_id=r.restaurante_id
      where r.restaurante_id=p_restaurante_id and (q.id is not null or r.atendida is true or r.resena_solicitada is true)
      order by coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(rc.zona_horaria,'Europe/Madrid')) desc limit 250
    ) rows), '[]'::jsonb)) into v_result
  from public.restaurantes rr left join public.automatizaciones_config a on a.restaurante_id=rr.id
  left join public.restaurante_modulos m on m.restaurante_id=rr.id where rr.id=p_restaurante_id;
  return v_result;
end;
$$;

-- The existing dispatch result name 'sent' means the provider returned an ACK.
-- Preserve that input contract until the n8n draft can be changed safely.
create or replace function public.complete_visit_review_delivery(
  p_event_id text,p_lock_token uuid,p_outcome text,p_message_id text default null,p_error text default null
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.reservation_webhook_deliveries%rowtype; q public.visit_review_requests%rowtype;
  m public.review_provider_messages%rowtype;
begin
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id;
  if d.event_type is distinct from 'visit.review_request' then return false; end if;
  perform 1 from public.reservas where id=d.reservation_id for update;
  perform 1 from public.clientes where id=d.cliente_id for update;
  select * into q from public.visit_review_requests where reserva_id=d.reservation_id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id for update;
  if q.id is null or q.restaurante_id is distinct from d.restaurante_id or q.cliente_id is distinct from d.cliente_id
    or d.payload->>'reviewRequestId' is distinct from q.id::text then return false; end if;
  if d.lock_token is distinct from p_lock_token
    and (q.active_delivery_token is distinct from p_lock_token or p_outcome<>'sent') then return false; end if;
  if p_outcome='sent' then
    if d.delivery_mode<>'live' or nullif(trim(p_message_id),'') is null
      or (p_message_id !~ '^wamid\.[A-Za-z0-9._~+/=-]+$' and p_message_id !~ '^waha:.+$')
      or char_length(p_message_id)>512 then raise exception 'REVIEW_DELIVERY_PROOF_MISSING'; end if;
    insert into public.review_provider_messages(provider_message_id,request_id,restaurante_id,event_id,status,accepted_at)
      values(p_message_id,q.id,q.restaurante_id,p_event_id,'accepted',now())
      on conflict(provider_message_id) do update set request_id=excluded.request_id,
        restaurante_id=excluded.restaurante_id,event_id=excluded.event_id,
        accepted_at=coalesce(review_provider_messages.accepted_at,excluded.accepted_at),updated_at=now()
      where review_provider_messages.request_id is null or
        (review_provider_messages.request_id=excluded.request_id and review_provider_messages.restaurante_id=excluded.restaurante_id)
      returning * into m;
    if m.provider_message_id is null then raise exception 'REVIEW_PROVIDER_BINDING_MISMATCH'; end if;
    update public.visit_review_requests set status=m.status,accepted_at=m.accepted_at,
      sent_at=m.sent_at,delivered_at=m.delivered_at,read_at=m.read_at,failed_at=m.failed_at,
      send_method='whatsapp',provider_message_id=p_message_id,active_delivery_token=null,
      last_error=case when m.status='failed' then 'provider_failed' else null end,updated_at=now() where id=q.id;
    -- 'delivered' here is the generic job's completed state, not WhatsApp delivery.
    update public.reservation_webhook_deliveries set status='delivered',delivered_at=now(),http_status=200,last_error=null,
      locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.reservas set resena_solicitada=true where id=d.reservation_id and restaurante_id=q.restaurante_id;
  elsif p_outcome='test' then
    update public.reservation_webhook_deliveries set status='delivered',delivered_at=now(),last_error='test_no_message_sent',
      locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.visit_review_requests set active_delivery_token=null,updated_at=now() where id=q.id;
  elsif p_outcome in ('blocked','uncertain') then
    update public.reservation_webhook_deliveries set status=case when p_outcome='uncertain' then 'failed' else 'skipped' end,
      last_error=left(coalesce(p_error,'review_delivery_blocked'),120),locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.visit_review_requests set status=case when status='cancelled' then status else p_outcome end,
      active_delivery_token=case when p_outcome='uncertain' then active_delivery_token end,
      last_error=left(coalesce(p_error,'review_delivery_blocked'),120),updated_at=now()
      where id=q.id and provider_message_id is null;
  else raise exception 'INVALID_REVIEW_DELIVERY_OUTCOME'; end if;
  return true;
end;
$$;

revoke all on function public.record_review_provider_status(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_review_provider_status(text,text,timestamptz) to service_role;
revoke all on function public.complete_visit_review_delivery(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.complete_visit_review_delivery(text,uuid,text,text,text) to service_role;

commit;
