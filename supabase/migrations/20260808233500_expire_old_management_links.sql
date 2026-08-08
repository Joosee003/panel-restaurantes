-- Los enlaces de gestión contienen datos personales y no deben permanecer
-- accesibles indefinidamente. La reserva sigue guardada para el restaurante;
-- solo caduca el acceso público siete días después de la fecha reservada.

update public.reservas r
set gestion_token = null
from public.reservas_config c
where c.restaurante_id = r.restaurante_id
  and r.gestion_token is not null
  and coalesce(
    r.inicio_at,
    r.fecha_hora_reserva at time zone c.zona_horaria
  ) < now() - interval '7 days';

create or replace function public.obtener_reserva_publica_gestion(
  p_gestion_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reserva_id', r.id,
    'gestion_token', r.gestion_token,
    'restaurante_nombre', coalesce(w.nombre_publico, rest.nombre),
    'restaurante_slug', w.slug,
    'restaurante_direccion', w.direccion_publica,
    'restaurante_telefono', w.telefono_publico,
    'restaurante_email', w.email_publico,
    'restaurante_maps_url', w.google_maps_url,
    'zona_horaria', c.zona_horaria,
    'nombre_cliente', r.nombre_cliente,
    'telefono_cliente', r.telefono,
    'email_cliente', r.email,
    'personas', r.personas,
    'inicio_at', coalesce(
      r.inicio_at,
      r.fecha_hora_reserva at time zone c.zona_horaria
    ),
    'fin_at', coalesce(
      r.fin_at,
      (r.fecha_hora_reserva at time zone c.zona_horaria)
        + make_interval(mins => c.duracion_minutos)
    ),
    'estado', r.estado,
    'politica_cancelacion', c.politica_cancelacion,
    'puede_cancelar',
      lower(coalesce(r.estado, '')) not in (
        'cancelada', 'cancelado', 'no-show', 'no_show'
      )
      and coalesce(
        r.inicio_at,
        r.fecha_hora_reserva at time zone c.zona_horaria
      ) >= now() + make_interval(mins => c.cancelacion_minutos),
    'puede_reprogramar',
      c.activo = true
      and w.publicada = true
      and lower(coalesce(r.estado, '')) not in (
        'cancelada', 'cancelado', 'no-show', 'no_show'
      )
      and coalesce(
        r.inicio_at,
        r.fecha_hora_reserva at time zone c.zona_horaria
      ) >= now() + make_interval(mins => c.cancelacion_minutos)
  )
  from public.reservas r
  join public.restaurantes rest on rest.id = r.restaurante_id
  join public.reservas_config c on c.restaurante_id = r.restaurante_id
  left join public.restaurante_webs w on w.restaurante_id = r.restaurante_id
  where r.gestion_token = p_gestion_token
    and coalesce(
      r.inicio_at,
      r.fecha_hora_reserva at time zone c.zona_horaria
    ) >= now() - interval '7 days'
  limit 1;
$$;

revoke execute on function public.obtener_reserva_publica_gestion(uuid)
from public, anon, authenticated;

grant execute on function public.obtener_reserva_publica_gestion(uuid)
to service_role;
