-- Las reservas manuales pasan por las mismas reglas de horario y capacidad
-- que la web. Las mesas se validan en base de datos y cada cambio queda
-- registrado para conservar el historial operativo.

create table if not exists public.reserva_mesa_historial (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  reserva_id uuid references public.reservas(id) on delete set null,
  mesa_anterior_id uuid references public.sala_mesas(id) on delete set null,
  mesa_nueva_id uuid references public.sala_mesas(id) on delete set null,
  mesa_anterior_nombre text,
  mesa_nueva_nombre text,
  accion text not null,
  cambiado_por uuid,
  reserva_inicio_at timestamptz,
  creado_en timestamptz not null default now(),
  constraint reserva_mesa_historial_accion_check
    check (accion in ('asignada', 'cambiada', 'liberada'))
);

create index if not exists reserva_mesa_historial_reserva_idx
  on public.reserva_mesa_historial (restaurante_id, reserva_id, creado_en desc);

alter table public.reserva_mesa_historial enable row level security;

drop policy if exists reserva_mesa_historial_select on public.reserva_mesa_historial;
create policy reserva_mesa_historial_select
on public.reserva_mesa_historial
for select
to authenticated
using ((select public.user_can_access_restaurant(restaurante_id)));

drop policy if exists app_admin_full_access on public.reserva_mesa_historial;
create policy app_admin_full_access
on public.reserva_mesa_historial
for all
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

revoke all on table public.reserva_mesa_historial from public, anon, authenticated;
grant select on table public.reserva_mesa_historial to authenticated;
grant all on table public.reserva_mesa_historial to service_role;

create or replace function app_private.validar_asignacion_mesa_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mesa public.sala_mesas%rowtype;
  v_zona_horaria text;
  v_duracion integer;
  v_inicio timestamptz;
  v_fin timestamptz;
begin
  if new.mesa_id is null
     or lower(coalesce(new.estado, 'pendiente'))
       in ('cancelada', 'cancelado', 'no-show', 'no_show', 'no show') then
    return new;
  end if;

  select coalesce(c.zona_horaria, 'Europe/Madrid'),
         coalesce(c.duracion_minutos, 90)
    into v_zona_horaria, v_duracion
  from public.reservas_config c
  where c.restaurante_id = new.restaurante_id;

  v_zona_horaria := coalesce(v_zona_horaria, 'Europe/Madrid');
  v_duracion := coalesce(v_duracion, 90);
  v_inicio := coalesce(
    new.inicio_at,
    new.fecha_hora_reserva at time zone v_zona_horaria
  );
  v_fin := coalesce(new.fin_at, v_inicio + make_interval(mins => v_duracion));

  if v_inicio is null or v_fin is null or v_fin <= v_inicio then
    raise exception 'INVALID_RESERVATION_TIME';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('table:' || new.mesa_id::text, 0));

  select m.*
    into v_mesa
  from public.sala_mesas m
  where m.id = new.mesa_id
  for update;

  if v_mesa.id is null or v_mesa.restaurante_id <> new.restaurante_id then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  if not v_mesa.activa or v_mesa.bloqueada then
    raise exception 'TABLE_NOT_AVAILABLE';
  end if;

  if v_mesa.capacidad < greatest(coalesce(new.personas, 1), 1) then
    raise exception 'TABLE_CAPACITY_EXCEEDED';
  end if;

  if exists (
    select 1
    from public.reservas r
    left join public.reservas_config c on c.restaurante_id = r.restaurante_id
    where r.mesa_id = new.mesa_id
      and r.id is distinct from new.id
      and lower(coalesce(r.estado, 'pendiente'))
        not in ('cancelada', 'cancelado', 'no-show', 'no_show', 'no show')
      and coalesce(
        r.inicio_at,
        r.fecha_hora_reserva at time zone coalesce(c.zona_horaria, 'Europe/Madrid')
      ) < v_fin
      and coalesce(
        r.fin_at,
        (r.fecha_hora_reserva at time zone coalesce(c.zona_horaria, 'Europe/Madrid'))
          + make_interval(mins => coalesce(c.duracion_minutos, 90))
      ) > v_inicio
  ) then
    raise exception 'TABLE_TIME_CONFLICT';
  end if;

  new.inicio_at := v_inicio;
  new.fin_at := v_fin;
  return new;
