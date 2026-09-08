-- STAGED ONLY. Apply after harden-qr-close.sql, never on its own.
-- One complete QR table session can optionally record one explicitly selected
-- reservation's visit. This records money already received, never charges it.
-- Requires the inspected history/loyalty triggers and unique reservation/ref
-- indexes. app_private must remain outside the Data API exposed schemas.
begin;

-- These existing triggers own the visit counter and point calculation. Refuse a
-- partial install that would silently record spend without its connected data.
do $guard$
begin
  if not exists(select 1 from pg_trigger
      where tgrelid='public.clientes_historial'::regclass
        and tgname='trg_actualizar_visitas_cliente' and tgenabled in ('O','A'))
     or not exists(select 1 from pg_trigger
      where tgrelid='public.clientes_historial'::regclass
        and tgname='trg_historial_gasto_a_puntos' and tgenabled in ('O','A')) then
    raise exception 'QR_VISIT_TRIGGERS_REQUIRED';
  end if;
  if to_regprocedure('public.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)') is null then
    raise exception 'QR_VALIDATED_CLOSE_REQUIRED';
  end if;
end;
$guard$;

create table app_private.qr_cierre_operaciones (
  operacion_id uuid primary key,
  restaurante_id uuid not null references public.restaurantes(id),
  mesa_id uuid not null references public.sala_mesas(id),
  mesa_session_id uuid not null,
  cierre_id uuid not null unique references public.cierres_mesa_qr(id),
  reserva_id uuid unique references public.reservas(id),
  historial_id uuid unique references public.clientes_historial(id),
  creado_por uuid not null,
  creado_en timestamptz not null default now(),
  solicitud jsonb not null,
  respuesta jsonb not null,
  unique (mesa_id, mesa_session_id),
  check ((reserva_id is null) = (historial_id is null))
);
alter table app_private.qr_cierre_operaciones enable row level security;
revoke all on app_private.qr_cierre_operaciones from public, anon, authenticated;
create index qr_cierre_operaciones_restaurante_idx
  on app_private.qr_cierre_operaciones(restaurante_id, creado_en desc);

