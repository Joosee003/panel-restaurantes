-- RLS: el navegador publico no consulta ninguna tabla. La web publica pasa
-- por rutas de servidor y las cuentas del panel solo gestionan su restaurante.
alter table public.restaurante_webs enable row level security;
alter table public.reservas_config enable row level security;
alter table public.reservas_horarios enable row level security;
alter table public.reservas_excepciones enable row level security;
alter table public.booking_request_limits enable row level security;

drop policy if exists restaurante_webs_owner_access on public.restaurante_webs;
create policy restaurante_webs_owner_access
on public.restaurante_webs
for all
to authenticated
using ((select public.user_can_access_restaurant(restaurante_id)))
with check ((select public.user_can_access_restaurant(restaurante_id)));

drop policy if exists reservas_config_owner_access on public.reservas_config;
create policy reservas_config_owner_access
on public.reservas_config
for all
to authenticated
using ((select public.user_can_access_restaurant(restaurante_id)))
with check ((select public.user_can_access_restaurant(restaurante_id)));

drop policy if exists reservas_horarios_owner_access on public.reservas_horarios;
create policy reservas_horarios_owner_access
on public.reservas_horarios
for all
to authenticated
using ((select public.user_can_access_restaurant(restaurante_id)))
with check ((select public.user_can_access_restaurant(restaurante_id)));

drop policy if exists reservas_excepciones_owner_access on public.reservas_excepciones;
create policy reservas_excepciones_owner_access
on public.reservas_excepciones
for all
to authenticated
using ((select public.user_can_access_restaurant(restaurante_id)))
with check ((select public.user_can_access_restaurant(restaurante_id)));

revoke all on table public.restaurante_webs from anon;
revoke all on table public.reservas_config from anon;
revoke all on table public.reservas_horarios from anon;
revoke all on table public.reservas_excepciones from anon;
revoke all on table public.booking_request_limits from public, anon, authenticated;

grant select, insert, update, delete on table public.restaurante_webs to authenticated;
grant select, insert, update, delete on table public.reservas_config to authenticated;
grant select, insert, update, delete on table public.reservas_horarios to authenticated;
grant select, insert, update, delete on table public.reservas_excepciones to authenticated;
grant all on table public.restaurante_webs to service_role;
grant all on table public.reservas_config to service_role;
grant all on table public.reservas_horarios to service_role;
grant all on table public.reservas_excepciones to service_role;
grant all on table public.booking_request_limits to service_role;

revoke all on function public.sincronizar_fecha_reserva_nativa()
from public, anon, authenticated;
grant execute on function public.sincronizar_fecha_reserva_nativa()
to service_role;

revoke all on function public.preparar_web_reservas_restaurante()
from public, anon, authenticated;
grant execute on function public.preparar_web_reservas_restaurante()
to service_role;

revoke all on function public.obtener_disponibilidad_reservas(text, date, integer, uuid)
from public, anon, authenticated;
grant execute on function public.obtener_disponibilidad_reservas(text, date, integer, uuid)
to service_role;

revoke all on function public.crear_reserva_publica(
  text, timestamptz, integer, text, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.crear_reserva_publica(
  text, timestamptz, integer, text, text, text, text, uuid
) to service_role;

revoke all on function public.consumir_limite_reserva_publica(text, integer, integer)
from public, anon, authenticated;
grant execute on function public.consumir_limite_reserva_publica(text, integer, integer)
to service_role;

revoke all on function public.obtener_reserva_publica_gestion(uuid)
from public, anon, authenticated;
grant execute on function public.obtener_reserva_publica_gestion(uuid)
to service_role;

revoke all on function public.cancelar_reserva_publica_gestion(uuid)
from public, anon, authenticated;
grant execute on function public.cancelar_reserva_publica_gestion(uuid)
to service_role;

revoke all on function public.reprogramar_reserva_publica_gestion(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.reprogramar_reserva_publica_gestion(uuid, timestamptz)
to service_role;

revoke all on function public.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
from public, anon;
grant execute on function public.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
to authenticated, service_role;