end;
$$;

revoke all on function app_private.validar_asignacion_mesa_reserva()
from public, anon, authenticated, service_role;

drop trigger if exists zz_validar_asignacion_mesa_reserva on public.reservas;
create trigger zz_validar_asignacion_mesa_reserva
before insert or update of mesa_id, inicio_at, fin_at, fecha_hora_reserva, estado, personas, restaurante_id
on public.reservas
for each row
execute function app_private.validar_asignacion_mesa_reserva();

create or replace function app_private.registrar_historial_mesa_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accion text;
  v_nombre_anterior text;
  v_nombre_nuevo text;
begin
  if new.mesa_id is not distinct from old.mesa_id then
    return new;
  end if;

  v_accion := case
    when old.mesa_id is null then 'asignada'
    when new.mesa_id is null then 'liberada'
    else 'cambiada'
  end;

  select m.nombre into v_nombre_anterior
  from public.sala_mesas m
  where m.id = old.mesa_id;

  select m.nombre into v_nombre_nuevo
  from public.sala_mesas m
  where m.id = new.mesa_id;

  insert into public.reserva_mesa_historial (
    restaurante_id,
    reserva_id,
    mesa_anterior_id,
    mesa_nueva_id,
    mesa_anterior_nombre,
    mesa_nueva_nombre,
    accion,
    cambiado_por,
    reserva_inicio_at
  ) values (
    new.restaurante_id,
    new.id,
    old.mesa_id,
    new.mesa_id,
    v_nombre_anterior,
    v_nombre_nuevo,
    v_accion,
    auth.uid(),
    new.inicio_at
  );

  return new;
end;
$$;

revoke all on function app_private.registrar_historial_mesa_reserva()
from public, anon, authenticated, service_role;

drop trigger if exists registrar_historial_mesa_reserva on public.reservas;
create trigger registrar_historial_mesa_reserva
after update of mesa_id
on public.reservas
for each row
execute function app_private.registrar_historial_mesa_reserva();

create or replace function public.obtener_disponibilidad_manual(
  p_restaurante_id uuid,
  p_fecha date,
  p_personas integer
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
  v_dias_maximos integer;
  v_ahora_local timestamp;
begin
  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'RESTAURANT_ACCESS_DENIED';
  end if;

  select
    c.zona_horaria,
    c.intervalo_minutos,
    c.duracion_minutos,
    c.capacidad_por_turno,
    c.personas_minimas,
    c.personas_maximas,
    c.dias_maximos_antelacion
  into
    v_zona_horaria,
    v_intervalo,
    v_duracion,
    v_capacidad,
    v_min_personas,
    v_max_personas,
    v_dias_maximos
  from public.reservas_config c
  where c.restaurante_id = p_restaurante_id;

  if v_zona_horaria is null then
    raise exception 'BOOKING_SETTINGS_NOT_FOUND';
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
    where s.slot_start >= now()
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

revoke all on function public.obtener_disponibilidad_manual(uuid, date, integer)
from public, anon, authenticated, service_role;
grant execute on function public.obtener_disponibilidad_manual(uuid, date, integer)
to authenticated, service_role;

create or replace function public.crear_reserva_manual(
  p_restaurante_id uuid,
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
  v_zona_horaria text;
  v_min_personas integer;
  v_max_personas integer;
  v_cliente_id uuid;
  v_reserva_id uuid;
  v_gestion_token uuid;
  v_fin_at timestamptz;
  v_turno text;
  v_telefono text;
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 254)), '');
  v_nombre text := nullif(left(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), 120), '');
  v_notas text := nullif(left(trim(coalesce(p_notas, '')), 800), '');
  v_existing jsonb;
