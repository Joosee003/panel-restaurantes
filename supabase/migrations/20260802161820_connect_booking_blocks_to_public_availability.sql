-- Conecta los bloqueos creados desde el panel de reservas con la
-- disponibilidad de la web pública. Un bloqueo solapado invalida la franja.

create index if not exists bloqueos_reservas_activos_lookup_idx
  on public.bloqueos_reservas (restaurante_id, fecha, hora_inicio, hora_fin)
  where activo = true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bloqueos_reservas'::regclass
      and conname = 'bloqueos_reservas_rango_check'
  ) then
    alter table public.bloqueos_reservas
      add constraint bloqueos_reservas_rango_check
      check (hora_fin > hora_inicio);
  end if;
end;
$$;

create or replace function public.validar_solapamiento_horario_reservas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activo = true and exists (
    select 1
    from public.reservas_horarios h
    where h.restaurante_id = new.restaurante_id
      and h.dia_semana = new.dia_semana
      and h.activo = true
      and h.id is distinct from new.id
      and new.hora_inicio < h.hora_fin
      and h.hora_inicio < new.hora_fin
  ) then
    raise exception 'OVERLAPPING_BOOKING_SCHEDULE';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_solapamiento_horario_reservas()
from public, anon, authenticated;

drop trigger if exists validar_solapamiento_horario_reservas
on public.reservas_horarios;

create trigger validar_solapamiento_horario_reservas
before insert or update of restaurante_id, dia_semana, hora_inicio, hora_fin, activo
on public.reservas_horarios
for each row execute function public.validar_solapamiento_horario_reservas();

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
      and not exists (
        select 1
        from public.bloqueos_reservas b
        where b.restaurante_id = v_restaurante_id
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
