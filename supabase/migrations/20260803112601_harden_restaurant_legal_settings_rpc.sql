-- La función de ajustes trabaja con los permisos del usuario y las políticas RLS.
alter function public.guardar_configuracion_web_reservas_legal(uuid, jsonb, jsonb, jsonb, jsonb)
  security invoker;

revoke all on function public.guardar_configuracion_web_reservas_legal(uuid, jsonb, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.guardar_configuracion_web_reservas_legal(uuid, jsonb, jsonb, jsonb, jsonb)
to authenticated, service_role;

revoke all on function public.crear_reserva_publica_con_aceptacion(
  text, timestamptz, integer, text, text, text, text, uuid, boolean, boolean, text
) from public, anon, authenticated;
grant execute on function public.crear_reserva_publica_con_aceptacion(
  text, timestamptz, integer, text, text, text, text, uuid, boolean, boolean, text
) to service_role;
