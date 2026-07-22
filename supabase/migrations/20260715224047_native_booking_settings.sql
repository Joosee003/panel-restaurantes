-- Guarda web, reglas y horario semanal en una sola transaccion desde Ajustes.
create or replace function public.guardar_configuracion_web_reservas(
  p_restaurante_id uuid,
  p_web jsonb,
  p_config jsonb,
  p_horarios jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

