-- DRAFT ONLY: not applied to production. Promote with `supabase migration new`
-- after the isolated SQL tests and a two-session concurrency test pass.
-- This adds an opt-in physical-seat ceiling; it is NOT a table-packing engine.
begin;

alter table public.reservas_config
  add column if not exists capacidad_vinculada_sala boolean not null default false;

comment on column public.reservas_config.capacidad_vinculada_sala is
  'Opt-in after checking the complete room inventory. Booking quota is capped by seats in active, unblocked tables in active zones; does not assign or combine tables.';

create or replace function app_private.limitar_capacidad_por_sala(
  p_restaurante_id uuid,
  p_cupo_configurado integer
)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select case when coalesce((
    select c.capacidad_vinculada_sala
    from public.reservas_config c
    where c.restaurante_id = p_restaurante_id
  ), false) then least(
    greatest(coalesce(p_cupo_configurado, 0), 0)::bigint,
    coalesce((
      select sum(greatest(m.capacidad, 0))
      from public.sala_mesas m
      join public.sala_zonas z
        on z.id = m.zona_id and z.restaurante_id = m.restaurante_id
      where m.restaurante_id = p_restaurante_id
        and m.activa and not m.bloqueada and z.activa
    ), 0)
  )::integer else greatest(coalesce(p_cupo_configurado, 0), 0) end;
$$;

revoke all on function app_private.limitar_capacidad_por_sala(uuid, integer)
from public, anon, authenticated, service_role;

-- Preserve every existing reader's auth, publication, lead-time and date rules.
-- Abort on definition drift rather than silently leaving one channel unchanged.
do $$
declare
  v_signature text;
  v_definition text;
  v_restaurant_argument text;
  v_needle constant text := 's.effective_capacity - coalesce((';
