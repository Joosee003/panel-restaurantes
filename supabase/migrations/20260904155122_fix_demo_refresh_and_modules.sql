-- Mantiene actualizada la información ficticia sin abrir escrituras a la
-- cuenta demo y muestra en ella los módulos anunciados en la pantalla pública.

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
  select coalesce(c.zona_horaria, 'Europe/Madrid'),
         coalesce(c.duracion_minutos, 90)
    into v_zona_horaria, v_duracion
  from public.reservas_config c
  where c.restaurante_id = new.restaurante_id;

  v_zona_horaria := coalesce(v_zona_horaria, 'Europe/Madrid');
  v_duracion := coalesce(v_duracion, 90);

  if current_setting('app.allow_demo_write', true) = '1'
     and exists (
       select 1
       from public.usuarios_restaurantes ur
       where ur.restaurante_id = new.restaurante_id
         and ur.demo_vista is true
     ) then
    if new.fecha_hora_reserva is not null then
      new.inicio_at := new.fecha_hora_reserva at time zone v_zona_horaria;
      new.fin_at := new.inicio_at + make_interval(mins => v_duracion);
    end if;
    return new;
  end if;

  if new.mesa_id is null
     or lower(coalesce(new.estado, 'pendiente'))
       in ('cancelada', 'cancelado', 'no-show', 'no_show', 'no show') then
    return new;
  end if;

  v_inicio := coalesce(
    new.inicio_at,
    new.fecha_hora_reserva at time zone v_zona_horaria
  );
  v_fin := coalesce(new.fin_at, v_inicio + make_interval(mins => v_duracion));

  if v_inicio is null or v_fin is null or v_fin <= v_inicio then
    raise exception 'INVALID_RESERVATION_TIME';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('table:' || new.mesa_id::text, 0)
  );

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

update public.restaurante_modulos m
set rentabilidad = true,
    menu_digital = true,
    camarero_digital = true
where exists (
  select 1
  from public.usuarios_restaurantes ur
  where ur.restaurante_id = m.restaurante_id
    and ur.demo_vista is true
);
