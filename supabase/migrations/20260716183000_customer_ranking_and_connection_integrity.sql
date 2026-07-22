-- Unifica las metricas de clientes y separa las reservas nativas de Amelia.

alter table public.fidelizacion_config
  add column if not exists nivel_maestro_desde integer not null default 20;

alter table public.fidelizacion_config
  drop constraint if exists fidelizacion_config_niveles_orden_check;

alter table public.fidelizacion_config
  add constraint fidelizacion_config_niveles_orden_check check (
    nivel_frecuente_desde >= 1
    and nivel_habitual_desde > nivel_frecuente_desde
    and nivel_vip_desde > nivel_habitual_desde
    and nivel_maestro_desde > nivel_vip_desde
  );

create index if not exists clientes_historial_ranking_idx
  on public.clientes_historial (restaurante_id, cliente_id, tipo, created_at desc)
  include (gasto_eur);

create or replace view public.vw_clientes_resumen
with (security_invoker = true)
as
with reservas_agrupadas as (
  select
    r.restaurante_id,
    r.cliente_id,
    count(*)::bigint as total_reservas,
    count(*) filter (
      where lower(coalesce(r.estado, '')) = 'cancelada'
    )::bigint as total_canceladas_reales,
    count(*) filter (where r.atendida = true)::bigint as total_atendidas,
    count(*) filter (where r.atendida = false)::bigint as total_no_shows_reales,
    min(r.fecha_hora_reserva) filter (
      where r.fecha_hora_reserva > now()
        and lower(coalesce(r.estado, '')) in ('confirmada', 'pendiente')
    ) as proxima_reserva
  from public.reservas r
  where r.cliente_id is not null
  group by r.restaurante_id, r.cliente_id
),
historial_agrupado as (
  select
    h.restaurante_id,
    h.cliente_id,
    count(*) filter (where h.tipo = 'visita')::bigint as visitas_historial,
    coalesce(sum(h.gasto_eur) filter (where h.tipo = 'visita'), 0)::numeric as gasto_total,
    min(h.created_at) filter (where h.tipo = 'visita') as primera_visita_historial,
    max(h.created_at) filter (where h.tipo = 'visita') as ultima_visita_historial
  from public.clientes_historial h
  group by h.restaurante_id, h.cliente_id
),
metricas as (
  select
    c.id,
    c.restaurante_id,
    c.nombre,
    c.telefono,
    c.email,
    c.fecha_nacimiento,
    c.visitas_totales,
    c.primera_visita,
    c.ultima_visita,
    c.origen_principal,
    c.canal_contacto,
    c.ya_dejo_resena,
    c.public_token,
    c.puntos_totales,
    c.created_at,
    c.updated_at,
    c.notas_internas,
    c.etiquetas,
    c.permite_whatsapp,
    c.permite_email,
    c.no_show_total,
    c.cancelaciones_totales,
    coalesce(r.total_reservas, 0)::bigint as total_reservas,
    coalesce(r.total_canceladas_reales, 0)::bigint as total_canceladas_reales,
    coalesce(r.total_atendidas, 0)::bigint as total_atendidas,
    r.proxima_reserva,
    coalesce(r.total_no_shows_reales, 0)::bigint as total_no_shows_reales,
    greatest(
      coalesce(c.visitas_totales, 0)::bigint,
      coalesce(r.total_atendidas, 0)::bigint,
      coalesce(h.visitas_historial, 0)::bigint
    ) as visitas_reales,
    coalesce(h.visitas_historial, 0)::bigint as visitas_historial,
    coalesce(h.gasto_total, 0)::numeric as gasto_total,
    coalesce(ps.puntos, c.puntos_totales, 0)::integer as puntos_disponibles,
    coalesce(c.primera_visita, h.primera_visita_historial::timestamp) as primera_visita_real,
    case
      when c.ultima_visita is null and h.ultima_visita_historial is null then null
      else greatest(
        coalesce(c.ultima_visita, '-infinity'::timestamp),
        coalesce(h.ultima_visita_historial::timestamp, '-infinity'::timestamp)
      )
    end as ultima_visita_real
  from public.clientes c
  left join reservas_agrupadas r
    on r.restaurante_id = c.restaurante_id
   and r.cliente_id = c.id
  left join historial_agrupado h
    on h.restaurante_id = c.restaurante_id
   and h.cliente_id = c.id
  left join public.puntos_saldos ps
    on ps.restaurante_id = c.restaurante_id
   and ps.cliente_id = c.id
)
select
  m.*,
  dense_rank() over (
    partition by m.restaurante_id
    order by
      m.visitas_reales desc,
      m.gasto_total desc,
      m.puntos_disponibles desc,
      m.created_at asc nulls last,
      m.id
  )::bigint as ranking_posicion
from metricas m;

revoke all on public.vw_clientes_resumen from anon;
grant select on public.vw_clientes_resumen to authenticated;

-- Las reservas nativas ya envian sus avisos desde la API de Next. El trigger
-- antiguo queda reservado a reservas historicas de Amelia para evitar dobles
-- correos y dobles actualizaciones.
create or replace function public.notify_reserva_estado_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if new.estado is distinct from old.estado
     and coalesce(new.origen, '') not in ('web_publica', 'panel_nativo') then
    begin
      perform net.http_post(
        url := 'https://n8n.gastrohelp.es/webhook/reserva-estado-cambiado',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'reserva_id', new.id,
          'estado', new.estado
        )
      );
    exception
      when others then
        null;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_email_estado_reserva on public.reservas;
drop trigger if exists after_reserva_atendida on public.reservas;

-- Estas funciones solo se consumen desde rutas de servidor con service_role.
-- No se exponen como RPC publicas directas.
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('public.crear_reserva_publica(text,timestamptz,integer,text,text,text,text,uuid)'),
    to_regprocedure('public.obtener_disponibilidad_reservas(text,date,integer,uuid)'),
    to_regprocedure('public.obtener_reserva_publica_gestion(uuid)'),
    to_regprocedure('public.cancelar_reserva_publica_gestion(uuid)'),
    to_regprocedure('public.reprogramar_reserva_publica_gestion(uuid,timestamptz)'),
    to_regprocedure('public.consumir_limite_reserva_publica(text,integer,integer)')
  ]
  loop
    if fn is not null then
      execute format('revoke all on function %s from public, anon, authenticated', fn);
      execute format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end;
$$;

-- La pantalla de clientes se refresca tambien cuando cambian historial o saldo.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'clientes_historial'
  ) then
    alter publication supabase_realtime add table public.clientes_historial;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'puntos_saldos'
  ) then
    alter publication supabase_realtime add table public.puntos_saldos;
  end if;
end;
$$;
