-- Keep at most one pending reward and one active coupon per client/item.
create unique index if not exists canjes_puntos_one_pending_per_client_reward
  on public.canjes_puntos (cliente_id, restaurante_id, premio_id)
  where estado = 'pendiente';

create unique index if not exists cupon_cliente_one_active_per_client_coupon
  on public.cupon_cliente (cliente_id, restaurante_id, cupon_id)
  where estado = 'activo';

-- Serialize reward redemptions through the client's balance row and make a
-- repeated request idempotent. The partial index remains the final safeguard.
create or replace function public.rpc_canjear_premio(
  p_cliente_id uuid,
  p_restaurante_id uuid,
  p_premio_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.rpc_canjear_premio(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_canjear_premio(uuid, uuid, uuid)
  to service_role;

