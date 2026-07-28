-- Allow isolated Reputation Suite users to read only the restaurant assigned to them.
-- This does not grant access to the general restaurant panel or to any other restaurant.

drop policy if exists reputation_users_select_restaurant on public.restaurantes;

create policy reputation_users_select_restaurant
on public.restaurantes
for select
to authenticated
using (
  exists (
    select 1
    from public.opinion_usuarios_restaurantes our
    where our.user_id = auth.uid()
      and our.restaurante_id = restaurantes.id
      and our.active = true
  )
);
