-- GastroHelp Reputation Suite v2
-- Adds structured feedback, funnel analytics, follow-up workflow and alert queue.

alter table public.opinion_config
  add column if not exists auto_open_google boolean not null default true,
  add column if not exists google_delay_ms integer not null default 4200,
  add column if not exists low_rating_threshold smallint not null default 3,
  add column if not exists contact_prompt_enabled boolean not null default true;

alter table public.opinion_config
  drop constraint if exists opinion_config_google_delay_check,
  add constraint opinion_config_google_delay_check
    check (google_delay_ms between 1200 and 12000),
  drop constraint if exists opinion_config_low_rating_threshold_check,
  add constraint opinion_config_low_rating_threshold_check
    check (low_rating_threshold between 1 and 5);

alter table public.opiniones_qr
  add column if not exists aspectos text[] not null default '{}'::text[],
  add column if not exists contacto text,
  add column if not exists contacto_tipo text not null default 'ninguno',
  add column if not exists solicita_contacto boolean not null default false,
  add column if not exists seguimiento text not null default 'pendiente',
  add column if not exists nota_interna text,
  add column if not exists resuelto_at timestamptz,
  add column if not exists google_abierto boolean not null default false,
  add column if not exists google_abierto_at timestamptz;

alter table public.opiniones_qr
  drop constraint if exists opiniones_qr_contacto_tipo_check,
  add constraint opiniones_qr_contacto_tipo_check
    check (contacto_tipo in ('telefono','email','ninguno')),
  drop constraint if exists opiniones_qr_seguimiento_check,
  add constraint opiniones_qr_seguimiento_check
    check (seguimiento in ('pendiente','en_revision','resuelto')),
  drop constraint if exists opiniones_qr_contacto_length,
  add constraint opiniones_qr_contacto_length
    check (contacto is null or char_length(contacto) <= 160),
  drop constraint if exists opiniones_qr_nota_interna_length,
  add constraint opiniones_qr_nota_interna_length
    check (nota_interna is null or char_length(nota_interna) <= 2000),
  drop constraint if exists opiniones_qr_aspectos_check,
  add constraint opiniones_qr_aspectos_check
    check (
      aspectos <@ array[
        'comida','servicio','ambiente','espera','limpieza','calidad_precio'
      ]::text[]
    );

create index if not exists opiniones_qr_seguimiento_idx
  on public.opiniones_qr(restaurante_id, seguimiento, created_at desc);
create index if not exists opiniones_qr_google_abierto_idx
  on public.opiniones_qr(restaurante_id, google_abierto, created_at desc);
create index if not exists opiniones_qr_aspectos_gin_idx
  on public.opiniones_qr using gin(aspectos);

create table if not exists public.opinion_eventos (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  submission_token uuid,
  event_type text not null,
  origen text not null default 'desconocido',
  rating smallint,
  created_at timestamptz not null default now(),
  constraint opinion_eventos_event_type_check check (
    event_type in (
      'view','rating_selected','details_opened','submitted',
      'copy_succeeded','copy_failed','google_opened','returned_from_google'
    )
  ),
  constraint opinion_eventos_origen_check check (
    origen in ('mesa','caja','entrada','portacuentas','redes','desconocido')
  ),
  constraint opinion_eventos_rating_check check (rating is null or rating between 1 and 5)
);

create index if not exists opinion_eventos_restaurante_created_idx
  on public.opinion_eventos(restaurante_id, created_at desc);
create index if not exists opinion_eventos_type_created_idx
  on public.opinion_eventos(restaurante_id, event_type, created_at desc);
create index if not exists opinion_eventos_origin_created_idx
  on public.opinion_eventos(restaurante_id, origen, created_at desc);

create table if not exists public.opinion_alertas (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  opinion_id uuid not null references public.opiniones_qr(id) on delete cascade,
  tipo text not null default 'valoracion_baja',
  estado text not null default 'pendiente',
  destino_email text,
  destino_whatsapp text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dismissed_at timestamptz,
  constraint opinion_alertas_tipo_check check (tipo in ('valoracion_baja','seguimiento_solicitado')),
  constraint opinion_alertas_estado_check check (estado in ('pendiente','enviada','descartada')),
  constraint opinion_alertas_unique unique(opinion_id, tipo)
);

