-- Captured 2026-10-18 from gastrohelp-panel before loyalty V2. Do not run after new V2 redemptions without reconciliation.
begin;
do $$ begin
  if exists(select 1 from public.canjes_puntos where solicitado_por_cliente is true and estado='pendiente') then
    raise exception 'LOYALTY_ROLLBACK_REQUIRES_PENDING_V2_RECONCILIATION';
  end if;
end $$;
CREATE OR REPLACE FUNCTION app_private.rpc_cancelar_canje(p_canje_id uuid, p_restaurante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente uuid;
  v_cost integer;
begin
  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  select cliente_id, puntos_usados
    into v_cliente, v_cost
  from public.canjes_puntos
  where id = p_canje_id
    and restaurante_id = p_restaurante_id
    and estado = 'pendiente'
  for update;

  if v_cliente is null then
    raise exception 'CANJE_NO_ENCONTRADO_O_NO_PENDIENTE';
  end if;

  update public.canjes_puntos
  set estado = 'cancelado'
  where id = p_canje_id
    and restaurante_id = p_restaurante_id;

  insert into public.puntos_movimientos (
    cliente_id,
    restaurante_id,
    tipo,
    puntos,
    referencia,
    nota
  ) values (
    v_cliente,
    p_restaurante_id,
    'ajuste',
    v_cost,
    'cancelacion:' || p_canje_id::text,
    'Cancelación de canje (devolución puntos)'
  );
end;
$function$;


CREATE OR REPLACE FUNCTION app_private.rpc_confirmar_canje(p_canje_id uuid, p_restaurante_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  update public.canjes_puntos
  set estado = 'confirmado',
      confirmado_en = now()
  where id = p_canje_id
    and restaurante_id = p_restaurante_id
    and estado = 'pendiente';

  if not found then
    raise exception 'CANJE_NO_ENCONTRADO_O_NO_PENDIENTE';
  end if;
end;
$function$;


CREATE OR REPLACE FUNCTION public.rpc_canjear_premio(p_cliente_id uuid, p_restaurante_id uuid, p_premio_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cost integer;
  v_saldo integer;
  v_canje_id uuid;
begin
  if not exists (
    select 1
    from public.clientes c
    where c.id = p_cliente_id
      and c.restaurante_id = p_restaurante_id
  ) then
    raise exception 'Cliente no disponible';
  end if;

  select p.puntos_requeridos
    into v_cost
  from public.premios_puntos p
  where p.id = p_premio_id
    and p.restaurante_id = p_restaurante_id
    and p.activo is true
  limit 1;

  if v_cost is null then
    raise exception 'Premio no disponible';
  end if;

  select s.puntos
    into v_saldo
  from public.puntos_saldos s
  where s.cliente_id = p_cliente_id
    and s.restaurante_id = p_restaurante_id
  for update;

  v_saldo := coalesce(v_saldo, 0);

  select c.id
    into v_canje_id
  from public.canjes_puntos c
  where c.cliente_id = p_cliente_id
    and c.restaurante_id = p_restaurante_id
    and c.premio_id = p_premio_id
    and c.estado = 'pendiente'
  order by c.creado_en desc, c.id desc
  limit 1;

  if v_canje_id is not null then
    return v_canje_id;
  end if;

  if v_saldo < v_cost then
    raise exception 'Puntos insuficientes';
  end if;

  insert into public.canjes_puntos (
    cliente_id,
    restaurante_id,
    premio_id,
    puntos_usados,
    estado
  ) values (
    p_cliente_id,
    p_restaurante_id,
    p_premio_id,
    v_cost,
    'pendiente'
  )
  returning id into v_canje_id;

  begin
    insert into public.puntos_movimientos (
      cliente_id,
      restaurante_id,
      tipo,
      puntos,
      referencia,
      nota
    ) values (
      p_cliente_id,
      p_restaurante_id,
      'canje',
      -v_cost,
      v_canje_id::text,
      'Canje de premio'
    );
  exception
    when check_violation then
      raise exception 'Puntos insuficientes';
  end;

  return v_canje_id;
end;
$function$;

commit;
