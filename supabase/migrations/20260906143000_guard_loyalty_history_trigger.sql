create or replace function public.trg_clientes_historial_gasto_a_puntos()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_ppe numeric;
  v_puntos integer;
  v_ref text;
  v_activo boolean := false;
begin
  if new.tipo is distinct from 'visita' then
    return new;
  end if;

  if new.gasto_eur is null then
    return new;
  end if;

  select coalesce(r.puntos_activo, false) and coalesce(m.fidelizacion, false)
    into v_activo
    from public.restaurantes r
    left join public.restaurante_modulos m
      on m.restaurante_id = r.id
   where r.id = new.restaurante_id
   limit 1;

  if not coalesce(v_activo, false) then
    return new;
  end if;

  v_ref := 'visita:' || coalesce(new.reserva_id::text, new.id::text);

  select fc.puntos_por_euro
    into v_ppe
    from public.fidelizacion_config fc
   where fc.restaurante_id = new.restaurante_id
   limit 1;

  if v_ppe is null then
    select r.puntos_por_euro
      into v_ppe
      from public.restaurantes r
     where r.id = new.restaurante_id
     limit 1;
  end if;

  v_ppe := coalesce(v_ppe, 1);
  v_puntos := floor(new.gasto_eur * v_ppe);

  if v_puntos <= 0 then
    return new;
  end if;

  insert into public.puntos_movimientos (
    cliente_id,
    restaurante_id,
    tipo,
    puntos,
    referencia,
    nota
  )
  values (
    new.cliente_id,
    new.restaurante_id,
    'ticket',
    v_puntos,
    v_ref,
    'puntos por gasto (visita)'
  )
  on conflict do nothing;

  return new;
end;
$function$;

comment on function public.trg_clientes_historial_gasto_a_puntos()
is 'Awards visit points only when both restaurant points and the contracted loyalty module are enabled.';
