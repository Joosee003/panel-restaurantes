-- Mantiene las implementaciones privilegiadas fuera del esquema expuesto y
-- publica envoltorios que bloquean cualquier escritura desde una cuenta demo.
create schema if not exists app_private;

revoke all on schema app_private from public, anon, authenticated, service_role;

create or replace function app_private.assert_mutation_allowed()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and auth.uid() is not null
     and exists (
       select 1
       from public.usuarios_restaurantes as ur
       where ur.user_id = auth.uid()
         and ur.demo_vista = true
     )
     and not exists (
       select 1
       from public.app_admins as aa
       where aa.user_id = auth.uid()
     ) then
    raise exception using
      errcode = '42501',
      message = 'DEMO_READ_ONLY';
  end if;
end;
$$;

revoke all on function app_private.assert_mutation_allowed()
from public, anon, authenticated, service_role;

-- Se conservan los cuerpos actuales y sus firmas, pero dejan de ser endpoints
-- directos de PostgREST. Solo los envoltorios públicos pueden ejecutarlos.
alter function public.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
  set schema app_private;
alter function public.registrar_consumo_reserva(uuid, uuid, numeric, text, text)
  set schema app_private;
alter function public.renovar_acceso_mesa_qr(uuid, integer)
  set schema app_private;
alter function public.cerrar_mesa_qr_segura(uuid, uuid[], numeric, numeric, text, text)
  set schema app_private;
alter function public.rpc_confirmar_canje(uuid, uuid)
  set schema app_private;
alter function public.rpc_cancelar_canje(uuid, uuid)
  set schema app_private;

revoke all on function app_private.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function app_private.registrar_consumo_reserva(uuid, uuid, numeric, text, text)
from public, anon, authenticated, service_role;
revoke all on function app_private.renovar_acceso_mesa_qr(uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function app_private.cerrar_mesa_qr_segura(uuid, uuid[], numeric, numeric, text, text)
from public, anon, authenticated, service_role;
revoke all on function app_private.rpc_confirmar_canje(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function app_private.rpc_cancelar_canje(uuid, uuid)
from public, anon, authenticated, service_role;

create function public.guardar_configuracion_web_reservas(
  p_restaurante_id uuid,
  p_web jsonb,
  p_config jsonb,
  p_horarios jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();

  return app_private.guardar_configuracion_web_reservas(
    p_restaurante_id,
    p_web,
    p_config,
    p_horarios
  );
end;
$$;

create function public.registrar_consumo_reserva(
  p_reserva_id uuid,
  p_restaurante_id uuid,
  p_gasto numeric,
  p_metodo_pago text default 'no_indicado'::text,
  p_notas text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();

  return app_private.registrar_consumo_reserva(
    p_reserva_id,
    p_restaurante_id,
    p_gasto,
    p_metodo_pago,
    p_notas
  );
end;
$$;

create function public.renovar_acceso_mesa_qr(
  p_mesa_id uuid,
  p_duracion_horas integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();

  return app_private.renovar_acceso_mesa_qr(
    p_mesa_id,
    p_duracion_horas
  );
end;
$$;

create function public.cerrar_mesa_qr_segura(
  p_mesa_id uuid,
  p_pedidos_ids uuid[],
  p_descuento numeric default 0,
  p_propina numeric default 0,
  p_metodo_pago text default 'tarjeta'::text,
  p_notas text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();

  return app_private.cerrar_mesa_qr_segura(
    p_mesa_id,
    p_pedidos_ids,
    p_descuento,
    p_propina,
    p_metodo_pago,
    p_notas
  );
end;
$$;

create function public.rpc_confirmar_canje(
  p_canje_id uuid,
  p_restaurante_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();
  perform app_private.rpc_confirmar_canje(p_canje_id, p_restaurante_id);
end;
$$;

create function public.rpc_cancelar_canje(
  p_canje_id uuid,
  p_restaurante_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.assert_mutation_allowed();
  perform app_private.rpc_cancelar_canje(p_canje_id, p_restaurante_id);
end;
$$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC de forma predeterminada. Se retira
-- primero y luego se abre solo para los dos roles de aplicación necesarios.
revoke all on function public.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.registrar_consumo_reserva(uuid, uuid, numeric, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.renovar_acceso_mesa_qr(uuid, integer)
from public, anon, authenticated, service_role;
revoke all on function public.cerrar_mesa_qr_segura(uuid, uuid[], numeric, numeric, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.rpc_confirmar_canje(uuid, uuid)
from public, anon, authenticated, service_role;
revoke all on function public.rpc_cancelar_canje(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.guardar_configuracion_web_reservas(uuid, jsonb, jsonb, jsonb)
to authenticated, service_role;
grant execute on function public.registrar_consumo_reserva(uuid, uuid, numeric, text, text)
to authenticated, service_role;
grant execute on function public.renovar_acceso_mesa_qr(uuid, integer)
to authenticated, service_role;
grant execute on function public.cerrar_mesa_qr_segura(uuid, uuid[], numeric, numeric, text, text)
to authenticated, service_role;
grant execute on function public.rpc_confirmar_canje(uuid, uuid)
to authenticated, service_role;
grant execute on function public.rpc_cancelar_canje(uuid, uuid)
to authenticated, service_role;

-- Los propietarios pueden seguir leyendo sus módulos, pero no activar extras.
-- La política app_admin_full_access permanece como única política permisiva de
-- INSERT/UPDATE para el rol authenticated; service_role conserva su bypass RLS.
drop policy if exists insert_modulos_auth_vinculado
on public.restaurante_modulos;

drop policy if exists update_modulos_auth
on public.restaurante_modulos;