create index if not exists opinion_alertas_restaurante_estado_idx
  on public.opinion_alertas(restaurante_id, estado, created_at desc);

alter table public.opinion_eventos enable row level security;
alter table public.opinion_alertas enable row level security;

drop policy if exists opinion_eventos_manage_select on public.opinion_eventos;
create policy opinion_eventos_manage_select
on public.opinion_eventos for select to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id));

drop policy if exists opinion_alertas_manage_select on public.opinion_alertas;
create policy opinion_alertas_manage_select
on public.opinion_alertas for select to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id));

drop policy if exists opinion_alertas_manage_update on public.opinion_alertas;
create policy opinion_alertas_manage_update
on public.opinion_alertas for update to authenticated
using (public.can_manage_opinion_restaurant(restaurante_id))
with check (public.can_manage_opinion_restaurant(restaurante_id));

grant select on public.opinion_eventos to authenticated;
grant select, update on public.opinion_alertas to authenticated;

create or replace function public.get_opinion_public_config_v2(p_slug text)
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
  subheadline text,
  auto_open_google boolean,
  google_delay_ms integer,
  low_rating_threshold smallint,
  contact_prompt_enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.nombre, oc.slug, oc.google_review_url,
         coalesce(oc.logo_url, r.logo_url), oc.color_primary,
         oc.color_secondary, oc.color_background, oc.headline, oc.subheadline,
         oc.auto_open_google, oc.google_delay_ms, oc.low_rating_threshold,
         oc.contact_prompt_enabled
  from public.opinion_config oc
  join public.restaurantes r on r.id = oc.restaurante_id
  where oc.slug = lower(trim(p_slug)) and oc.active = true
  limit 1;
$$;

revoke all on function public.get_opinion_public_config_v2(text) from public;
grant execute on function public.get_opinion_public_config_v2(text) to anon, authenticated;

