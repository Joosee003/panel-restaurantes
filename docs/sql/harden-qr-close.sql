-- STAGED ONLY. Not applied to production and not yet a migration.
-- Promote with `supabase migration new` after review and real multi-connection tests.
-- This only makes QR payment recording safer; it does not process a payment or
-- connect a close to reservations, customer history, points, or profitability.

begin;

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
  v_descuento numeric;
  v_propina numeric;
  v_total_cobrado numeric;
  v_metodo text;
  v_cierre_id uuid;
  v_new_expires_at timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_mesa from public.sala_mesas
  where id = p_mesa_id for update;
  if not found or not public.user_can_access_restaurant(v_mesa.restaurante_id) then
    raise exception 'MESA_NO_AUTORIZADA';
  end if;

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
    v_ids := array_append(v_ids, v_pedido.id);
    v_total_bruto := v_total_bruto + v_pedido.total;
  end loop;
  if cardinality(v_ids) = 0 or v_ids is distinct from v_solicitados then
    raise exception 'PEDIDOS_CAMBIADOS_ACTUALIZA';
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
