-- Enforce restaurant consistency on new writes. Never repair, delete or reassign existing data.
-- Composite foreign keys also protect against concurrent parent changes.
set lock_timeout = '5s';
set statement_timeout = '45s';

create unique index if not exists tenant_carta_categorias_id_restaurant_key on public.carta_categorias(id,restaurante_id);
create unique index if not exists tenant_cartas_digitales_id_restaurant_key on public.cartas_digitales(id,restaurante_id);
create unique index if not exists tenant_chatbot_sessions_id_restaurant_key on public.chatbot_sessions(id,restaurante_id);
create unique index if not exists tenant_clientes_id_restaurant_key on public.clientes(id,restaurante_id);
create unique index if not exists tenant_cupones_id_restaurant_key on public.cupones(id,restaurante_id);
create unique index if not exists tenant_opiniones_qr_id_restaurant_key on public.opiniones_qr(id,restaurante_id);
create unique index if not exists tenant_platos_id_restaurant_key on public.platos(id,restaurante_id);
create unique index if not exists tenant_premios_puntos_id_restaurant_key on public.premios_puntos(id,restaurante_id);
create unique index if not exists tenant_reservas_id_restaurant_key on public.reservas(id,restaurante_id);
create unique index if not exists tenant_restaurant_invitations_id_restaurant_key on public.restaurant_invitations(id,restaurante_id);
create unique index if not exists tenant_sala_mesas_id_restaurant_key on public.sala_mesas(id,restaurante_id);
create unique index if not exists tenant_sala_zonas_id_restaurant_key on public.sala_zonas(id,restaurante_id);
alter table public.acciones_restaurante add constraint tenant_acciones_restaurante_reserva_id_fkey foreign key (reserva_id,restaurante_id) references public.reservas(id,restaurante_id) on delete set null (reserva_id) not valid;
alter table public.acciones_restaurante validate constraint tenant_acciones_restaurante_reserva_id_fkey;
alter table public.agency_onboarding_requests add constraint tenant_agency_onboarding_requests_invitation_id_fkey foreign key (invitation_id,restaurante_id) references public.restaurant_invitations(id,restaurante_id) on delete cascade not valid;
alter table public.agency_onboarding_requests validate constraint tenant_agency_onboarding_requests_invitation_id_fkey;
alter table public.canjes_puntos add constraint tenant_canjes_puntos_premio_id_fkey foreign key (premio_id,restaurante_id) references public.premios_puntos(id,restaurante_id) on delete restrict not valid;
alter table public.canjes_puntos validate constraint tenant_canjes_puntos_premio_id_fkey;
alter table public.carta_categorias add constraint tenant_carta_categorias_carta_id_fkey foreign key (carta_id,restaurante_id) references public.cartas_digitales(id,restaurante_id) on delete cascade not valid;
alter table public.carta_categorias validate constraint tenant_carta_categorias_carta_id_fkey;
alter table public.carta_productos add constraint tenant_carta_productos_categoria_id_fkey foreign key (categoria_id,restaurante_id) references public.carta_categorias(id,restaurante_id) on delete set null (categoria_id) not valid;
alter table public.carta_productos validate constraint tenant_carta_productos_categoria_id_fkey;
alter table public.carta_productos add constraint tenant_carta_productos_carta_id_fkey foreign key (carta_id,restaurante_id) references public.cartas_digitales(id,restaurante_id) on delete cascade not valid;
alter table public.carta_productos validate constraint tenant_carta_productos_carta_id_fkey;
alter table public.chatbot_messages add constraint tenant_chatbot_messages_session_id_fkey foreign key (session_id,restaurante_id) references public.chatbot_sessions(id,restaurante_id) on delete cascade not valid;
alter table public.chatbot_messages validate constraint tenant_chatbot_messages_session_id_fkey;
alter table public.chatbot_sessions add constraint tenant_chatbot_sessions_selected_reservation_id_fkey foreign key (selected_reservation_id,restaurante_id) references public.reservas(id,restaurante_id) on delete set null (selected_reservation_id) not valid;
alter table public.chatbot_sessions validate constraint tenant_chatbot_sessions_selected_reservation_id_fkey;
alter table public.cierres_mesa_qr add constraint tenant_cierres_mesa_qr_mesa_id_fkey foreign key (mesa_id,restaurante_id) references public.sala_mesas(id,restaurante_id) on delete set null (mesa_id) not valid;
alter table public.cierres_mesa_qr validate constraint tenant_cierres_mesa_qr_mesa_id_fkey;
alter table public.cliente_comunicaciones_consentimiento add constraint tenant_cliente_comunicaciones_consentimiento_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete cascade not valid;
alter table public.cliente_comunicaciones_consentimiento validate constraint tenant_cliente_comunicaciones_consentimiento_cliente_id_fkey;
alter table public.cliente_notificaciones add constraint tenant_cliente_notificaciones_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete cascade not valid;
alter table public.cliente_notificaciones validate constraint tenant_cliente_notificaciones_cliente_id_fkey;
alter table public.clientes_historial add constraint tenant_clientes_historial_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete cascade not valid;
alter table public.clientes_historial validate constraint tenant_clientes_historial_cliente_id_fkey;
alter table public.cupon_cliente add constraint tenant_cupon_cliente_cupon_id_fkey foreign key (cupon_id,restaurante_id) references public.cupones(id,restaurante_id) on delete cascade not valid;
alter table public.cupon_cliente validate constraint tenant_cupon_cliente_cupon_id_fkey;
alter table public.menus_dia_qr add constraint tenant_menus_dia_qr_carta_id_fkey foreign key (carta_id,restaurante_id) references public.cartas_digitales(id,restaurante_id) on delete cascade not valid;
alter table public.menus_dia_qr validate constraint tenant_menus_dia_qr_carta_id_fkey;
alter table public.opinion_alertas add constraint tenant_opinion_alertas_opinion_id_fkey foreign key (opinion_id,restaurante_id) references public.opiniones_qr(id,restaurante_id) on delete cascade not valid;
alter table public.opinion_alertas validate constraint tenant_opinion_alertas_opinion_id_fkey;
alter table public.opinion_eventos add constraint tenant_opinion_eventos_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete set null (cliente_id) not valid;
alter table public.opinion_eventos validate constraint tenant_opinion_eventos_cliente_id_fkey;
alter table public.opinion_eventos add constraint tenant_opinion_eventos_reserva_id_fkey foreign key (reserva_id,restaurante_id) references public.reservas(id,restaurante_id) on delete set null (reserva_id) not valid;
alter table public.opinion_eventos validate constraint tenant_opinion_eventos_reserva_id_fkey;
alter table public.pedidos_qr add constraint tenant_pedidos_qr_carta_id_fkey foreign key (carta_id,restaurante_id) references public.cartas_digitales(id,restaurante_id) on delete set null (carta_id) not valid;
alter table public.pedidos_qr validate constraint tenant_pedidos_qr_carta_id_fkey;
alter table public.pedidos_qr add constraint tenant_pedidos_qr_mesa_id_fkey foreign key (mesa_id,restaurante_id) references public.sala_mesas(id,restaurante_id) on delete set null (mesa_id) not valid;
alter table public.pedidos_qr validate constraint tenant_pedidos_qr_mesa_id_fkey;
alter table public.reserva_mesa_historial add constraint tenant_reserva_mesa_historial_reserva_id_fkey foreign key (reserva_id,restaurante_id) references public.reservas(id,restaurante_id) on delete set null (reserva_id) not valid;
alter table public.reserva_mesa_historial validate constraint tenant_reserva_mesa_historial_reserva_id_fkey;
alter table public.reserva_mesa_historial add constraint tenant_reserva_mesa_historial_mesa_nueva_id_fkey foreign key (mesa_nueva_id,restaurante_id) references public.sala_mesas(id,restaurante_id) on delete set null (mesa_nueva_id) not valid;
alter table public.reserva_mesa_historial validate constraint tenant_reserva_mesa_historial_mesa_nueva_id_fkey;
alter table public.reserva_mesa_historial add constraint tenant_reserva_mesa_historial_mesa_anterior_id_fkey foreign key (mesa_anterior_id,restaurante_id) references public.sala_mesas(id,restaurante_id) on delete set null (mesa_anterior_id) not valid;
alter table public.reserva_mesa_historial validate constraint tenant_reserva_mesa_historial_mesa_anterior_id_fkey;
alter table public.reservas add constraint tenant_reservas_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) not valid;
alter table public.reservas validate constraint tenant_reservas_cliente_id_fkey;
alter table public.reservas add constraint tenant_reservas_mesa_id_fkey foreign key (mesa_id,restaurante_id) references public.sala_mesas(id,restaurante_id) on delete set null (mesa_id) not valid;
alter table public.reservas validate constraint tenant_reservas_mesa_id_fkey;
alter table public.reservation_webhook_deliveries add constraint tenant_reservation_webhook_deliveries_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete set null (cliente_id) not valid;
alter table public.reservation_webhook_deliveries validate constraint tenant_reservation_webhook_deliveries_cliente_id_fkey;
alter table public.reservation_webhook_deliveries add constraint tenant_reservation_webhook_deliveries_reservation_id_fkey foreign key (reservation_id,restaurante_id) references public.reservas(id,restaurante_id) on delete cascade not valid;
alter table public.reservation_webhook_deliveries validate constraint tenant_reservation_webhook_deliveries_reservation_id_fkey;
alter table public.sala_mesas add constraint tenant_sala_mesas_zona_id_fkey foreign key (zona_id,restaurante_id) references public.sala_zonas(id,restaurante_id) on delete set null (zona_id) not valid;
alter table public.sala_mesas validate constraint tenant_sala_mesas_zona_id_fkey;
alter table public.ventas_platos add constraint tenant_ventas_platos_plato_id_fkey foreign key (plato_id,restaurante_id) references public.platos(id,restaurante_id) on delete cascade not valid;
alter table public.ventas_platos validate constraint tenant_ventas_platos_plato_id_fkey;
alter table public.visit_review_requests add constraint tenant_visit_review_requests_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) on delete cascade not valid;
alter table public.visit_review_requests validate constraint tenant_visit_review_requests_cliente_id_fkey;
alter table public.visit_review_requests add constraint tenant_visit_review_requests_reserva_id_fkey foreign key (reserva_id,restaurante_id) references public.reservas(id,restaurante_id) on delete cascade not valid;
alter table public.visit_review_requests validate constraint tenant_visit_review_requests_reserva_id_fkey;
alter table public.cupon_cliente add constraint tenant_cupon_cliente_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) not valid;
alter table public.cupon_cliente validate constraint tenant_cupon_cliente_cliente_id_fkey;
alter table public.canjes_puntos add constraint tenant_canjes_puntos_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) not valid;
alter table public.canjes_puntos validate constraint tenant_canjes_puntos_cliente_id_fkey;
alter table public.puntos_movimientos add constraint tenant_puntos_movimientos_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) not valid;
alter table public.puntos_movimientos validate constraint tenant_puntos_movimientos_cliente_id_fkey;
alter table public.puntos_saldos add constraint tenant_puntos_saldos_cliente_id_fkey foreign key (cliente_id,restaurante_id) references public.clientes(id,restaurante_id) not valid;
alter table public.clientes_historial add constraint tenant_clientes_historial_reserva_id_fkey foreign key (reserva_id,restaurante_id) references public.reservas(id,restaurante_id) not valid;
alter table public.clientes_historial validate constraint tenant_clientes_historial_reserva_id_fkey;
-- Preflight found two existing balances without a customer. Keep them unchanged for owner review.
comment on constraint tenant_puntos_saldos_cliente_id_fkey on public.puntos_saldos is 'Enforces all new writes; validation pending review of two pre-existing orphan balances. Do not delete or reassign them automatically.';

