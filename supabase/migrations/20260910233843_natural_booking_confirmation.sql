-- A customer confirms their booking details in ordinary language. This is stored
-- separately from terms acceptance or a privacy notice they have not been shown.
alter table public.reservas add column datos_confirmados_at timestamptz,
  add column confirmacion_reserva jsonb;

create or replace function public.is_booking_details_confirmation(p_text text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select trim(regexp_replace(regexp_replace(translate(lower(coalesce(p_text,'')),'áéíóúü','aeiouu'),'[^a-z0-9 ]+',' ','g'),'[[:space:]]+',' ','g')) ~
  '^(?:(?:si|claro)(?: (?:todo |esta |esta todo |son |estan |los datos son |los datos estan )?(?:correctos?|bien|perfecto))?|(?:todo |esta |esta todo |estan |son |los datos son |los datos estan )?(?:correctos?|bien)|vale|perfecto|adelante|de acuerdo|confirmo|confirmar|acepto reserva|ok|okey|asi esta bien)(?: por favor| gracias)?$';
$$;
revoke all on function public.is_booking_details_confirmation(text) from public,anon,authenticated;
grant execute on function public.is_booking_details_confirmation(text) to service_role;

create or replace function public.crear_reserva_chatbot_confirmada(
  p_restaurante_id uuid,
  p_inicio_at timestamptz,
  p_personas integer,
  p_nombre text,
  p_telefono text,
  p_email text,
  p_idempotency_key uuid,
  p_confirmacion jsonb
)
returns jsonb
language plpgsql
security invoker
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

  if p_confirmacion is null or p_confirmacion->>'version' is distinct from 'booking-details-v1'
     or char_length(coalesce(p_confirmacion->>'prompt','')) not between 10 and 4000
     or char_length(coalesce(p_confirmacion->>'response','')) not between 1 and 2000
     or char_length(coalesce(p_confirmacion->>'messageId','')) not between 1 and 190
     or not public.is_booking_details_confirmation(p_confirmacion->>'response') then
    raise exception 'BOOKING_CONFIRMATION_REQUIRED';
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
    'gestion_token', r.gestion_token,
    'cliente_app_token', (select c.public_token from public.clientes c where c.id=r.cliente_id and c.restaurante_id=r.restaurante_id)
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
    version_legal,
    datos_confirmados_at,
    confirmacion_reserva
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
    null,
    null,
    '2026-08-03',
    now(),
    jsonb_build_object('version',p_confirmacion->>'version','prompt',p_confirmacion->>'prompt',
      'response',p_confirmacion->>'response','messageId',p_confirmacion->>'messageId',
      'conditionsAccepted',false,'privacyNoticeShown',false,
      'termsSnapshot',(select jsonb_build_object('version','2026-08-03','aviso_reserva',c.aviso_reserva,
        'politica_cancelacion',c.politica_cancelacion) from public.reservas_config c where c.restaurante_id=p_restaurante_id))
  )
  returning id, gestion_token into v_reserva_id, v_gestion_token;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reserva_id', v_reserva_id,
    'estado', v_estado,
    'inicio_at', p_inicio_at,
    'fin_at', v_fin_at,
    'gestion_token', v_gestion_token,
    'cliente_app_token', (select c.public_token from public.clientes c where c.id=v_cliente_id and c.restaurante_id=p_restaurante_id)
  );
end;
$$;

revoke all on function public.crear_reserva_chatbot_confirmada(uuid,timestamptz,integer,text,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.crear_reserva_chatbot_confirmada(uuid,timestamptz,integer,text,text,text,uuid,jsonb) to service_role;
