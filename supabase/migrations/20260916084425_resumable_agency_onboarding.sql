-- Additive: the previous deployed API remains compatible. No real rows are removed.
create table public.agency_onboarding_requests (
  request_id uuid primary key,
  admin_user_id uuid not null references auth.users(id),
  payload_hash text not null,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  invitation_id uuid not null references public.restaurant_invitations(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.agency_onboarding_requests enable row level security;
revoke all on public.agency_onboarding_requests from public, anon, authenticated;
grant all on public.agency_onboarding_requests to service_role;
create index agency_onboarding_requests_admin_idx on public.agency_onboarding_requests(admin_user_id);
create index agency_onboarding_requests_restaurant_idx on public.agency_onboarding_requests(restaurante_id);
create index agency_onboarding_requests_invitation_idx on public.agency_onboarding_requests(invitation_id);

alter table public.restaurant_invitations
  add column delivery_status text not null default 'not_requested'
    check (delivery_status in ('not_requested','sending','accepted','failed','uncertain')),
  add column delivery_attempts integer not null default 0,
  add column delivery_attempted_at timestamptz,
  add column delivery_error text,
  add column delivery_lock uuid;

create function public.admin_create_onboarding(p_admin_user_id uuid, p_request_id uuid, p_config jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_existing public.agency_onboarding_requests;
  v_result jsonb;
  v_hash text := encode(extensions.digest(p_config::text,'sha256'),'hex');
begin
  if not exists(select 1 from public.app_admins where user_id=p_admin_user_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,16));
  select * into v_existing from public.agency_onboarding_requests where request_id=p_request_id;
  if found then
    if v_existing.admin_user_id<>p_admin_user_id or v_existing.payload_hash<>v_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return jsonb_build_object('restaurante_id',v_existing.restaurante_id,'invitation_id',v_existing.invitation_id,'replayed',true);
  end if;
  v_result:=public.admin_crear_instalacion_restaurante_v2(p_admin_user_id,p_config);
  insert into public.agency_onboarding_requests(request_id,admin_user_id,payload_hash,restaurante_id,invitation_id)
    values(p_request_id,p_admin_user_id,v_hash,(v_result->>'restaurante_id')::uuid,(v_result->>'invitation_id')::uuid);
  return v_result || jsonb_build_object('replayed',false);
end;
$$;

create function public.admin_claim_invitation(p_admin_user_id uuid,p_restaurante_id uuid,p_retry boolean default false)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_inv public.restaurant_invitations;
  v_lock uuid:=gen_random_uuid();
begin
  if not exists(select 1 from public.app_admins where user_id=p_admin_user_id) then raise exception 'ADMIN_REQUIRED'; end if;
  select * into v_inv from public.restaurant_invitations where restaurante_id=p_restaurante_id order by created_at desc limit 1 for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if v_inv.status='accepted' then return jsonb_build_object('claimed',false,'status','account_ready'); end if;
  if v_inv.status not in ('pending','sent') then raise exception 'INVITATION_NOT_ACTIVE'; end if;
  -- An interrupted send is uncertain. Retrying a create must never resend it.
  if v_inv.delivery_status='sending' and v_inv.delivery_attempted_at < now()-interval '2 minutes' then
    update public.restaurant_invitations set delivery_status='uncertain',delivery_lock=null,delivery_error='RESULT_UNKNOWN' where id=v_inv.id;
    v_inv.delivery_status:='uncertain';
  end if;
  if v_inv.delivery_status='sending'
    or v_inv.delivery_attempted_at > now()-interval '1 minute'
    or (not p_retry and v_inv.delivery_status<>'not_requested') then
    return jsonb_build_object('claimed',false,'status',v_inv.delivery_status);
  end if;
  update public.restaurant_invitations set delivery_status='sending',delivery_lock=v_lock,
    delivery_attempts=delivery_attempts+1,delivery_attempted_at=now(),delivery_error=null where id=v_inv.id;
  return jsonb_build_object('claimed',true,'invitation_id',v_inv.id,'email',v_inv.email,
    'auth_user_id',v_inv.auth_user_id,'lock',v_lock);
end;
$$;

create function public.admin_finish_invitation(p_admin_user_id uuid,p_restaurante_id uuid,p_lock uuid,p_status text,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_count integer;
begin
  if not exists(select 1 from public.app_admins where user_id=p_admin_user_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('accepted','failed','uncertain') then raise exception 'INVALID_DELIVERY_STATUS'; end if;
  update public.restaurant_invitations set delivery_status=p_status,delivery_error=left(p_error,80),delivery_lock=null
    where restaurante_id=p_restaurante_id and delivery_lock=p_lock and delivery_status='sending';
  get diagnostics v_count=row_count;
  return v_count=1;
end;
$$;

revoke all on function public.admin_create_onboarding(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.admin_claim_invitation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.admin_finish_invitation(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.admin_create_onboarding(uuid,uuid,jsonb) to service_role;
grant execute on function public.admin_claim_invitation(uuid,uuid,boolean) to service_role;
grant execute on function public.admin_finish_invitation(uuid,uuid,uuid,text,text) to service_role;
