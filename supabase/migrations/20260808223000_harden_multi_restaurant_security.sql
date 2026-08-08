-- Retira el bootstrap temporal de reputación y endurece los helpers usados por RLS.
-- La ruta HTTP asociada se elimina en el mismo cambio de aplicación.

drop function if exists public.activate_reputation_access(text);

alter function public.can_manage_opinion_restaurant(uuid)
  set search_path = '';

revoke execute on function public.can_manage_opinion_restaurant(uuid) from public, anon;
grant execute on function public.can_manage_opinion_restaurant(uuid) to authenticated, service_role;

revoke execute on function public.puede_acceder_restaurante(uuid) from public, anon;
grant execute on function public.puede_acceder_restaurante(uuid) to authenticated, service_role;

revoke execute on function public.user_can_access_restaurant(uuid) from public, anon;
grant execute on function public.user_can_access_restaurant(uuid) to authenticated, service_role;

revoke execute on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated, service_role;

-- Defensa adicional: cualquier tabla de negocio con restaurante_id debe usar RLS.
do $migration$
declare
  target record;
begin
  for target in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema
     and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'restaurante_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', target.table_name);
  end loop;
end
$migration$;
