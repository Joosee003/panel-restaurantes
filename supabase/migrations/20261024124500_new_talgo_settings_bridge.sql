-- La pantalla de turnos New Talgo guarda en las tablas nativas. El sincronizador
-- histórico de dos turnos solo sigue actuando para restaurantes sin mesas activas.
create or replace function public.guardar_configuracion_web_reservas(
  p_restaurante_id uuid, p_web jsonb, p_config jsonb, p_horarios jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform app_private.assert_mutation_allowed();
  if p_restaurante_id is null or not public.user_can_access_restaurant(p_restaurante_id)
    then raise exception 'ACCESS_DENIED'; end if;
  perform 1 from public.restaurantes where id=p_restaurante_id for update;
  v_result := app_private.guardar_configuracion_web_reservas(p_restaurante_id,p_web,p_config,p_horarios);
  if not exists (select 1 from public.reservas_config
    where restaurante_id=p_restaurante_id and mesas_activas_en_disponibilidad)
  then perform public.sync_panel_service_hours(p_restaurante_id); end if;
  return v_result;
end $$;
