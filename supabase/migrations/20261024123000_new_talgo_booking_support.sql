CREATE OR REPLACE FUNCTION app_private.guardar_configuracion_web_reservas(p_restaurante_id uuid, p_web jsonb, p_config jsonb, p_horarios jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nombre text := nullif(left(trim(coalesce(p_web ->> 'nombre_publico', '')), 120), '');
  v_zona_horaria text := coalesce(nullif(trim(p_config ->> 'zona_horaria'), ''), 'Europe/Madrid');
  v_publicada boolean := coalesce((p_web ->> 'publicada')::boolean, false);
  v_reservas_activas boolean := coalesce((p_config ->> 'activo')::boolean, false);
  v_slug text;
begin
  if p_restaurante_id is null
     or not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  if v_nombre is null then
    raise exception 'PUBLIC_NAME_REQUIRED';
  end if;

  if jsonb_typeof(coalesce(p_horarios, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_SCHEDULE';
  end if;

  if not exists (
    select 1 from pg_timezone_names tz where tz.name = v_zona_horaria
  ) then
    raise exception 'INVALID_TIMEZONE';
  end if;

  update public.restaurante_webs
  set publicada = v_publicada,
      nombre_publico = v_nombre,
      antetitulo = nullif(left(trim(coalesce(p_web ->> 'antetitulo', '')), 120), ''),
      titular = nullif(left(trim(coalesce(p_web ->> 'titular', '')), 180), ''),
      subtitulo = nullif(left(trim(coalesce(p_web ->> 'subtitulo', '')), 360), ''),
      descripcion = nullif(left(trim(coalesce(p_web ->> 'descripcion', '')), 2000), ''),
      direccion_publica = nullif(left(trim(coalesce(p_web ->> 'direccion_publica', '')), 260), ''),
      telefono_publico = nullif(left(trim(coalesce(p_web ->> 'telefono_publico', '')), 40), ''),
      email_publico = nullif(lower(left(trim(coalesce(p_web ->> 'email_publico', '')), 254)), ''),
      whatsapp = nullif(left(trim(coalesce(p_web ->> 'whatsapp', '')), 40), ''),
      google_maps_url = nullif(left(trim(coalesce(p_web ->> 'google_maps_url', '')), 1000), ''),
      instagram_url = nullif(left(trim(coalesce(p_web ->> 'instagram_url', '')), 1000), ''),
      facebook_url = nullif(left(trim(coalesce(p_web ->> 'facebook_url', '')), 1000), ''),
      logo_url = nullif(left(trim(coalesce(p_web ->> 'logo_url', '')), 1000), ''),
      hero_image_url = nullif(left(trim(coalesce(p_web ->> 'hero_image_url', '')), 1000), ''),
      galeria_urls = array(
        select left(trim(value), 1000)
        from jsonb_array_elements_text(coalesce(p_web -> 'galeria_urls', '[]'::jsonb))
        where trim(value) <> ''
        limit 12
      ),
      especialidades = array(
        select left(trim(value), 80)
        from jsonb_array_elements_text(coalesce(p_web -> 'especialidades', '[]'::jsonb))
        where trim(value) <> ''
        limit 12
      ),
      color_primario = coalesce(nullif(trim(p_web ->> 'color_primario'), ''), '#123c3a'),
      color_acento = coalesce(nullif(trim(p_web ->> 'color_acento'), ''), '#e7b75f'),
      color_fondo = coalesce(nullif(trim(p_web ->> 'color_fondo'), ''), '#f7f3e8'),
      seo_titulo = nullif(left(trim(coalesce(p_web ->> 'seo_titulo', '')), 180), ''),
      seo_descripcion = nullif(left(trim(coalesce(p_web ->> 'seo_descripcion', '')), 320), '')
  where restaurante_id = p_restaurante_id
  returning slug into v_slug;

  if v_slug is null then
    raise exception 'WEB_CONFIG_MISSING';
  end if;

  update public.reservas_config
  set activo = v_reservas_activas,
      zona_horaria = v_zona_horaria,
      intervalo_minutos = greatest(5, least(120, coalesce((p_config ->> 'intervalo_minutos')::integer, 30))),
      duracion_minutos = greatest(15, least(720, coalesce((p_config ->> 'duracion_minutos')::integer, 90))),
      capacidad_por_turno = greatest(1, least(5000, coalesce((p_config ->> 'capacidad_por_turno')::integer, 40))),
      personas_minimas = greatest(1, least(100, coalesce((p_config ->> 'personas_minimas')::integer, 1))),
      personas_maximas = greatest(1, least(500, coalesce((p_config ->> 'personas_maximas')::integer, 12))),
      antelacion_minutos = greatest(0, least(43200, coalesce((p_config ->> 'antelacion_minutos')::integer, 60))),
      dias_maximos_antelacion = greatest(1, least(730, coalesce((p_config ->> 'dias_maximos_antelacion')::integer, 60))),
      confirmacion_automatica = coalesce((p_config ->> 'confirmacion_automatica')::boolean, true),
      confirmacion_automatica_hasta = coalesce((p_config ->> 'confirmacion_automatica_hasta')::smallint, confirmacion_automatica_hasta),
      cancelacion_minutos = greatest(0, least(10080, coalesce((p_config ->> 'cancelacion_minutos')::integer, 120))),
      requiere_telefono = coalesce((p_config ->> 'requiere_telefono')::boolean, true),
      requiere_email = coalesce((p_config ->> 'requiere_email')::boolean, false),
      aviso_reserva = nullif(left(trim(coalesce(p_config ->> 'aviso_reserva', '')), 500), ''),
      politica_cancelacion = nullif(left(trim(coalesce(p_config ->> 'politica_cancelacion', '')), 800), '')
  where restaurante_id = p_restaurante_id;

  if (
    select personas_maximas < personas_minimas
    from public.reservas_config
    where restaurante_id = p_restaurante_id
  ) then
    raise exception 'INVALID_PARTY_RANGE';
  end if;

  delete from public.reservas_horarios
  where restaurante_id = p_restaurante_id;

  insert into public.reservas_horarios (
    restaurante_id,
    dia_semana,
    turno,
    hora_inicio,
    hora_fin,
    capacidad_override,
    activo
  )
  select
    p_restaurante_id,
    x.dia_semana,
    lower(trim(x.turno)),
    x.hora_inicio,
    x.hora_fin,
    x.capacidad_override,
    coalesce(x.activo, true)
  from jsonb_to_recordset(coalesce(p_horarios, '[]'::jsonb)) as x(
    dia_semana smallint,
    turno text,
    hora_inicio time,
    hora_fin time,
    capacidad_override integer,
    activo boolean
  )
  where coalesce(x.activo, true) = true;

  if v_reservas_activas and not exists (
    select 1
    from public.reservas_horarios h
    where h.restaurante_id = p_restaurante_id and h.activo = true
  ) then
    raise exception 'ACTIVE_BOOKING_REQUIRES_SCHEDULE';
  end if;

  return jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'publicada', v_publicada,
    'reservas_activas', v_reservas_activas
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.sync_panel_service_hours(p_restaurante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_lunch time[]; v_dinner time[]; v_active_ids uuid[];
begin
  select public.parse_panel_service_hours(r.horario_comida), public.parse_panel_service_hours(r.horario_cena)
    into v_lunch, v_dinner from public.restaurantes r where r.id = p_restaurante_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if v_lunch is not null and v_dinner is not null
     and v_lunch[1] < v_dinner[2] and v_dinner[1] < v_lunch[2] then
    raise exception 'OVERLAPPING_PANEL_SERVICE_HOURS';
  end if;
  if exists (select 1 from public.reservas_horarios where restaurante_id = p_restaurante_id and turno not in ('comida','cena'))
     and not exists (select 1 from public.reservas_config where restaurante_id=p_restaurante_id and mesas_activas_en_disponibilidad)
  then raise exception 'INVALID_PANEL_SERVICE'; end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_active_ids
  from public.reservas_horarios where restaurante_id = p_restaurante_id and activo;
  delete from public.reservas_horarios where restaurante_id = p_restaurante_id
    and ((turno = 'comida' and v_lunch is null) or (turno = 'cena' and v_dinner is null));
  -- Disable first so changing both ranges never collides with the old range of
  -- the other service during row-by-row overlap validation. Restore exact flags.
  update public.reservas_horarios set activo = false where restaurante_id = p_restaurante_id;
  update public.reservas_horarios set activo = true where restaurante_id = p_restaurante_id and id = any(v_active_ids);
  -- Missing days remain closed; saving a range must not open a closed weekday.
  insert into public.reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo)
  select p_restaurante_id,d.day,s.service,s.hours[1],s.hours[2],false
  from generate_series(0,6) d(day)
  cross join (values ('comida',v_lunch),('cena',v_dinner)) s(service,hours)
  where s.hours is not null and not exists (
    select 1 from public.reservas_horarios h where h.restaurante_id=p_restaurante_id and h.dia_semana=d.day and h.turno=s.service
  );
end $function$;

CREATE OR REPLACE FUNCTION app_private.validar_asignacion_mesa_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if exists (select 1 from public.sala_ocupaciones o
    join public.reservas_config c on c.restaurante_id=o.restaurante_id
    where o.mesa_id=new.mesa_id and o.liberada_en is null
      and c.mesas_activas_en_disponibilidad and o.ocupada_en < v_fin)
  then raise exception 'TABLE_OCCUPIED'; end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.reprogramar_reserva_publica_gestion(p_gestion_token uuid, p_nuevo_inicio_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reserva_id uuid;
  v_restaurante_id uuid;
  v_slug text;
  v_zona_horaria text;
  v_cancelacion_minutos integer;
  v_personas integer;
  v_table_aware boolean;
  v_auto_threshold integer;
  v_new_mesa_id uuid;
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
    c.mesas_activas_en_disponibilidad,
    c.confirmacion_automatica_hasta,
    greatest(coalesce(r.personas, 1), 1),
    r.estado,
    coalesce(r.inicio_at, r.fecha_hora_reserva at time zone c.zona_horaria)
  into
    v_reserva_id,
    v_restaurante_id,
    v_slug,
    v_zona_horaria,
    v_cancelacion_minutos,
    v_table_aware,
    v_auto_threshold,
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

  if v_table_aware and v_estado_anterior = 'confirmada' then
    if v_personas > coalesce(v_auto_threshold, 0) then
      raise exception 'RESERVATION_CANNOT_BE_RESCHEDULED';
    end if;
    select m.id into v_new_mesa_id from public.sala_mesas m
    where m.restaurante_id=v_restaurante_id and m.activa and not m.bloqueada and m.capacidad >= v_personas
      and not exists(select 1 from public.sala_ocupaciones o
        where o.mesa_id=m.id and o.liberada_en is null and o.ocupada_en < v_nuevo_fin_at)
      and not exists(select 1 from public.reservas r
        join public.reservas_config c2 on c2.restaurante_id=r.restaurante_id
        where r.mesa_id=m.id and r.id<>v_reserva_id
          and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
          and coalesce(r.inicio_at,r.fecha_hora_reserva at time zone v_zona_horaria) < v_nuevo_fin_at
          and coalesce(r.fin_at,(r.fecha_hora_reserva at time zone v_zona_horaria)+make_interval(mins=>c2.duracion_minutos)) > p_nuevo_inicio_at)
    order by m.capacidad,m.orden,m.id limit 1 for update of m;
    if v_new_mesa_id is null then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  end if;

  update public.reservas
  set inicio_at = p_nuevo_inicio_at,
      fin_at = v_nuevo_fin_at,
      fecha_hora_reserva = p_nuevo_inicio_at at time zone v_zona_horaria,
      turno = v_nuevo_turno,
      estado = v_estado_anterior,
      cancelada_at = null,
      mesa_id = v_new_mesa_id
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
$function$;

create or replace function app_private.prevent_blocking_reserved_table()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.bloqueada and not old.bloqueada
     and exists(select 1 from public.reservas_config c
       where c.restaurante_id=new.restaurante_id and c.mesas_activas_en_disponibilidad)
     and exists(select 1 from public.reservas r
       where r.mesa_id=new.id
         and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
         and coalesce(r.fin_at, (r.fecha_hora_reserva at time zone 'Europe/Madrid') + interval '90 minutes') > now())
  then raise exception 'TABLE_HAS_FUTURE_RESERVATION'; end if;
  return new;
end; $$;
drop trigger if exists prevent_blocking_reserved_table on public.sala_mesas;
create trigger prevent_blocking_reserved_table before update of bloqueada on public.sala_mesas
  for each row execute function app_private.prevent_blocking_reserved_table();
revoke all on function app_private.prevent_blocking_reserved_table() from public,anon,authenticated,service_role;
