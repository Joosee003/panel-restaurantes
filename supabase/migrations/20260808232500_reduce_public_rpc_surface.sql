-- Reduce la superficie pública de RPC sin romper los flujos públicos vigentes.

-- Versiones antiguas que la aplicación ya no utiliza.
revoke execute on function public.get_opinion_public_config(text)
  from public, anon, authenticated;
revoke execute on function public.submit_opinion_qr(text, integer, text, text, text, uuid, boolean)
  from public, anon, authenticated;

-- Las funciones públicas vigentes usan referencias con esquema explícito.
-- Un search_path vacío evita resolución de objetos manipulables.
alter function public.get_opinion_public_config_v2(text)
  set search_path = '';
alter function public.submit_opinion_qr_v2(text, integer, text, text, text, uuid, boolean, text[], text, text, boolean)
  set search_path = '';
alter function public.track_opinion_event(text, uuid, text, text, integer)
  set search_path = '';
alter function public.get_public_gastrohelp_metrics()
  set search_path = '';

-- Evita que EXECUTE vuelva a quedar concedido a todos por herencia.
revoke execute on function public.get_opinion_public_config_v2(text) from public;
revoke execute on function public.submit_opinion_qr_v2(text, integer, text, text, text, uuid, boolean, text[], text, text, boolean) from public;
revoke execute on function public.track_opinion_event(text, uuid, text, text, integer) from public;
revoke execute on function public.get_public_gastrohelp_metrics() from public;

grant execute on function public.get_opinion_public_config_v2(text) to anon, authenticated;
grant execute on function public.submit_opinion_qr_v2(text, integer, text, text, text, uuid, boolean, text[], text, text, boolean) to anon, authenticated;
grant execute on function public.track_opinion_event(text, uuid, text, text, integer) to anon, authenticated;
grant execute on function public.get_public_gastrohelp_metrics() to anon, authenticated;