begin
  perform app_private.assert_mutation_allowed();

  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'RESTAURANT_ACCESS_DENIED';
  end if;

  v_telefono := nullif(regexp_replace(coalesce(p_telefono, ''), '[^0-9]', '', 'g'), '');
  if v_telefono like '34%' and length(v_telefono) = 11 then
    v_telefono := substring(v_telefono from 3);
  end if;

  select c.zona_horaria, c.personas_minimas, c.personas_maximas
    into v_zona_horaria, v_min_personas, v_max_personas
  from public.reservas_config c
  where c.restaurante_id = p_restaurante_id;

  if v_zona_horaria is null then
    raise exception 'BOOKING_SETTINGS_NOT_FOUND';
  end if;

  if p_inicio_at is null
     or v_nombre is null or length(v_nombre) < 2
     or p_personas is null
     or p_personas < v_min_personas or p_personas > v_max_personas
     or (v_telefono is null and v_email is null)
     or (v_telefono is not null and length(v_telefono) not between 7 and 15)
     or (v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'INVALID_BOOKING_REQUEST';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_restaurante_id::text || ':manual:' || p_idempotency_key::text, 0)
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
  from public.obtener_disponibilidad_manual(
    p_restaurante_id,
    (p_inicio_at at time zone v_zona_horaria)::date,
    p_personas
  ) a
  where a.inicio_at = p_inicio_at
  limit 1;

  if v_fin_at is null then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;

  if v_telefono is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(p_restaurante_id::text || ':client-phone:' || v_telefono, 0)
    );

    select c.id into v_cliente_id
    from public.clientes c
    where c.restaurante_id = p_restaurante_id
      and regexp_replace(coalesce(c.telefono, ''), '[^0-9]', '', 'g')
        in (v_telefono, '34' || v_telefono)
    order by c.created_at asc nulls last, c.id asc
    limit 1;
  else
    perform pg_advisory_xact_lock(
      hashtextextended(p_restaurante_id::text || ':client-email:' || v_email, 0)
    );

    select c.id into v_cliente_id
    from public.clientes c
    where c.restaurante_id = p_restaurante_id
      and lower(c.email) = v_email
    order by c.created_at asc nulls last, c.id asc
    limit 1;
  end if;

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
      'panel',
      'ninguno',
      false,
      false,
      now()
    )
    returning id into v_cliente_id;
  else
    update public.clientes
    set nombre = v_nombre,
        telefono = coalesce(v_telefono, telefono),
        email = coalesce(v_email, email),
        origen_principal = coalesce(origen_principal, 'panel'),
        updated_at = now()
    where id = v_cliente_id;
  end if;

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
    p_restaurante_id,
    v_cliente_id,
    v_nombre,
    v_telefono,
    v_email,
    p_personas,
    'panel_nativo',
    v_notas,
    p_inicio_at at time zone v_zona_horaria,
    p_inicio_at,
    v_fin_at,
    'pendiente',
    v_turno,
    p_idempotency_key
  )
  returning id, gestion_token into v_reserva_id, v_gestion_token;

  return jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'reserva_id', v_reserva_id,
    'estado', 'pendiente',
    'inicio_at', p_inicio_at,
    'fin_at', v_fin_at,
    'gestion_token', v_gestion_token
  );
end;
$$;

revoke all on function public.crear_reserva_manual(
  uuid, timestamptz, integer, text, text, text, text, uuid
)
from public, anon, authenticated, service_role;
grant execute on function public.crear_reserva_manual(
  uuid, timestamptz, integer, text, text, text, text, uuid
)
to authenticated, service_role;

create or replace function public.gestionar_mesa_reserva(
  p_reserva_id uuid,
  p_mesa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva public.reservas%rowtype;
begin
  perform app_private.assert_mutation_allowed();

  select r.* into v_reserva
  from public.reservas r
  where r.id = p_reserva_id
  for update;

  if v_reserva.id is null then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if not public.user_can_access_restaurant(v_reserva.restaurante_id) then
    raise exception 'RESTAURANT_ACCESS_DENIED';
  end if;

  update public.reservas
  set mesa_id = p_mesa_id
  where id = p_reserva_id;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', p_reserva_id,
    'mesa_id', p_mesa_id
  );
end;
$$;

revoke all on function public.gestionar_mesa_reserva(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.gestionar_mesa_reserva(uuid, uuid)
to authenticated, service_role;

comment on table public.reserva_mesa_historial is
  'Registro no editable de asignaciones, cambios y liberaciones de mesas.';
comment on function public.crear_reserva_manual(uuid, timestamptz, integer, text, text, text, text, uuid) is
  'Crea cliente y reserva manual en una transacción tras validar horario y capacidad.';
comment on function public.gestionar_mesa_reserva(uuid, uuid) is
  'Asigna, cambia o libera una mesa con validación de capacidad y solapamientos.';
