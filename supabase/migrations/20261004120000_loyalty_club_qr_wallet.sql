begin;

create schema if not exists loyalty_private;
revoke all on schema loyalty_private from public, anon, authenticated;

create or replace function loyalty_private.normalized_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if left(v_phone, 2) = '00' then
    v_phone := substr(v_phone, 3);
  end if;
  if length(v_phone) = 9 and left(trim(coalesce(p_phone, '')), 1) <> '+' then
    v_phone := '34' || v_phone;
  end if;
  if v_phone !~ '^[1-9][0-9]{7,14}$' then
    return null;
  end if;
  return v_phone;
end;
$$;

revoke all on function loyalty_private.normalized_phone(text) from public, anon, authenticated;

-- Existing duplicates are preserved for explicit review. This trigger prevents
-- any new duplicate phone identity inside the same restaurant.
create or replace function loyalty_private.prevent_duplicate_customer_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := loyalty_private.normalized_phone(new.telefono);
begin
  if v_phone is null then
    return new;
  end if;
  -- Share the club's phone lock with every other customer write path.
  perform pg_advisory_xact_lock(hashtextextended(new.restaurante_id::text || ':club-phone:' || v_phone, 0));
  if exists (
    select 1
    from public.clientes c
    where c.restaurante_id = new.restaurante_id
      and c.id is distinct from new.id
      and loyalty_private.normalized_phone(c.telefono) = v_phone
  ) then
    raise exception 'CUSTOMER_PHONE_ALREADY_EXISTS' using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function loyalty_private.prevent_duplicate_customer_phone() from public, anon, authenticated;
drop trigger if exists clientes_prevent_duplicate_phone on public.clientes;
create trigger clientes_prevent_duplicate_phone
before insert or update of restaurante_id, telefono on public.clientes
for each row execute function loyalty_private.prevent_duplicate_customer_phone();

create table if not exists public.cliente_club_identities (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id uuid not null,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  telefono_normalizado text not null check (telefono_normalizado ~ '^[1-9][0-9]{7,14}$'),
  member_code uuid not null default gen_random_uuid(),
  consentimiento_at timestamptz not null default now(),
  consentimiento_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cliente_club_identities_customer_fkey
    foreign key (cliente_id, restaurante_id)
    references public.clientes(id, restaurante_id) on delete cascade,
  constraint cliente_club_identity_auth_per_restaurant unique (restaurante_id, auth_user_id),
  constraint cliente_club_identity_phone_per_restaurant unique (restaurante_id, telefono_normalizado),
  constraint cliente_club_identity_customer_per_restaurant unique (restaurante_id, cliente_id),
  constraint cliente_club_member_code_unique unique (member_code)
);

alter table public.cliente_club_identities enable row level security;
revoke all on public.cliente_club_identities from public, anon, authenticated;
grant select on public.cliente_club_identities to authenticated;
drop policy if exists cliente_club_identity_own_select on public.cliente_club_identities;
create policy cliente_club_identity_own_select
on public.cliente_club_identities
for select to authenticated
using (auth_user_id = (select auth.uid()));

alter table public.canjes_puntos
  add column if not exists puntos_descontados_en timestamptz,
  add column if not exists solicitado_por_cliente boolean not null default false;

-- Pending/confirmed rows created by the old flow already debited points when
-- the customer requested the reward. Mark only rows with matching evidence.
update public.canjes_puntos c
set puntos_descontados_en = coalesce(c.confirmado_en, c.creado_en, now())
where c.puntos_descontados_en is null
  and exists (
    select 1
    from public.puntos_movimientos m
    where m.cliente_id = c.cliente_id
      and m.restaurante_id = c.restaurante_id
      and m.referencia = c.id::text
      and m.puntos = -c.puntos_usados
  );

