-- A private live route uses the existing phone allowlist and creates real bookings.
-- No routes are activated by this schema migration, and browser grants stay closed.
alter table public.whatsapp_restaurant_routes
  drop constraint whatsapp_restaurant_routes_delivery_mode_check;
alter table public.whatsapp_restaurant_routes
  add constraint whatsapp_restaurant_routes_delivery_mode_check
  check (delivery_mode in ('pilot','live','private_live'));

comment on column public.whatsapp_restaurant_routes.delivery_mode is
  'pilot: allowlisted simulation; private_live: allowlisted real reservations; live: public production. Demo readiness is checked by the server.';
