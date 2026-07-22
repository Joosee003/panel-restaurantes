-- Devuelve solamente horas reservables; nunca expone tablas al navegador.
create or replace function public.obtener_disponibilidad_reservas(
  p_slug text,
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
  v_restaurante_id uuid;
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
    w.restaurante_id,
    c.zona_horaria,
    c.intervalo_minutos,
    c.duracion_minutos,
    c.capacidad_por_turno,
    c.personas_minimas,
    c.personas_maximas,
    c.antelacion_minutos,
    c.dias_maximos_antelacion
  into
    v_restaurante_id,
    v_zona_horaria,
    v_intervalo,
    v_duracion,
    v_capacidad,
    v_min_personas,
    v_max_personas,
    v_antelacion,
    v_dias_maximos
  from public.restaurante_webs w
  join public.reservas_config c on c.restaurante_id = w.restaurante_id
  where w.slug = lower(trim(p_slug))
    and w.publicada = true
    and c.activo = true
  limit 1;

  if v_restaurante_id is null then
    raise exception 'BOOKING_NOT_AVAILABLE';
  end if;

  if p_fecha is null or p_personas is null
     or p_personas < v_min_personas or p_personas > v_max_personas then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  v_ahora_local := now() at time zone v_zona_horaria;
  if p_fecha < v_ahora_local::date
     or p_fecha > v_ahora_local::date + v_dias_maximos then
    return;
  end if;

  return query
  with normal_ranges as (
    select
      h.turno,
      h.hora_inicio,
      h.hora_fin,
      h.capacidad_override
    from public.reservas_horarios h
    where h.restaurante_id = v_restaurante_id
      and h.dia_semana = extract(dow from p_fecha)::integer
      and h.activo = true
      and not exists (
        select 1
        from public.reservas_excepciones e
        where e.restaurante_id = v_restaurante_id
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
    where e.restaurante_id = v_restaurante_id
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
        where e.restaurante_id = v_restaurante_id
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
    where s.slot_start >= now() + make_interval(mins => v_antelacion)
      and not exists (
        select 1
        from public.reservas_excepciones e
        where e.restaurante_id = v_restaurante_id
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
  ),
  remaining_slots as (
    select
      s.*,
      greatest(
        0,
        s.effective_capacity - coalesce((
          select sum(greatest(coalesce(r.personas, 1), 1))::integer
          from public.reservas r
          where r.restaurante_id = v_restaurante_id
            and r.id is distinct from p_excluir_reserva_id
            and lower(coalesce(r.estado, 'pendiente'))
              not in ('cancelada', 'cancelado', 'no-show', 'no_show')
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

-- Crea cliente y reserva dentro de una unica transaccion.
create or replace function public.crear_reserva_publica(
  p_slug text,
  p_inicio_at timestamptz,
  p_personas integer,
  p_nombre text,
  p_telefono text default null,
  p_email text default null,
  p_notas text default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_zona_horaria text;
  v_duracion integer;
  v_min_personas integer;
  v_max_personas integer;
  v_confirmacion_automatica boolean;
  v_requiere_telefono boolean;
  v_requiere_email boolean;
  v_cliente_id uuid;
  v_cliente_token uuid;
  v_reserva_id uuid;
  v_gestion_token uuid;
  v_estado text;
  v_turno text;
  v_fin_at timestamptz;
  v_telefono text := nullif(left(trim(coalesce(p_telefono, '')), 40), '');
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 254)), '');
  v_nombre text := nullif(left(trim(coalesce(p_nombre, '')), 120), '');
  v_existing jsonb;
begin
  select
    w.restaurante_id,
    c.zona_horaria,
    c.duracion_minutos,
    c.personas_minimas,
    c.personas_maximas,
    c.confirmacion_automatica,
    c.requiere_telefono,
    c.requiere_email
  into
    v_restaurante_id,
    v_zona_horaria,
    v_duracion,
    v_min_personas,
    v_max_personas,
    v_confirmacion_automatica,
    v_requiere_telefono,
    v_requiere_email
  from public.restaurante_webs w
  join public.reservas_config c on c.restaurante_id = w.restaurante_id
  where w.slug = lower(trim(p_slug))
    and w.publicada = true
    and c.activo = true
  limit 1;

  if v_restaurante_id is null then
    raise exception 'BOOKING_NOT_AVAILABLE';
  end if;

  if p_inicio_at is null or v_nombre is null or length(v_nombre) < 2
     or p_personas is null
     or p_personas < v_min_personas or p_personas > v_max_personas
     or (v_requiere_telefono and v_telefono is null)
     or (v_requiere_email and v_email is null)
     or (v_telefono is null and v_email is null)
     or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_restaurante_id::text || ':request:' || p_idempotency_key::text, 0)
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
    where r.restaurante_id = v_restaurante_id
      and r.idempotency_key = p_idempotency_key
    limit 1;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Bloqueo por restaurante y dia local: dos peticiones simultaneas no pueden
  -- consumir la misma capacidad antes de que la otra termine.
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_restaurante_id::text || ':date:'
        || (p_inicio_at at time zone v_zona_horaria)::date::text,
      0
    )
  );

  select a.fin_at, a.turno
    into v_fin_at, v_turno
  from public.obtener_disponibilidad_reservas(
    p_slug,
    (p_inicio_at at time zone v_zona_horaria)::date,
    p_personas
  ) a
  where a.inicio_at = p_inicio_at
  limit 1;

  if v_fin_at is null then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  if v_telefono is not null then
    -- La base historica puede contener mas de un cliente con el mismo telefono
    -- y no tiene una restriccion unica. Serializamos por telefono y reutilizamos
    -- el registro mas antiguo sin forzar una limpieza destructiva de datos.
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_restaurante_id::text || ':client-phone:' || v_telefono,
        0
      )
    );

    select c.id, c.public_token
      into v_cliente_id, v_cliente_token
    from public.clientes c
    where c.restaurante_id = v_restaurante_id
      and c.telefono = v_telefono
    order by c.created_at asc nulls last, c.id asc
    limit 1;

    if v_cliente_id is null then
      insert into public.clientes (
        restaurante_id, nombre, telefono, email, origen_principal,
        canal_contacto, updated_at
      ) values (
        v_restaurante_id, v_nombre, v_telefono, v_email, 'web',
        'whatsapp', now()
      )
      returning id, public_token into v_cliente_id, v_cliente_token;
    else
      update public.clientes
      set nombre = v_nombre,
          email = coalesce(v_email, email),
          origen_principal = coalesce(origen_principal, 'web'),
          canal_contacto = case
            when canal_contacto is null or canal_contacto = 'ninguno'
            then 'whatsapp'
            else canal_contacto
          end,
          updated_at = now()
      where id = v_cliente_id
      returning public_token into v_cliente_token;
    end if;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_restaurante_id::text || ':client-email:' || v_email,
        0
      )
    );

    select c.id, c.public_token
      into v_cliente_id, v_cliente_token
    from public.clientes c
    where c.restaurante_id = v_restaurante_id
      and lower(c.email) = v_email
    order by c.created_at asc
    limit 1;

    if v_cliente_id is null then
      insert into public.clientes (
        restaurante_id, nombre, email, origen_principal,
        canal_contacto, updated_at
      ) values (
        v_restaurante_id, v_nombre, v_email, 'web', 'email', now()
      )
      returning id, public_token into v_cliente_id, v_cliente_token;
    else
      update public.clientes
      set nombre = v_nombre,
          origen_principal = coalesce(origen_principal, 'web'),
          canal_contacto = case
            when canal_contacto is null or canal_contacto = 'ninguno'
            then 'email'
            else canal_contacto
          end,
          updated_at = now()
      where id = v_cliente_id
      returning public_token into v_cliente_token;
    end if;
  end if;

  v_estado := case
    when v_confirmacion_automatica then 'confirmada'
    else 'pendiente'
  end;

  insert into public.reservas (
    restaurante_id,
    cliente_id,
    nombre_cliente,
    telefono,
    email,
    personas,
    origen,
    notas,
    fecha_hora_reserva,
    inicio_at,
    fin_at,
    estado,
    turno,
    idempotency_key
  ) values (
    v_restaurante_id,
    v_cliente_id,
    v_nombre,
    v_telefono,
    v_email,
    p_personas,
    'web_publica',
    nullif(left(trim(coalesce(p_notas, '')), 800), ''),
    p_inicio_at at time zone v_zona_horaria,
    p_inicio_at,
    v_fin_at,
    v_estado,
    v_turno,
    p_idempotency_key
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
    'cliente_token', v_cliente_token
  );
end;
$$;

