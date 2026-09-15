-- The server validates the input and identity; only service_role can call this transaction.
-- Reuse the existing invitation workflow, then prepare only the purchased services.
create or replace function public.admin_crear_instalacion_restaurante_v2(p_admin_user_id uuid, p_config jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_result jsonb;
  v_id uuid;
  v_channel uuid := gen_random_uuid();
  v_email text := lower(trim(p_config->>'email'));
  v_reputation boolean := coalesce((p_config->>'activarReputacion')::boolean,false);
  v_reservas boolean := coalesce((p_config->>'activarReservas')::boolean,false);
  v_clientes boolean := coalesce((p_config->>'activarClientes')::boolean,false);
  v_resenas boolean := coalesce((p_config->>'activarResenas')::boolean,false);
  v_chatbot boolean := coalesce((p_config->>'activarChatbot')::boolean,false);
  v_camarero boolean := coalesce((p_config->>'activarCamarero')::boolean,false);
  v_carta boolean := coalesce((p_config->>'activarMenuDigital')::boolean,false);
  v_fidelizacion boolean := coalesce((p_config->>'activarFidelizacion')::boolean,false);
  v_automatizaciones boolean := coalesce((p_config->>'activarAutomatizaciones')::boolean,false);
  v_timezone text := coalesce(p_config->>'zonaHoraria','Europe/Madrid');
  v_google text := nullif(trim(p_config->>'googleReviewUrl'),'');
begin
  if not exists(select 1 from public.app_admins where user_id=p_admin_user_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if (v_chatbot or v_resenas) and not (v_reservas and v_clientes)
    or v_camarero and not v_carta or v_fidelizacion and not v_clientes
    or v_automatizaciones and not v_reservas then raise exception 'INVALID_SERVICE_DEPENDENCIES'; end if;
  if v_timezone not in ('Europe/Madrid','Atlantic/Canary') then raise exception 'INVALID_TIMEZONE'; end if;
  if not(v_reputation or v_reservas or v_clientes or v_resenas or v_chatbot or v_camarero or v_carta or v_fidelizacion or coalesce((p_config->>'activarMetricas')::boolean,false)) then raise exception 'NO_SERVICES'; end if;
  -- Serialize competing submissions for the same email. The original function rejects duplicates.
  perform pg_advisory_xact_lock(hashtextextended(v_email, 0));
  v_result := public.admin_crear_instalacion_restaurante(
    p_admin_user_id => p_admin_user_id, p_nombre => p_config->>'nombre',
    p_telefono => p_config->>'telefono', p_direccion => p_config->>'direccion', p_email => v_email,
    p_capacidad => (p_config->>'capacidad')::integer, p_mesas => (p_config->>'mesas')::integer,
    p_plan => p_config->>'plan', p_carta_nombre => p_config->>'cartaNombre',
    p_reservas => v_reservas, p_clientes => v_clientes, p_resenas => v_resenas,
    p_fidelizacion => v_fidelizacion, p_metricas => (p_config->>'activarMetricas')::boolean,
    p_chatbot => v_chatbot, p_camarero_digital => v_camarero,
    p_menu_digital => v_carta, p_automatizaciones => v_automatizaciones
  );
  v_id := (v_result->>'restaurante_id')::uuid;
  -- Remove the legacy demonstration menu inside this transaction, before the new account is visible.
  delete from public.menus_dia_qr where restaurante_id=v_id;
  if not (v_carta or v_camarero) then
    delete from public.cartas_digitales where restaurante_id=v_id;
  end if;
  if not(v_reservas or v_camarero) then
    delete from public.sala_mesas where restaurante_id=v_id;
    delete from public.sala_zonas where restaurante_id=v_id;
  end if;
  update public.restaurantes set google_review_url=v_google where id=v_id;
  update public.reservas_config set zona_horaria=v_timezone, capacidad_por_turno=(p_config->>'capacidad')::integer,
    activo=false where restaurante_id=v_id;
  update public.automatizaciones_config set enabled=false, delivery_mode='test',
    review_enabled=v_resenas, whatsapp_enabled=v_chatbot, email_enabled=false where restaurante_id=v_id;
  if v_reputation then
    insert into public.opinion_config(restaurante_id,slug,google_review_url,active,seo_keywords,auto_open_google)
    select id,slug,coalesce(v_google,''),true,'[]'::jsonb,false from public.restaurantes where id=v_id;
  end if;
  if v_chatbot or v_resenas then
    insert into public.whatsapp_channels(id,restaurante_id,session_name,status,enabled,chatbot_enabled,reviews_enabled)
    values(v_channel,v_id,'gh_'||replace(v_channel::text,'-',''),'STOPPED',false,false,false);
  end if;
  -- Assert the structural records expected by the app instead of returning a partial success.
  if not exists(select 1 from public.reservas_config where restaurante_id=v_id)
    or not exists(select 1 from public.restaurante_webs where restaurante_id=v_id and publicada=false)
    or not exists(select 1 from public.automatizaciones_config where restaurante_id=v_id and enabled=false)
    or not exists(select 1 from public.restaurante_modulos where restaurante_id=v_id) then
    raise exception 'INSTALLATION_INCOMPLETE';
  end if;
  return jsonb_build_object('restaurante_id',v_id,'invitation_id',v_result->>'invitation_id');
end;
$$;
revoke all on function public.admin_crear_instalacion_restaurante_v2(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_crear_instalacion_restaurante_v2(uuid,jsonb) to service_role;