begin
  foreach v_signature in array array[
    'public.obtener_disponibilidad_reservas(text,date,integer,uuid)',
    'public.obtener_disponibilidad_manual(uuid,date,integer)',
    'public.obtener_disponibilidad_chatbot(uuid,date,integer,uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    if position('app_private.limitar_capacidad_por_sala(' in v_definition) > 0 then
      continue;
    end if;
    if (length(v_definition) - length(replace(v_definition, v_needle, '')))
       / length(v_needle) <> 1 then
      raise exception 'CAPACITY_READER_DEFINITION_DRIFT: %', v_signature;
    end if;
    v_restaurant_argument := case when v_signature like '%reservas(text%'
      then 'v_restaurante_id' else 'p_restaurante_id' end;
    execute replace(v_definition, v_needle,
      'app_private.limitar_capacidad_por_sala(' || v_restaurant_argument ||
      ', s.effective_capacity) - coalesce((');
  end loop;
end;
$$;

-- The settings RPC was moved to app_private by the demo-write hardening.
-- Omitted JSON keys preserve the mode for older clients.
do $$
declare
  v_definition text := pg_get_functiondef(
    'app_private.guardar_configuracion_web_reservas(uuid,jsonb,jsonb,jsonb)'::regprocedure
  );
  v_needle constant text := '      personas_minimas =';
begin
  if position('capacidad_vinculada_sala =' in v_definition) = 0 then
    if (length(v_definition) - length(replace(v_definition, v_needle, '')))
       / length(v_needle) <> 1 then
      raise exception 'CAPACITY_SETTINGS_DEFINITION_DRIFT';
    end if;
    execute replace(v_definition, v_needle,
      '      capacidad_vinculada_sala = coalesce((p_config ->> ''capacidad_vinculada_sala'')::boolean, capacidad_vinculada_sala),' ||
      chr(10) || v_needle);
  end if;
end;
$$;

-- A non-waiting transaction lock prevents row-lock order inversions from
-- deadlocking. A caller receiving CAPACITY_BUSY must retry the whole request.
-- This lock coordinates physical changes and the final booking write, not
-- merely the earlier availability read. Existing per-day booking locks remain.
create or replace function app_private.bloquear_capacidad_sala(p_restaurante_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_restaurante_id is null then
    raise exception 'INVALID_RESTAURANT';
  end if;
  if not pg_try_advisory_xact_lock(
    hashtextextended(p_restaurante_id::text || ':room-capacity', 0)
  ) then
    raise exception 'CAPACITY_BUSY' using errcode = '55P03';
  end if;
end;
$$;
revoke all on function app_private.bloquear_capacidad_sala(uuid)
from public, anon, authenticated, service_role;

create or replace function app_private.coordinar_cambios_capacidad_sala()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform app_private.bloquear_capacidad_sala(old.restaurante_id);
  end if;
  if tg_op <> 'DELETE' then
    perform app_private.bloquear_capacidad_sala(new.restaurante_id);
    return new;
  end if;
  return old;
end;
$$;
revoke all on function app_private.coordinar_cambios_capacidad_sala()
from public, anon, authenticated, service_role;

drop trigger if exists coordinar_capacidad_sala_mesas on public.sala_mesas;
create trigger coordinar_capacidad_sala_mesas
before insert or delete or update of restaurante_id, zona_id, capacidad, activa, bloqueada
on public.sala_mesas for each row
execute function app_private.coordinar_cambios_capacidad_sala();

drop trigger if exists coordinar_capacidad_sala_zonas on public.sala_zonas;
create trigger coordinar_capacidad_sala_zonas
before insert or delete or update of restaurante_id, activa
on public.sala_zonas for each row
execute function app_private.coordinar_cambios_capacidad_sala();

drop trigger if exists coordinar_capacidad_sala_config on public.reservas_config;
create trigger coordinar_capacidad_sala_config
before insert or delete or update of restaurante_id, capacidad_vinculada_sala,
  capacidad_por_turno, zona_horaria, duracion_minutos
on public.reservas_config for each row
execute function app_private.coordinar_cambios_capacidad_sala();

create or replace function app_private.validar_capacidad_fisica_reserva()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vinculada boolean;
  v_zona_horaria text;
  v_duracion integer;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_capacidad integer;
  v_ocupadas bigint;
  v_estados_finales constant text[] := array[
    'cancelada', 'cancelado', 'no-show', 'no_show', 'no show'
  ];
begin
  if lower(coalesce(new.estado, 'pendiente')) = any(v_estados_finales) then
    return new;
  end if;

  -- Arrival, consumption and table reassignment must still work if a table
  -- was blocked after this reservation was accepted. Only new/increased or
  -- moved demand is checked. No accepted reservation is silently cancelled.
  if tg_op = 'UPDATE'
     and not (lower(coalesce(old.estado, 'pendiente')) = any(v_estados_finales))
     and new.restaurante_id is not distinct from old.restaurante_id
     and new.inicio_at is not distinct from old.inicio_at
     and new.fin_at is not distinct from old.fin_at
     and new.fecha_hora_reserva is not distinct from old.fecha_hora_reserva
     and greatest(coalesce(new.personas, 1), 1)
       <= greatest(coalesce(old.personas, 1), 1) then
    return new;
  end if;

  perform app_private.bloquear_capacidad_sala(new.restaurante_id);

  select c.capacidad_vinculada_sala, c.zona_horaria, c.duracion_minutos
    into v_vinculada, v_zona_horaria, v_duracion
  from public.reservas_config c
  where c.restaurante_id = new.restaurante_id;
  if coalesce(v_vinculada, false) is not true then
    return new;
  end if;

  v_zona_horaria := coalesce(v_zona_horaria, 'Europe/Madrid');
  v_duracion := coalesce(v_duracion, 90);
  v_inicio := coalesce(new.inicio_at,
    new.fecha_hora_reserva at time zone v_zona_horaria);
  v_fin := coalesce(new.fin_at, v_inicio + make_interval(mins => v_duracion));
  if v_inicio is null or v_fin is null or v_fin <= v_inicio then
    raise exception 'INVALID_RESERVATION_TIME';
  end if;

  -- Only the physical ceiling is checked here; per-slot quotas and opening
  -- rules stay in the original create/reschedule RPCs and availability readers.
  v_capacidad := app_private.limitar_capacidad_por_sala(new.restaurante_id, 2147483647);
  select coalesce(sum(greatest(coalesce(r.personas, 1), 1)), 0)
    into v_ocupadas
  from public.reservas r
  where r.restaurante_id = new.restaurante_id
    and r.id is distinct from new.id
    and not (lower(coalesce(r.estado, 'pendiente')) = any(v_estados_finales))
    and coalesce(r.inicio_at, r.fecha_hora_reserva at time zone v_zona_horaria) < v_fin
    and coalesce(r.fin_at,
      (r.fecha_hora_reserva at time zone v_zona_horaria)
        + make_interval(mins => v_duracion)) > v_inicio;

  if v_ocupadas + greatest(coalesce(new.personas, 1), 1) > v_capacidad then
    raise exception 'SLOT_NOT_AVAILABLE';
  end if;
  return new;
end;
$$;
revoke all on function app_private.validar_capacidad_fisica_reserva()
from public, anon, authenticated, service_role;

drop trigger if exists zx_validar_capacidad_fisica_reserva on public.reservas;
create trigger zx_validar_capacidad_fisica_reserva
before insert or update of restaurante_id, inicio_at, fin_at,
  fecha_hora_reserva, estado, personas
on public.reservas for each row
execute function app_private.validar_capacidad_fisica_reserva();

commit;
