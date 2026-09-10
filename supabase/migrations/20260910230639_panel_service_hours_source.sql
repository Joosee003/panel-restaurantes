-- The panel's two service ranges are authoritative. Calendar rows retain days
-- and capacity overrides, but their hours are derived from their own restaurant.
create or replace function public.parse_panel_service_hours(p_value text)
returns time[] language plpgsql immutable security invoker set search_path = '' as $$
declare v_parts text[]; v_start time; v_end time;
begin
  if nullif(trim(coalesce(p_value, '')), '') is null then return null; end if;
  v_parts := regexp_match(trim(p_value), '^([0-9]{1,2}:[0-9]{2})[[:space:]]*[-–—][[:space:]]*([0-9]{1,2}:[0-9]{2})$');
  if v_parts is null then raise exception 'INVALID_PANEL_SERVICE_HOURS'; end if;
  begin v_start := v_parts[1]::time; v_end := v_parts[2]::time;
  exception when others then raise exception 'INVALID_PANEL_SERVICE_HOURS'; end;
  if v_start >= v_end or v_end = '24:00'::time then raise exception 'INVALID_PANEL_SERVICE_HOURS'; end if;
  return array[v_start, v_end];
end $$;

create or replace function public.validate_panel_service_hours()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_lunch time[]; v_dinner time[];
begin
  v_lunch := public.parse_panel_service_hours(new.horario_comida);
  v_dinner := public.parse_panel_service_hours(new.horario_cena);
  if v_lunch is not null and v_dinner is not null
     and v_lunch[1] < v_dinner[2] and v_dinner[1] < v_lunch[2] then
    raise exception 'OVERLAPPING_PANEL_SERVICE_HOURS';
  end if;
  return new;
end $$;

create or replace function public.enforce_panel_calendar_hours()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_lunch text; v_dinner text; v_hours time[];
begin
  -- Serialize with changes to the parent, including old browser/RPC clients.
  select r.horario_comida, r.horario_cena into v_lunch, v_dinner
  from public.restaurantes r where r.id = new.restaurante_id for share;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if new.turno not in ('comida', 'cena') then raise exception 'INVALID_PANEL_SERVICE'; end if;
  v_hours := public.parse_panel_service_hours(case new.turno when 'comida' then v_lunch else v_dinner end);
  if v_hours is null then raise exception 'PANEL_SERVICE_HOURS_REQUIRED'; end if;
  new.hora_inicio := v_hours[1]; new.hora_fin := v_hours[2];
  return new;
end $$;

create or replace function public.sync_panel_service_hours(p_restaurante_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_lunch time[]; v_dinner time[]; v_active_ids uuid[];
begin
  select public.parse_panel_service_hours(r.horario_comida), public.parse_panel_service_hours(r.horario_cena)
    into v_lunch, v_dinner from public.restaurantes r where r.id = p_restaurante_id for update;
  if not found then raise exception 'ACCESS_DENIED'; end if;
  if v_lunch is not null and v_dinner is not null
     and v_lunch[1] < v_dinner[2] and v_dinner[1] < v_lunch[2] then
    raise exception 'OVERLAPPING_PANEL_SERVICE_HOURS';
  end if;
  if exists (select 1 from public.reservas_horarios where restaurante_id = p_restaurante_id and turno not in ('comida','cena')) then
    raise exception 'INVALID_PANEL_SERVICE';
  end if;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_active_ids
  from public.reservas_horarios where restaurante_id = p_restaurante_id and activo;
  delete from public.reservas_horarios where restaurante_id = p_restaurante_id
    and ((turno = 'comida' and v_lunch is null) or (turno = 'cena' and v_dinner is null));
  -- Disable first so changing both ranges never collides with the old range of
  -- the other service during row-by-row overlap validation. Restore exact flags.
  update public.reservas_horarios set activo = false where restaurante_id = p_restaurante_id;
  update public.reservas_horarios set activo = true where restaurante_id = p_restaurante_id and id = any(v_active_ids);
  -- Missing days remain closed; saving a range must not open a closed weekday.
  insert into public.reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin,activo)
  select p_restaurante_id,d.day,s.service,s.hours[1],s.hours[2],false
  from generate_series(0,6) d(day)
  cross join (values ('comida',v_lunch),('cena',v_dinner)) s(service,hours)
  where s.hours is not null and not exists (
    select 1 from public.reservas_horarios h where h.restaurante_id=p_restaurante_id and h.dia_semana=d.day and h.turno=s.service
  );
end $$;

create or replace function public.sync_panel_service_hours_after_save()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.sync_panel_service_hours(new.id);
  return new;
end $$;

revoke all on function public.parse_panel_service_hours(text) from public, anon;
grant execute on function public.parse_panel_service_hours(text) to authenticated, service_role;
revoke all on function public.sync_panel_service_hours(uuid) from public, anon;
grant execute on function public.sync_panel_service_hours(uuid) to authenticated, service_role;
revoke all on function public.validate_panel_service_hours() from public, anon, authenticated;
revoke all on function public.enforce_panel_calendar_hours() from public, anon, authenticated;
revoke all on function public.sync_panel_service_hours_after_save() from public, anon, authenticated;

create trigger validate_panel_service_hours before insert or update of horario_comida,horario_cena
on public.restaurantes for each row execute function public.validate_panel_service_hours();
-- Alphabetical order puts normalization before the existing overlap trigger.
create trigger canonical_panel_calendar_hours before insert or update
on public.reservas_horarios for each row execute function public.enforce_panel_calendar_hours();
create trigger sync_panel_service_hours_insert after insert on public.restaurantes
for each row execute function public.sync_panel_service_hours_after_save();
create trigger sync_panel_service_hours_update after update of horario_comida,horario_cena on public.restaurantes
for each row when (old.horario_comida is distinct from new.horario_comida or old.horario_cena is distinct from new.horario_cena)
execute function public.sync_panel_service_hours_after_save();

-- Keep the existing access checks and demo protection around the private writer.
-- A save from an older web editor cannot restore a second independent timetable.
create or replace function public.guardar_configuracion_web_reservas(
  p_restaurante_id uuid, p_web jsonb, p_config jsonb, p_horarios jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.assert_mutation_allowed();
  if p_restaurante_id is null or not public.user_can_access_restaurant(p_restaurante_id) then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.restaurantes where id=p_restaurante_id for update;
  v_result := app_private.guardar_configuracion_web_reservas(p_restaurante_id,p_web,p_config,p_horarios);
  perform public.sync_panel_service_hours(p_restaurante_id);
  return v_result;
end $$;
revoke all on function public.guardar_configuracion_web_reservas(uuid,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.guardar_configuracion_web_reservas(uuid,jsonb,jsonb,jsonb) to authenticated, service_role;

-- Backfill from each restaurant's existing panel settings. Never copy one
-- restaurant's hours, enabled services, dates, or capacity into another.
do $$ declare v_id uuid;
begin
  for v_id in select id from public.restaurantes order by id loop
    perform public.sync_panel_service_hours(v_id);
  end loop;
end $$;