create table if not exists public.loyalty_redemption_tokens (
  id uuid primary key default gen_random_uuid(),
  canje_id uuid not null references public.canjes_puntos(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint loyalty_redemption_token_customer_fkey
    foreign key (cliente_id, restaurante_id)
    references public.clientes(id, restaurante_id) on delete cascade,
  constraint loyalty_redemption_token_expiry_check check (expires_at > created_at)
);

create unique index if not exists loyalty_redemption_one_active_token
  on public.loyalty_redemption_tokens(canje_id)
  where used_at is null and revoked_at is null;
create index if not exists loyalty_redemption_tokens_tenant_lookup
  on public.loyalty_redemption_tokens(restaurante_id, token_hash);
alter table public.loyalty_redemption_tokens enable row level security;
revoke all on public.loyalty_redemption_tokens from public, anon, authenticated;

create table if not exists public.loyalty_redemption_debits (
  canje_id uuid primary key references public.canjes_puntos(id) on delete restrict,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id uuid not null,
  puntos integer not null check (puntos > 0),
  movimiento_referencia text not null unique,
  created_at timestamptz not null default now(),
  constraint loyalty_redemption_debit_customer_fkey
    foreign key (cliente_id, restaurante_id)
    references public.clientes(id, restaurante_id) on delete restrict
);

alter table public.loyalty_redemption_debits enable row level security;
revoke all on public.loyalty_redemption_debits from public, anon, authenticated;

create table if not exists public.loyalty_manual_visits (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  cliente_id uuid not null,
  historial_id uuid references public.clientes_historial(id) on delete restrict,
  reserva_id uuid,
  idempotency_key uuid not null,
  registered_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint loyalty_manual_visit_customer_fkey
    foreign key (cliente_id, restaurante_id)
    references public.clientes(id, restaurante_id) on delete restrict,
  constraint loyalty_manual_visit_reservation_fkey
    foreign key (reserva_id, restaurante_id)
    references public.reservas(id, restaurante_id) on delete restrict,
  constraint loyalty_manual_visit_source_check
    check ((historial_id is not null) <> (reserva_id is not null)),
  constraint loyalty_manual_visit_idempotency unique (restaurante_id, idempotency_key)
);

create unique index if not exists loyalty_manual_visit_reservation_once
  on public.loyalty_manual_visits(restaurante_id, reserva_id)
  where reserva_id is not null;

alter table public.loyalty_manual_visits enable row level security;
revoke all on public.loyalty_manual_visits from public, anon, authenticated;

create or replace function loyalty_private.restaurant_for_slug(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- A missing or colliding slug must never pick an arbitrary tenant.
  select case when count(distinct r.id) = 1 then (array_agg(distinct r.id))[1] else null end
  from public.restaurantes r
  left join public.restaurante_webs w on w.restaurante_id = r.id
  join public.restaurante_modulos m on m.restaurante_id = r.id
  where nullif(trim(coalesce(p_slug, '')), '') is not null
    and (
      lower(coalesce(nullif(trim(w.slug), ''), '')) = lower(trim(coalesce(p_slug, '')))
      or lower(coalesce(nullif(trim(r.slug), ''), '')) = lower(trim(coalesce(p_slug, '')))
    )
    and m.fidelizacion is true
    and coalesce(m.estado, 'activo') = 'activo'
$$;

revoke all on function loyalty_private.restaurant_for_slug(text) from public, anon, authenticated;

create or replace function public.club_public_restaurant(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id,
    'slug', lower(coalesce(nullif(trim(w.slug), ''), nullif(trim(r.slug), ''))),
    'name', r.nombre,
    'logoUrl', r.logo_url,
    'accent', coalesce(r.color_primario, '#b45309'),
    'background', coalesce(r.color_fondo, '#fffaf0'),
    'bookingPath', case when w.slug is null then null else '/restaurante/' || w.slug end
  )
  from public.restaurantes r
  left join public.restaurante_webs w on w.restaurante_id = r.id
  join public.restaurante_modulos m on m.restaurante_id = r.id
  where r.id = loyalty_private.restaurant_for_slug(p_slug)
    and m.fidelizacion is true
  limit 1
$$;

revoke all on function public.club_public_restaurant(text) from public;
grant execute on function public.club_public_restaurant(text) to anon, authenticated, service_role;

create or replace function loyalty_private.authenticated_phone()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_phone text;
begin
  if auth.uid() is null then
    raise exception 'CLUB_AUTH_REQUIRED' using errcode = '42501';
  end if;
  select loyalty_private.normalized_phone(u.phone)
  into v_phone
  from auth.users u
  where u.id = auth.uid() and u.phone_confirmed_at is not null;
  if v_phone is null then
    raise exception 'CLUB_VERIFIED_PHONE_REQUIRED' using errcode = '42501';
  end if;
  return v_phone;
end;
$$;

revoke all on function loyalty_private.authenticated_phone() from public, anon, authenticated;

create or replace function public.club_join_restaurant(
  p_slug text,
  p_nombre text default null,
  p_consent_version text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid := loyalty_private.restaurant_for_slug(p_slug);
  v_phone text := loyalty_private.authenticated_phone();
  v_cliente public.clientes%rowtype;
  v_identity public.cliente_club_identities%rowtype;
  v_name text := nullif(left(regexp_replace(trim(coalesce(p_nombre, '')), '\s+', ' ', 'g'), 120), '');
begin
  if v_restaurante_id is null then
    raise exception 'CLUB_NOT_AVAILABLE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_restaurante_id::text || ':club-phone:' || v_phone, 0));

  select * into v_identity
  from public.cliente_club_identities i
  where i.restaurante_id = v_restaurante_id
    and i.auth_user_id = auth.uid()
  for update;

  if v_identity.id is not null then
    return jsonb_build_object('ok', true, 'created', false, 'clienteId', v_identity.cliente_id, 'memberCode', v_identity.member_code);
  end if;

  if trim(coalesce(p_consent_version, '')) <> 'club-loyalty-2026-10-04' then
    raise exception 'CLUB_CONSENT_REQUIRED';
  end if;

  select * into v_cliente
  from public.clientes c
  where c.restaurante_id = v_restaurante_id
    and loyalty_private.normalized_phone(c.telefono) = v_phone
  order by c.created_at asc nulls last, c.id
  limit 1
  for update;

  if v_cliente.id is null then
    if v_name is null or length(v_name) < 2 then
      raise exception 'CLUB_NAME_REQUIRED';
    end if;
    insert into public.clientes (
      restaurante_id, nombre, telefono, origen_principal, canal_contacto,
      puntos_totales, visitas_totales, permite_whatsapp, permite_email, updated_at
    ) values (
      v_restaurante_id, v_name, '+' || v_phone, 'club_qr', 'ninguno',
      0, 0, false, false, now()
    ) returning * into v_cliente;
  elsif v_name is not null and (v_cliente.nombre is null or trim(v_cliente.nombre) = '') then
    update public.clientes
    set nombre = v_name, updated_at = now()
    where id = v_cliente.id and restaurante_id = v_restaurante_id
    returning * into v_cliente;
  end if;

  insert into public.cliente_club_identities (
    restaurante_id, cliente_id, auth_user_id, telefono_normalizado, consentimiento_version
  ) values (
    v_restaurante_id, v_cliente.id, auth.uid(), v_phone, left(trim(p_consent_version), 80)
  ) returning * into v_identity;

  return jsonb_build_object(
    'ok', true,
    'created', v_cliente.origen_principal = 'club_qr' and v_cliente.created_at > now() - interval '5 seconds',
    'clienteId', v_cliente.id,
    'memberCode', v_identity.member_code
  );
end;
$$;

revoke all on function public.club_join_restaurant(text, text, text) from public, anon;
grant execute on function public.club_join_restaurant(text, text, text) to authenticated, service_role;

create or replace function loyalty_private.identity_for_slug(p_slug text)
returns public.cliente_club_identities
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_identity public.cliente_club_identities%rowtype;
begin
  select * into v_identity
  from public.cliente_club_identities i
  where i.restaurante_id = loyalty_private.restaurant_for_slug(p_slug)
    and i.auth_user_id = auth.uid();
  if v_identity.id is null then
    raise exception 'CLUB_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  return v_identity;
end;
$$;

revoke all on function loyalty_private.identity_for_slug(text) from public, anon, authenticated;

-- Match the existing customer app's visit-based levels, including its defaults.
-- Private helper: callers must authorize the tenant/customer before invoking it.
create or replace function loyalty_private.customer_level(p_cliente_id uuid, p_restaurante_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(v.visitas_reales, c.visitas_totales, 0) >= coalesce(fc.nivel_maestro_desde, 20) then 'maestro'
    when coalesce(v.visitas_reales, c.visitas_totales, 0) >= coalesce(fc.nivel_vip_desde, 10) then 'vip'
    when coalesce(v.visitas_reales, c.visitas_totales, 0) >= coalesce(fc.nivel_habitual_desde, 5) then 'habitual'
    when coalesce(v.visitas_reales, c.visitas_totales, 0) >= coalesce(fc.nivel_frecuente_desde, 2) then 'frecuente'
    else 'nuevo' end
  from public.clientes c
  left join public.vw_clientes_resumen v on v.id=c.id and v.restaurante_id=c.restaurante_id
  left join public.fidelizacion_config fc on fc.restaurante_id=c.restaurante_id
  where c.id=p_cliente_id and c.restaurante_id=p_restaurante_id;
$$;

revoke all on function loyalty_private.customer_level(uuid, uuid) from public, anon, authenticated;

create or replace function public.club_get_dashboard(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  i public.cliente_club_identities%rowtype := loyalty_private.identity_for_slug(p_slug);
  v_level text := loyalty_private.customer_level(i.cliente_id, i.restaurante_id);
  v_result jsonb;
begin
  select jsonb_build_object(
    'restaurant', jsonb_build_object(
      'id', r.id, 'name', r.nombre,
      'slug', lower(coalesce(nullif(trim(w.slug), ''), nullif(trim(r.slug), ''))),
      'logoUrl', r.logo_url, 'accent', coalesce(r.color_primario, '#b45309'),
      'background', coalesce(r.color_fondo, '#fffaf0'),
      'bookingPath', case when nullif(trim(w.slug), '') is null then null else '/restaurante/' || trim(w.slug) end
    ),
    'customer', jsonb_build_object(
      'id', c.id, 'name', c.nombre, 'memberCode', i.member_code,
      'points', coalesce(ps.puntos, c.puntos_totales, 0),
      'visits', coalesce(v.visitas_reales, c.visitas_totales, 0),
      'level', v_level
    ),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.nombre, 'description', p.descripcion,
        'pointsRequired', p.puntos_requeridos, 'imageUrl', p.imagen_url,
        'levelMinimum', p.nivel_minimo
      ) order by p.puntos_requeridos, p.nombre)
      from public.premios_puntos p
      where p.restaurante_id = i.restaurante_id and p.activo is true
        and array_position(array['nuevo','frecuente','habitual','vip','maestro'], v_level)
          >= array_position(array['nuevo','frecuente','habitual','vip','maestro'], coalesce(p.nivel_minimo, 'nuevo'))
    ), '[]'::jsonb),
    'redemptions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cp.id, 'rewardId', cp.premio_id, 'points', cp.puntos_usados,
        'status', cp.estado, 'createdAt', cp.creado_en, 'confirmedAt', cp.confirmado_en
      ) order by cp.creado_en desc)
      from (select * from public.canjes_puntos x where x.restaurante_id=i.restaurante_id and x.cliente_id=i.cliente_id order by x.creado_en desc limit 12) cp
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(row_to_json(h)::jsonb order by h.occurred_at desc)
      from (
        select 'points'::text as kind, pm.tipo::text as type, pm.nota::text as label,
          pm.puntos::numeric as amount, pm.creado_en as occurred_at
        from public.puntos_movimientos pm
        where pm.restaurante_id=i.restaurante_id and pm.cliente_id=i.cliente_id
        union all
        select 'visit', ch.tipo::text, coalesce(ch.descripcion, 'Visita al restaurante'),
          ch.gasto_eur::numeric, ch.created_at
        from public.clientes_historial ch
        where ch.restaurante_id=i.restaurante_id and ch.cliente_id=i.cliente_id
        order by occurred_at desc limit 20
      ) h
    ), '[]'::jsonb)
  ) into v_result
  from public.clientes c
  join public.restaurantes r on r.id = i.restaurante_id
  left join public.restaurante_webs w on w.restaurante_id = r.id
  left join public.puntos_saldos ps on ps.cliente_id = c.id and ps.restaurante_id = c.restaurante_id
  left join public.vw_clientes_resumen v on v.id = c.id and v.restaurante_id = c.restaurante_id
  where c.id = i.cliente_id and c.restaurante_id = i.restaurante_id;
  return v_result;
