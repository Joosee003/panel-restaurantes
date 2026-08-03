-- Dominio, datos legales por restaurante y prueba de aceptación en reservas.
alter table public.restaurante_webs
  add column if not exists dominio_personalizado text,
  add column if not exists titular_legal text,
  add column if not exists nif_cif text,
  add column if not exists domicilio_legal text,
  add column if not exists email_legal text,
  add column if not exists datos_registrales text,
  add column if not exists privacidad_email text,
  add column if not exists conservacion_reservas text,
  add column if not exists legal_actualizado_en date;

create unique index if not exists restaurante_webs_dominio_personalizado_unique_idx
  on public.restaurante_webs (lower(dominio_personalizado))
  where dominio_personalizado is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'restaurante_webs_dominio_formato_check'
      and conrelid = 'public.restaurante_webs'::regclass
  ) then
    alter table public.restaurante_webs
      add constraint restaurante_webs_dominio_formato_check
      check (
        dominio_personalizado is null
        or dominio_personalizado ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$'
      );
  end if;
end;
$$;

alter table public.reservas
  add column if not exists privacidad_informada_at timestamptz,
  add column if not exists condiciones_aceptadas_at timestamptz,
  add column if not exists version_legal text;

create or replace function public.crear_reserva_publica_con_aceptacion(
  p_slug text,
  p_inicio_at timestamptz,
  p_personas integer,
  p_nombre text,
  p_telefono text default null,
  p_email text default null,
  p_notas text default null,
  p_idempotency_key uuid default null,
  p_privacidad_informada boolean default false,
  p_condiciones_aceptadas boolean default false,
  p_version_legal text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_reserva_id uuid;
begin
  if p_privacidad_informada is not true
     or p_condiciones_aceptadas is not true
     or nullif(trim(coalesce(p_version_legal, '')), '') is null then
    raise exception 'LEGAL_ACCEPTANCE_REQUIRED';
  end if;

  v_result := public.crear_reserva_publica(
    p_slug, p_inicio_at, p_personas, p_nombre, p_telefono, p_email,
    p_notas, p_idempotency_key
  );
  v_reserva_id := nullif(v_result ->> 'reserva_id', '')::uuid;

  update public.reservas
  set privacidad_informada_at = coalesce(privacidad_informada_at, now()),
      condiciones_aceptadas_at = coalesce(condiciones_aceptadas_at, now()),
      version_legal = coalesce(version_legal, left(trim(p_version_legal), 40))
  where id = v_reserva_id;

  if not found then raise exception 'BOOKING_LEGAL_AUDIT_FAILED'; end if;
  return v_result;
end;
$$;

revoke all on function public.crear_reserva_publica_con_aceptacion(
  text, timestamptz, integer, text, text, text, text, uuid, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.crear_reserva_publica_con_aceptacion(
  text, timestamptz, integer, text, text, text, text, uuid, boolean, boolean, text
) to service_role;

create or replace function public.guardar_configuracion_web_reservas_legal(
  p_restaurante_id uuid,
  p_web jsonb,
  p_config jsonb,
  p_horarios jsonb,
  p_legal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_domain text := lower(trim(coalesce(p_legal ->> 'dominio_personalizado', '')));
begin
  if p_restaurante_id is null
     or not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED';
  end if;

  v_domain := regexp_replace(v_domain, '^https?://', '');
  v_domain := split_part(v_domain, '/', 1);
  v_domain := regexp_replace(v_domain, '^www[.]', '');
  v_domain := nullif(v_domain, '');

  if v_domain is not null and (
    v_domain !~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?[.])+[a-z]{2,63}$'
    or v_domain in ('gastrohelp.es', 'panel.gastrohelp.es')
    or v_domain like '%.vercel.app'
  ) then raise exception 'INVALID_CUSTOM_DOMAIN'; end if;

  if v_domain is not null and (
    nullif(trim(coalesce(p_legal ->> 'titular_legal', '')), '') is null
    or nullif(trim(coalesce(p_legal ->> 'nif_cif', '')), '') is null
    or nullif(trim(coalesce(p_legal ->> 'domicilio_legal', '')), '') is null
    or nullif(trim(coalesce(p_legal ->> 'email_legal', '')), '') is null
    or nullif(trim(coalesce(p_legal ->> 'privacidad_email', '')), '') is null
  ) then raise exception 'CUSTOM_DOMAIN_REQUIRES_LEGAL_DATA'; end if;

  v_result := public.guardar_configuracion_web_reservas(
    p_restaurante_id, p_web, p_config, p_horarios
  );

  update public.restaurante_webs
  set dominio_personalizado = v_domain,
      titular_legal = nullif(left(trim(coalesce(p_legal ->> 'titular_legal', '')), 180), ''),
      nif_cif = nullif(upper(left(trim(coalesce(p_legal ->> 'nif_cif', '')), 32)), ''),
      domicilio_legal = nullif(left(trim(coalesce(p_legal ->> 'domicilio_legal', '')), 300), ''),
      email_legal = nullif(lower(left(trim(coalesce(p_legal ->> 'email_legal', '')), 254)), ''),
      datos_registrales = nullif(left(trim(coalesce(p_legal ->> 'datos_registrales', '')), 500), ''),
      privacidad_email = nullif(lower(left(trim(coalesce(p_legal ->> 'privacidad_email', '')), 254)), ''),
      conservacion_reservas = nullif(left(trim(coalesce(p_legal ->> 'conservacion_reservas', '')), 500), ''),
      legal_actualizado_en = current_date
  where restaurante_id = p_restaurante_id;

  return v_result || jsonb_build_object(
    'dominio_personalizado', v_domain,
    'legal_guardado', true
  );
end;
$$;

revoke all on function public.guardar_configuracion_web_reservas_legal(uuid, jsonb, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.guardar_configuracion_web_reservas_legal(uuid, jsonb, jsonb, jsonb, jsonb)
to authenticated, service_role;
