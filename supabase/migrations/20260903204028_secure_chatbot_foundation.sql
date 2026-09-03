-- Estado e idempotencia del chatbot de WhatsApp.
-- Las tablas quedan cerradas a clientes y solo se usan desde el servidor.

create table if not exists public.chatbot_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  contact_phone text not null,
  contact_name text,
  state text not null default 'idle',
  draft jsonb not null default '{}'::jsonb,
  selected_reservation_id uuid references public.reservas(id) on delete set null,
  handoff boolean not null default false,
  lock_token uuid,
  locked_until timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatbot_sessions_phone_check
    check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  constraint chatbot_sessions_name_check
    check (contact_name is null or char_length(contact_name) between 1 and 120),
  constraint chatbot_sessions_state_check
    check (state in (
      'idle',
      'booking_party',
      'booking_date',
      'booking_time',
      'booking_name',
      'booking_email',
      'booking_confirm',
      'manage_select',
      'manage_action',
      'cancel_confirm',
      'reschedule_date',
      'reschedule_time',
      'reschedule_confirm',
      'handoff'
    )),
  unique (restaurante_id, contact_phone)
);

create table if not exists public.chatbot_messages (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  session_id uuid not null references public.chatbot_sessions(id) on delete cascade,
  provider_message_id text not null,
  direction text not null default 'inbound',
  text_content text,
  status text not null default 'processing',
  response jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chatbot_messages_provider_id_check
    check (char_length(provider_message_id) between 1 and 190),
  constraint chatbot_messages_text_check
    check (text_content is null or char_length(text_content) <= 2000),
  constraint chatbot_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint chatbot_messages_status_check
    check (status in ('processing', 'completed', 'failed')),
  unique (restaurante_id, provider_message_id)
);

create index if not exists chatbot_sessions_expiry_idx
  on public.chatbot_sessions (expires_at);

create index if not exists chatbot_sessions_restaurant_updated_idx
  on public.chatbot_sessions (restaurante_id, updated_at desc);

create index if not exists chatbot_messages_session_created_idx
  on public.chatbot_messages (session_id, created_at desc);

alter table public.chatbot_sessions enable row level security;
alter table public.chatbot_messages enable row level security;

revoke all on table public.chatbot_sessions from public, anon, authenticated;
revoke all on table public.chatbot_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.chatbot_sessions to service_role;
grant select, insert, update, delete on table public.chatbot_messages to service_role;

