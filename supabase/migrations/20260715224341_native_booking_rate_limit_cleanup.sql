create index if not exists booking_request_limits_updated_at_idx
  on public.booking_request_limits (updated_at);

create or replace function public.consumir_limite_reserva_publica(
  p_key_hash text,
  p_limite integer default 20,
  p_ventana_segundos integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requests integer;
begin
  if length(trim(coalesce(p_key_hash, ''))) < 16
     or p_limite < 1 or p_limite > 1000
     or p_ventana_segundos < 10 or p_ventana_segundos > 86400 then
    return false;
  end if;

  -- La proteccion conserva solo una semana de claves anonimizadas. El indice
  -- hace que esta limpieza sea barata incluso cuando haya muchos restaurantes.
  delete from public.booking_request_limits
  where updated_at < now() - interval '7 days';

  insert into public.booking_request_limits (
    key_hash, window_started_at, requests, updated_at
  ) values (
    p_key_hash, now(), 1, now()
  )
  on conflict (key_hash) do update
  set window_started_at = case
        when public.booking_request_limits.window_started_at
          <= now() - make_interval(secs => p_ventana_segundos)
        then now()
        else public.booking_request_limits.window_started_at
      end,
      requests = case
        when public.booking_request_limits.window_started_at
          <= now() - make_interval(secs => p_ventana_segundos)
        then 1
        else public.booking_request_limits.requests + 1
      end,
      updated_at = now()
  returning requests into v_requests;

  return v_requests <= p_limite;
end;
$$;
