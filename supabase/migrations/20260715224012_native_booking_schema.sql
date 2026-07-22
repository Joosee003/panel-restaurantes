-- GastroHelp: motor de reservas nativo y webs publicas por restaurante.
--
-- Esta migracion es deliberadamente aditiva: Amelia y las columnas antiguas
-- siguen funcionando durante el piloto. Las nuevas reservas escriben tambien
-- fecha_hora_reserva para que el panel actual no deje de verlas.

create table if not exists public.restaurante_webs (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null unique
    references public.restaurantes(id) on delete cascade,
  slug text not null unique,
  publicada boolean not null default false,
  nombre_publico text not null,
  antetitulo text,
  titular text,
  subtitulo text,
  descripcion text,
  direccion_publica text,
  telefono_publico text,
  email_publico text,
  whatsapp text,
  google_maps_url text,
  instagram_url text,
  facebook_url text,
  logo_url text,
  hero_image_url text,
  galeria_urls text[] not null default '{}',
  especialidades text[] not null default '{}',
  color_primario text not null default '#123c3a',
  color_acento text not null default '#e7b75f',
  color_fondo text not null default '#f7f3e8',
  seo_titulo text,
  seo_descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurante_webs_slug_formato_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint restaurante_webs_colores_check
    check (
      color_primario ~ '^#[0-9a-fA-F]{6}$'
      and color_acento ~ '^#[0-9a-fA-F]{6}$'
      and color_fondo ~ '^#[0-9a-fA-F]{6}$'
    )
);

create table if not exists public.reservas_config (
  restaurante_id uuid primary key
    references public.restaurantes(id) on delete cascade,
  activo boolean not null default false,
  zona_horaria text not null default 'Europe/Madrid',
  intervalo_minutos smallint not null default 30,
  duracion_minutos smallint not null default 90,
  capacidad_por_turno integer not null default 40,
  personas_minimas smallint not null default 1,
  personas_maximas smallint not null default 12,
  antelacion_minutos integer not null default 60,
  dias_maximos_antelacion smallint not null default 60,
  confirmacion_automatica boolean not null default true,
  cancelacion_minutos integer not null default 120,
  requiere_telefono boolean not null default true,
  requiere_email boolean not null default false,
  aviso_reserva text,
  politica_cancelacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservas_config_intervalo_check
    check (intervalo_minutos between 5 and 120),
  constraint reservas_config_duracion_check
    check (duracion_minutos between 15 and 720),
  constraint reservas_config_capacidad_check
    check (capacidad_por_turno between 1 and 5000),
  constraint reservas_config_personas_check
    check (
      personas_minimas between 1 and 100
      and personas_maximas between personas_minimas and 500
    ),
  constraint reservas_config_antelacion_check
    check (antelacion_minutos between 0 and 43200),
  constraint reservas_config_dias_check
    check (dias_maximos_antelacion between 1 and 730),
  constraint reservas_config_cancelacion_check
    check (cancelacion_minutos between 0 and 10080)
);

create table if not exists public.reservas_horarios (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null
    references public.restaurantes(id) on delete cascade,
  dia_semana smallint not null,
  turno text not null,
  hora_inicio time not null,
  hora_fin time not null,
  capacidad_override integer,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservas_horarios_dia_check check (dia_semana between 0 and 6),
  constraint reservas_horarios_turno_check
    check (turno ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint reservas_horarios_rango_check check (hora_fin > hora_inicio),
  constraint reservas_horarios_capacidad_check
    check (capacidad_override is null or capacidad_override between 1 and 5000),
  unique (restaurante_id, dia_semana, turno, hora_inicio)
);

create table if not exists public.reservas_excepciones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null
    references public.restaurantes(id) on delete cascade,
  fecha date not null,
  tipo text not null,
  turno text,
  hora_inicio time,
  hora_fin time,
  capacidad_override integer,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservas_excepciones_tipo_check
    check (tipo in ('cierre', 'horario_especial', 'capacidad')),
  constraint reservas_excepciones_horas_check
    check (
      (hora_inicio is null and hora_fin is null)
      or (hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)
    ),
  constraint reservas_excepciones_campos_check
    check (
      (tipo = 'cierre')
      or (
        tipo = 'horario_especial'
        and hora_inicio is not null
        and hora_fin is not null
      )
      or (
        tipo = 'capacidad'
        and capacidad_override is not null
      )
    ),
  constraint reservas_excepciones_capacidad_check
    check (capacidad_override is null or capacidad_override between 1 and 5000)
);

-- Limite persistente para que varios servidores a la vez compartan proteccion.
create table if not exists public.booking_request_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  requests integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint booking_request_limits_requests_check check (requests > 0)
);

-- Cada restaurante recibe una web en borrador y reservas apagadas. Nada se
-- publica hasta que GastroHelp haya revisado contenido, horarios y capacidad.
create or replace function public.preparar_web_reservas_restaurante()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base_slug text;
  v_web_slug text;
begin
  v_base_slug := translate(
    lower(trim(coalesce(new.nombre, 'restaurante'))),
    'áéíóúüñç',
    'aeiouunc'
  );
  v_base_slug := regexp_replace(v_base_slug, '[^a-z0-9]+', '-', 'g');
  v_base_slug := regexp_replace(v_base_slug, '(^-|-$)', '', 'g');
  v_base_slug := coalesce(nullif(v_base_slug, ''), 'restaurante');
  v_web_slug := v_base_slug || '-' || substring(replace(new.id::text, '-', '') from 1 for 6);

  insert into public.restaurante_webs (
    restaurante_id, slug, publicada, nombre_publico, titular
  ) values (
    new.id, v_web_slug, false, new.nombre, new.nombre
  )
  on conflict (restaurante_id) do nothing;

  insert into public.reservas_config (restaurante_id, activo)
  values (new.id, false)
  on conflict (restaurante_id) do nothing;

  return new;
