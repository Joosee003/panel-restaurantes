-- STAGED ONLY. Not applied to production; promote through the migration workflow
-- after the isolated and full-schema checks. Existing API wrappers/ACLs remain.
-- Fix: with no fidelizacion_config row, SELECT INTO cleared the manual rate,
-- so reservations and notifications reported zero while the trigger awarded points.
-- New customer records keep marketing permissions off; an assigned customer must
-- belong to this restaurant and is locked before its visit or points are written.
begin;
do $guard$
begin
  if to_regprocedure('public.registrar_consumo_reserva_interno(uuid,uuid,numeric,text,text)') is null then
    raise exception 'MANUAL_CONSUMPTION_BASELINE_REQUIRED';
  end if;
  if not exists(select 1 from pg_trigger
      where tgrelid='public.clientes_historial'::regclass
        and tgname='trg_historial_gasto_a_puntos' and tgenabled in ('O','A')) then
    raise exception 'MANUAL_CONSUMPTION_POINTS_TRIGGER_REQUIRED';
  end if;
end;
$guard$;

create or replace function public.registrar_consumo_reserva_interno(
  p_reserva_id uuid,
  p_restaurante_id uuid,
  p_gasto numeric,
  p_metodo_pago text default 'no_indicado'::text,
  p_notas text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_reserva record;
  v_cliente_id uuid;
  v_cliente_existente uuid;
  v_num_movimientos bigint := 0;
  v_puntos integer := 0;
  v_historial_id uuid;
  v_saldo integer := 0;
  v_ref text;
begin
  if p_reserva_id is null or p_restaurante_id is null then
    raise exception 'DATOS_INCOMPLETOS';
  end if;

  if p_gasto is null or p_gasto <= 0 then
    raise exception 'IMPORTE_INVALIDO';
  end if;

  if p_gasto > 10000 then
    raise exception 'IMPORTE_DEMASIADO_ALTO';
  end if;

  select *
    into v_reserva
    from public.reservas
   where id = p_reserva_id
     and restaurante_id = p_restaurante_id
   for update;

  if not found then
    raise exception 'RESERVA_NO_ENCONTRADA';
  end if;

  if coalesce(v_reserva.estado, '') = 'cancelada' then
    raise exception 'RESERVA_CANCELADA';
  end if;

  if v_reserva.consumo_registrado_en is not null
     or exists (
       select 1
         from public.clientes_historial h
        where h.reserva_id = p_reserva_id
     ) then
    return jsonb_build_object(
      'ok', false,
      'error', 'CONSUMO_YA_REGISTRADO',
      'reserva_id', p_reserva_id,
      'consumo_total', v_reserva.consumo_total,
      'puntos_generados', coalesce(v_reserva.puntos_generados, 0)
    );
  end if;

  v_cliente_id := v_reserva.cliente_id;

  if v_cliente_id is null then
    select c.id
      into v_cliente_existente
      from public.clientes c
     where c.restaurante_id = p_restaurante_id
       and (
         (
           nullif(regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g'), '') is not null
           and regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') =
             regexp_replace(coalesce(v_reserva.telefono, ''), '\D', '', 'g')
         )
         or (
           nullif(lower(coalesce(c.email, '')), '') is not null
           and lower(c.email) = lower(coalesce(v_reserva.email, ''))
         )
       )
     order by c.created_at asc
     limit 1;

    if v_cliente_existente is not null then
      v_cliente_id := v_cliente_existente;
    else
      insert into public.clientes (
        restaurante_id,
        nombre,
        telefono,
        email,
        origen_principal,
        canal_contacto,
        puntos_totales,
        visitas_totales,
        permite_whatsapp,
        permite_email
      )
      values (
        p_restaurante_id,
        coalesce(nullif(v_reserva.nombre_cliente, ''), 'Cliente'),
        nullif(v_reserva.telefono, ''),
        nullif(v_reserva.email, ''),
        coalesce(nullif(v_reserva.origen, ''), 'reserva'),
        coalesce(nullif(v_reserva.origen, ''), 'reserva'),
        0,
        0,
        false,
        false
      )
      returning id into v_cliente_id;
    end if;

    update public.reservas
       set cliente_id = v_cliente_id
     where id = p_reserva_id;
  end if;

  -- Preserve the same reservation -> customer order used by the history visit
  -- update and the linked QR close. Validate and lock tenant identity together.
  perform 1 from public.clientes
   where id = v_cliente_id and restaurante_id = p_restaurante_id
   for update;
  if not found then
    raise exception 'CLIENTE_RESERVA_NO_VALIDO';
  end if;

  insert into public.clientes_historial (
    cliente_id,
    restaurante_id,
    reserva_id,
    tipo,
    descripcion,
    personas,
    gasto_eur,
    turno
  )
  values (
    v_cliente_id,
    p_restaurante_id,
    p_reserva_id,
    'visita',
    'Consumo registrado desde reservas',
    coalesce(v_reserva.personas, 0),
    p_gasto,
    v_reserva.turno
  )
  returning id into v_historial_id;

  -- The history trigger is the only points writer. Its configured fallback,
  -- actual rounding and module switches determine the amount we report.
  -- Do not repeat the calculation or attempt a second ledger insert here.
  v_ref := 'visita:' || p_reserva_id::text;
  select count(*), coalesce(sum(pm.puntos), 0)
    into v_num_movimientos, v_puntos
    from public.puntos_movimientos pm
   where pm.restaurante_id = p_restaurante_id
     and pm.cliente_id = v_cliente_id
     and pm.referencia = v_ref;
  if v_num_movimientos > 1 or v_puntos < 0 then
    raise exception 'PUNTOS_CONSUMO_INCONSISTENTES';
  end if;

  update public.reservas
     set estado = case
           when coalesce(estado, 'pendiente') = 'pendiente' then 'confirmada'
           else estado
         end,
         atendida = true,
         cliente_id = v_cliente_id,
         consumo_total = p_gasto,
         consumo_metodo_pago = left(coalesce(p_metodo_pago, 'no_indicado'), 40),
         consumo_notas = nullif(left(coalesce(p_notas, ''), 400), ''),
         puntos_generados = v_puntos,
         consumo_registrado_en = now()
   where id = p_reserva_id
     and restaurante_id = p_restaurante_id;

  select coalesce(ps.puntos, 0)
    into v_saldo
    from public.puntos_saldos ps
   where ps.cliente_id = v_cliente_id
     and ps.restaurante_id = p_restaurante_id
   limit 1;

  update public.clientes
     set puntos_totales = coalesce(v_saldo, 0),
         ultima_visita = now(),
         updated_at = now()
   where id = v_cliente_id
     and restaurante_id = p_restaurante_id;

  if v_cliente_id is not null then
    insert into public.cliente_notificaciones (
      restaurante_id,
      cliente_id,
      tipo,
      titulo,
      mensaje,
      url,
      leida
    )
    values (
      p_restaurante_id,
      v_cliente_id,
      'puntos',
      case when v_puntos > 0 then 'Puntos añadidos' else 'Visita registrada' end,
      case when v_puntos > 0
        then 'Tu visita ha sumado ' || v_puntos::text || ' puntos.'
        else 'Tu visita ha sido registrada.'
      end,
      null,
      false
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', p_reserva_id,
    'cliente_id', v_cliente_id,
    'consumo_total', p_gasto,
    'puntos_generados', v_puntos,
    'saldo_actual', coalesce(v_saldo, 0)
  );
end;
$function$;

comment on function public.registrar_consumo_reserva_interno(uuid, uuid, numeric, text, text)
is 'Records a visit and reports the actual points written by its history trigger. Keeps existing signature, wrappers and grants; does not recalculate or insert points twice.';

commit;
