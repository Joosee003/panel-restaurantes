CREATE OR REPLACE FUNCTION public.crear_reserva_manual(p_restaurante_id uuid, p_inicio_at timestamp with time zone, p_personas integer, p_nombre text, p_telefono text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_notas text DEFAULT NULL::text, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_zona_horaria text;
  v_min_personas integer;
  v_max_personas integer;
  v_table_aware boolean;
  v_auto_threshold integer;
  v_mesa_id uuid;
  v_estado text;
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

  select c.zona_horaria, c.personas_minimas, c.personas_maximas, c.mesas_activas_en_disponibilidad, c.confirmacion_automatica_hasta
    into v_zona_horaria, v_min_personas, v_max_personas, v_table_aware, v_auto_threshold
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
     or (v_table_aware and v_telefono is null)
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

  v_estado := case when v_table_aware and p_personas <= coalesce(v_auto_threshold,0)
    then 'confirmada' else 'pendiente' end;
  if v_estado='confirmada' then
    select m.id into v_mesa_id from public.sala_mesas m
    where m.restaurante_id=p_restaurante_id and m.activa and not m.bloqueada and m.capacidad>=p_personas
      and not exists(select 1 from public.sala_ocupaciones o where o.mesa_id=m.id
        and o.liberada_en is null and o.ocupada_en<v_fin_at)
      and not exists(select 1 from public.reservas r where r.mesa_id=m.id
        and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
        and r.inicio_at<v_fin_at and r.fin_at>p_inicio_at)
      and not exists(select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
        where g.mesa_id=m.id and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
        and r.inicio_at<v_fin_at and r.fin_at>p_inicio_at)
    order by m.capacidad,m.orden,m.id limit 1 for update of m;
    if v_mesa_id is null then raise exception 'SLOT_NOT_AVAILABLE'; end if;
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
    idempotency_key,
    mesa_id
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
    v_estado,
    v_turno,
    p_idempotency_key,
    v_mesa_id
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
$function$;
