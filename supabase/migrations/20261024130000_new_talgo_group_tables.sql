-- Varias mesas para una reserva grande, sin duplicar reservas ni clientes.
create table if not exists public.reserva_mesas_grupo (
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  mesa_id uuid not null references public.sala_mesas(id),
  creado_en timestamptz not null default now(),
  primary key (reserva_id, mesa_id)
);
create index if not exists reserva_mesas_grupo_mesa_idx
  on public.reserva_mesas_grupo(mesa_id, restaurante_id);
alter table public.reserva_mesas_grupo enable row level security;
create policy reserva_mesas_grupo_lectura on public.reserva_mesas_grupo
  for select to authenticated using (public.user_can_access_restaurant(restaurante_id));
revoke all on public.reserva_mesas_grupo from public,anon,authenticated;
grant select on public.reserva_mesas_grupo to authenticated;
grant all on public.reserva_mesas_grupo to service_role;

create or replace function public.confirmar_reserva_grupo(p_reserva_id uuid, p_mesa_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_r public.reservas%rowtype;
  v_c public.reservas_config%rowtype;
  v_slug text;
  v_id uuid;
  v_m public.sala_mesas%rowtype;
  v_capacity integer := 0;
  v_count integer := 0;
begin
  perform app_private.assert_mutation_allowed();
  select * into v_r from public.reservas where id=p_reserva_id for update;
  if v_r.id is null or not public.user_can_access_restaurant(v_r.restaurante_id)
    then raise exception 'RESTAURANT_ACCESS_DENIED'; end if;
  select * into v_c from public.reservas_config where restaurante_id=v_r.restaurante_id;
  if not v_c.mesas_activas_en_disponibilidad or v_r.estado <> 'pendiente'
     or v_r.personas <= coalesce(v_c.confirmacion_automatica_hasta,0)
     or v_r.personas > v_c.personas_maximas then raise exception 'GROUP_REQUEST_NOT_ELIGIBLE'; end if;
  if p_mesa_ids is null or cardinality(p_mesa_ids) < 2 or cardinality(p_mesa_ids) > 8
     or cardinality(p_mesa_ids) <> (select count(distinct x) from unnest(p_mesa_ids) x)
  then raise exception 'INVALID_GROUP_TABLES'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    v_r.restaurante_id::text || ':date:' || (v_r.inicio_at at time zone v_c.zona_horaria)::date::text,0));
  select slug into v_slug from public.restaurante_webs where restaurante_id=v_r.restaurante_id;
  if not exists(select 1 from public.obtener_disponibilidad_reservas(
    v_slug,(v_r.inicio_at at time zone v_c.zona_horaria)::date,v_r.personas,v_r.id) a
    where a.inicio_at=v_r.inicio_at) then raise exception 'SLOT_NOT_AVAILABLE'; end if;
  for v_id in select x from unnest(p_mesa_ids) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('table:' || v_id::text,0));
    select * into v_m from public.sala_mesas where id=v_id for update;
    if v_m.id is null or v_m.restaurante_id<>v_r.restaurante_id or not v_m.activa or v_m.bloqueada
      then raise exception 'TABLE_NOT_AVAILABLE'; end if;
    if exists(select 1 from public.sala_ocupaciones o where o.mesa_id=v_id
      and o.liberada_en is null and o.ocupada_en < v_r.fin_at)
      then raise exception 'TABLE_OCCUPIED'; end if;
    if exists(select 1 from public.reservas r where r.mesa_id=v_id and r.id<>v_r.id
      and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
      and r.inicio_at<v_r.fin_at and r.fin_at>v_r.inicio_at)
      or exists(select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
        where g.mesa_id=v_id and r.id<>v_r.id
        and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
        and r.inicio_at<v_r.fin_at and r.fin_at>v_r.inicio_at)
      then raise exception 'TABLE_TIME_CONFLICT'; end if;
    v_capacity := v_capacity + v_m.capacidad;
    v_count := v_count + 1;
  end loop;
  if v_count<>cardinality(p_mesa_ids) or v_capacity<v_r.personas
    then raise exception 'GROUP_TABLE_CAPACITY_EXCEEDED'; end if;
  insert into public.reserva_mesas_grupo(reserva_id,restaurante_id,mesa_id)
    select v_r.id,v_r.restaurante_id,x from unnest(p_mesa_ids) x;
  update public.reservas set estado='confirmada' where id=v_r.id;
  return jsonb_build_object('ok',true,'reserva_id',v_r.id,'estado','confirmada','mesas',v_count);
end $$;
revoke all on function public.confirmar_reserva_grupo(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.confirmar_reserva_grupo(uuid,uuid[]) to authenticated,service_role;

create or replace function app_private.require_group_tables_on_confirmation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_threshold integer; v_enabled boolean; v_capacity integer;
begin
  if new.estado='confirmada' and old.estado is distinct from new.estado then
    select c.mesas_activas_en_disponibilidad,c.confirmacion_automatica_hasta
      into v_enabled,v_threshold from public.reservas_config c where c.restaurante_id=new.restaurante_id;
    if v_enabled and new.personas>coalesce(v_threshold,0) then
      select coalesce(sum(m.capacidad),0) into v_capacity
        from public.reserva_mesas_grupo g join public.sala_mesas m on m.id=g.mesa_id
        where g.reserva_id=new.id and g.restaurante_id=new.restaurante_id;
      if v_capacity<new.personas then raise exception 'GROUP_TABLES_REQUIRED'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists require_group_tables_on_confirmation on public.reservas;
create trigger require_group_tables_on_confirmation before update of estado on public.reservas
  for each row execute function app_private.require_group_tables_on_confirmation();
revoke all on function app_private.require_group_tables_on_confirmation() from public,anon,authenticated,service_role;