end;
$$;

drop trigger if exists preparar_web_reservas_restaurante on public.restaurantes;
create trigger preparar_web_reservas_restaurante
after insert on public.restaurantes
for each row execute function public.preparar_web_reservas_restaurante();

insert into public.restaurante_webs (
  restaurante_id, slug, publicada, nombre_publico, titular
)
select
  r.id,
  coalesce(
    nullif(
      regexp_replace(
        regexp_replace(
          translate(lower(trim(r.nombre)), 'áéíóúüñç', 'aeiouunc'),
          '[^a-z0-9]+', '-', 'g'
        ),
        '(^-|-$)', '', 'g'
      ),
      ''
    ),
    'restaurante'
  ) || '-' || substring(replace(r.id::text, '-', '') from 1 for 6),
  false,
  r.nombre,
  r.nombre
from public.restaurantes r
on conflict (restaurante_id) do nothing;

insert into public.reservas_config (restaurante_id, activo)
select r.id, false
from public.restaurantes r
on conflict (restaurante_id) do nothing;

alter table public.reservas
  add column if not exists inicio_at timestamptz,
  add column if not exists fin_at timestamptz,
  add column if not exists idempotency_key uuid,
  add column if not exists gestion_token uuid default gen_random_uuid(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists cancelada_at timestamptz;

-- Repara valores por defecto que contenian la lista de opciones completa.
alter table public.reservas alter column estado set default 'pendiente';
alter table public.reservas alter column turno drop default;
alter table public.clientes alter column canal_contacto set default 'ninguno';

update public.reservas
set turno = case
  when extract(hour from fecha_hora_reserva) < 17 then 'comida'
  else 'cena'
end
where turno = 'comida, cena'
  and fecha_hora_reserva is not null;

update public.reservas
set estado = 'pendiente'
where estado = 'confirmada, pendiente, cancelada';

update public.clientes
set canal_contacto = 'ninguno'
where canal_contacto = 'whatsapp, telefono, ninguno';

create index if not exists restaurante_webs_publicada_slug_idx
  on public.restaurante_webs (slug)
  where publicada = true;

create index if not exists reservas_horarios_lookup_idx
  on public.reservas_horarios (restaurante_id, dia_semana, activo, hora_inicio);

create index if not exists reservas_excepciones_lookup_idx
  on public.reservas_excepciones (restaurante_id, fecha, tipo);

create index if not exists reservas_inicio_lookup_idx
  on public.reservas (restaurante_id, inicio_at, fin_at)
  where inicio_at is not null and estado not in ('cancelada', 'no-show');

create unique index if not exists reservas_idempotency_unique_idx
  on public.reservas (restaurante_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists reservas_gestion_token_unique_idx
  on public.reservas (gestion_token)
  where gestion_token is not null;

-- Mantiene las fechas nuevas y antiguas alineadas en ambos sentidos.
create or replace function public.sincronizar_fecha_reserva_nativa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_zona_horaria text;
  v_duracion integer;
begin
  select c.zona_horaria, c.duracion_minutos
    into v_zona_horaria, v_duracion
  from public.reservas_config c
  where c.restaurante_id = new.restaurante_id;

  v_zona_horaria := coalesce(v_zona_horaria, 'Europe/Madrid');
  v_duracion := coalesce(v_duracion, 90);

  if tg_op = 'UPDATE'
     and new.fecha_hora_reserva is distinct from old.fecha_hora_reserva
     and new.inicio_at is not distinct from old.inicio_at then
    new.inicio_at := new.fecha_hora_reserva at time zone v_zona_horaria;
    new.fin_at := new.inicio_at + make_interval(mins => v_duracion);
  elsif new.inicio_at is not null then
    new.fecha_hora_reserva := new.inicio_at at time zone v_zona_horaria;
    if tg_op = 'UPDATE' and new.inicio_at is distinct from old.inicio_at then
      new.fin_at := new.inicio_at + make_interval(mins => v_duracion);
    else
      new.fin_at := coalesce(new.fin_at, new.inicio_at + make_interval(mins => v_duracion));
    end if;
  elsif new.fecha_hora_reserva is not null then
    new.inicio_at := new.fecha_hora_reserva at time zone v_zona_horaria;
    new.fin_at := coalesce(new.fin_at, new.inicio_at + make_interval(mins => v_duracion));
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sincronizar_fecha_reserva_nativa on public.reservas;
create trigger sincronizar_fecha_reserva_nativa
before insert or update of inicio_at, fin_at, fecha_hora_reserva, restaurante_id
on public.reservas
for each row execute function public.sincronizar_fecha_reserva_nativa();

drop trigger if exists set_updated_at_restaurante_webs on public.restaurante_webs;
create trigger set_updated_at_restaurante_webs
before update on public.restaurante_webs
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_reservas_config on public.reservas_config;
create trigger set_updated_at_reservas_config
before update on public.reservas_config
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_reservas_horarios on public.reservas_horarios;
create trigger set_updated_at_reservas_horarios
before update on public.reservas_horarios
for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at_reservas_excepciones on public.reservas_excepciones;
create trigger set_updated_at_reservas_excepciones
before update on public.reservas_excepciones
for each row execute function public.set_updated_at();

