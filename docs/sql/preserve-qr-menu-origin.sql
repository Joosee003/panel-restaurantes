-- STAGED ONLY. Not applied to production and not yet a migration.
-- Requires harden-qr-close.sql. Promote with the reviewed migration process.
-- Preserve the menu identity the existing anonymous, token-protected creator
-- already validates. Existing unknown origins stay NULL; never match by name.
-- The CREATE OR REPLACE body below is the 2026-09-08 catalog definition with
-- only menu_id / v_menu_id added to its line INSERT. Owner and ACL are retained.

begin;

do $dependencies$
begin
  if to_regprocedure('public.crear_pedido_mesa_qr_seguro(text,uuid,text,text,jsonb)') is null
     or to_regprocedure('app_private.guard_qr_item_mutation()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid = 'public.pedido_qr_items'::regclass
         and tgname = 'qr_item_mutation_guard' and tgenabled = 'O'
     ) then
    raise exception 'QR_MENU_ORIGIN_DEPENDENCIES_MISSING';
  end if;
  -- Refuse a stale replacement after somebody changes the existing API. The
  -- first fingerprint is the read-only catalog body; the second permits reruns.
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.crear_pedido_mesa_qr_seguro(text,uuid,text,text,jsonb)'::regprocedure
      and p.prosecdef and p.proconfig = array['search_path=""']::text[]
      and p.prolang = (select oid from pg_language where lanname = 'plpgsql')
      and md5(p.prosrc) = any(array[
        '78c680e1b509aea4d36e8589f35fc1f9',
        'd45c6ed218ad5ab23b60054775e56135'
      ])
  ) then raise exception 'QR_MENU_CREATOR_CHANGED_REVIEW_REQUIRED'; end if;
end;
$dependencies$;

-- This is an immutable historical identifier, not a cascading catalog link.
-- A menu can be removed from today's catalog without erasing yesterday's source.
alter table public.pedido_qr_items add column if not exists menu_id uuid;
alter table public.pedido_qr_items
  drop constraint if exists pedido_qr_items_single_origin;
alter table public.pedido_qr_items
  add constraint pedido_qr_items_single_origin
  check (producto_id is null or menu_id is null);
comment on column public.pedido_qr_items.menu_id is
  'Validated menu identity at ordering time. NULL for legacy unknown origins; never inferred from a name. Retained when the menu is removed.';

-- Validate new or changed origins even for direct writes admitted by an old
-- policy. The existing item guard still locks the parent and rejects final edits.
create or replace function app_private.guard_qr_item_origin()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_pedido public.pedidos_qr%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.producto_id is not distinct from old.producto_id
       and new.menu_id is not distinct from old.menu_id then
      return new;
    end if;
  end if;
  if new.producto_id is not null and new.menu_id is not null then
    raise exception 'ORIGEN_QR_AMBIGUO';
  end if;
  select * into v_pedido from public.pedidos_qr where id = new.pedido_id;
  if not found then raise exception 'PEDIDO_QR_NO_ENCONTRADO'; end if;
  if new.producto_id is not null and not exists (
    select 1 from public.carta_productos p
    where p.id = new.producto_id and p.restaurante_id = v_pedido.restaurante_id
      and p.carta_id = v_pedido.carta_id
  ) then raise exception 'PRODUCTO_QR_ORIGEN_NO_VALIDO'; end if;
  if new.menu_id is not null and not exists (
    select 1 from public.menus_dia_qr m
    where m.id = new.menu_id and m.restaurante_id = v_pedido.restaurante_id
      and (m.carta_id = v_pedido.carta_id or m.carta_id is null)
  ) then raise exception 'MENU_QR_ORIGEN_NO_VALIDO'; end if;
  return new;
end;
$function$;
revoke all on function app_private.guard_qr_item_origin() from public, anon, authenticated;
create or replace trigger qr_item_origin_guard
before insert or update on public.pedido_qr_items
for each row execute function app_private.guard_qr_item_origin();

