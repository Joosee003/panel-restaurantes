create or replace function app_private.rpc_cancelar_canje(
  p_canje_id uuid,
  p_restaurante_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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

comment on function app_private.rpc_cancelar_canje(uuid, uuid)
is 'Cancels a pending redemption and refunds its points exactly once through puntos_movimientos.';
