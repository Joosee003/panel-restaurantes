-- Reviewed draft. Apply to an isolated copy before production.
-- Existing reservations and messages are not backfilled or sent by this script.
begin;

create schema if not exists review_private;
revoke all on schema review_private from public, anon;
grant usage on schema review_private to authenticated, service_role;

create table if not exists public.visit_review_requests (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  reserva_id uuid not null unique references public.reservas(id) on delete cascade,
  public_token uuid not null unique default gen_random_uuid(),
  scheduled_for timestamptz not null,
  status text not null default 'ready' check (status in ('scheduled','ready','prepared','sent','blocked','uncertain','cancelled')),
  sent_at timestamptz,
  send_method text check (send_method in ('manual','whatsapp')),
  provider_message_id text,
  active_delivery_token uuid,
  google_opened_at timestamptz,
  checked_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists visit_review_requests_customer_idx on public.visit_review_requests(restaurante_id,cliente_id,created_at desc);
alter table public.visit_review_requests enable row level security;
revoke all on public.visit_review_requests from public, anon, authenticated;
grant select on public.visit_review_requests to authenticated;
grant all on public.visit_review_requests to service_role;
drop policy if exists visit_review_requests_read on public.visit_review_requests;
create policy visit_review_requests_read on public.visit_review_requests for select to authenticated
  using ((select public.puede_acceder_restaurante(restaurante_id)));

create or replace function review_private.assert_manager(p_restaurante_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not public.puede_acceder_restaurante(p_restaurante_id) or public.is_demo_user() then
    raise exception 'REVIEW_ACCESS_DENIED' using errcode='42501';
  end if;
end;
$$;

create or replace function review_private.valid_google_url(p_url text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select p_url is not null and char_length(p_url) <= 2048 and p_url !~ '[[:space:]]'
    and p_url ~ '^https://(((www\.)?google\.(com|es)/(maps([/?#]|$)|local/writereview([?#]|$)))|((maps\.google\.(com|es)|g\.page|maps\.app\.goo\.gl)/)|(search\.google\.com/local/writereview([?#]|$)))';
$$;

create or replace function review_private.has_consent(p_restaurante_id uuid,p_cliente_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.clientes c join public.cliente_comunicaciones_consentimiento cc
      on cc.cliente_id=c.id and cc.restaurante_id=c.restaurante_id
    where c.id=p_cliente_id and c.restaurante_id=p_restaurante_id
      and c.permite_whatsapp is true and cc.review_whatsapp is true and cc.revoked_at is null
  );
$$;

create or replace function review_private.cancel_pending(p_cliente_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.visit_review_requests set status='cancelled',last_error=p_reason,updated_at=now()
    where cliente_id=p_cliente_id and sent_at is null and status not in ('cancelled','uncertain');
  update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),
    locked_at=null,lock_token=null,last_error=p_reason,updated_at=now()
    where cliente_id=p_cliente_id and event_type='visit.review_request'
      and status in ('pending','processing','retrying');
end;
$$;

-- Lock order for changes: reservation, customer, request, delivery.
create or replace function review_private.ensure_request(p_reserva_id uuid,p_automatic boolean default false)
returns public.visit_review_requests language plpgsql security definer set search_path = '' as $$
declare
  r public.reservas%rowtype;
  c public.clientes%rowtype;
  q public.visit_review_requests%rowtype;
  a public.automatizaciones_config%rowtype;
  v_start timestamptz;
  v_due timestamptz;
  v_timezone text;
  v_consent boolean;
  v_url text;
  v_name text;
  v_reason text;
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
    when r.atendida is false or lower(coalesce(r.estado,'')) not in ('confirmada','confirmado','ha venido','completada','completado') then 'visit_not_completed'
    when c.id is null then 'customer_missing'
    when c.ya_dejo_resena is true then 'review_confirmed'
    when v_start is null then 'visit_not_completed'
    when not exists(select 1 from public.restaurante_modulos m where m.restaurante_id=r.restaurante_id and m.resenas is true) then 'review_disabled'
    else null end;
  if v_reason is not null then
    if q.id is not null and q.sent_at is null then
      update public.visit_review_requests set status='cancelled',last_error=v_reason,updated_at=now() where id=q.id returning * into q;
    end if;
    update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error=v_reason,updated_at=now()
      where reservation_id=r.id and event_type='visit.review_request' and status in ('pending','processing','retrying');
    return q;
  end if;
  -- A new request is per visit. Old sent requests and manual preparation are never re-queued.
  if q.id is not null and (q.sent_at is not null or q.status in ('prepared','uncertain','cancelled')) then return q; end if;
  insert into public.visit_review_requests(restaurante_id,cliente_id,reserva_id,scheduled_for,status,sent_at,send_method,last_error)
  values(r.restaurante_id,c.id,r.id,v_due,
    case when r.resena_solicitada is true then 'sent' when not v_consent then 'blocked' when v_due>now() then 'scheduled' else 'ready' end,
    case when r.resena_solicitada is true then coalesce((select d.delivered_at from public.reservation_webhook_deliveries d where d.event_id='visit.review_request:'||r.id::text),r.updated_at,now()) end,
    case when r.resena_solicitada is true then 'manual' end,
    case when not v_consent then 'review_consent_missing' end)
  on conflict(reserva_id) do update set scheduled_for=excluded.scheduled_for,
    status=excluded.status,last_error=excluded.last_error,updated_at=now()
  returning * into q;
  if q.sent_at is not null then return q; end if;
  -- A future booking must not cancel the request for an earlier visit.
  update public.visit_review_requests set status='cancelled',last_error='newer_visit',updated_at=now()
    where v_start<=now() and cliente_id=c.id and id<>q.id and scheduled_for<=q.scheduled_for and sent_at is null and status in ('ready','scheduled','blocked');
  update public.reservation_webhook_deliveries d set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error='newer_visit',updated_at=now()
    where d.cliente_id=c.id and d.reservation_id<>r.id and d.event_type='visit.review_request' and d.status in ('pending','retrying','processing')
      and exists(select 1 from public.visit_review_requests oldq where oldq.reserva_id=d.reservation_id and oldq.last_error='newer_visit');
  if p_automatic and v_consent and review_private.valid_google_url(v_url)
    and v_start>=now()-interval '1 day' and a.review_enabled is true then
    perform public.enqueue_reservation_automation('visit.review_request:'||r.id::text,'visit.review_request',r.id,r.restaurante_id,c.id,v_due,
      jsonb_build_object('event','visit.review_request','reviewRequestId',q.id,'reviewPath','/r/'||q.public_token::text,
        'restaurantName',v_name,'customer',jsonb_build_object('id',c.id,'name',c.nombre,'phone',c.telefono)),'whatsapp');
    -- Keep timing in step with a rescheduled reservation, without reviving cancelled or sent deliveries.
    update public.reservation_webhook_deliveries set scheduled_for=v_due,
      payload=payload||jsonb_build_object('reviewRequestId',q.id,'reviewPath','/r/'||q.public_token::text),updated_at=now()
      where event_id='visit.review_request:'||r.id::text and status in ('pending','retrying');
  end if;
  return q;
end;
$$;

create or replace function review_private.sync_visit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform review_private.ensure_request(new.id,true);
  return new;
end;
$$;
drop trigger if exists visit_review_request_sync on public.reservas;
create trigger visit_review_request_sync after insert or update of atendida,estado,inicio_at,fecha_hora_reserva,cliente_id on public.reservas
  for each row execute function review_private.sync_visit();

create or replace function review_private.customer_review_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ya_dejo_resena is true then perform review_private.cancel_pending(new.id,'review_confirmed');
  elsif new.permite_whatsapp is not true then perform review_private.cancel_pending(new.id,'review_consent_missing'); end if;
  return new;
end;
$$;
drop trigger if exists customer_review_changed on public.clientes;
create trigger customer_review_changed after update of ya_dejo_resena,permite_whatsapp on public.clientes
  for each row execute function review_private.customer_review_changed();

create or replace function review_private.consent_changed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then perform review_private.cancel_pending(old.cliente_id,'review_consent_missing'); return old; end if;
  if new.review_whatsapp is not true or new.revoked_at is not null then perform review_private.cancel_pending(new.cliente_id,'review_consent_missing'); end if;
  return new;
end;
$$;
drop trigger if exists visit_review_consent_changed on public.cliente_comunicaciones_consentimiento;
create trigger visit_review_consent_changed after update or delete on public.cliente_comunicaciones_consentimiento
  for each row execute function review_private.consent_changed();

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
        'sent_at',coalesce(q.sent_at,case when r.resena_solicitada then r.updated_at end),
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

create or replace function public.list_visit_review_requests(p_restaurante_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$ select review_private.list_requests(p_restaurante_id); $$;

create or replace function review_private.settings(p_restaurante_id uuid,p_google_url text,p_delay integer,p_automatic boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform review_private.assert_manager(p_restaurante_id);
  if p_delay is null or p_delay not in (2,3) or p_automatic is null or (nullif(trim(p_google_url),'') is not null and not review_private.valid_google_url(trim(p_google_url))) then raise exception 'INVALID_REVIEW_SETTINGS'; end if;
  update public.restaurantes set google_review_url=nullif(trim(p_google_url),'') where id=p_restaurante_id;
  insert into public.automatizaciones_config(restaurante_id,review_enabled,review_delay_hours) values(p_restaurante_id,p_automatic,p_delay)
    on conflict(restaurante_id) do update set review_enabled=p_automatic,review_delay_hours=p_delay,updated_at=now();
  if not p_automatic then
    update public.reservation_webhook_deliveries set status='cancelled',cancelled_at=now(),locked_at=null,lock_token=null,last_error='review_automatic_disabled',updated_at=now()
      where restaurante_id=p_restaurante_id and event_type='visit.review_request' and status in ('pending','retrying','processing');
  end if;
end;
$$;
create or replace function public.save_visit_review_settings(p_restaurante_id uuid,p_google_url text,p_delay integer,p_automatic boolean)
returns void language sql security invoker set search_path = '' as $$ select review_private.settings(p_restaurante_id,p_google_url,p_delay,p_automatic); $$;

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
  if p_action in ('confirm','unconfirm') then
    update public.clientes set ya_dejo_resena=(p_action='confirm'),updated_at=now() where id=c.id;
    update public.visit_review_requests set confirmed_at=case when p_action='confirm' then now() end,
      confirmed_by=case when p_action='confirm' then auth.uid() end,updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  elsif p_action='checked' then
    update public.visit_review_requests set checked_at=now(),updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  elsif p_action='not_sent' and q.status='uncertain' then
    update public.visit_review_requests set status='ready',active_delivery_token=null,last_error=null,updated_at=now() where id=q.id;
    return jsonb_build_object('ok',true);
  end if;
  if c.ya_dejo_resena is true then raise exception 'REVIEW_ALREADY_CONFIRMED'; end if;
  if q.sent_at is not null then raise exception 'REVIEW_ALREADY_SENT'; end if;
  if not review_private.has_consent(r.restaurante_id,c.id) then raise exception 'REVIEW_CONSENT_MISSING'; end if;
  if q.status='cancelled' or r.atendida is false or lower(coalesce(r.estado,'')) not in ('confirmada','confirmado','ha venido','completada','completado') then raise exception 'REVIEW_VISIT_NOT_COMPLETED'; end if;
  if q.scheduled_for>now() then raise exception 'REVIEW_NOT_DUE'; end if;
  if p_action='prepare' then
    if q.status='uncertain' or q.active_delivery_token is not null then raise exception 'REVIEW_DELIVERY_UNCERTAIN'; end if;
    if not review_private.valid_google_url(v_url) then raise exception 'REVIEW_GOOGLE_URL_MISSING'; end if;
    -- Claim manual handling before opening WhatsApp. Opening a draft is never marked as sent.
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
create or replace function public.visit_review_action(p_reserva_id uuid,p_action text)
returns jsonb language sql security invoker set search_path = '' as $$ select review_private.action(p_reserva_id,p_action); $$;

-- Public handoff is service-only: the page exposes no customer data and GET never records a click.
create or replace function public.get_visit_review_link(p_token uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('restaurantName',r.nombre,'googleUrl',r.google_review_url,
    'active',m.resenas is true and q.created_at>now()-interval '180 days',
    'optedOut',not review_private.has_consent(q.restaurante_id,q.cliente_id))
    from public.visit_review_requests q join public.restaurantes r on r.id=q.restaurante_id
    join public.restaurante_modulos m on m.restaurante_id=r.id
    where q.public_token=p_token;
$$;
create or replace function public.open_visit_review_link(p_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare q public.visit_review_requests%rowtype; v_result jsonb;
begin
  v_result:=public.get_visit_review_link(p_token);
  if v_result is null or (v_result->>'active')::boolean is not true or not review_private.valid_google_url(v_result->>'googleUrl') then return null; end if;
  select * into q from public.visit_review_requests where public_token=p_token;
  if review_private.has_consent(q.restaurante_id,q.cliente_id) then
    update public.visit_review_requests set google_opened_at=coalesce(google_opened_at,now()),updated_at=now() where id=q.id;
  end if;
  return v_result;
end;
$$;
create or replace function public.stop_visit_review_requests(p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare q public.visit_review_requests%rowtype;
begin
  select * into q from public.visit_review_requests where public_token=p_token;
  if q.id is null then return false; end if;
  perform 1 from public.clientes where id=q.cliente_id for update;
  update public.cliente_comunicaciones_consentimiento set review_whatsapp=false,updated_at=now()
    where cliente_id=q.cliente_id and restaurante_id=q.restaurante_id;
  perform review_private.cancel_pending(q.cliente_id,'review_consent_missing');
  return true;
end;
$$;

create or replace function review_private.normalized_phone(p_phone text)
returns text language plpgsql immutable security invoker set search_path = '' as $$
declare v_phone text:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
begin
  if coalesce(p_phone,'') !~ '^[+0-9[:space:]().-]+$' then return null; end if;
  if left(v_phone,2)='00' then v_phone:=substr(v_phone,3); end if;
  if length(v_phone)=9 and left(trim(p_phone),1)<>'+' then v_phone:='34'||v_phone; end if;
  if v_phone !~ '^[1-9][0-9]{7,14}$' then return null; end if;
  return v_phone;
end;
$$;

-- Booking and optional review permission are committed in one transaction. Retrying a booking cannot change consent.
create or replace function public.crear_reserva_publica_con_resena(
  p_slug text,p_inicio_at timestamptz,p_personas integer,p_nombre text,p_telefono text default null,
  p_email text default null,p_notas text default null,p_idempotency_key uuid default null,
  p_privacidad_informada boolean default false,p_condiciones_aceptadas boolean default false,p_version_legal text default null,
  p_review_whatsapp boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_result jsonb; r public.reservas%rowtype; v_phone text:=p_telefono; v_normalized text:=review_private.normalized_phone(p_telefono);
begin
  if p_review_whatsapp and nullif(trim(p_telefono),'') is null then raise exception 'INVALID_BOOKING_REQUEST'; end if;
  if v_normalized is not null then
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_slug))||':review-phone:'||v_normalized,0));
    select c.telefono into v_phone from public.clientes c join public.restaurante_webs w on w.restaurante_id=c.restaurante_id
      where w.slug=lower(trim(p_slug)) and review_private.normalized_phone(c.telefono)=v_normalized
      order by c.created_at asc nulls last,c.id asc limit 1;
    v_phone:=coalesce(v_phone,'+'||v_normalized);
  end if;
  v_result:=public.crear_reserva_publica_con_aceptacion(p_slug,p_inicio_at,p_personas,p_nombre,v_phone,p_email,p_notas,p_idempotency_key,p_privacidad_informada,p_condiciones_aceptadas,p_version_legal);
  if p_review_whatsapp and coalesce((v_result->>'duplicate')::boolean,false) is false then
    select * into r from public.reservas where id=(v_result->>'reserva_id')::uuid;
    if r.cliente_id is null then raise exception 'REVIEW_CUSTOMER_MISSING'; end if;
    insert into public.cliente_comunicaciones_consentimiento(restaurante_id,cliente_id,review_whatsapp,consent_source,consent_version)
      values(r.restaurante_id,r.cliente_id,true,'public_booking','review-whatsapp-v1')
      on conflict(restaurante_id,cliente_id) do update set review_whatsapp=true,revoked_at=null,consented_at=now(),
        review_email=case when cliente_comunicaciones_consentimiento.revoked_at is null then cliente_comunicaciones_consentimiento.review_email else false end,
        loyalty_whatsapp=case when cliente_comunicaciones_consentimiento.revoked_at is null then cliente_comunicaciones_consentimiento.loyalty_whatsapp else false end,
        loyalty_email=case when cliente_comunicaciones_consentimiento.revoked_at is null then cliente_comunicaciones_consentimiento.loyalty_email else false end,
        consent_source='public_booking',consent_version='review-whatsapp-v1',updated_at=now();
    -- The reservation INSERT precedes consent. Schedule now, in this same transaction,
    -- so the restaurant never has to mark attendance to trigger the request.
    perform review_private.ensure_request(r.id,true);
  end if;
  return v_result;
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
    return jsonb_build_object('allowed',false,'reason','review_customer_changed');
  end if;
  if q.active_delivery_token is not null then
    return jsonb_build_object('allowed',false,'reason',case when q.active_delivery_token=p_lock_token then 'review_delivery_in_progress' else 'review_delivery_uncertain' end);
  end if;
  if q.sent_at is not null or q.status in ('prepared','uncertain','cancelled') or c.ya_dejo_resena is true then return jsonb_build_object('allowed',false,'reason','review_already_handled'); end if;
  if r.atendida is false or lower(coalesce(r.estado,'')) not in ('confirmada','confirmado','ha venido','completada','completado') then return jsonb_build_object('allowed',false,'reason','visit_not_completed'); end if;
  if q.scheduled_for>now() then return jsonb_build_object('allowed',false,'reason','review_not_due'); end if;
  if not review_private.has_consent(r.restaurante_id,c.id) then return jsonb_build_object('allowed',false,'reason','review_consent_missing'); end if;
  if a.enabled is not true or a.review_enabled is not true or a.whatsapp_enabled is not true or a.delivery_mode is distinct from d.delivery_mode
    or not exists(select 1 from public.restaurante_modulos where restaurante_id=r.restaurante_id and resenas is true and automatizaciones is true) then
    return jsonb_build_object('allowed',false,'reason','review_automatic_disabled');
  end if;
  select google_review_url,nombre into v_url,v_name from public.restaurantes where id=r.restaurante_id;
  if not review_private.valid_google_url(v_url) then return jsonb_build_object('allowed',false,'reason','review_google_url_missing'); end if;
  update public.visit_review_requests set active_delivery_token=p_lock_token,updated_at=now() where id=q.id;
  return jsonb_build_object('allowed',true,'token',q.public_token,'name',coalesce(c.nombre,r.nombre_cliente,'Cliente'),
    'phone',coalesce(c.telefono,r.telefono),'restaurantName',v_name,'deliveryMode',d.delivery_mode);
end;
$$;

create or replace function public.complete_visit_review_delivery(p_event_id text,p_lock_token uuid,p_outcome text,p_message_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare d public.reservation_webhook_deliveries%rowtype; q public.visit_review_requests%rowtype;
begin
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id;
  if d.event_type is distinct from 'visit.review_request' then return false; end if;
  perform 1 from public.reservas where id=d.reservation_id for update;
  perform 1 from public.clientes where id=d.cliente_id for update;
  select * into q from public.visit_review_requests where reserva_id=d.reservation_id for update;
  select * into d from public.reservation_webhook_deliveries where event_id=p_event_id for update;
  if d.lock_token is distinct from p_lock_token and (q.active_delivery_token is distinct from p_lock_token or p_outcome<>'sent') then return false; end if;
  if p_outcome='sent' then
    if d.delivery_mode<>'live' or nullif(trim(p_message_id),'') is null or q.id is null then raise exception 'REVIEW_DELIVERY_PROOF_MISSING'; end if;
    update public.visit_review_requests set status='sent',sent_at=coalesce(sent_at,now()),send_method='whatsapp',provider_message_id=p_message_id,
      active_delivery_token=null,last_error=null,updated_at=now() where id=q.id;
    update public.reservation_webhook_deliveries set status='delivered',delivered_at=now(),http_status=200,last_error=null,
      locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.reservas set resena_solicitada=true where id=d.reservation_id;
  elsif p_outcome='test' then
    update public.reservation_webhook_deliveries set status='delivered',delivered_at=now(),last_error='test_no_message_sent',locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.visit_review_requests set active_delivery_token=null,updated_at=now() where id=q.id;
  elsif p_outcome in ('blocked','uncertain') then
    update public.reservation_webhook_deliveries set status=case when p_outcome='uncertain' then 'failed' else 'skipped' end,
      last_error=left(coalesce(p_error,'review_delivery_blocked'),120),locked_at=null,lock_token=null,updated_at=now() where event_id=p_event_id;
    update public.visit_review_requests set status=case when status='cancelled' then status else p_outcome end,
      active_delivery_token=case when p_outcome='uncertain' then active_delivery_token end,
      last_error=left(coalesce(p_error,'review_delivery_blocked'),120),updated_at=now() where id=q.id and sent_at is null;
  else raise exception 'INVALID_REVIEW_DELIVERY_OUTCOME'; end if;
  return true;
end;
$$;

-- Grants below deliberately exclude direct writes and service operations from browser roles.
revoke all on all functions in schema review_private from public, anon, authenticated;
grant execute on function review_private.assert_manager(uuid),review_private.list_requests(uuid),review_private.settings(uuid,text,integer,boolean),review_private.action(uuid,text) to authenticated;
grant execute on all functions in schema review_private to service_role;
revoke all on function public.list_visit_review_requests(uuid),public.save_visit_review_settings(uuid,text,integer,boolean),public.visit_review_action(uuid,text) from public,anon;
grant execute on function public.list_visit_review_requests(uuid),public.save_visit_review_settings(uuid,text,integer,boolean),public.visit_review_action(uuid,text) to authenticated,service_role;
revoke all on function public.get_visit_review_link(uuid),public.open_visit_review_link(uuid),public.stop_visit_review_requests(uuid),public.crear_reserva_publica_con_resena(text,timestamptz,integer,text,text,text,text,uuid,boolean,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.get_visit_review_link(uuid),public.open_visit_review_link(uuid),public.stop_visit_review_requests(uuid),public.crear_reserva_publica_con_resena(text,timestamptz,integer,text,text,text,text,uuid,boolean,boolean,text,boolean) to service_role;
revoke all on function public.get_visit_review_delivery(text,uuid),public.complete_visit_review_delivery(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.get_visit_review_delivery(text,uuid),public.complete_visit_review_delivery(text,uuid,text,text,text) to service_role;

-- Preserve booking notifications and replace only the old review scheduling block.
CREATE OR REPLACE FUNCTION public.sync_reservation_automation_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_start timestamptz;
  v_previous_start timestamptz;
  v_slug text;
  v_restaurant_name text;
  v_restaurant_email text;
  v_timezone text := 'Europe/Madrid';
  v_reminder_hours smallint := 24;
  v_review_delay smallint := 3;
  v_payload jsonb;
  v_epoch text;
begin
  v_start := coalesce(new.inicio_at, new.fecha_hora_reserva at time zone v_timezone);
  if tg_op = 'UPDATE' then
    v_previous_start := coalesce(old.inicio_at, old.fecha_hora_reserva at time zone v_timezone);
  end if;

  select
    coalesce(w.slug, r.slug),
    r.nombre,
    coalesce(w.email_publico, r.email_notificaciones),
    coalesce(c.zona_horaria, 'Europe/Madrid'),
    coalesce(a.reminder_hours_before, 24),
    coalesce(a.review_delay_hours, 3)
  into
    v_slug,
    v_restaurant_name,
    v_restaurant_email,
    v_timezone,
    v_reminder_hours,
    v_review_delay
  from public.restaurantes r
  left join public.restaurante_webs w on w.restaurante_id = r.id
  left join public.reservas_config c on c.restaurante_id = r.id
  left join public.automatizaciones_config a on a.restaurante_id = r.id
  where r.id = new.restaurante_id;

  v_start := coalesce(new.inicio_at, new.fecha_hora_reserva at time zone v_timezone);
  if tg_op = 'UPDATE' then
    v_previous_start := coalesce(old.inicio_at, old.fecha_hora_reserva at time zone v_timezone);
  end if;

  v_payload := jsonb_build_object(
    'reservationId', new.id,
    'restaurantId', new.restaurante_id,
    'restaurantSlug', v_slug,
    'restaurantName', v_restaurant_name,
    'restaurantEmail', v_restaurant_email,
    'restaurantTimezone', v_timezone,
    'status', new.estado,
    'start', v_start,
    'end', new.fin_at,
    'party', new.personas,
    'customer', jsonb_build_object(
      'id', new.cliente_id,
      'name', new.nombre_cliente,
      'phone', new.telefono,
      'email', new.email
    ),
    'managementPath', case when new.gestion_token is null then null else '/reserva/' || new.gestion_token::text end,
    'reviewPath', case when v_slug is null then null else '/opinion/' || v_slug end,
    'notes', new.notas,
    'source', coalesce(new.origen, 'panel')
  );

  if tg_op = 'INSERT' then
    perform public.enqueue_reservation_automation(
      'reservation.created:' || new.id::text,
      'reservation.created',
      new.id,
      new.restaurante_id,
      new.cliente_id,
      now(),
      v_payload || jsonb_build_object('event', 'reservation.created'),
      'auto'
    );

    if v_start is not null then
      v_epoch := extract(epoch from v_start)::bigint::text;
      perform public.enqueue_reservation_automation(
        'reservation.reminder:' || new.id::text || ':' || v_epoch,
        'reservation.reminder',
        new.id,
        new.restaurante_id,
        new.cliente_id,
        v_start - make_interval(hours => v_reminder_hours),
        v_payload || jsonb_build_object('event', 'reservation.reminder'),
        'auto'
      );
    end if;

    return new;
  end if;

  if v_start is distinct from v_previous_start then
    update public.reservation_webhook_deliveries
    set status = 'cancelled',
        cancelled_at = now(),
        locked_at = null,
        lock_token = null,
        updated_at = now(),
        last_error = 'reservation_rescheduled'
    where reservation_id = new.id
      and event_type in ('reservation.reminder', 'reservation.cancelled')
      and status in ('pending', 'retrying', 'processing');

    v_epoch := extract(epoch from v_start)::bigint::text;
    perform public.enqueue_reservation_automation(
      'reservation.rescheduled:' || new.id::text || ':' || v_epoch,
      'reservation.rescheduled',
      new.id,
      new.restaurante_id,
      new.cliente_id,
      now(),
      v_payload || jsonb_build_object(
        'event', 'reservation.rescheduled',
        'previousStart', v_previous_start
      ),
      'auto'
    );

    perform public.enqueue_reservation_automation(
      'reservation.reminder:' || new.id::text || ':' || v_epoch,
      'reservation.reminder',
      new.id,
      new.restaurante_id,
      new.cliente_id,
      v_start - make_interval(hours => v_reminder_hours),
      v_payload || jsonb_build_object('event', 'reservation.reminder'),
      'auto'
    );
  end if;

  if lower(coalesce(new.estado, '')) in ('cancelada', 'cancelado')
     and lower(coalesce(old.estado, '')) not in ('cancelada', 'cancelado') then
    update public.reservation_webhook_deliveries
    set status = 'cancelled',
        cancelled_at = now(),
        locked_at = null,
        lock_token = null,
        updated_at = now(),
        last_error = 'reservation_cancelled'
    where reservation_id = new.id
      and event_type in ('reservation.reminder', 'visit.review_request')
      and status in ('pending', 'retrying', 'processing');

    perform public.enqueue_reservation_automation(
      'reservation.cancelled:' || new.id::text || ':' || extract(epoch from now())::bigint::text,
      'reservation.cancelled',
      new.id,
      new.restaurante_id,
      new.cliente_id,
      now(),
      v_payload || jsonb_build_object(
        'event', 'reservation.cancelled',
        'previousStart', v_previous_start
      ),
      'auto'
    );
  elsif new.estado is distinct from old.estado
        and lower(coalesce(new.estado, '')) not in ('cancelada', 'cancelado')
        and v_start is not distinct from v_previous_start then
    perform public.enqueue_reservation_automation(
      'reservation.status_changed:' || new.id::text || ':' || lower(coalesce(new.estado, 'unknown')),
      'reservation.status_changed',
      new.id,
      new.restaurante_id,
      new.cliente_id,
      now(),
      v_payload || jsonb_build_object(
        'event', 'reservation.status_changed',
        'previousStatus', old.estado
      ),
      'auto'
    );
  end if;

  -- Visit review scheduling is handled by visit_review_request_sync.

  return new;
end;
$function$
;

commit;
