-- Sistema multi-restaurante de opiniones QR.
-- Aplicado en Supabase mediante MCP el 27-07-2026.

create table if not exists public.opinion_config (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null unique references public.restaurantes(id) on delete cascade,
  slug text not null unique,
  google_review_url text not null,
  logo_url text,
  color_primary text not null default '#1f5fbf',
  color_secondary text not null default '#3b241f',
  color_background text not null default '#fbfaf7',
  headline text not null default '¿Qué tal ha sido tu experiencia?',
  subheadline text not null default 'Tu opinión nos ayuda a seguir mejorando cada día.',
  feedback_email text,
  feedback_whatsapp text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opinion_config_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint opinion_config_colors check (
    color_primary ~ '^#[0-9A-Fa-f]{6}$' and
    color_secondary ~ '^#[0-9A-Fa-f]{6}$' and
    color_background ~ '^#[0-9A-Fa-f]{6}$'
  )
);

create table if not exists public.opiniones_qr (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comentario text,
  nombre_cliente text,
  origen text not null default 'desconocido'
    check (origen in ('mesa','caja','entrada','portacuentas','redes','desconocido')),
  estado text not null default 'nueva'
    check (estado in ('nueva','revisada','respondida')),
  submission_token uuid not null unique,
  consentimiento_privacidad boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opiniones_qr_comentario_length
    check (comentario is null or char_length(comentario) <= 2000),
  constraint opiniones_qr_nombre_length
    check (nombre_cliente is null or char_length(nombre_cliente) <= 100)
);

create index if not exists opiniones_qr_restaurante_created_idx
  on public.opiniones_qr(restaurante_id, created_at desc);
create index if not exists opiniones_qr_restaurante_rating_idx
  on public.opiniones_qr(restaurante_id, rating);
create index if not exists opiniones_qr_restaurante_origen_idx
  on public.opiniones_qr(restaurante_id, origen);

create or replace function public.set_opinion_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opinion_config_set_updated_at on public.opinion_config;
create trigger opinion_config_set_updated_at
before update on public.opinion_config
for each row execute function public.set_opinion_updated_at();

drop trigger if exists opiniones_qr_set_updated_at on public.opiniones_qr;
create trigger opiniones_qr_set_updated_at
before update on public.opiniones_qr
for each row execute function public.set_opinion_updated_at();

alter table public.opinion_config enable row level security;
alter table public.opiniones_qr enable row level security;

create or replace function public.can_manage_opinion_restaurant(p_restaurante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.usuarios_restaurantes ur
      where ur.user_id = auth.uid()
        and ur.restaurante_id = p_restaurante_id
        and coalesce(ur.demo_vista, false) = false
    );
$$;

revoke all on function public.can_manage_opinion_restaurant(uuid) from public;
grant execute on function public.can_manage_opinion_restaurant(uuid) to authenticated;

create policy opinion_config_manage_select
on public.opinion_config for select to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id));

create policy opinion_config_manage_update
on public.opinion_config for update to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id))
with check (public.can_manage_opinion_restaurant(restaurante_id));

create policy opiniones_qr_manage_select
on public.opiniones_qr for select to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id));

create policy opiniones_qr_manage_update
on public.opiniones_qr for update to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id))
with check (public.can_manage_opinion_restaurant(restaurante_id));

create or replace function public.get_opinion_public_config(p_slug text)
returns table (
  restaurante_id uuid,
  restaurante_nombre text,
  slug text,
  google_review_url text,
  logo_url text,
  color_primary text,
  color_secondary text,
  color_background text,
  headline text,
  subheadline text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nombre, oc.slug, oc.google_review_url,
         coalesce(oc.logo_url, r.logo_url), oc.color_primary,
         oc.color_secondary, oc.color_background, oc.headline, oc.subheadline
  from public.opinion_config oc
  join public.restaurantes r on r.id = oc.restaurante_id
  where oc.slug = lower(trim(p_slug)) and oc.active = true
  limit 1;
$$;

revoke all on function public.get_opinion_public_config(text) from public;
grant execute on function public.get_opinion_public_config(text) to anon, authenticated;

create or replace function public.submit_opinion_qr(
  p_slug text,
  p_rating integer,
  p_comentario text default null,
  p_nombre_cliente text default null,
  p_origen text default 'desconocido',
  p_submission_token uuid default gen_random_uuid(),
  p_consentimiento_privacidad boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurante_id uuid;
  v_opinion_id uuid;
  v_origen text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Valoración no válida' using errcode = '22023';
  end if;
  if p_comentario is not null and char_length(trim(p_comentario)) > 2000 then
    raise exception 'Comentario demasiado largo' using errcode = '22001';
  end if;
  if p_nombre_cliente is not null and char_length(trim(p_nombre_cliente)) > 100 then
    raise exception 'Nombre demasiado largo' using errcode = '22001';
  end if;

  select oc.restaurante_id into v_restaurante_id
  from public.opinion_config oc
  where oc.slug = lower(trim(p_slug)) and oc.active = true
  limit 1;

  if v_restaurante_id is null then
    raise exception 'Sistema de opiniones no disponible' using errcode = 'P0002';
  end if;

  v_origen := case lower(coalesce(trim(p_origen), 'desconocido'))
    when 'mesa' then 'mesa'
    when 'caja' then 'caja'
    when 'entrada' then 'entrada'
    when 'portacuentas' then 'portacuentas'
    when 'redes' then 'redes'
    else 'desconocido'
  end;

  insert into public.opiniones_qr (
    restaurante_id, rating, comentario, nombre_cliente, origen,
    submission_token, consentimiento_privacidad
  ) values (
    v_restaurante_id, p_rating,
    nullif(trim(coalesce(p_comentario, '')), ''),
    nullif(trim(coalesce(p_nombre_cliente, '')), ''),
    v_origen, coalesce(p_submission_token, gen_random_uuid()),
    coalesce(p_consentimiento_privacidad, false)
  )
  on conflict (submission_token) do nothing
  returning id into v_opinion_id;

  if v_opinion_id is null then
    select id into v_opinion_id
    from public.opiniones_qr
    where submission_token = p_submission_token
      and restaurante_id = v_restaurante_id
    limit 1;
  end if;

  return v_opinion_id;
end;
$$;

revoke all on function public.submit_opinion_qr(text, integer, text, text, text, uuid, boolean) from public;
grant execute on function public.submit_opinion_qr(text, integer, text, text, text, uuid, boolean)
  to anon, authenticated;

grant select, update on public.opinion_config to authenticated;
grant select, update on public.opiniones_qr to authenticated;
