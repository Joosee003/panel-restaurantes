-- A reschedule must not emit a temporary cancellation event.
-- Availability already supports excluding the reservation being moved.
-- This function is shared by restaurants. Abort if its deployed source or
-- access rules have changed since the reviewed version.
DO $guard$
DECLARE
  v_function oid;
  v_source text;
BEGIN
  SELECT p.oid, p.prosrc INTO v_function, v_source
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'modificar_reserva_publica_gestion'
    AND p.pronargs = 3;

  IF v_function IS NULL
    OR md5(replace(v_source, E'\r\n', E'\n')) <> 'df06f3511ae541a80ccb1397a91364a1'
    OR has_function_privilege('anon', v_function, 'EXECUTE')
    OR has_function_privilege('authenticated', v_function, 'EXECUTE')
    OR NOT has_function_privilege('service_role', v_function, 'EXECUTE')
    OR to_regprocedure('public.obtener_disponibilidad_reservas(text,date,integer,uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'NEW_TALGO_RESCHEDULE_PREFLIGHT_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION public.modificar_reserva_publica_gestion(p_gestion_token uuid, p_nuevo_inicio_at timestamp with time zone, p_nuevas_personas integer)
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
  v_min_personas integer;
  v_max_personas integer;
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
    c.personas_minimas,
    c.personas_maximas,
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
    v_min_personas,
    v_max_personas,
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

  v_personas := coalesce(p_nuevas_personas, v_personas);
  if v_personas < v_min_personas or v_personas > v_max_personas
    then raise exception 'INVALID_BOOKING_REQUEST'; end if;
  if v_table_aware and (
    (v_estado_anterior = 'confirmada' and v_personas > coalesce(v_auto_threshold,0)) or
    (v_estado_anterior = 'pendiente' and v_personas <= coalesce(v_auto_threshold,0))
  ) then raise exception 'RESERVATION_CANNOT_BE_RESCHEDULED'; end if;

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

  -- Exclude this reservation during the availability check without changing
  -- its status. A temporary cancellation would enqueue a false notice.
  select a.fin_at, a.turno
    into v_nuevo_fin_at, v_nuevo_turno
  from public.obtener_disponibilidad_reservas(
    v_slug,
    (p_nuevo_inicio_at at time zone v_zona_horaria)::date,
    v_personas,
    v_reserva_id
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
      and not exists(select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
        where g.mesa_id=m.id and r.id<>v_reserva_id
          and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
          and r.inicio_at < v_nuevo_fin_at and r.fin_at > p_nuevo_inicio_at)
    order by m.capacidad,m.orden,m.id limit 1 for update of m;
    if v_new_mesa_id is null then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  end if;

  update public.reservas
  set inicio_at = p_nuevo_inicio_at,
      fin_at = v_nuevo_fin_at,
      fecha_hora_reserva = p_nuevo_inicio_at at time zone v_zona_horaria,
      turno = v_nuevo_turno,
      personas = v_personas,
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
    'personas', v_personas,
    'turno', v_nuevo_turno
  );
end;
$function$;
