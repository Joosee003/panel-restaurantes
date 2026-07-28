-- Acceso aislado para GastroHelp Reputation Suite.

create table if not exists public.opinion_usuarios_restaurantes (
  user_id uuid not null references auth.users(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  role text not null default 'restaurante'
    check (role in ('restaurante','gastrohelp_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, restaurante_id)
);

alter table public.opinion_usuarios_restaurantes enable row level security;

drop policy if exists opinion_user_self_select
  on public.opinion_usuarios_restaurantes;
create policy opinion_user_self_select
on public.opinion_usuarios_restaurantes
for select to authenticated
using (user_id = auth.uid() or public.is_app_admin());

grant select on public.opinion_usuarios_restaurantes to authenticated;

create or replace function public.can_manage_opinion_restaurant(
  p_restaurante_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_app_admin()
    or exists (
      select 1
      from public.opinion_usuarios_restaurantes our
      where our.user_id = auth.uid()
        and our.restaurante_id = p_restaurante_id
        and our.active = true
    );
$$;

revoke all on function public.can_manage_opinion_restaurant(uuid) from public;
grant execute on function public.can_manage_opinion_restaurant(uuid)
  to authenticated;

create or replace function public.activate_reputation_access(p_slug text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_restaurante_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email <> 'reputacion@gastrohelp.es' then
    raise exception 'Cuenta no autorizada para activar este acceso';
  end if;

  select restaurante_id into v_restaurante_id
  from public.opinion_config
  where slug = lower(trim(p_slug))
    and active = true
  limit 1;

  if v_restaurante_id is null then
    raise exception 'Restaurante no encontrado';
  end if;

  insert into public.opinion_usuarios_restaurantes(
    user_id,
    restaurante_id,
    role,
    active
  )
  values (
    auth.uid(),
    v_restaurante_id,
    'restaurante',
    true
  )
  on conflict (user_id, restaurante_id)
  do update set active = true, role = 'restaurante';

  return true;
end;
$$;

revoke all on function public.activate_reputation_access(text) from public;
grant execute on function public.activate_reputation_access(text)
  to authenticated;