end;
$$;

revoke all on function public.club_get_dashboard(text) from public, anon;
grant execute on function public.club_get_dashboard(text) to authenticated, service_role;

create or replace function loyalty_private.issue_redemption(
  p_cliente_id uuid,
  p_restaurante_id uuid,
  p_premio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost integer;
  v_minimum_level text;
  v_balance integer := 0;
  v_canje public.canjes_puntos%rowtype;
  v_token text;
  v_hash text;
  v_expires timestamptz := now() + interval '5 minutes';
begin
  if not exists (
    select 1 from public.restaurante_modulos m
    where m.restaurante_id=p_restaurante_id and m.fidelizacion is true
      and coalesce(m.estado,'activo')='activo'
  ) then raise exception 'CLUB_NOT_AVAILABLE'; end if;
  perform 1 from public.clientes c
  where c.id=p_cliente_id and c.restaurante_id=p_restaurante_id
  for update;
  if not found then raise exception 'CUSTOMER_NOT_AVAILABLE'; end if;

  select p.puntos_requeridos, coalesce(p.nivel_minimo, 'nuevo') into v_cost, v_minimum_level
  from public.premios_puntos p
  where p.id=p_premio_id and p.restaurante_id=p_restaurante_id and p.activo is true;
  if v_cost is null then raise exception 'REWARD_NOT_AVAILABLE'; end if;
  if not coalesce(
    array_position(array['nuevo','frecuente','habitual','vip','maestro'], loyalty_private.customer_level(p_cliente_id, p_restaurante_id))
      >= array_position(array['nuevo','frecuente','habitual','vip','maestro'], v_minimum_level),
    false
  ) then raise exception 'REWARD_LEVEL_REQUIRED' using errcode = '42501'; end if;

  select s.puntos into v_balance
  from public.puntos_saldos s
  where s.cliente_id=p_cliente_id and s.restaurante_id=p_restaurante_id
  for update;
  v_balance := coalesce(v_balance, 0);
  if v_balance < v_cost then raise exception 'INSUFFICIENT_POINTS'; end if;

  select * into v_canje
  from public.canjes_puntos c
  where c.cliente_id=p_cliente_id and c.restaurante_id=p_restaurante_id
    and c.premio_id=p_premio_id and c.estado='pendiente'
  order by c.creado_en desc, c.id desc limit 1 for update;

  if v_canje.id is null then
    insert into public.canjes_puntos(cliente_id,restaurante_id,premio_id,puntos_usados,estado,solicitado_por_cliente)
    values(p_cliente_id,p_restaurante_id,p_premio_id,v_cost,'pendiente',true)
    returning * into v_canje;
  elsif v_canje.solicitado_por_cliente is false and v_canje.puntos_descontados_en is null then
    -- An old pending row without matching debit evidence must be reconciled first.
    raise exception 'REDEMPTION_LEGACY_RECONCILIATION_REQUIRED';
  elsif v_canje.puntos_usados <> v_cost then
    raise exception 'REWARD_CHANGED';
  end if;

  update public.loyalty_redemption_tokens
  set revoked_at=now()
  where canje_id=v_canje.id and used_at is null and revoked_at is null;

  v_token := 'ghr_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  insert into public.loyalty_redemption_tokens(canje_id,restaurante_id,cliente_id,token_hash,expires_at)
  values(v_canje.id,p_restaurante_id,p_cliente_id,v_hash,v_expires);

  return jsonb_build_object('ok',true,'redemptionId',v_canje.id,'token',v_token,'expiresAt',v_expires,'points',v_cost);
end;
$$;

revoke all on function loyalty_private.issue_redemption(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.club_create_redemption(p_slug text, p_premio_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare i public.cliente_club_identities%rowtype := loyalty_private.identity_for_slug(p_slug);
begin
  return loyalty_private.issue_redemption(i.cliente_id, i.restaurante_id, p_premio_id);
end;
$$;

revoke all on function public.club_create_redemption(text, uuid) from public, anon;
grant execute on function public.club_create_redemption(text, uuid) to authenticated, service_role;

create or replace function public.club_create_redemption_for_customer(
  p_cliente_id uuid, p_restaurante_id uuid, p_premio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  return loyalty_private.issue_redemption(p_cliente_id,p_restaurante_id,p_premio_id);
end;
$$;

revoke all on function public.club_create_redemption_for_customer(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.club_create_redemption_for_customer(uuid, uuid, uuid) to service_role;

-- Keep the historical RPC signature for compatibility, but never debit on request.
create or replace function public.rpc_canjear_premio(
  p_cliente_id uuid, p_restaurante_id uuid, p_premio_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  v_result := loyalty_private.issue_redemption(p_cliente_id,p_restaurante_id,p_premio_id);
  return (v_result->>'redemptionId')::uuid;
end;
$$;

revoke all on function public.rpc_canjear_premio(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rpc_canjear_premio(uuid, uuid, uuid) to service_role;

create or replace function loyalty_private.confirm_redemption(p_canje_id uuid, p_restaurante_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.canjes_puntos%rowtype;
  v_balance integer := 0;
begin
  if not exists (
    select 1 from public.restaurante_modulos m
    where m.restaurante_id=p_restaurante_id and m.fidelizacion is true
      and coalesce(m.estado,'activo')='activo'
  ) then raise exception 'CLUB_NOT_AVAILABLE'; end if;
  select * into c from public.canjes_puntos
  where id=p_canje_id and restaurante_id=p_restaurante_id
  for update;
  if c.id is null then raise exception 'REDEMPTION_NOT_FOUND'; end if;
  if c.estado <> 'pendiente' then raise exception 'REDEMPTION_NOT_PENDING'; end if;
  if c.solicitado_por_cliente is false and c.puntos_descontados_en is null then
    raise exception 'REDEMPTION_LEGACY_RECONCILIATION_REQUIRED';
  end if;

  if c.puntos_descontados_en is null then
    select s.puntos into v_balance from public.puntos_saldos s
    where s.cliente_id=c.cliente_id and s.restaurante_id=c.restaurante_id
    for update;
    v_balance := coalesce(v_balance, 0);
    if v_balance < c.puntos_usados then raise exception 'INSUFFICIENT_POINTS'; end if;

    insert into public.loyalty_redemption_debits(canje_id,restaurante_id,cliente_id,puntos,movimiento_referencia)
    values(c.id,c.restaurante_id,c.cliente_id,c.puntos_usados,'canje-confirmado:'||c.id::text);
    insert into public.puntos_movimientos(cliente_id,restaurante_id,tipo,puntos,referencia,nota)
    values(c.cliente_id,c.restaurante_id,'canje',-c.puntos_usados,'canje-confirmado:'||c.id::text,'Canje confirmado por el restaurante');
  end if;

  update public.canjes_puntos
  set estado='confirmado', confirmado_en=coalesce(confirmado_en,now()),
      puntos_descontados_en=coalesce(puntos_descontados_en,now())
  where id=c.id and restaurante_id=c.restaurante_id;

  return jsonb_build_object('ok',true,'redemptionId',c.id,'customerId',c.cliente_id,'points',c.puntos_usados);
end;
$$;

revoke all on function loyalty_private.confirm_redemption(uuid, uuid) from public, anon, authenticated;

create or replace function app_private.rpc_confirmar_canje(p_canje_id uuid, p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.user_can_access_restaurant(p_restaurante_id) or public.is_demo_user() then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  perform loyalty_private.confirm_redemption(p_canje_id,p_restaurante_id);
end;
$$;

create or replace function app_private.rpc_cancelar_canje(p_canje_id uuid, p_restaurante_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare c public.canjes_puntos%rowtype;
begin
  if not public.user_can_access_restaurant(p_restaurante_id) or public.is_demo_user() then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  select * into c from public.canjes_puntos
  where id=p_canje_id and restaurante_id=p_restaurante_id and estado='pendiente'
  for update;
  if c.id is null then raise exception 'REDEMPTION_NOT_PENDING'; end if;
  update public.canjes_puntos set estado='cancelado' where id=c.id;
  update public.loyalty_redemption_tokens set revoked_at=now()
  where canje_id=c.id and used_at is null and revoked_at is null;
  if c.puntos_descontados_en is not null then
    insert into public.puntos_movimientos(cliente_id,restaurante_id,tipo,puntos,referencia,nota)
    values(c.cliente_id,c.restaurante_id,'ajuste',c.puntos_usados,'cancelacion:'||c.id::text,'Cancelación de canje: devolución de puntos');
  end if;
end;
$$;

create or replace function public.rpc_previsualizar_canje_qr(p_token text, p_restaurante_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  select jsonb_build_object(
    'valid', t.used_at is null and t.revoked_at is null and t.expires_at > now() and c.estado='pendiente',
    'reason', case
      when t.used_at is not null then 'ALREADY_USED'
      when t.revoked_at is not null then 'REVOKED'
      when t.expires_at <= now() then 'EXPIRED'
      when c.estado <> 'pendiente' then 'NOT_PENDING'
      else null end,
    'redemptionId',c.id,'customerId',cl.id,'customerName',cl.nombre,
    'rewardName',p.nombre,'points',c.puntos_usados,'expiresAt',t.expires_at
  ) into v_result
  from public.loyalty_redemption_tokens t
  join public.canjes_puntos c on c.id=t.canje_id and c.restaurante_id=t.restaurante_id
  join public.clientes cl on cl.id=t.cliente_id and cl.restaurante_id=t.restaurante_id
  join public.premios_puntos p on p.id=c.premio_id and p.restaurante_id=c.restaurante_id
  where t.restaurante_id=p_restaurante_id
    and t.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
  limit 1;
  return coalesce(v_result,jsonb_build_object('valid',false,'reason','INVALID'));
end;
$$;

revoke all on function public.rpc_previsualizar_canje_qr(text, uuid) from public, anon;
grant execute on function public.rpc_previsualizar_canje_qr(text, uuid) to authenticated, service_role;

create or replace function public.rpc_confirmar_canje_qr(p_token text, p_restaurante_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare t public.loyalty_redemption_tokens%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not public.user_can_access_restaurant(p_restaurante_id) or public.is_demo_user() then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  select * into t from public.loyalty_redemption_tokens x
  where x.restaurante_id=p_restaurante_id
    and x.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
  for update;
  if t.id is null then raise exception 'INVALID_REDEMPTION_TOKEN'; end if;
  if t.used_at is not null then raise exception 'REDEMPTION_TOKEN_USED'; end if;
  if t.revoked_at is not null then raise exception 'REDEMPTION_TOKEN_REVOKED'; end if;
  if t.expires_at <= now() then raise exception 'REDEMPTION_TOKEN_EXPIRED'; end if;
  v_result := loyalty_private.confirm_redemption(t.canje_id,p_restaurante_id);
  update public.loyalty_redemption_tokens set used_at=now() where id=t.id;
  update public.loyalty_redemption_tokens set revoked_at=now()
    where canje_id=t.canje_id and id<>t.id and used_at is null and revoked_at is null;
  return v_result || jsonb_build_object('tokenUsed',true);
end;
$$;

revoke all on function public.rpc_confirmar_canje_qr(text, uuid) from public, anon;
grant execute on function public.rpc_confirmar_canje_qr(text, uuid) to authenticated, service_role;

create or replace function public.rpc_identificar_cliente_club(p_member_code uuid, p_restaurante_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_result jsonb;
begin
  if auth.uid() is null or not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  select jsonb_build_object(
    'found',true,'customerId',c.id,'customerName',c.nombre,'phone',c.telefono,
    'points',coalesce(s.puntos,c.puntos_totales,0),'visits',coalesce(v.visitas_reales,c.visitas_totales,0)
  ) into v_result
  from public.cliente_club_identities i
  join public.clientes c on c.id=i.cliente_id and c.restaurante_id=i.restaurante_id
  left join public.puntos_saldos s on s.cliente_id=c.id and s.restaurante_id=c.restaurante_id
  left join public.vw_clientes_resumen v on v.id=c.id and v.restaurante_id=c.restaurante_id
  where i.member_code=p_member_code and i.restaurante_id=p_restaurante_id;
  return coalesce(v_result,jsonb_build_object('found',false));
end;
$$;

revoke all on function public.rpc_identificar_cliente_club(uuid, uuid) from public, anon;
grant execute on function public.rpc_identificar_cliente_club(uuid, uuid) to authenticated, service_role;

create or replace function public.rpc_registrar_visita_cliente_club(
  p_member_code uuid,
  p_restaurante_id uuid,
  p_idempotency_key uuid,
  p_gasto numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.cliente_club_identities%rowtype;
  v_historial_id uuid;
  v_existing public.loyalty_manual_visits%rowtype;
  v_reserva_id uuid;
  v_already_attended boolean;
begin
  if auth.uid() is null or not public.user_can_access_restaurant(p_restaurante_id) or public.is_demo_user() then
    raise exception 'ACCESS_DENIED' using errcode='42501';
  end if;
  if p_idempotency_key is null or (p_gasto is not null and (p_gasto <= 0 or p_gasto > 10000)) then
    raise exception 'INVALID_VISIT';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_restaurante_id::text || ':club-visit:' || p_idempotency_key::text, 0));
  select * into v_existing from public.loyalty_manual_visits
  where restaurante_id=p_restaurante_id and idempotency_key=p_idempotency_key;
  if v_existing.id is not null then
    if not exists (
      select 1 from public.cliente_club_identities x
      where x.restaurante_id=p_restaurante_id and x.member_code=p_member_code
        and x.cliente_id=v_existing.cliente_id
    ) then
      raise exception 'VISIT_IDEMPOTENCY_MISMATCH';
    end if;
    return jsonb_build_object('ok',true,'duplicate',true,'visitId',v_existing.id,'customerId',v_existing.cliente_id);
  end if;
  select * into i from public.cliente_club_identities
  where member_code=p_member_code and restaurante_id=p_restaurante_id
  for update;
  if i.id is null then raise exception 'MEMBER_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.restaurante_modulos m
    where m.restaurante_id=p_restaurante_id and m.fidelizacion is true
      and coalesce(m.estado,'activo')='activo'
  ) then raise exception 'CLUB_NOT_AVAILABLE'; end if;

  -- A QR confirmation for a recent reservation is the same visit as "Ha venido".
  -- Reuse its attendance record instead of inserting a second history/points event.
  select r.id,r.atendida into v_reserva_id,v_already_attended
  from public.reservas r
  left join public.reservas_config rc on rc.restaurante_id=r.restaurante_id
  where r.restaurante_id=p_restaurante_id and r.cliente_id=i.cliente_id
    and lower(coalesce(r.estado,'')) not in ('cancelada','cancelado','no_show','no-show','no presentado','no_presentado')
    and coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(rc.zona_horaria,'Europe/Madrid'))
      between now()-interval '6 hours' and now()
  order by coalesce(r.inicio_at,r.fecha_hora_reserva at time zone coalesce(rc.zona_horaria,'Europe/Madrid')) desc,r.id
  limit 1 for update of r;
  if v_reserva_id is not null then
    if p_gasto is not null then raise exception 'VISIT_USE_RESERVATION_CHECKOUT'; end if;
    if v_already_attended is not true then
      perform public.marcar_asistencia_reserva(v_reserva_id,true);
    end if;
    insert into public.loyalty_manual_visits(restaurante_id,cliente_id,reserva_id,idempotency_key,registered_by)
    values(p_restaurante_id,i.cliente_id,v_reserva_id,p_idempotency_key,auth.uid())
    on conflict do nothing returning * into v_existing;
    if v_existing.id is null then
      select * into v_existing from public.loyalty_manual_visits
      where restaurante_id=p_restaurante_id and reserva_id=v_reserva_id;
    end if;
    return jsonb_build_object('ok',true,'duplicate',v_already_attended is true or v_existing.idempotency_key<>p_idempotency_key,
      'visitId',v_existing.id,'customerId',i.cliente_id,'reservationId',v_reserva_id);
  end if;
  insert into public.clientes_historial(cliente_id,restaurante_id,tipo,descripcion,gasto_eur)
  values(i.cliente_id,i.restaurante_id,'visita','Visita registrada tras identificación del cliente',p_gasto)
  returning id into v_historial_id;
  insert into public.loyalty_manual_visits(restaurante_id,cliente_id,historial_id,idempotency_key,registered_by)
  values(i.restaurante_id,i.cliente_id,v_historial_id,p_idempotency_key,auth.uid())
  returning * into v_existing;
  update public.clientes set ultima_visita=now(),updated_at=now()
  where id=i.cliente_id and restaurante_id=i.restaurante_id;
  return jsonb_build_object('ok',true,'duplicate',false,'visitId',v_existing.id,'customerId',i.cliente_id);
end;
$$;

revoke all on function public.rpc_registrar_visita_cliente_club(uuid, uuid, uuid, numeric) from public, anon;
grant execute on function public.rpc_registrar_visita_cliente_club(uuid, uuid, uuid, numeric) to authenticated, service_role;

commit;