create or replace function public.submit_opinion_qr_v2(
  p_slug text,
  p_rating integer,
  p_comentario text default null,
  p_nombre_cliente text default null,
  p_origen text default 'desconocido',
  p_submission_token uuid default gen_random_uuid(),
  p_consentimiento_privacidad boolean default false,
  p_aspectos text[] default '{}'::text[],
  p_contacto text default null,
  p_contacto_tipo text default 'ninguno',
  p_solicita_contacto boolean default false
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
  v_aspectos text[] := '{}'::text[];
  v_contacto text;
  v_contacto_tipo text := 'ninguno';
  v_threshold smallint := 3;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Valoración no válida' using errcode = '22023';
  end if;
  if not coalesce(p_consentimiento_privacidad, false) then
    raise exception 'Consentimiento requerido' using errcode = '22023';
  end if;
  if p_comentario is not null and char_length(trim(p_comentario)) > 2000 then
    raise exception 'Comentario demasiado largo' using errcode = '22001';
  end if;
  if p_nombre_cliente is not null and char_length(trim(p_nombre_cliente)) > 100 then
    raise exception 'Nombre demasiado largo' using errcode = '22001';
  end if;
  if p_contacto is not null and char_length(trim(p_contacto)) > 160 then
    raise exception 'Contacto demasiado largo' using errcode = '22001';
  end if;

  select oc.restaurante_id, oc.low_rating_threshold
    into v_restaurante_id, v_threshold
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

  select coalesce(array_agg(item), '{}'::text[])
    into v_aspectos
  from (
    select distinct lower(trim(value)) as item
    from unnest(coalesce(p_aspectos, '{}'::text[])) as value
    where lower(trim(value)) = any(array[
      'comida','servicio','ambiente','espera','limpieza','calidad_precio'
    ]::text[])
    limit 6
  ) allowed;

  if coalesce(p_solicita_contacto, false) then
    v_contacto_tipo := case lower(coalesce(trim(p_contacto_tipo), 'ninguno'))
      when 'telefono' then 'telefono'
      when 'email' then 'email'
      else 'ninguno'
    end;
    v_contacto := nullif(trim(coalesce(p_contacto, '')), '');
    if v_contacto is null then
      v_contacto_tipo := 'ninguno';
    end if;
  end if;

  insert into public.opiniones_qr (
    restaurante_id, rating, comentario, nombre_cliente, origen,
    submission_token, consentimiento_privacidad, aspectos,
    contacto, contacto_tipo, solicita_contacto
  ) values (
    v_restaurante_id, p_rating,
    nullif(trim(coalesce(p_comentario, '')), ''),
    nullif(trim(coalesce(p_nombre_cliente, '')), ''),
    v_origen, coalesce(p_submission_token, gen_random_uuid()),
    true, v_aspectos, v_contacto, v_contacto_tipo,
    coalesce(p_solicita_contacto, false) and v_contacto is not null
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

  if p_rating <= v_threshold then
    insert into public.opinion_alertas (
      restaurante_id, opinion_id, tipo, destino_email, destino_whatsapp, payload
    )
    select v_restaurante_id, v_opinion_id, 'valoracion_baja',
           oc.feedback_email, oc.feedback_whatsapp,
           jsonb_build_object('rating', p_rating, 'origen', v_origen)
    from public.opinion_config oc
    where oc.restaurante_id = v_restaurante_id
    on conflict (opinion_id, tipo) do nothing;
  end if;

  if coalesce(p_solicita_contacto, false) and v_contacto is not null then
    insert into public.opinion_alertas (
      restaurante_id, opinion_id, tipo, destino_email, destino_whatsapp, payload
    )
    select v_restaurante_id, v_opinion_id, 'seguimiento_solicitado',
           oc.feedback_email, oc.feedback_whatsapp,
           jsonb_build_object('contacto_tipo', v_contacto_tipo, 'origen', v_origen)
    from public.opinion_config oc
    where oc.restaurante_id = v_restaurante_id
    on conflict (opinion_id, tipo) do nothing;
  end if;

  return v_opinion_id;
end;
$$;

revoke all on function public.submit_opinion_qr_v2(
  text, integer, text, text, text, uuid, boolean, text[], text, text, boolean
) from public;
grant execute on function public.submit_opinion_qr_v2(
  text, integer, text, text, text, uuid, boolean, text[], text, text, boolean
) to anon, authenticated;

create or replace function public.track_opinion_event(
  p_slug text,
  p_submission_token uuid,
  p_event_type text,
  p_origen text default 'desconocido',
  p_rating integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurante_id uuid;
  v_event_id uuid;
  v_event_type text;
  v_origen text;
begin
  v_event_type := lower(trim(coalesce(p_event_type, '')));
  if v_event_type <> all(array[
    'view','rating_selected','details_opened','submitted',
    'copy_succeeded','copy_failed','google_opened','returned_from_google'
  ]::text[]) then
    raise exception 'Evento no válido' using errcode = '22023';
  end if;

  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'Valoración no válida' using errcode = '22023';
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

  insert into public.opinion_eventos (
    restaurante_id, submission_token, event_type, origen, rating
  ) values (
    v_restaurante_id, p_submission_token, v_event_type, v_origen,
    case when p_rating between 1 and 5 then p_rating else null end
  ) returning id into v_event_id;

  if v_event_type = 'google_opened' and p_submission_token is not null then
    update public.opiniones_qr
    set google_abierto = true,
        google_abierto_at = coalesce(google_abierto_at, now())
    where restaurante_id = v_restaurante_id
      and submission_token = p_submission_token;
  end if;

  return v_event_id;
end;
$$;

revoke all on function public.track_opinion_event(text, uuid, text, text, integer) from public;
grant execute on function public.track_opinion_event(text, uuid, text, text, integer)
  to anon, authenticated;

update public.opinion_config
set google_delay_ms = 4200,
    auto_open_google = true,
    low_rating_threshold = 3,
    contact_prompt_enabled = true
where slug = 'hispanos-grill';