-- Keep demo users read-only without blocking SELECT queries.
-- A restrictive FOR ALL policy also applies to SELECT, which made the
-- public demo appear empty. Split the guard by write command instead.

do $$
declare
  target record;
begin
  for target in
    select schemaname, tablename
    from pg_policies
    where schemaname = 'public'
      and policyname = 'demo_write_guard'
    order by tablename
  loop
    execute format(
      'drop policy if exists demo_write_guard on %I.%I',
      target.schemaname,
      target.tablename
    );
    execute format(
      'drop policy if exists demo_insert_guard on %I.%I',
      target.schemaname,
      target.tablename
    );
    execute format(
      'drop policy if exists demo_update_guard on %I.%I',
      target.schemaname,
      target.tablename
    );
    execute format(
      'drop policy if exists demo_delete_guard on %I.%I',
      target.schemaname,
      target.tablename
    );

    execute format(
      'create policy demo_insert_guard on %I.%I as restrictive for insert to authenticated with check ((select not public.is_demo_user()))',
      target.schemaname,
      target.tablename
    );
    execute format(
      'create policy demo_update_guard on %I.%I as restrictive for update to authenticated using ((select not public.is_demo_user())) with check ((select not public.is_demo_user()))',
      target.schemaname,
      target.tablename
    );
    execute format(
      'create policy demo_delete_guard on %I.%I as restrictive for delete to authenticated using ((select not public.is_demo_user()))',
      target.schemaname,
      target.tablename
    );
  end loop;
end
$$;
