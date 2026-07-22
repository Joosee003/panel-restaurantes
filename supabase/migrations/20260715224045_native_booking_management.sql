create or replace function public.consumir_limite_reserva_publica(
  p_key_hash text,
  p_limite integer default 20,
  p_ventana_segundos integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests integer;
begin
  if length(trim(coalesce(p_key_hash, ''))) < 16
     or p_limite < 1 or p_limite > 1000
     or p_ventana_segundos < 10 or p_ventana_segundos > 86400 then
    return false;
  end if;

  insert into public.booking_request_limits (
    key_hash, window_started_at, requests, updated_at
  ) values (
    p_key_hash, now(), 1, now()
  )
  on conflict (key_hash) do update
  set window_started_at = case
        when public.booking_request_limits.window_started_at
          <= now() - make_interval(secs => p_ventana_segundos)
        then now()
        else public.booking_request_limits.window_started_at
      end,
      requests = case
        when public.booking_request_limits.window_started_at
          <= now() - make_interval(secs => p_ventana_segundos)
        then 1
        else public.booking_request_limits.requests + 1
      end,
      updated_at = now()
  returning requests into v_requests;

  return v_requests <= p_limite;
end;
$$;

create or replace function public.obtener_reserva_publica_gestion(p_gestion_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reserva_id', r.id,
    'gestion_token', r.gestion_token,
    'restaurante_nombre', coalesce(w.nombre_publico, rest.nombre),
    'restaurante_slug', w.slug,
    'restaurante_direccion', w.direccion_publica,
    'restaurante_telefono', w.telefono_publico,
    'restaurante_email', w.email_publico,
    'restaurante_maps_url', w.google_maps_url,
    'zona_horaria', c.zona_horaria,
    'nombre_cliente', r.nombre_cliente,
    'telefono_cliente', r.telefono,
    'email_cliente', r.email,
    'personas', r.personas,
    'inicio_at', coalesce(
      r.inicio_at,
      r.fecha_hora_reserva at time zone c.zona_horaria
    ),
    'fin_at', coalesce(
      r.fin_at,
      (r.fecha_hora_reserva at time zone c.zona_horaria)
        + make_interval(mins => c.duracion_minutos)
    ),
    'estado', r.estado,
    'politica_cancelacion', c.politica_cancelacion,
    'puede_cancelar',
      lower(coalesce(r.estado, '')) not in ('cancelada', 'cancelado', 'no-show', 'no_show')
      and coalesce(r.inicio_at, r.fecha_hora_reserva at time zone c.zona_horaria)
        >= now() + make_interval(mins => c.cancelacion_minutos),
    'puede_reprogramar',
      c.activo = true
      and w.publicada = true
      and lower(coalesce(r.estado, '')) not in ('cancelada', 'cancelado', 'no-show', 'no_show')
      and coalesce(r.inicio_at, r.fecha_hora_reserva at time zone c.zona_horaria)
        >= now() + make_interval(mins => c.cancelacion_minutos)
  )
  from public.reservas r
  join public.restaurantes rest on rest.id = r.restaurante_id
  join public.reservas_config c on c.restaurante_id = r.restaurante_id
  left join public.restaurante_webs w on w.restaurante_id = r.restaurante_id
  where r.gestion_token = p_gestion_token
  limit 1;
$$;

create or replace function public.cancelar_reserva_publica_gestion(p_gestion_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva_id uuid;
  v_estado text;
  v_inicio_at timestamptz;
  v_cancelacion_minutos integer;
  v_zona_horaria text;
begin
  select
    r.id,
    r.estado,
    coalesce(r.inicio_at, r.fecha_hora_reserva at time zone c.zona_horaria),
    c.cancelacion_minutos,
    c.zona_horaria
  into
    v_reserva_id,
    v_estado,
    v_inicio_at,
    v_cancelacion_minutos,
    v_zona_horaria
  from public.reservas r
  join public.reservas_config c on c.restaurante_id = r.restaurante_id
  where r.gestion_token = p_gestion_token
  for update of r;

  if v_reserva_id is null then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if lower(coalesce(v_estado, '')) in ('cancelada', 'cancelado') then
    return jsonb_build_object(
      'ok', true,
      'duplicate', true,
      'reserva_id', v_reserva_id,
      'estado', 'cancelada'
    );
  end if;

  if v_inicio_at < now() + make_interval(mins => v_cancelacion_minutos) then
    raise exception 'CANCELLATION_WINDOW_CLOSED';
  end if;

  update public.reservas
  set estado = 'cancelada',
      cancelada_at = now(),
      mesa_id = null
  where id = v_reserva_id;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reserva_id', v_reserva_id,
    'estado', 'cancelada'
  );
end;
$$;

create or replace function public.reprogramar_reserva_publica_gestion(
  p_gestion_token uuid,
  p_nuevo_inicio_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva_id uuid;
  v_restaurante_id uuid;
  v_slug text;
  v_zona_horaria text;
  v_cancelacion_minutos integer;
  v_personas integer;
  v_estado_anterior text;
  v_inicio_anterior timestamptz;
  v_nuevo_fin_at timestamptz;
  v_nuevo_turno text;
begin
  select
    r.id,
    r.restaurante_id,
    w.slug,
    c.zona_horaria,
    c.cancelacion_minutos,
    greatest(coalesce(r.personas, 1), 1),
    r.estado,
    coalesce(r.inicio_at, r.fecha_hora_reserva at time zone c.zona_horaria)
  into
    v_reserva_id,
    v_restaurante_id,
    v_slug,
    v_zona_horaria,
    v_cancelacion_minutos,
    v_personas,
    v_estado_anterior,
    v_inicio_anterior
  from public.reservas r
  join public.reservas_config c on c.restaurante_id = r.restaurante_id and c.activo = true
  join public.restaurante_webs w on w.restaurante_id = r.restaurante_id and w.publicada = true
  where r.gestion_token = p_gestion_token
  for update of r;

  if v_reserva_id is null then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if p_nuevo_inicio_at is null
     or lower(coalesce(v_estado_anterior, '')) in ('cancelada', 'cancelado', 'no-show', 'no_show') then
    raise exception 'RESERVATION_CANNOT_BE_RESCHEDULED';
  end if;

  if v_inicio_anterior < now() + make_interval(mins => v_cancelacion_minutos) then
    raise exception 'CANCELLATION_WINDOW_CLOSED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      v_restaurante_id::text || ':date:'
        || (p_nuevo_inicio_at at time zone v_zona_horaria)::date::text,
      0
    )
  );

  -- Dentro de esta transaccion liberamos temporalmente la reserva actual para
  -- que no reste su propia capacidad al comprobar la nueva hora.
  update public.reservas
  set estado = 'cancelada'
  where id = v_reserva_id;

  select a.fin_at, a.turno
    into v_nuevo_fin_at, v_nuevo_turno
  from public.obtener_disponibilidad_reservas(
    v_slug,
    (p_nuevo_inicio_at at time zone v_zona_horaria)::date,
    v_personas
  ) a
  where a.inicio_at = p_nuevo_inicio_at
  limit 1;

  if v_nuevo_fin_at is null then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  update public.reservas
  set inicio_at = p_nuevo_inicio_at,
      fin_at = v_nuevo_fin_at,
      fecha_hora_reserva = p_nuevo_inicio_at at time zone v_zona_horaria,
      turno = v_nuevo_turno,
      estado = v_estado_anterior,
      cancelada_at = null,
      mesa_id = null
  where id = v_reserva_id;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva_id,
    'estado', v_estado_anterior,
    'inicio_at', p_nuevo_inicio_at,
    'fin_at', v_nuevo_fin_at,
    'turno', v_nuevo_turno
  );
end;
$$;

