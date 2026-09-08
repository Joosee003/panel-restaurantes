-- DRAFT ONLY. Apply after harden-qr-close and connect-qr-reservation in an
-- authorized disposable full-schema environment before promoting a migration.
-- No historic backfill. An explicit opt-in captures future closes only.
begin;

do $guard$
begin
  if not exists (select 1 from pg_trigger where tgrelid='public.cierres_mesa_qr'::regclass
      and tgname='qr_close_record_guard' and tgenabled='O') then
    raise exception 'QR_CLOSE_GUARD_REQUIRED';
  end if;
end;
$guard$;

-- Composite references enforce tenant identity even if a catalog row is moved.
create unique index if not exists carta_productos_id_restaurante_qr_profit_key
  on public.carta_productos(id, restaurante_id);
create unique index if not exists platos_id_restaurante_qr_profit_key
  on public.platos(id, restaurante_id);

create table public.qr_rentabilidad_config (
  restaurante_id uuid primary key references public.restaurantes(id) on delete restrict,
  activa boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.qr_producto_plato (
  restaurante_id uuid not null references public.restaurantes(id) on delete restrict,
  producto_id uuid not null,
  plato_id uuid not null,
  primary key (restaurante_id, producto_id),
  foreign key (producto_id, restaurante_id)
    references public.carta_productos(id, restaurante_id) on delete cascade,
  foreign key (plato_id, restaurante_id)
    references public.platos(id, restaurante_id) on delete cascade
);
create index qr_producto_plato_plato_idx on public.qr_producto_plato(plato_id, restaurante_id);

-- These are immutable sale snapshots, separate from editable manual sales.
-- Catalog IDs deliberately have no FK: deleting a recipe must not erase sales.
create table public.ventas_qr (
  id uuid primary key, -- the original pedido_qr_items.id, not a retry-generated ID
  restaurante_id uuid not null references public.restaurantes(id) on delete restrict,
  cierre_id uuid not null references public.cierres_mesa_qr(id) on delete restrict,
  pedido_id uuid not null,
  producto_id uuid,
  menu_id uuid,
  plato_id uuid,
  nombre_producto text not null,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric not null,
  ingreso_bruto numeric not null,
  descuento numeric not null,
  ingreso_total numeric not null,
  coste_unitario numeric,
  coste_total numeric,
  beneficio_total numeric,
  estado_coste text not null check (estado_coste in
    ('calculado','sin_vinculo','receta_incompleta','menu_sin_escandallo','origen_desconocido')),
  fecha date not null,
  creado_en timestamptz not null,
  check (precio_unitario >= 0 and precio_unitario < 'Infinity'::numeric
    and precio_unitario=round(precio_unitario,2)),
  check (ingreso_bruto=precio_unitario*cantidad),
  check (descuento >= 0 and descuento <= ingreso_bruto and descuento=round(descuento,2)),
  check (ingreso_total=ingreso_bruto-descuento),
  check ((estado_coste='calculado' and coste_unitario is not null and coste_total is not null
    and beneficio_total is not null and coste_unitario >= 0 and coste_unitario < 'Infinity'::numeric
    and coste_total=round(coste_unitario*cantidad,2) and beneficio_total=ingreso_total-coste_total)
    or (estado_coste<>'calculado' and coste_unitario is null and coste_total is null
      and beneficio_total is null))
);
create index ventas_qr_restaurante_fecha_idx on public.ventas_qr(restaurante_id, fecha, id);
create index ventas_qr_cierre_idx on public.ventas_qr(cierre_id);

alter table public.qr_rentabilidad_config enable row level security;
alter table public.qr_producto_plato enable row level security;
alter table public.ventas_qr enable row level security;
revoke all on public.qr_rentabilidad_config, public.qr_producto_plato, public.ventas_qr
  from public, anon, authenticated;
grant select on public.qr_rentabilidad_config, public.qr_producto_plato, public.ventas_qr to authenticated;

create function app_private.can_read_qr_profitability(p_restaurante_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $function$
  select auth.uid() is not null and public.user_can_access_restaurant(p_restaurante_id)
    and exists(select 1 from public.restaurante_modulos m where m.restaurante_id=p_restaurante_id
      and m.rentabilidad is true and m.estado='activo');
$function$;
revoke all on function app_private.can_read_qr_profitability(uuid) from public, anon, authenticated;
grant execute on function app_private.can_read_qr_profitability(uuid) to authenticated;

create policy qr_profit_config_read on public.qr_rentabilidad_config for select to authenticated
  using ((select app_private.can_read_qr_profitability(restaurante_id)));
create policy qr_profit_mapping_read on public.qr_producto_plato for select to authenticated
  using ((select app_private.can_read_qr_profitability(restaurante_id)));
create policy qr_profit_sales_read on public.ventas_qr for select to authenticated
  using ((select app_private.can_read_qr_profitability(restaurante_id)));

-- A monthly report is read in one SQL statement. Paging across independent
-- requests cannot provide a consistent snapshot while closes are committing.
create function public.consultar_ventas_qr(p_restaurante_id uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare v_report jsonb;
begin
  if auth.uid() is null or not app_private.can_read_qr_profitability(p_restaurante_id) then
    raise exception 'RENTABILIDAD_NO_AUTORIZADA' using errcode='42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta <= p_desde or p_hasta-p_desde > 31 then
    raise exception 'PERIODO_RENTABILIDAD_INVALIDO';
  end if;
  select jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb),
    'snapshot',statement_timestamp(),'has_more',count(*)>30000)
  into v_report from (
    -- JSON numbers are decoded as floating point by browsers. Send monetary
    -- totals as two-decimal strings so large values cannot lose a cent in transit.
    select id,restaurante_id,nombre_producto,cantidad,round(ingreso_total,2)::text as ingreso_total,
      round(coste_total,2)::text as coste_total,round(beneficio_total,2)::text as beneficio_total,estado_coste,fecha
    from public.ventas_qr where restaurante_id=p_restaurante_id
      and fecha >= p_desde and fecha < p_hasta order by id limit 30001
  ) s;
  return v_report;
end;
$function$;
revoke all on function public.consultar_ventas_qr(uuid,date,date) from public, anon, authenticated;
grant execute on function public.consultar_ventas_qr(uuid,date,date) to authenticated;

create function app_private.assert_qr_profitability_access(p_restaurante_id uuid)
returns void language plpgsql security invoker set search_path = ''
as $function$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'RESTAURANTE_NO_AUTORIZADO' using errcode='42501';
  end if;
  perform app_private.assert_mutation_allowed();
  perform 1 from public.restaurante_modulos m where m.restaurante_id=p_restaurante_id
    and m.rentabilidad is true and m.camarero_digital is true and m.estado='activo' for share;
  if not found then raise exception 'MODULOS_QR_RENTABILIDAD_NO_ACTIVOS' using errcode='42501'; end if;
end;
$function$;
revoke all on function app_private.assert_qr_profitability_access(uuid) from public, anon, authenticated;

create function app_private.configurar_rentabilidad_qr(p_restaurante_id uuid, p_activa boolean)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  perform app_private.assert_qr_profitability_access(p_restaurante_id);
  if p_activa is null then raise exception 'ACTIVACION_REQUERIDA'; end if;
  insert into public.qr_rentabilidad_config(restaurante_id,activa) values(p_restaurante_id,p_activa)
    on conflict(restaurante_id) do update set activa=excluded.activa,updated_at=now();
end;
$function$;
create function public.configurar_rentabilidad_qr(p_restaurante_id uuid, p_activa boolean)
returns void language sql security invoker set search_path = ''
as $function$
  select app_private.configurar_rentabilidad_qr(p_restaurante_id,p_activa);
$function$;

create function app_private.vincular_producto_qr_plato(p_producto_id uuid, p_plato_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare v_restaurante_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  select restaurante_id into v_restaurante_id from public.carta_productos where id=p_producto_id;
  if not found or not public.user_can_access_restaurant(v_restaurante_id) then
    raise exception 'PRODUCTO_NO_AUTORIZADO' using errcode='42501';
  end if;
  perform app_private.assert_qr_profitability_access(v_restaurante_id);
  if p_plato_id is null then
    delete from public.qr_producto_plato where restaurante_id=v_restaurante_id and producto_id=p_producto_id;
    return;
  end if;
  if not exists(select 1 from public.platos where id=p_plato_id and restaurante_id=v_restaurante_id and activo) then
    raise exception 'PLATO_NO_VALIDO';
  end if;
  insert into public.qr_producto_plato(restaurante_id,producto_id,plato_id)
    values(v_restaurante_id,p_producto_id,p_plato_id)
    on conflict(restaurante_id,producto_id) do update set plato_id=excluded.plato_id;
end;
$function$;
create function public.vincular_producto_qr_plato(p_producto_id uuid, p_plato_id uuid)
returns void language sql security invoker set search_path = ''
as $function$
  select app_private.vincular_producto_qr_plato(p_producto_id,p_plato_id);
$function$;
revoke all on function app_private.configurar_rentabilidad_qr(uuid,boolean),
  public.configurar_rentabilidad_qr(uuid,boolean),app_private.vincular_producto_qr_plato(uuid,uuid),
  public.vincular_producto_qr_plato(uuid,uuid) from public, anon, authenticated;
grant execute on function app_private.configurar_rentabilidad_qr(uuid,boolean),
  public.configurar_rentabilidad_qr(uuid,boolean),app_private.vincular_producto_qr_plato(uuid,uuid),
  public.vincular_producto_qr_plato(uuid,uuid) to authenticated;

create function app_private.capture_qr_profitability()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_active boolean;
  v_zone text;
  v_created_at timestamptz;
  v_count bigint;
  v_gross numeric;
  v_discount numeric;
begin
  if auth.uid() is null or not public.user_can_access_restaurant(new.restaurante_id) then
    raise exception 'RESTAURANTE_NO_AUTORIZADO' using errcode='42501';
  end if;
  perform app_private.assert_mutation_allowed();
  -- Module and opt-in locks serialize disabling with capture. Absent config
  -- means disabled; concurrent first activation never backfills an older close.
  select (m.rentabilidad is true and m.estado='activo') into v_active
    from public.restaurante_modulos m where m.restaurante_id=new.restaurante_id for share;
  if v_active is distinct from true then return new; end if;
  select activa into v_active from public.qr_rentabilidad_config
    where restaurante_id=new.restaurante_id for share;
  if v_active is distinct from true then return new; end if;
  perform app_private.assert_qr_module_active(new.restaurante_id);

  select coalesce((select c.zona_horaria from public.reservas_config c
    where c.restaurante_id=new.restaurante_id), 'Europe/Madrid') into v_zone;
  if not exists(select 1 from pg_timezone_names where name=v_zone) then
    raise exception 'ZONA_HORARIA_RENTABILIDAD_INVALIDA';
  end if;
  v_created_at := coalesce((to_jsonb(new)->>'creado_en')::timestamptz,now());
  if exists(select 1 from public.pedidos_qr p where p.id=any(new.pedidos_ids)
    and (p.restaurante_id is distinct from new.restaurante_id or p.mesa_id is distinct from new.mesa_id
      or p.mesa_session_id is distinct from new.mesa_session_id)) then
    raise exception 'ORIGEN_VENTA_QR_INVALIDO';
  end if;

  -- One statement observes the same catalog/recipe version for every line.
  -- Monetary allocation uses exact NUMERIC cents, never binary floating point.
  with lines as (
    select i.*, nullif(to_jsonb(i)->>'menu_id','')::uuid as source_menu_id,
      i.precio_unitario*i.cantidad*100 as gross_cents
    from public.pedido_qr_items i where i.pedido_id=any(new.pedidos_ids)
  ), weights as (
    select l.*, coalesce(new.descuento*100*gross_cents/nullif(new.total_bruto*100,0),0) as share_cents
    from lines l
  ), allocations as (
    select w.*, floor(share_cents) + case when
      row_number() over(order by share_cents-floor(share_cents) desc,id)
        <= new.descuento*100-sum(floor(share_cents)) over() then 1 else 0 end as discount_cents
    from weights w
  ), valued as (
    select a.*, mp.plato_id, case
      when a.source_menu_id is not null then 'menu_sin_escandallo'
      when a.producto_id is null then 'origen_desconocido'
      when mp.plato_id is null then 'sin_vinculo'
      when recipe.valid is distinct from true then 'receta_incompleta'
      else 'calculado' end as cost_status,
      case when a.source_menu_id is null and recipe.valid is true then recipe.unit_cost end as unit_cost
    from allocations a
    left join public.qr_producto_plato mp
      on mp.restaurante_id=new.restaurante_id and mp.producto_id=a.producto_id
    left join lateral (
      select count(pi.id)>0 and bool_and(coalesce(
        p.restaurante_id=new.restaurante_id and p.activo is true
        and ing.id is not null and ing.restaurante_id=new.restaurante_id and ing.activo is true
        and ing.coste_compra >= 0 and ing.coste_compra < 'Infinity'::numeric
        and ing.cantidad_compra > 0 and ing.cantidad_compra < 'Infinity'::numeric
        and ing.merma_pct >= 0 and ing.merma_pct < 100
        and pi.cantidad_usada > 0 and pi.cantidad_usada < 'Infinity'::numeric,
        false
      )) as valid,
      sum(case when ing.coste_compra >= 0 and ing.coste_compra < 'Infinity'::numeric
        and ing.cantidad_compra > 0 and ing.cantidad_compra < 'Infinity'::numeric
        and ing.merma_pct >= 0 and ing.merma_pct < 100
        and pi.cantidad_usada > 0 and pi.cantidad_usada < 'Infinity'::numeric
        then ing.coste_compra/(ing.cantidad_compra*(1-ing.merma_pct/100))*pi.cantidad_usada end) as unit_cost
      from public.platos p
      left join public.plato_ingredientes pi on pi.plato_id=p.id
      left join public.ingredientes ing on ing.id=pi.ingrediente_id
      where p.id=mp.plato_id
    ) recipe on true
  )
  insert into public.ventas_qr(id,restaurante_id,cierre_id,pedido_id,producto_id,menu_id,plato_id,
    nombre_producto,cantidad,precio_unitario,ingreso_bruto,descuento,ingreso_total,
    coste_unitario,coste_total,beneficio_total,estado_coste,fecha,creado_en)
  select id,new.restaurante_id,new.id,pedido_id,producto_id,source_menu_id,plato_id,
    coalesce(nombre_producto,'Producto sin nombre'),cantidad,precio_unitario,gross_cents/100,
    discount_cents/100,(gross_cents-discount_cents)/100,
    unit_cost,round(unit_cost*cantidad,2),(gross_cents-discount_cents)/100-round(unit_cost*cantidad,2),
    cost_status,(v_created_at at time zone v_zone)::date,v_created_at
  from valued;

  -- Fail closed on financial/source corruption; missing recipes never reach this
  -- path. A repeated item ID is rejected by the PK, not silently skipped.
  get diagnostics v_count = row_count;
  select sum(ingreso_bruto),sum(descuento) into v_gross,v_discount
    from public.ventas_qr where cierre_id=new.id;
  if v_count=0 or v_gross is distinct from new.total_bruto or v_discount is distinct from new.descuento then
    raise exception 'VENTAS_QR_DESCUADRADAS';
  end if;
  return new;
end;
$function$;
revoke all on function app_private.capture_qr_profitability() from public, anon, authenticated;
create trigger qr_profitability_capture after insert on public.cierres_mesa_qr
  for each row execute function app_private.capture_qr_profitability();

create function app_private.guard_qr_profitability_snapshot()
returns trigger language plpgsql security invoker set search_path = ''
as $function$
begin
  raise exception 'VENTA_QR_REQUIERE_AJUSTE' using errcode='42501';
end;
$function$;
revoke all on function app_private.guard_qr_profitability_snapshot() from public, anon, authenticated;
create trigger qr_profitability_immutable before update or delete on public.ventas_qr
  for each row execute function app_private.guard_qr_profitability_snapshot();

comment on table public.ventas_qr is
  'QR close snapshots. Income excludes tips and includes the proportional discount. Recipe cost observed at close; no tax normalization or net-profit calculation. Missing costs stay NULL. No automatic historic import.';
commit;
