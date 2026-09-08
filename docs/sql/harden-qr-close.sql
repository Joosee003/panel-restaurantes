-- STAGED ONLY. Not applied to production and not yet a migration.
-- Promote with `supabase migration new` after review and real multi-connection tests.
-- This only makes QR payment recording safer; it does not process a payment or
-- connect a close to reservations, customer history, points, or profitability.

begin;

-- Read the server-owned module row, not a browser flag or JWT user metadata.
-- Hold a shared lock until commit so module deactivation cannot race a write.
create or replace function app_private.assert_qr_module_active(p_restaurante_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_active boolean;
begin
  select (m.camarero_digital is true and m.estado = 'activo') into v_active
  from public.restaurante_modulos m
  where m.restaurante_id = p_restaurante_id for share;
  if v_active is distinct from true then
    raise exception 'CAMARERO_DIGITAL_NO_ACTIVO' using errcode = '42501';
  end if;
end;
$function$;
revoke all on function app_private.assert_qr_module_active(uuid) from public, anon, authenticated;

-- Every insert and close must lock the physical table first. A creator can have
-- read an old token before waiting, so revalidate its session after taking lock.
create or replace function public.enforce_pedido_qr_session_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mesa public.sala_mesas%rowtype;
begin
  select * into v_mesa from public.sala_mesas
  where id = new.mesa_id for update;

  if not found
     or new.restaurante_id is distinct from v_mesa.restaurante_id
     or new.mesa_session_id is distinct from v_mesa.qr_session_id
     or not v_mesa.activa or v_mesa.bloqueada then
    raise exception 'SESION_MESA_NO_VALIDA';
  end if;

  perform app_private.assert_qr_module_active(v_mesa.restaurante_id);

  perform pg_advisory_xact_lock(
    hashtextextended(new.mesa_id::text || ':' || new.mesa_session_id::text, 0)
  );

  if (select count(*) from public.pedidos_qr p
      where p.mesa_id = new.mesa_id
        and p.mesa_session_id = new.mesa_session_id
        and p.created_at > now() - interval '1 minute') >= 5 then
    raise exception 'DEMASIADOS_PEDIDOS';
  end if;

  if (select count(*) from public.pedidos_qr p
      where p.mesa_id = new.mesa_id
        and p.mesa_session_id = new.mesa_session_id) >= 40 then
    raise exception 'LIMITE_SESION_ALCANZADO';
  end if;
  return new;
end;
$function$;

-- Keep the legacy signature for already deployed clients. Its public wrapper
-- still applies demo protection. Exact-session completeness is enforced here.
create or replace function app_private.cerrar_mesa_qr_segura(
  p_mesa_id uuid,
  p_pedidos_ids uuid[],
  p_descuento numeric default 0,
  p_propina numeric default 0,
  p_metodo_pago text default 'tarjeta',
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mesa public.sala_mesas%rowtype;
  v_pedido record;
  v_ids uuid[] := '{}'::uuid[];
  v_solicitados uuid[];
  v_total_bruto numeric := 0;
  v_item_count bigint;
  v_invalid_items boolean;
  v_item_total numeric;
  v_descuento numeric;
  v_propina numeric;
  v_total_cobrado numeric;
  v_metodo text;
  v_cierre_id uuid;
  v_new_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_mutation_allowed();
  select * into v_mesa from public.sala_mesas
  where id = p_mesa_id for update;
  if not found or not public.user_can_access_restaurant(v_mesa.restaurante_id) then
    raise exception 'MESA_NO_AUTORIZADA';
  end if;
  perform app_private.assert_qr_module_active(v_mesa.restaurante_id);

  if p_pedidos_ids is null or cardinality(p_pedidos_ids) = 0 then
    raise exception 'PEDIDOS_REQUERIDOS';
  end if;
  select array_agg(x order by x) into v_solicitados from unnest(p_pedidos_ids) x;
  if array_position(v_solicitados, null) is not null
     or cardinality(v_solicitados) <> (select count(distinct x) from unnest(v_solicitados) x) then
    raise exception 'PEDIDOS_NO_VALIDOS';
  end if;

  -- Include every non-final order in the current session, not just submitted IDs.
  -- Lock order rows to serialize kitchen cancellation/status edits with close.
  for v_pedido in
    select p.id, p.total from public.pedidos_qr p
    where p.restaurante_id = v_mesa.restaurante_id
      and p.mesa_id = v_mesa.id
      and p.mesa_session_id = v_mesa.qr_session_id
      and lower(trim(coalesce(p.estado, ''))) <> all (
        array['cobrado','cobrada','cerrado','cerrada','cancelado','cancelada'])
    order by p.id for update
  loop
    if v_pedido.total is null or v_pedido.total::text in ('NaN','Infinity','-Infinity')
       or v_pedido.total < 0 or v_pedido.total <> round(v_pedido.total, 2) then
      raise exception 'IMPORTE_PEDIDO_INVALIDO';
    end if;
    -- Item mutations take this same parent-order lock. Read their current
    -- persisted prices, not the current menu price or a browser-supplied sum.
    select count(*), coalesce(bool_or(
        i.precio_unitario is null or i.precio_unitario::text in ('NaN','Infinity','-Infinity')
        or i.precio_unitario < 0 or i.precio_unitario <> round(i.precio_unitario, 2)
        or i.cantidad is null or i.cantidad <= 0), false),
      sum(i.precio_unitario * i.cantidad)
    into v_item_count, v_invalid_items, v_item_total
    from public.pedido_qr_items i where i.pedido_id = v_pedido.id;
    if v_invalid_items then raise exception 'LINEA_PEDIDO_INVALIDA'; end if;
    if v_item_count = 0 or v_item_total is distinct from v_pedido.total then
      raise exception 'IMPORTE_PEDIDO_DESCUADRADO';
    end if;
    v_ids := array_append(v_ids, v_pedido.id);
    v_total_bruto := v_total_bruto + v_pedido.total;
  end loop;
  if cardinality(v_ids) = 0 or v_ids is distinct from v_solicitados then
    raise exception 'PEDIDOS_CAMBIADOS_ACTUALIZA';
  end if;
  if exists(select 1 from public.cierres_mesa_qr c where c.pedidos_ids && v_ids) then
    raise exception 'PEDIDO_QR_YA_CERRADO';
  end if;

  v_descuento := coalesce(p_descuento, 0);
  v_propina := coalesce(p_propina, 0);
  if v_descuento::text in ('NaN','Infinity','-Infinity')
     or v_propina::text in ('NaN','Infinity','-Infinity')
     or v_descuento < 0 or v_descuento > v_total_bruto
     or v_propina < 0 or v_propina > 10000
     or v_descuento <> round(v_descuento, 2)
     or v_propina <> round(v_propina, 2) then
    raise exception 'IMPORTES_CIERRE_INVALIDOS';
  end if;
  v_metodo := lower(trim(coalesce(p_metodo_pago, 'tarjeta')));
  if v_metodo <> all(array['tarjeta','efectivo','bizum','mixto']) then
    raise exception 'METODO_PAGO_INVALIDO';
  end if;
  v_total_cobrado := v_total_bruto - v_descuento + v_propina;
  insert into public.cierres_mesa_qr (
    restaurante_id, mesa_id, mesa_session_id, mesa, pedidos_ids,
    total_bruto, descuento, propina, total_cobrado, metodo_pago, notas
  ) values (
    v_mesa.restaurante_id, v_mesa.id, v_mesa.qr_session_id, v_mesa.nombre, v_ids,
    v_total_bruto, v_descuento, v_propina, v_total_cobrado, v_metodo,
    left(nullif(trim(coalesce(p_notas, '')), ''), 500)
  ) returning id into v_cierre_id;

  update public.pedidos_qr set estado = 'cobrado', updated_at = now()
  where id = any(v_ids);
  v_new_expires_at := now() + interval '12 hours';
  update public.sala_mesas
  set qr_access_token = encode(extensions.gen_random_bytes(24), 'hex'),
      qr_session_id = gen_random_uuid(), qr_expires_at = v_new_expires_at,
      updated_at = now()
  where id = v_mesa.id;
  return jsonb_build_object(
    'ok', true, 'cierre_id', v_cierre_id, 'total_cobrado', v_total_cobrado,
    'nueva_url_generada', true, 'expires_at', v_new_expires_at
  );
end;
$function$;

-- New clients also send the session and gross product total they showed the
-- operator. A changed price/session fails before any close write. Do not retry
-- automatically after a lost response; inspect close history first.
create or replace function app_private.cerrar_mesa_qr_validada(
  p_mesa_id uuid, p_pedidos_ids uuid[], p_mesa_session_id uuid,
  p_total_esperado numeric, p_descuento numeric, p_propina numeric,
  p_metodo_pago text, p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_mesa public.sala_mesas%rowtype;
  v_pedido record;
  v_total numeric := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform app_private.assert_mutation_allowed();
  select * into v_mesa from public.sala_mesas where id = p_mesa_id for update;
  if not found or not public.user_can_access_restaurant(v_mesa.restaurante_id) then
    raise exception 'MESA_NO_AUTORIZADA';
  end if;
  perform app_private.assert_qr_module_active(v_mesa.restaurante_id);
  if p_mesa_session_id is null or p_mesa_session_id is distinct from v_mesa.qr_session_id then
    raise exception 'SESION_MESA_CAMBIADA';
  end if;
  if p_total_esperado is null or p_total_esperado::text in ('NaN','Infinity','-Infinity')
     or p_total_esperado < 0 or p_total_esperado <> round(p_total_esperado, 2) then
    raise exception 'TOTAL_ESPERADO_INVALIDO';
  end if;
  for v_pedido in
    select p.total from public.pedidos_qr p
    where p.restaurante_id = v_mesa.restaurante_id
      and p.mesa_id = v_mesa.id
      and p.mesa_session_id = v_mesa.qr_session_id
      and lower(trim(coalesce(p.estado, ''))) <> all (
        array['cobrado','cobrada','cerrado','cerrada','cancelado','cancelada'])
    order by p.id for update
  loop
    v_total := v_total + v_pedido.total;
  end loop;
  if v_total is distinct from p_total_esperado then
    raise exception 'IMPORTE_CAMBIADO_ACTUALIZA';
  end if;
  return app_private.cerrar_mesa_qr_segura(
    p_mesa_id, p_pedidos_ids, p_descuento, p_propina, p_metodo_pago, p_notas
  );
end;
$function$;

create or replace function public.cerrar_mesa_qr_validada(
  p_mesa_id uuid, p_pedidos_ids uuid[], p_mesa_session_id uuid,
  p_total_esperado numeric, p_descuento numeric, p_propina numeric,
  p_metodo_pago text, p_notas text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.cerrar_mesa_qr_validada(
    p_mesa_id, p_pedidos_ids, p_mesa_session_id, p_total_esperado,
    p_descuento, p_propina, p_metodo_pago, p_notas
  );
$function$;

-- This trigger MUST stay SECURITY INVOKER: current_user identifies the SQL
-- writer, including a SECURITY DEFINER close RPC, and cannot be forged by a
-- browser setting a custom GUC. Application admin accounts still execute as
-- authenticated and cannot fabricate closes or mark an order as paid directly.
create or replace function app_private.guard_qr_payment_writer()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_close_owner name;
begin
  if tg_table_name = 'cierres_mesa_qr' and tg_op <> 'INSERT' then
    raise exception 'CIERRE_QR_INMUTABLE' using errcode = '42501';
  end if;
  if tg_table_name = 'pedidos_qr' then
    -- Existing demo refresh is a fixed-fixture, timestamp-only operation.
    -- Validate the actual SQL writer before the definer mutation trigger sees
    -- the exemption. A caller-set app.allow_demo_write flag alone grants none.
    if tg_op = 'UPDATE' then
      if old.restaurante_id = 'de000000-0000-4000-8000-000000000002'::uuid
         and old.id = any(array[
           'de000000-0000-4000-8000-000000000601'::uuid,
           'de000000-0000-4000-8000-000000000602'::uuid,
           'de000000-0000-4000-8000-000000000603'::uuid,
           'de000000-0000-4000-8000-000000000604'::uuid])
         and current_setting('app.allow_demo_write', true) = '1'
         and (to_jsonb(new) - 'created_at' - 'updated_at') = (to_jsonb(old) - 'created_at' - 'updated_at') then
        select pg_get_userbyid(p.proowner) into v_close_owner from pg_proc p
        where p.oid = to_regprocedure('public.refresh_demo_dates()');
        if current_user is distinct from v_close_owner then
          raise exception 'DEMO_READ_ONLY' using errcode = '42501';
        end if;
        return new;
      end if;
    end if;
    if lower(trim(coalesce(new.estado, ''))) <> all(array['cobrado','cobrada','cerrado','cerrada']) then
      return new;
    end if;
  end if;
  select pg_get_userbyid(p.proowner) into v_close_owner
  from pg_proc p
  where p.oid = 'app_private.cerrar_mesa_qr_segura(uuid,uuid[],numeric,numeric,text,text)'::regprocedure;
  if current_user is distinct from v_close_owner then
    raise exception 'CIERRE_QR_SOLO_RPC' using errcode = '42501';
  end if;
  return new;
end;
$function$;

-- Terminal orders remain immutable even if an old client sends a stale kitchen
-- update. Only an exact final status update may follow receipt insertion. The
-- separate invoker trigger permits that transition only for the trusted SQL
-- writer; no caller-controlled GUC or fragile top-level-xid check is used.
create or replace function app_private.guard_qr_order_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_has_close boolean;
begin
  -- The preceding qr_00_payment_writer_guard already proved the SQL owner.
  -- Restrict this exception to the four existing synthetic records and dates.
  if tg_op = 'UPDATE' then
    if old.restaurante_id = 'de000000-0000-4000-8000-000000000002'::uuid
       and old.id = any(array[
         'de000000-0000-4000-8000-000000000601'::uuid,
         'de000000-0000-4000-8000-000000000602'::uuid,
         'de000000-0000-4000-8000-000000000603'::uuid,
         'de000000-0000-4000-8000-000000000604'::uuid])
       and current_setting('app.allow_demo_write', true) = '1'
       and (to_jsonb(new) - 'created_at' - 'updated_at') = (to_jsonb(old) - 'created_at' - 'updated_at') then
      return new;
    end if;
  end if;
  perform app_private.assert_mutation_allowed();
  perform app_private.assert_qr_module_active(old.restaurante_id);
  if lower(trim(coalesce(old.estado, ''))) = any(
    array['cobrado','cobrada','cerrado','cerrada','cancelado','cancelada']) then
    raise exception 'PEDIDO_QR_FINALIZADO' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
      new.id is distinct from old.id or new.restaurante_id is distinct from old.restaurante_id
      or new.mesa_id is distinct from old.mesa_id or new.mesa_session_id is distinct from old.mesa_session_id) then
    raise exception 'PEDIDO_QR_IDENTIDAD_INMUTABLE' using errcode = '42501';
  end if;
  select count(*) > 0 into v_has_close
  from public.cierres_mesa_qr c where old.id = any(c.pedidos_ids);
  if v_has_close then
    if tg_op = 'UPDATE' and new.estado = 'cobrado'
       and (to_jsonb(new) - 'estado' - 'updated_at') = (to_jsonb(old) - 'estado' - 'updated_at') then
      return new;
    end if;
    raise exception 'PEDIDO_QR_FINALIZADO' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and lower(trim(coalesce(new.estado, ''))) = any(
    array['cobrado','cobrada','cerrado','cerrada']) then
    raise exception 'CIERRE_QR_REQUERIDO' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- Item writes lock their parent order. A competing close either observes the
-- edit before its own lock or finishes first and the item write is rejected.
create or replace function app_private.guard_qr_item_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pedido public.pedidos_qr%rowtype;
  v_pedido_id uuid;
begin
  perform app_private.assert_mutation_allowed();
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.pedido_id is distinct from old.pedido_id) then
    raise exception 'ITEM_QR_IDENTIDAD_INMUTABLE' using errcode = '42501';
  end if;
  v_pedido_id := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  select * into v_pedido from public.pedidos_qr where id = v_pedido_id for update;
  if not found then
    -- A permitted deletion of an open parent can cascade after that row has
    -- disappeared. Final parent deletions already fail in the parent guard.
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    raise exception 'PEDIDO_QR_NO_ENCONTRADO';
  end if;
  perform app_private.assert_qr_module_active(v_pedido.restaurante_id);
  if lower(trim(coalesce(v_pedido.estado, ''))) = any(
    array['cobrado','cobrada','cerrado','cerrada','cancelado','cancelada'])
    or exists(select 1 from public.cierres_mesa_qr c where v_pedido.id = any(c.pedidos_ids)) then
    raise exception 'PEDIDO_QR_FINALIZADO' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

revoke all on function app_private.guard_qr_payment_writer() from public, anon, authenticated;
revoke all on function app_private.guard_qr_order_mutation() from public, anon, authenticated;
revoke all on function app_private.guard_qr_item_mutation() from public, anon, authenticated;

create or replace trigger qr_00_payment_writer_guard before insert or update on public.pedidos_qr
  for each row execute function app_private.guard_qr_payment_writer();
create or replace trigger qr_order_mutation_guard before update or delete on public.pedidos_qr
  for each row execute function app_private.guard_qr_order_mutation();
create or replace trigger qr_item_mutation_guard before insert or update or delete on public.pedido_qr_items
  for each row execute function app_private.guard_qr_item_mutation();
create or replace trigger qr_close_record_guard before insert or update or delete on public.cierres_mesa_qr
  for each row execute function app_private.guard_qr_payment_writer();

-- No new public SECURITY DEFINER endpoint. Only the guarded private body has
-- elevated privileges. app_private must stay outside the exposed API schemas.
-- Existing app_private functions had owner-only ACLs at read-only inspection;
-- verify again before applying the schema-USAGE grant to an actual environment.
revoke all on function app_private.cerrar_mesa_qr_segura(uuid, uuid[], numeric, numeric, text, text)
  from public, anon, authenticated;
revoke all on function app_private.cerrar_mesa_qr_validada(uuid, uuid[], uuid, numeric, numeric, numeric, text, text)
  from public, anon, authenticated;

-- Granting schema USAGE must not make an unrelated privileged function usable.
-- has_function_privilege includes PUBLIC and inherited grants, not just proacl.
-- Fail the whole transaction if the private boundary has drifted.
do $guard$
declare
  v_unexpected text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
  into v_unexpected
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.prosecdef
    and p.oid <> 'app_private.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)'::regprocedure
    and has_function_privilege('authenticated', p.oid, 'execute');
  if v_unexpected is not null then
    raise exception using errcode = '42501', message = 'APP_PRIVATE_PRIVILEGES_UNSAFE',
      detail = v_unexpected;
  end if;
end;
$guard$;

-- PostgreSQL schema-specific REVOKE cannot remove the implicit GLOBAL default
-- PUBLIC EXECUTE. Revoke it globally for the current creating role, then remove
-- any schema-specific additions. This affects FUTURE functions created by this
-- role in all schemas; intended APIs need explicit grants. Other creating roles
-- require a separate defaults review. Existing functions are unchanged.
alter default privileges revoke execute on functions from public;
alter default privileges in schema app_private revoke execute on functions from public;

grant usage on schema app_private to authenticated;
grant execute on function app_private.cerrar_mesa_qr_validada(uuid, uuid[], uuid, numeric, numeric, numeric, text, text)
  to authenticated;
revoke all on function public.cerrar_mesa_qr_validada(uuid, uuid[], uuid, numeric, numeric, numeric, text, text)
  from public, anon;
grant execute on function public.cerrar_mesa_qr_validada(uuid, uuid[], uuid, numeric, numeric, numeric, text, text)
  to authenticated;

comment on function public.cerrar_mesa_qr_validada(uuid, uuid[], uuid, numeric, numeric, numeric, text, text)
  is 'Records an already received QR table payment after checking the full session and operator-confirmed gross total. Does not charge money or award loyalty points.';

commit;