CREATE OR REPLACE FUNCTION public.crear_pedido_mesa_qr_seguro(p_public_token text, p_mesa_id uuid, p_access_token text, p_notas text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_carta record;
  v_mesa public.sala_mesas%rowtype;
  v_pedido_id uuid := gen_random_uuid();
  v_total numeric := 0;
  v_item jsonb;
  v_qty integer;
  v_id_text text;
  v_notas text;
  v_producto_id uuid;
  v_menu_id uuid;
  v_producto record;
  v_nombre text;
  v_precio numeric;
  v_now timestamp := now() at time zone 'Europe/Madrid';
begin
  if p_public_token is null or length(trim(p_public_token)) <> 32 then
    raise exception 'TOKEN_INVALIDO';
  end if;

  select id, restaurante_id
  into v_carta
  from public.cartas_digitales
  where public_token = trim(p_public_token)
    and estado = 'activa'
  limit 1;

  if not found then
    raise exception 'CARTA_NO_ENCONTRADA';
  end if;

  select *
  into v_mesa
  from public.sala_mesas
  where id = p_mesa_id
    and restaurante_id = v_carta.restaurante_id
    and activa = true
    and bloqueada = false
  limit 1;

  if not found then
    raise exception 'MESA_NO_DISPONIBLE';
  end if;

  if p_access_token is null
     or length(trim(p_access_token)) <> 48
     or v_mesa.qr_access_token <> trim(p_access_token) then
    raise exception 'ACCESO_MESA_INVALIDO';
  end if;

  if v_mesa.qr_expires_at <= now() then
    raise exception 'ACCESO_MESA_CADUCADO';
  end if;

  if (
    select count(*)
    from public.pedidos_qr as recent
    where recent.mesa_id = v_mesa.id
      and recent.mesa_session_id = v_mesa.qr_session_id
      and recent.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'DEMASIADOS_PEDIDOS';
  end if;

  if (
    select count(*)
    from public.pedidos_qr as session_orders
    where session_orders.mesa_id = v_mesa.id
      and session_orders.mesa_session_id = v_mesa.qr_session_id
  ) >= 40 then
    raise exception 'LIMITE_SESION_ALCANZADO';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'PEDIDO_VACIO';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'PEDIDO_DEMASIADO_GRANDE';
  end if;

  insert into public.pedidos_qr (
    id, restaurante_id, carta_id, mesa_id, mesa_session_id,
    mesa, estado, total, notas
  )
  values (
    v_pedido_id, v_carta.restaurante_id, v_carta.id, v_mesa.id,
    v_mesa.qr_session_id, v_mesa.nombre, 'nuevo', 0,
    left(nullif(trim(coalesce(p_notas, '')), ''), 500)
  );

  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    v_id_text := nullif(trim(coalesce(v_item->>'producto_id', '')), '');

    if coalesce(v_item->>'cantidad', '') ~ '^[0-9]+$' then
      v_qty := least(greatest((v_item->>'cantidad')::integer, 1), 20);
    else
      v_qty := 1;
    end if;

    v_notas := left(nullif(trim(coalesce(v_item->>'notas', '')), ''), 280);
    v_producto_id := null;
    v_menu_id := null;
    v_nombre := null;
    v_precio := null;

    if v_id_text like 'menu-%' then
      if substring(v_id_text from 6) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_menu_id := substring(v_id_text from 6)::uuid;

        select m.titulo as nombre, m.precio
        into v_producto
        from public.menus_dia_qr as m
        where m.id = v_menu_id
          and m.restaurante_id = v_carta.restaurante_id
          and (m.carta_id = v_carta.id or m.carta_id is null)
          and m.activo = true
          and (m.fecha_desde is null or m.fecha_desde <= v_now::date)
          and (m.fecha_hasta is null or m.fecha_hasta >= v_now::date)
          and (m.hora_inicio is null or m.hora_inicio <= v_now::time)
          and (m.hora_fin is null or m.hora_fin >= v_now::time)
          and (
            m.dias_semana is null
            or array_length(m.dias_semana, 1) is null
            or extract(isodow from v_now)::integer = any(m.dias_semana)
          )
        limit 1;

        if found then
          v_nombre := v_producto.nombre;
          v_precio := coalesce(v_producto.precio, 0);
        end if;
      end if;
    else
      if v_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_producto_id := v_id_text::uuid;

        select p.nombre, p.precio
        into v_producto
        from public.carta_productos as p
        where p.id = v_producto_id
          and p.carta_id = v_carta.id
          and p.restaurante_id = v_carta.restaurante_id
          and p.activo = true
        limit 1;

        if found then
          v_nombre := v_producto.nombre;
          v_precio := coalesce(v_producto.precio, 0);
        end if;
      end if;
    end if;

    if v_nombre is null then
      raise exception 'PRODUCTO_NO_VALIDO';
    end if;

    insert into public.pedido_qr_items (
      pedido_id, producto_id, menu_id, nombre_producto, precio_unitario, cantidad, notas
    )
    values (
      v_pedido_id, v_producto_id, v_menu_id, v_nombre, v_precio, v_qty, v_notas
    );

    v_total := v_total + (v_precio * v_qty);
  end loop;

  update public.pedidos_qr
  set total = v_total,
      updated_at = now()
  where id = v_pedido_id;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido_id,
    'mesa_id', v_mesa.id,
    'total', v_total
  );
end;
$function$;

commit;