create or replace function app_private.enforce_recipe_restaurant()
returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid;
begin
  select restaurante_id into a from public.platos where id=new.plato_id for key share;
  select restaurante_id into b from public.ingredientes where id=new.ingrediente_id for key share;
  if a is null or b is null or a is distinct from b then
    raise exception using errcode='23514', message='RESTAURANT_RELATION_MISMATCH';
  end if;
  return new;
end $$;
create or replace function app_private.enforce_order_item_restaurant()
returns trigger language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid;
begin
  if new.producto_id is null then return new; end if;
  select restaurante_id into a from public.pedidos_qr where id=new.pedido_id for key share;
  select restaurante_id into b from public.carta_productos where id=new.producto_id for key share;
  if a is null or b is null or a is distinct from b then
    raise exception using errcode='23514', message='RESTAURANT_RELATION_MISMATCH';
  end if;
  return new;
end $$;
create or replace function app_private.prevent_restaurant_reassignment()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.restaurante_id is distinct from old.restaurante_id then
    raise exception using errcode='23514', message='RESTAURANT_REASSIGNMENT_NOT_ALLOWED';
  end if;
  return new;
end $$;
revoke all on function app_private.enforce_recipe_restaurant() from public,anon,authenticated;
revoke all on function app_private.enforce_order_item_restaurant() from public,anon,authenticated;
revoke all on function app_private.prevent_restaurant_reassignment() from public,anon,authenticated;
create trigger tenant_recipe_relation before insert or update of plato_id,ingrediente_id on public.plato_ingredientes for each row execute function app_private.enforce_recipe_restaurant();
create trigger tenant_order_item_relation before insert or update of pedido_id,producto_id on public.pedido_qr_items for each row execute function app_private.enforce_order_item_restaurant();
-- These parents serve children without a redundant restaurant column. Keeping
-- their restaurant fixed makes both direction checks hold under concurrency.
create trigger tenant_restaurant_immutable before update of restaurante_id on public.platos for each row execute function app_private.prevent_restaurant_reassignment();
create trigger tenant_restaurant_immutable before update of restaurante_id on public.ingredientes for each row execute function app_private.prevent_restaurant_reassignment();
create trigger tenant_restaurant_immutable before update of restaurante_id on public.pedidos_qr for each row execute function app_private.prevent_restaurant_reassignment();
create trigger tenant_restaurant_immutable before update of restaurante_id on public.carta_productos for each row execute function app_private.prevent_restaurant_reassignment();
-- Storage ownership policies previously allowed demo users to write images.
-- A restrictive guard keeps the public menu/reward images readable.
create policy demo_storage_insert_guard on storage.objects as restrictive for insert to authenticated with check (not public.is_demo_user());
create policy demo_storage_update_guard on storage.objects as restrictive for update to authenticated using (not public.is_demo_user()) with check (not public.is_demo_user());
create policy demo_storage_delete_guard on storage.objects as restrictive for delete to authenticated using (not public.is_demo_user());
