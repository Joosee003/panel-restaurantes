-- Shared GastroHelp promotions. Loyalty coupons remain a separate, private workflow.
create table public.promociones (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  ubicacion text not null check (ubicacion in ('universitarios', 'partidas', 'estacion')),
  tipo text not null check (tipo in ('precio_especial', 'porcentaje', 'descuento_fijo', 'grupos', 'dos_por_uno', 'pack', 'evento')),
  titulo text not null check (char_length(trim(titulo)) between 3 and 90),
  descripcion text not null default '' check (char_length(descripcion) <= 700),
  publico text not null default '' check (char_length(publico) <= 120),
  producto_ids uuid[] not null default '{}',
  productos_texto text not null default '' check (char_length(productos_texto) <= 300),
  precio numeric(10,2) check (precio > 0),
  descuento_porcentaje numeric(5,2) check (descuento_porcentaje > 0 and descuento_porcentaje <= 100),
  descuento_eur numeric(10,2) check (descuento_eur > 0),
  personas_minimas integer check (personas_minimas >= 2),
  imagen_url text check (imagen_url is null or char_length(imagen_url) <= 500),
  dias_semana smallint[] not null default '{}' check (dias_semana <@ array[1,2,3,4,5,6,7]::smallint[]),
  hora_inicio time without time zone,
  hora_fin time without time zone,
  fecha_inicio date,
  fecha_fin date,
  condiciones text not null default '' check (char_length(condiciones) <= 500),
  cta_texto text not null default 'Ver carta' check (char_length(trim(cta_texto)) between 2 and 45),
  cta_destino text not null default 'carta' check (cta_destino in ('carta', 'visitanos', 'contacto')),
  estado text not null default 'borrador' check (estado in ('borrador', 'programada', 'activa', 'pausada', 'finalizada')),
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint promociones_fechas_check check (fecha_inicio is null or fecha_fin is null or fecha_fin >= fecha_inicio),
  constraint promociones_programacion_check check (estado <> 'programada' or fecha_inicio is not null),
  constraint promociones_publicacion_check check (estado not in ('activa', 'programada') or (char_length(trim(descripcion)) > 0 and imagen_url is not null)),
  constraint promociones_horas_check check ((hora_inicio is null and hora_fin is null) or (hora_inicio is not null and hora_fin is not null and hora_fin > hora_inicio)),
  constraint promociones_tipo_precio_check check (
    (tipo in ('precio_especial', 'pack') and precio is not null and descuento_porcentaje is null and descuento_eur is null)
    or (tipo = 'porcentaje' and descuento_porcentaje is not null and precio is null and descuento_eur is null)
    or (tipo = 'descuento_fijo' and descuento_eur is not null and precio is null and descuento_porcentaje is null)
    or (tipo in ('grupos', 'dos_por_uno', 'evento') and descuento_porcentaje is null and descuento_eur is null)
  ),
  constraint promociones_grupos_check check (tipo <> 'grupos' or personas_minimas is not null)
);

create index promociones_publicas_idx on public.promociones (restaurante_id, ubicacion, estado, orden);
create index promociones_fechas_idx on public.promociones (restaurante_id, fecha_inicio, fecha_fin);

create function public.promocion_visible(p public.promociones, p_momento timestamptz default now())
returns boolean language sql stable security invoker set search_path = '' as $$
  select p.estado in ('activa', 'programada')
    and (p.fecha_inicio is null or (p_momento at time zone 'Europe/Madrid')::date >= p.fecha_inicio)
    and (p.fecha_fin is null or (p_momento at time zone 'Europe/Madrid')::date <= p.fecha_fin)
    and (cardinality(p.dias_semana) = 0 or extract(isodow from p_momento at time zone 'Europe/Madrid')::smallint = any(p.dias_semana))
    and (p.hora_inicio is null or (
      (p_momento at time zone 'Europe/Madrid')::time >= p.hora_inicio
      and (p_momento at time zone 'Europe/Madrid')::time < p.hora_fin
    ));
$$;

create function public.promociones_validar_productos()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (
    select 1 from unnest(new.producto_ids) as selected(id)
    where not exists (
      select 1 from public.carta_productos item
      where item.id = selected.id and item.restaurante_id = new.restaurante_id
    )
  ) then
    raise exception 'PROMOCION_PRODUCTO_AJENO_O_INEXISTENTE' using errcode = '23514';
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;
create trigger promociones_validar_productos_before_write
before insert or update on public.promociones
for each row execute function public.promociones_validar_productos();

alter table public.promociones enable row level security;
create policy promociones_propietario_leer on public.promociones for select to authenticated
using (public.user_can_access_restaurant(restaurante_id) or public.is_app_admin());
create policy promociones_propietario_insertar on public.promociones for insert to authenticated
with check ((public.user_can_access_restaurant(restaurante_id) or public.is_app_admin()) and not public.is_demo_user());
create policy promociones_propietario_editar on public.promociones for update to authenticated
using ((public.user_can_access_restaurant(restaurante_id) or public.is_app_admin()) and not public.is_demo_user())
with check ((public.user_can_access_restaurant(restaurante_id) or public.is_app_admin()) and not public.is_demo_user());
create policy promociones_propietario_borrar on public.promociones for delete to authenticated
using ((public.user_can_access_restaurant(restaurante_id) or public.is_app_admin()) and not public.is_demo_user());
create policy promociones_publicas_anon on public.promociones for select to anon
using (public.promocion_visible(promociones));

grant select on public.promociones to anon;
grant select, insert, update, delete on public.promociones to authenticated;
revoke all on function public.promocion_visible(public.promociones, timestamptz) from public;
grant execute on function public.promocion_visible(public.promociones, timestamptz) to anon, authenticated;
revoke all on function public.promociones_validar_productos() from public;

-- SECURITY INVOKER keeps the public function subject to the table's anon RLS.
create function public.obtener_promociones_publicas(p_restaurante_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'ubicacion', p.ubicacion,
    'tipo', p.tipo,
    'titulo', p.titulo,
    'descripcion', p.descripcion,
    'publico', p.publico,
    'productos', p.productos_texto,
    'precio', p.precio,
    'descuento_porcentaje', p.descuento_porcentaje,
    'descuento_eur', p.descuento_eur,
    'personas_minimas', p.personas_minimas,
    'imagen_url', p.imagen_url,
    'condiciones', p.condiciones,
    'cta_texto', p.cta_texto,
    'cta_destino', p.cta_destino
  ) order by p.orden, p.creado_en), '[]'::jsonb)
  from public.promociones p
  where p.restaurante_id = p_restaurante_id and public.promocion_visible(p);
$$;
revoke all on function public.obtener_promociones_publicas(uuid) from public;
grant execute on function public.obtener_promociones_publicas(uuid) to anon, authenticated;