create or replace function public.begin_chatbot_turn(
  p_restaurante_id uuid,
  p_contact_phone text,
  p_provider_message_id text,
  p_contact_name text,
  p_text_content text,
  p_lock_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.chatbot_sessions%rowtype;
  v_message public.chatbot_messages%rowtype;
begin
  if p_restaurante_id is null
     or p_lock_token is null
     or p_contact_phone !~ '^\+[1-9][0-9]{6,14}$'
     or char_length(coalesce(p_provider_message_id, '')) not between 1 and 190
     or char_length(coalesce(p_text_content, '')) > 2000
     or char_length(coalesce(p_contact_name, '')) > 120 then
    raise exception 'INVALID_CHATBOT_REQUEST';
  end if;

  insert into public.chatbot_sessions (
    restaurante_id,
    contact_phone,
    contact_name
  ) values (
    p_restaurante_id,
    p_contact_phone,
    nullif(btrim(p_contact_name), '')
  )
  on conflict (restaurante_id, contact_phone) do update
  set contact_name = coalesce(
        nullif(btrim(excluded.contact_name), ''),
        public.chatbot_sessions.contact_name
      ),
      updated_at = now()
  returning * into v_session;

  select *
  into v_session
  from public.chatbot_sessions
  where id = v_session.id
  for update;

  select *
  into v_message
  from public.chatbot_messages
  where restaurante_id = p_restaurante_id
    and provider_message_id = p_provider_message_id;

  if found and v_message.status = 'completed' then
    return jsonb_build_object(
      'status', 'duplicate',
      'response', v_message.response
    );
  end if;

  if v_session.locked_until is not null
     and v_session.locked_until > now()
     and v_session.lock_token is distinct from p_lock_token then
    return jsonb_build_object('status', 'busy');
  end if;

  update public.chatbot_sessions
  set lock_token = p_lock_token,
      locked_until = now() + interval '2 minutes',
      expires_at = now() + interval '24 hours',
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.chatbot_messages (
    restaurante_id,
    session_id,
    provider_message_id,
    direction,
    text_content,
    status,
    response,
    error_code
  ) values (
    p_restaurante_id,
    v_session.id,
    p_provider_message_id,
    'inbound',
    nullif(p_text_content, ''),
    'processing',
    null,
    null
  )
  on conflict (restaurante_id, provider_message_id) do update
  set session_id = excluded.session_id,
      text_content = excluded.text_content,
      status = 'processing',
      response = null,
      error_code = null,
      updated_at = now();

  return jsonb_build_object(
    'status', 'acquired',
    'sessionId', v_session.id,
    'state', v_session.state,
    'draft', v_session.draft,
    'selectedReservationId', v_session.selected_reservation_id,
    'handoff', v_session.handoff,
    'contactName', v_session.contact_name
  );
end;
$$;

create or replace function public.complete_chatbot_turn(
  p_restaurante_id uuid,
  p_provider_message_id text,
  p_lock_token uuid,
  p_state text,
  p_draft jsonb,
  p_selected_reservation_id uuid,
  p_handoff boolean,
  p_response jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select m.session_id
  into v_session_id
  from public.chatbot_messages m
  join public.chatbot_sessions s on s.id = m.session_id
  where m.restaurante_id = p_restaurante_id
    and m.provider_message_id = p_provider_message_id
    and m.status = 'processing'
    and s.lock_token = p_lock_token
    and s.locked_until > now()
  for update of s;

  if v_session_id is null then
    return false;
  end if;

  update public.chatbot_sessions
  set state = p_state,
      draft = coalesce(p_draft, '{}'::jsonb),
      selected_reservation_id = p_selected_reservation_id,
      handoff = coalesce(p_handoff, false),
      lock_token = null,
      locked_until = null,
      expires_at = now() + interval '24 hours',
      updated_at = now()
  where id = v_session_id;

  update public.chatbot_messages
  set status = 'completed',
      response = coalesce(p_response, '{}'::jsonb),
      error_code = null,
      updated_at = now()
  where restaurante_id = p_restaurante_id
    and provider_message_id = p_provider_message_id;

  return true;
end;
$$;

create or replace function public.fail_chatbot_turn(
  p_restaurante_id uuid,
  p_provider_message_id text,
  p_lock_token uuid,
  p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
begin
  select m.session_id
  into v_session_id
  from public.chatbot_messages m
  join public.chatbot_sessions s on s.id = m.session_id
  where m.restaurante_id = p_restaurante_id
    and m.provider_message_id = p_provider_message_id
    and s.lock_token = p_lock_token
  for update of s;

  if v_session_id is null then
    return false;
  end if;

  update public.chatbot_sessions
  set lock_token = null,
      locked_until = null,
      updated_at = now()
  where id = v_session_id;

  update public.chatbot_messages
  set status = 'failed',
      error_code = left(coalesce(p_error_code, 'CHATBOT_FAILED'), 100),
      updated_at = now()
  where restaurante_id = p_restaurante_id
    and provider_message_id = p_provider_message_id;

  return true;
end;
$$;

create or replace function public.obtener_reservas_chatbot_telefono(
  p_restaurante_id uuid,
  p_contact_phone text
)
returns table (
  reserva_id uuid,
  nombre_cliente text,
  personas integer,
  inicio_at timestamptz,
  gestion_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_national_phone text;
begin
  v_phone := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  v_national_phone := case
    when v_phone like '34%' and char_length(v_phone) = 11 then substring(v_phone from 3)
    else v_phone
  end;

  if p_restaurante_id is null or char_length(v_phone) not between 7 and 15 then
    raise exception 'INVALID_CHATBOT_REQUEST';
  end if;

  return query
  select
    r.id,
    r.nombre_cliente,
    r.personas,
    coalesce(
      r.inicio_at,
      r.fecha_hora_reserva at time zone coalesce(c.zona_horaria, 'Europe/Madrid')
    ),
    r.gestion_token
  from public.reservas r
  left join public.reservas_config c on c.restaurante_id = r.restaurante_id
  where r.restaurante_id = p_restaurante_id
    and r.gestion_token is not null
    and lower(coalesce(r.estado, 'pendiente'))
      not in ('cancelada', 'cancelado', 'no-show', 'no_show', 'no show')
    and coalesce(
      r.inicio_at,
      r.fecha_hora_reserva at time zone coalesce(c.zona_horaria, 'Europe/Madrid')
    ) >= now()
    and regexp_replace(coalesce(r.telefono, ''), '[^0-9]', '', 'g')
      in (v_phone, v_national_phone, '34' || v_national_phone)
  order by coalesce(
    r.inicio_at,
    r.fecha_hora_reserva at time zone coalesce(c.zona_horaria, 'Europe/Madrid')
  ) asc
  limit 5;
end;
$$;

create or replace function public.obtener_disponibilidad_chatbot(
  p_restaurante_id uuid,
  p_fecha date,
  p_personas integer,
  p_excluir_reserva_id uuid default null
)
returns table (
  inicio_at timestamptz,
  fin_at timestamptz,
  hora_local text,
  turno text,
  capacidad_disponible integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zona_horaria text;
  v_intervalo integer;
  v_duracion integer;
  v_capacidad integer;
  v_min_personas integer;
  v_max_personas integer;
  v_antelacion integer;
  v_dias_maximos integer;
  v_ahora_local timestamp;
begin
  select
    c.zona_horaria,
    c.intervalo_minutos,
    c.duracion_minutos,
    c.capacidad_por_turno,
    c.personas_minimas,
    c.personas_maximas,
    c.antelacion_minutos,
    c.dias_maximos_antelacion
  into
    v_zona_horaria,
    v_intervalo,
    v_duracion,
    v_capacidad,
    v_min_personas,
    v_max_personas,
    v_antelacion,
    v_dias_maximos
  from public.reservas_config c
  where c.restaurante_id = p_restaurante_id
    and c.activo = true;

  if v_zona_horaria is null then
    raise exception 'BOOKING_NOT_AVAILABLE';
  end if;

  if p_fecha is null
     or p_personas is null
     or p_personas < v_min_personas
     or p_personas > v_max_personas then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  v_ahora_local := now() at time zone v_zona_horaria;
  if p_fecha < v_ahora_local::date
     or p_fecha > v_ahora_local::date + v_dias_maximos then
    return;
  end if;

  return query
  with normal_ranges as (
    select h.turno, h.hora_inicio, h.hora_fin, h.capacidad_override
    from public.reservas_horarios h
    where h.restaurante_id = p_restaurante_id
      and h.dia_semana = extract(dow from p_fecha)::integer
      and h.activo = true
      and not exists (
        select 1
        from public.reservas_excepciones e
        where e.restaurante_id = p_restaurante_id
          and e.fecha = p_fecha
          and e.tipo = 'horario_especial'
      )
  ),
  special_ranges as (
    select
      coalesce(nullif(e.turno, ''), 'especial') as turno,
      e.hora_inicio,
      e.hora_fin,
      e.capacidad_override
    from public.reservas_excepciones e
    where e.restaurante_id = p_restaurante_id
      and e.fecha = p_fecha
      and e.tipo = 'horario_especial'
  ),
  service_ranges as (
    select * from normal_ranges
    union all
    select * from special_ranges
  ),
  candidate_slots as (
    select
      r.turno,
      gs.local_start,
      gs.local_start at time zone v_zona_horaria as slot_start,
      (gs.local_start at time zone v_zona_horaria)
        + make_interval(mins => v_duracion) as slot_end,
      coalesce(r.capacidad_override, v_capacidad) as range_capacity
    from service_ranges r
    cross join lateral generate_series(
      p_fecha + r.hora_inicio,
      p_fecha + r.hora_fin - make_interval(mins => v_duracion),
      make_interval(mins => v_intervalo)
    ) as gs(local_start)
    where r.hora_inicio is not null
      and r.hora_fin is not null
      and p_fecha + r.hora_fin >= p_fecha + r.hora_inicio
        + make_interval(mins => v_duracion)
  ),
  open_slots as (
    select
      s.*,
      coalesce((
        select e.capacidad_override
        from public.reservas_excepciones e
        where e.restaurante_id = p_restaurante_id
          and e.fecha = p_fecha
          and e.tipo = 'capacidad'
          and (
            e.hora_inicio is null
            or (s.local_start::time >= e.hora_inicio and s.local_start::time < e.hora_fin)
          )
        order by (e.hora_inicio is not null) desc, e.updated_at desc
        limit 1
      ), s.range_capacity) as effective_capacity
    from candidate_slots s
    where s.slot_start >= now() + make_interval(mins => greatest(v_antelacion, 0))
      and not exists (
        select 1
        from public.reservas_excepciones e
        where e.restaurante_id = p_restaurante_id
          and e.fecha = p_fecha
          and e.tipo = 'cierre'
          and (
            e.hora_inicio is null
            or (
              s.local_start::time < e.hora_fin
              and (s.local_start + make_interval(mins => v_duracion))::time > e.hora_inicio
            )
          )
      )
      and not exists (
        select 1
        from public.bloqueos_reservas b
        where b.restaurante_id = p_restaurante_id
          and b.fecha = p_fecha
          and b.activo = true
          and s.local_start::time < b.hora_fin
          and (s.local_start + make_interval(mins => v_duracion))::time > b.hora_inicio
      )
  ),
  remaining_slots as (
    select
      s.*,
      greatest(
        0,
        s.effective_capacity - coalesce((
          select sum(greatest(coalesce(r.personas, 1), 1))::integer
          from public.reservas r
          where r.restaurante_id = p_restaurante_id
            and (p_excluir_reserva_id is null or r.id <> p_excluir_reserva_id)
            and lower(coalesce(r.estado, 'pendiente'))
              not in ('cancelada', 'cancelado', 'no-show', 'no_show', 'no show')
            and coalesce(
              r.inicio_at,
              r.fecha_hora_reserva at time zone v_zona_horaria
            ) < s.slot_end
            and coalesce(
              r.fin_at,
              (r.fecha_hora_reserva at time zone v_zona_horaria)
                + make_interval(mins => v_duracion)
            ) > s.slot_start
        ), 0)
      )::integer as remaining_capacity
    from open_slots s
  )
  select
    s.slot_start,
    s.slot_end,
    to_char(s.local_start, 'HH24:MI'),
    s.turno,
    s.remaining_capacity
  from remaining_slots s
  where s.remaining_capacity >= p_personas
  order by s.slot_start;
end;
$$;

create or replace function public.crear_reserva_chatbot(
  p_restaurante_id uuid,
  p_inicio_at timestamptz,
  p_personas integer,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_idempotency_key uuid,
  p_privacidad_informada boolean,
  p_condiciones_aceptadas boolean,
  p_version_legal text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona_horaria text;
  v_min_personas integer;
  v_max_personas integer;
  v_confirmacion_automatica boolean;
  v_requiere_email boolean;
  v_cliente_id uuid;
  v_reserva_id uuid;
  v_gestion_token uuid;
  v_fin_at timestamptz;
  v_turno text;
  v_estado text;
  v_telefono text;
  v_email text := nullif(lower(left(btrim(coalesce(p_email, '')), 254)), '');
  v_nombre text := nullif(left(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), 120), '');
  v_existing jsonb;
begin
  if not exists (
    select 1
    from public.restaurante_modulos m
    where m.restaurante_id = p_restaurante_id
      and m.chatbot = true
      and m.estado = 'activo'
  ) then
    raise exception 'CHATBOT_NOT_AVAILABLE';
  end if;

  if p_privacidad_informada is not true
     or p_condiciones_aceptadas is not true
     or p_version_legal <> '2026-08-03' then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  v_telefono := regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g');
  if v_telefono like '34%' and char_length(v_telefono) = 11 then
    v_telefono := substring(v_telefono from 3);
  end if;
  v_telefono := nullif(v_telefono, '');

  select
    c.zona_horaria,
    c.personas_minimas,
    c.personas_maximas,
    c.confirmacion_automatica,
    c.requiere_email
  into
    v_zona_horaria,
    v_min_personas,
    v_max_personas,
    v_confirmacion_automatica,
    v_requiere_email
  from public.reservas_config c
  where c.restaurante_id = p_restaurante_id
    and c.activo = true;

  if v_zona_horaria is null then
    raise exception 'BOOKING_NOT_AVAILABLE';
  end if;

  if p_inicio_at is null
     or p_idempotency_key is null
     or v_nombre is null
     or char_length(v_nombre) < 2
     or p_personas is null
     or p_personas < v_min_personas
     or p_personas > v_max_personas
     or v_telefono is null
     or char_length(v_telefono) not between 7 and 15
     or (v_requiere_email and v_email is null)
     or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurante_id::text || ':chatbot:' || p_idempotency_key::text, 0)
  );

  select jsonb_build_object(
    'ok', true,
    'duplicate', true,
    'reserva_id', r.id,
    'estado', r.estado,
    'inicio_at', r.inicio_at,
    'fin_at', r.fin_at,
    'gestion_token', r.gestion_token
  )
  into v_existing
  from public.reservas r
  where r.restaurante_id = p_restaurante_id
    and r.idempotency_key = p_idempotency_key
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_restaurante_id::text || ':date:'
        || (p_inicio_at at time zone v_zona_horaria)::date::text,
      0
    )
  );

  select a.fin_at, a.turno
  into v_fin_at, v_turno
  from public.obtener_disponibilidad_chatbot(
    p_restaurante_id,
    (p_inicio_at at time zone v_zona_horaria)::date,
    p_personas,
    null
  ) a
  where a.inicio_at = p_inicio_at
  limit 1;

  if v_fin_at is null then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_restaurante_id::text || ':client-phone:' || v_telefono, 0)
  );

  select c.id
  into v_cliente_id
  from public.clientes c
  where c.restaurante_id = p_restaurante_id
    and regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')
      in (v_telefono, '34' || v_telefono)
  order by c.created_at asc nulls last, c.id asc
  limit 1;

  if v_cliente_id is null then
    insert into public.clientes (
      restaurante_id,
      nombre,
      telefono,
      email,
      origen_principal,
      canal_contacto,
      permite_whatsapp,
      permite_email,
      updated_at
    ) values (
      p_restaurante_id,
      v_nombre,
      v_telefono,
      v_email,
      'chatbot_whatsapp',
      'whatsapp',
      false,
      false,
      now()
    )
    returning id into v_cliente_id;
  else
    update public.clientes
    set nombre = v_nombre,
        telefono = v_telefono,
        email = coalesce(v_email, email),
        origen_principal = coalesce(origen_principal, 'chatbot_whatsapp'),
        canal_contacto = case
          when canal_contacto is null or canal_contacto = 'ninguno' then 'whatsapp'
          else canal_contacto
        end,
        updated_at = now()
    where id = v_cliente_id;
  end if;

  v_estado := case when v_confirmacion_automatica then 'confirmada' else 'pendiente' end;

  insert into public.reservas (
    restaurante_id,
    cliente_id,
    nombre_cliente,
    telefono,
    email,
    personas,
    origen,
    fecha_hora_reserva,
    inicio_at,
    fin_at,
    estado,
    turno,
    idempotency_key,
    privacidad_informada_at,
    condiciones_aceptadas_at,
    version_legal
  ) values (
    p_restaurante_id,
    v_cliente_id,
    v_nombre,
    v_telefono,
    v_email,
    p_personas,
    'chatbot_whatsapp',
    p_inicio_at at time zone v_zona_horaria,
    p_inicio_at,
    v_fin_at,
    v_estado,
    v_turno,
    p_idempotency_key,
    now(),
    now(),
    p_version_legal
  )
  returning id, gestion_token into v_reserva_id, v_gestion_token;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reserva_id', v_reserva_id,
    'estado', v_estado,
    'inicio_at', p_inicio_at,
    'fin_at', v_fin_at,
    'gestion_token', v_gestion_token
  );
end;
$$;

revoke all on function public.begin_chatbot_turn(uuid, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_chatbot_turn(uuid, text, text, text, text, uuid)
  to service_role;

revoke all on function public.complete_chatbot_turn(uuid, text, uuid, text, jsonb, uuid, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_chatbot_turn(uuid, text, uuid, text, jsonb, uuid, boolean, jsonb)
  to service_role;

revoke all on function public.fail_chatbot_turn(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_chatbot_turn(uuid, text, uuid, text)
  to service_role;

revoke all on function public.obtener_reservas_chatbot_telefono(uuid, text)
  from public, anon, authenticated;
grant execute on function public.obtener_reservas_chatbot_telefono(uuid, text)
  to service_role;

revoke all on function public.obtener_disponibilidad_chatbot(uuid, date, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.obtener_disponibilidad_chatbot(uuid, date, integer, uuid)
  to service_role;

revoke all on function public.crear_reserva_chatbot(
  uuid, timestamptz, integer, text, text, text, uuid, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.crear_reserva_chatbot(
  uuid, timestamptz, integer, text, text, text, uuid, boolean, boolean, text
) to service_role;
