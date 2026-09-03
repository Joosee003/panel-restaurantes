create or replace function public.purge_expired_chatbot_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.chatbot_sessions
  where expires_at < now()
    and (locked_until is null or locked_until < now());

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_chatbot_sessions()
  from public, anon, authenticated;
grant execute on function public.purge_expired_chatbot_sessions()
  to service_role;