create or replace function app_private.cerrar_mesa_qr_con_reserva(
  p_operacion_id uuid,
  p_mesa_id uuid,
  p_pedidos_ids uuid[],
  p_mesa_session_id uuid,
  p_total_esperado numeric,
  p_descuento numeric default 0,
  p_propina numeric default 0,
  p_metodo_pago text default 'tarjeta',
  p_notas text default null,
  p_reserva_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_restaurante_id uuid;
  v_reserva public.reservas%rowtype;
  v_modulos public.restaurante_modulos%rowtype;
  v_anterior app_private.qr_cierre_operaciones%rowtype;
  v_ids uuid[];
  v_solicitud jsonb;
  v_respuesta jsonb;
  v_inicio timestamptz;
  v_fin timestamptz;
  v_zona text;
  v_duracion integer;
  v_neto numeric;
  v_historial_id uuid;
  v_puntos integer := 0;
  v_saldo integer := 0;
  v_num_movimientos integer;
  v_primer_pedido timestamptz;
  v_ultimo_pedido timestamptz;
  v_pedidos_con_fecha integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_mutation_allowed();
  if p_operacion_id is null then raise exception 'OPERACION_REQUERIDA'; end if;

  -- Read tenant identity before disclosing any stored response. The physical
  -- table is locked later by the validated close, and tenant identity rechecked.
  select restaurante_id into v_restaurante_id
    from public.sala_mesas where id = p_mesa_id;
  if v_restaurante_id is null
     or not public.user_can_access_restaurant(v_restaurante_id) then
    raise exception 'MESA_NO_AUTORIZADA';
  end if;
  if p_pedidos_ids is null or cardinality(p_pedidos_ids) = 0 then
    raise exception 'PEDIDOS_REQUERIDOS';
  end if;
  select array_agg(x order by x) into v_ids from unnest(p_pedidos_ids) x;
  if array_position(v_ids, null) is not null
     or cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'PEDIDOS_NO_VALIDOS';
  end if;
  v_solicitud := jsonb_build_object(
    'mesa_id',p_mesa_id,'pedidos_ids',v_ids,'mesa_session_id',p_mesa_session_id,
    'total_esperado',p_total_esperado,'descuento',coalesce(p_descuento,0),
    'propina',coalesce(p_propina,0),'metodo_pago',p_metodo_pago,
    'notas',p_notas,'reserva_id',p_reserva_id
  );
  -- A colliding hash only returns a retryable conflict, never crosses requests.
  if not pg_try_advisory_xact_lock(hashtextextended('qr-operation:' || p_operacion_id::text,0)) then
    raise exception using errcode='55P03', message='QR_CIERRE_EN_CURSO';
  end if;
  select * into v_anterior from app_private.qr_cierre_operaciones
    where operacion_id = p_operacion_id;
  if found then
    if v_anterior.restaurante_id is distinct from v_restaurante_id
       or v_anterior.solicitud is distinct from v_solicitud then
      raise exception 'OPERACION_REUTILIZADA_CON_OTROS_DATOS';
    end if;
    return v_anterior.respuesta || jsonb_build_object('replayed',true);
  end if;

  select * into v_modulos from public.restaurante_modulos
    where restaurante_id = v_restaurante_id for share;
  if not found or not coalesce(v_modulos.camarero_digital,false)
     or v_modulos.estado is distinct from 'activo' then
    raise exception 'QR_MODULE_DISABLED';
  end if;

  if p_reserva_id is not null then
    if not coalesce(v_modulos.reservas,false) or not coalesce(v_modulos.clientes,false) then
      raise exception 'RESERVAS_CLIENTES_NO_ACTIVOS';
    end if;
    -- Reservation and client precede the table/order locks. This matches manual
    -- consumption's order. NOWAIT on the client avoids waiting while another
    -- caller is already changing that client's visit or points.
    select * into v_reserva from public.reservas
      where id=p_reserva_id and restaurante_id=v_restaurante_id for update;
    if not found then raise exception 'RESERVA_NO_AUTORIZADA'; end if;
    if v_reserva.mesa_id is distinct from p_mesa_id then
      raise exception 'RESERVA_MESA_DISTINTA';
    end if;
    if lower(trim(coalesce(v_reserva.estado,''))) <> all(array['pendiente','confirmada','confirmado']) then
      raise exception 'RESERVA_ESTADO_NO_VALIDO';
    end if;
    if v_reserva.consumo_registrado_en is not null
       or exists(select 1 from public.clientes_historial where reserva_id=p_reserva_id)
       or exists(select 1 from app_private.qr_cierre_operaciones where reserva_id=p_reserva_id) then
      -- Existing manual consumption needs a separately reviewed correction.
      -- Never silently add a second visit or replace its money/points.
      raise exception 'CONSUMO_PREVIO_REQUIERE_REVISION';
    end if;
    if v_reserva.cliente_id is null then raise exception 'RESERVA_SIN_CLIENTE_ASIGNADO'; end if;
    perform 1 from public.clientes
      where id=v_reserva.cliente_id and restaurante_id=v_restaurante_id for update nowait;
    if not found then raise exception 'CLIENTE_RESERVA_NO_VALIDO'; end if;

    select zona_horaria,duracion_minutos into v_zona,v_duracion
      from public.reservas_config where restaurante_id=v_restaurante_id;
    v_inicio := coalesce(v_reserva.inicio_at,
      v_reserva.fecha_hora_reserva at time zone coalesce(v_zona,'Europe/Madrid'));
    v_fin := coalesce(v_reserva.fin_at,v_inicio + make_interval(mins=>coalesce(v_duracion,90)));
    if v_inicio is null or v_fin is null or v_fin <= v_inicio
       or now() < v_inicio or now() >= v_fin then
      raise exception 'RESERVA_FUERA_DE_SERVICIO';
    end if;
    v_neto := p_total_esperado - coalesce(p_descuento,0);
    if v_neto is null or v_neto::text in ('NaN','Infinity','-Infinity')
       or v_neto < 0 or v_neto > 10000 or v_neto <> round(v_neto,2) then
      raise exception 'CONSUMO_QR_FUERA_DE_LIMITE';
    end if;
    -- An orphan movement without its visit must be reviewed, not reused.
    if exists(select 1 from public.puntos_movimientos
      where restaurante_id=v_restaurante_id and referencia='visita:' || p_reserva_id::text) then
      raise exception 'PUNTOS_PREVIOS_REQUIEREN_REVISION';
    end if;
  end if;

  v_respuesta := public.cerrar_mesa_qr_validada(p_mesa_id,v_ids,p_mesa_session_id,
    p_total_esperado,p_descuento,p_propina,p_metodo_pago,p_notas);
  if (v_respuesta->>'ok')::boolean is distinct from true then
    raise exception 'CIERRE_QR_NO_CONFIRMADO';
  end if;
  -- Validate the exact persisted close; an auth/tenant change can never attach
  -- an otherwise authorized close to a reservation belonging to another tenant.
  perform 1 from public.cierres_mesa_qr where id=(v_respuesta->>'cierre_id')::uuid
    and restaurante_id=v_restaurante_id and mesa_id=p_mesa_id
    and mesa_session_id=p_mesa_session_id;
  if not found then raise exception 'CIERRE_QR_NO_COINCIDE'; end if;

  if p_reserva_id is not null then
    -- Orders are already locked by close. Failure here rolls the entire close
    -- back (including rotated QR), so there is no partial payment record.
    select min(created_at),max(created_at),count(created_at)
      into v_primer_pedido,v_ultimo_pedido,v_pedidos_con_fecha
      from public.pedidos_qr where id=any(v_ids);
    if v_pedidos_con_fecha <> cardinality(v_ids)
       or v_primer_pedido < v_inicio or v_ultimo_pedido >= v_fin then
      raise exception 'PEDIDOS_FUERA_DEL_SERVICIO';
    end if;

    insert into public.clientes_historial(
      cliente_id,restaurante_id,reserva_id,tipo,descripcion,personas,gasto_eur,turno
    ) values(v_reserva.cliente_id,v_restaurante_id,p_reserva_id,'visita',
      'Consumo de cuenta QR vinculado por el restaurante',coalesce(v_reserva.personas,0),
      v_neto,v_reserva.turno) returning id into v_historial_id;
    -- Existing history trigger is the ONLY points writer here. Tips do not enter
    -- spend or points. Read the actual ledger, not a second calculation.
    select count(*),coalesce(sum(puntos),0) into v_num_movimientos,v_puntos
      from public.puntos_movimientos
      where restaurante_id=v_restaurante_id and cliente_id=v_reserva.cliente_id
        and referencia='visita:' || p_reserva_id::text;
    if v_num_movimientos > 1 or v_puntos < 0
       or (not coalesce(v_modulos.fidelizacion,false) and v_puntos <> 0)
       or (v_neto=0 and v_puntos<>0) then
      raise exception 'PUNTOS_QR_INCONSISTENTES';
    end if;
    select coalesce(puntos,0) into v_saldo from public.puntos_saldos
      where restaurante_id=v_restaurante_id and cliente_id=v_reserva.cliente_id;

    update public.reservas set atendida=true,consumo_total=v_neto,
      consumo_metodo_pago=lower(trim(coalesce(p_metodo_pago,'tarjeta'))),
      consumo_notas=left('Cuenta QR ' || (v_respuesta->>'cierre_id') ||
        case when nullif(trim(coalesce(p_notas,'')),'') is not null then ': ' || p_notas else '' end,400),
      consumo_registrado_en=now(),puntos_generados=v_puntos
      where id=p_reserva_id;
    update public.clientes set puntos_totales=coalesce(v_saldo,0),
      ultima_visita=now(),updated_at=now() where id=v_reserva.cliente_id
      and restaurante_id=v_restaurante_id;
    -- Contact permissions are not touched. This is an in-app notification only.
    insert into public.cliente_notificaciones(restaurante_id,cliente_id,tipo,titulo,mensaje,url,leida)
      values(v_restaurante_id,v_reserva.cliente_id,'puntos',
        case when v_puntos>0 then 'Puntos añadidos' else 'Visita registrada' end,
        case when v_puntos>0 then 'Tu visita ha sumado ' || v_puntos::text || ' puntos.'
          else 'Tu visita ha sido registrada.' end,null,false);
  end if;

  v_respuesta := v_respuesta || jsonb_build_object('operacion_id',p_operacion_id,
    'reserva_id',p_reserva_id,'cliente_id',v_reserva.cliente_id,'consumo_total',v_neto,
    'puntos_generados',v_puntos,'replayed',false);
  insert into app_private.qr_cierre_operaciones(operacion_id,restaurante_id,mesa_id,
    mesa_session_id,cierre_id,reserva_id,historial_id,creado_por,solicitud,respuesta)
    values(p_operacion_id,v_restaurante_id,p_mesa_id,p_mesa_session_id,
      (v_respuesta->>'cierre_id')::uuid,p_reserva_id,v_historial_id,auth.uid(),v_solicitud,v_respuesta);
  return v_respuesta;
end;
$function$;

create or replace function public.cerrar_mesa_qr_con_reserva(
  p_operacion_id uuid,p_mesa_id uuid,p_pedidos_ids uuid[],p_mesa_session_id uuid,
  p_total_esperado numeric,p_descuento numeric default 0,p_propina numeric default 0,
  p_metodo_pago text default 'tarjeta',p_notas text default null,p_reserva_id uuid default null
)
returns jsonb language sql security invoker set search_path=''
as $function$
  select app_private.cerrar_mesa_qr_con_reserva(p_operacion_id,p_mesa_id,p_pedidos_ids,
    p_mesa_session_id,p_total_esperado,p_descuento,p_propina,p_metodo_pago,p_notas,p_reserva_id);
$function$;
revoke all on function app_private.cerrar_mesa_qr_con_reserva(uuid,uuid,uuid[],uuid,numeric,numeric,numeric,text,text,uuid)
  from public,anon,authenticated;
revoke all on function public.cerrar_mesa_qr_con_reserva(uuid,uuid,uuid[],uuid,numeric,numeric,numeric,text,text,uuid)
  from public,anon,authenticated;
grant execute on function app_private.cerrar_mesa_qr_con_reserva(uuid,uuid,uuid[],uuid,numeric,numeric,numeric,text,text,uuid)
  to authenticated;
grant execute on function public.cerrar_mesa_qr_con_reserva(uuid,uuid,uuid[],uuid,numeric,numeric,numeric,text,text,uuid)
  to authenticated;

-- A linked visit is accounting history. Later edits require an explicit,
-- separately reviewed adjustment, never deleting/resetting it to enter twice.
create or replace function app_private.proteger_consumo_qr_vinculado()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if tg_table_name='reservas' then
    if exists(select 1 from app_private.qr_cierre_operaciones where reserva_id=old.id) then
      if tg_op='DELETE' or
         (to_jsonb(new) - array['notas','updated_at','resena_solicitada']) is distinct from
         (to_jsonb(old) - array['notas','updated_at','resena_solicitada']) then
        raise exception 'CONSUMO_QR_REQUIERE_AJUSTE';
      end if;
    end if;
  elsif exists(select 1 from app_private.qr_cierre_operaciones where historial_id=old.id) then
    raise exception 'CONSUMO_QR_REQUIERE_AJUSTE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;
revoke all on function app_private.proteger_consumo_qr_vinculado() from public,anon,authenticated;
create trigger proteger_consumo_qr_vinculado before update or delete on public.reservas
  for each row execute function app_private.proteger_consumo_qr_vinculado();
create trigger proteger_consumo_qr_vinculado before update or delete on public.clientes_historial
  for each row execute function app_private.proteger_consumo_qr_vinculado();

comment on function public.cerrar_mesa_qr_con_reserva(uuid,uuid,uuid[],uuid,numeric,numeric,numeric,text,text,uuid)
  is 'Atomically records a full QR session with optional explicit reservation visit. Same operation and payload returns previous result. No payment gateway or profitability writes.';
commit;
