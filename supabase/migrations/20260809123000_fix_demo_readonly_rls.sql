-- Replace the permissive demo write policies with a restrictive guard.
-- Permissive policies are OR-combined, so "NOT is_demo_user()" granted
-- every non-demo authenticated user write access across restaurant tenants.

do $$
declare
  target record;
begin
  for target in
    select distinct tablename
    from pg_policies
    where schemaname = 'public'
      and policyname like 'demo_readonly_%'
    order by tablename
  loop
    execute format('drop policy if exists demo_readonly_insert on public.%I', target.tablename);
    execute format('drop policy if exists demo_readonly_update on public.%I', target.tablename);
    execute format('drop policy if exists demo_readonly_delete on public.%I', target.tablename);
    execute format('drop policy if exists demo_write_guard on public.%I', target.tablename);
    execute format(
      'create policy demo_write_guard on public.%I as restrictive for all to authenticated using ((select not public.is_demo_user())) with check ((select not public.is_demo_user()))',
      target.tablename
    );
  end loop;
end
$$;
