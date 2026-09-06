drop policy if exists app_admin_full_access on public.pedido_qr_items;
create policy app_admin_full_access
on public.pedido_qr_items
for all
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

comment on policy app_admin_full_access on public.pedido_qr_items
is 'Allows GastroHelp application administrators to inspect and manage QR order items across restaurants.';
