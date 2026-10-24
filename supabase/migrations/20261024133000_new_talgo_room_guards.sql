-- Guardas de integridad para la sala compartida con las reservas originales.
create or replace function app_private.prevent_blocking_reserved_table()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.bloqueada and not old.bloqueada
     and exists(select 1 from public.reservas_config c
       where c.restaurante_id=new.restaurante_id and c.mesas_activas_en_disponibilidad)
     and (exists(select 1 from public.reservas r where r.mesa_id=new.id
         and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
         and coalesce(r.fin_at,(r.fecha_hora_reserva at time zone 'Europe/Madrid')+interval '90 minutes')>now())
       or exists(select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
         where g.mesa_id=new.id
         and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
         and r.fin_at>now()))
  then raise exception 'TABLE_HAS_FUTURE_RESERVATION'; end if;
  return new;
end $$;

create or replace function app_private.validate_group_table_conflict()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_start timestamptz; v_end timestamptz; v_timezone text; v_duration integer;
begin
  if new.mesa_id is null or lower(coalesce(new.estado,'pendiente'))
     in ('cancelada','cancelado','no-show','no_show') then return new; end if;
  if not exists(select 1 from public.reservas_config c where c.restaurante_id=new.restaurante_id
    and c.mesas_activas_en_disponibilidad) then return new; end if;
  select c.zona_horaria,c.duracion_minutos into v_timezone,v_duration
    from public.reservas_config c where c.restaurante_id=new.restaurante_id;
  v_start := coalesce(new.inicio_at,new.fecha_hora_reserva at time zone v_timezone);
  v_end := coalesce(new.fin_at,v_start+make_interval(mins=>v_duration));
  if exists(select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
    where g.mesa_id=new.mesa_id and r.id is distinct from new.id
      and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
      and r.inicio_at<v_end and r.fin_at>v_start)
  then raise exception 'TABLE_TIME_CONFLICT'; end if;
  return new;
end $$;
drop trigger if exists zy_validate_group_table_conflict on public.reservas;
create trigger zy_validate_group_table_conflict
  before insert or update of mesa_id,inicio_at,fin_at,fecha_hora_reserva,estado,personas
  on public.reservas for each row execute function app_private.validate_group_table_conflict();
revoke all on function app_private.validate_group_table_conflict() from public,anon,authenticated,service_role;

create or replace function app_private.validate_room_occupancy()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mesa public.sala_mesas%rowtype;
begin
  select * into v_mesa from public.sala_mesas where id=new.mesa_id for update;
  if v_mesa.id is null or v_mesa.restaurante_id<>new.restaurante_id
    or not v_mesa.activa or v_mesa.bloqueada then raise exception 'TABLE_NOT_AVAILABLE'; end if;
  if new.liberada_en is null and exists(
    select 1 from public.reserva_mesas_grupo g join public.reservas r on r.id=g.reserva_id
    where g.mesa_id=new.mesa_id
      and lower(coalesce(r.estado,'pendiente')) not in ('cancelada','cancelado','no-show','no_show')
      and r.inicio_at<=now() and r.fin_at>now())
  then raise exception 'TABLE_TIME_CONFLICT'; end if;
  return new;
end $$;
drop trigger if exists validate_room_occupancy on public.sala_ocupaciones;
create trigger validate_room_occupancy before insert on public.sala_ocupaciones
  for each row execute function app_private.validate_room_occupancy();
revoke all on function app_private.validate_room_occupancy() from public,anon,authenticated,service_role;
