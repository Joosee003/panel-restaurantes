-- Close direct mutation paths on tenant membership and invitation tables.
drop policy if exists demo_readonly_insert on public.usuarios_restaurantes;
drop policy if exists demo_readonly_update on public.usuarios_restaurantes;
drop policy if exists demo_readonly_delete on public.usuarios_restaurantes;
drop policy if exists demo_readonly_insert on public.restaurant_invitations;
drop policy if exists demo_readonly_update on public.restaurant_invitations;
drop policy if exists demo_readonly_delete on public.restaurant_invitations;

revoke insert, update, delete, truncate on public.usuarios_restaurantes from anon, authenticated;
revoke insert, update, delete, truncate on public.restaurant_invitations from anon, authenticated;
revoke insert, update, delete, truncate on public.app_admins from anon, authenticated;

-- Opinion writes and reads now pass through validated, rate-limited server routes.
revoke execute on function public.get_opinion_public_config_v2(text)
  from public, anon, authenticated;
revoke execute on function public.submit_opinion_qr_v2(
  text, integer, text, text, text, uuid, boolean, text[], text, text, boolean
) from public, anon, authenticated;
revoke execute on function public.track_opinion_event(text, uuid, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.get_opinion_public_config_v2(text) to service_role;
grant execute on function public.submit_opinion_qr_v2(
  text, integer, text, text, text, uuid, boolean, text[], text, text, boolean
) to service_role;
grant execute on function public.track_opinion_event(text, uuid, text, text, integer)
  to service_role;

-- Serialize order creation by table session so concurrent requests cannot bypass limits.
create or replace function public.enforce_pedido_qr_session_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(new.mesa_id::text || ':' || new.mesa_session_id::text, 0)
  );

  if (
    select count(*)
    from public.pedidos_qr p
    where p.mesa_id = new.mesa_id
      and p.mesa_session_id = new.mesa_session_id
      and p.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'DEMASIADOS_PEDIDOS';
  end if;

  if (
    select count(*)
    from public.pedidos_qr p
    where p.mesa_id = new.mesa_id
      and p.mesa_session_id = new.mesa_session_id
  ) >= 40 then
    raise exception 'LIMITE_SESION_ALCANZADO';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_pedido_qr_session_limits()
  from public, anon, authenticated;

drop trigger if exists pedidos_qr_enforce_session_limits on public.pedidos_qr;
create trigger pedidos_qr_enforce_session_limits
before insert on public.pedidos_qr
for each row execute function public.enforce_pedido_qr_session_limits();

-- Accept every invitation linked by Auth without failing when a user has several.
create or replace function public.completar_invitacion_restaurante()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurante_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.restaurant_invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now())
  where auth_user_id = v_user_id
    and status in ('sent', 'accepted');

  select ur.restaurante_id
    into v_restaurante_id
  from public.usuarios_restaurantes ur
  where ur.user_id = v_user_id
  order by ur.created_at asc, ur.restaurante_id asc
  limit 1;

  if v_restaurante_id is null then
    raise exception 'RESTAURANT_ACCESS_MISSING';
  end if;

  return jsonb_build_object('ok', true, 'restaurante_id', v_restaurante_id);
end;
$$;

revoke all on function public.completar_invitacion_restaurante()
  from public, anon;
grant execute on function public.completar_invitacion_restaurante()
  to authenticated;
