-- Owner notices reuse the original reservation automation events. This
-- migration is prepared in the isolated checkout and applied only to local QA.
create table if not exists public.restaurant_owner_notice_config (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  email text not null check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  enabled boolean not null default false,
  mobile_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_owner_notice_deliveries (
  event_id text primary key references public.reservation_webhook_deliveries(event_id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  reservation_id uuid not null,
  event_type text not null,
  status text not null default 'pending'
    check (status in ('pending','processing','retrying','delivered','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lock_token uuid,
  locked_at timestamptz,
  last_error text,
  smtp_message_id text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists owner_notice_due_idx
  on public.restaurant_owner_notice_deliveries(next_attempt_at,created_at)
  where status in ('pending','retrying');

alter table public.restaurant_owner_notice_config enable row level security;
alter table public.restaurant_owner_notice_deliveries enable row level security;
revoke all on public.restaurant_owner_notice_config from public, anon, authenticated;
revoke all on public.restaurant_owner_notice_deliveries from public, anon, authenticated;
grant select, insert, update on public.restaurant_owner_notice_config to service_role;
grant select, insert, update on public.restaurant_owner_notice_deliveries to service_role;

create or replace function app_private.enqueue_owner_reservation_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event_type not in ('reservation.created','reservation.rescheduled',
    'reservation.cancelled','reservation.status_changed') or new.reservation_id is null then
    return new;
  end if;
  if exists (
    select 1 from public.restaurant_owner_notice_config c
    where c.restaurante_id = new.restaurante_id and c.enabled
  ) then
    insert into public.restaurant_owner_notice_deliveries
      (event_id,restaurante_id,reservation_id,event_type)
    values (new.event_id,new.restaurante_id,new.reservation_id,new.event_type)
    on conflict (event_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enqueue_owner_reservation_notice() from public, anon, authenticated;
drop trigger if exists enqueue_owner_reservation_notice on public.reservation_webhook_deliveries;
create trigger enqueue_owner_reservation_notice after insert
on public.reservation_webhook_deliveries for each row
execute function app_private.enqueue_owner_reservation_notice();

create or replace function public.claim_owner_reservation_notices(p_limit integer default 10)
returns setof public.restaurant_owner_notice_deliveries
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with due as (
    select d.event_id from public.restaurant_owner_notice_deliveries d
    where (d.status in ('pending','retrying') and d.next_attempt_at <= now())
       or (d.status = 'processing' and d.locked_at < now() - interval '5 minutes')
    order by d.next_attempt_at,d.created_at
    for update skip locked
    limit least(greatest(coalesce(p_limit,10),1),20)
  )
  update public.restaurant_owner_notice_deliveries d
  set status='processing', attempts=d.attempts+1, lock_token=gen_random_uuid(),
      locked_at=now(), updated_at=now()
  from due where d.event_id=due.event_id
  returning d.*;
end;
$$;
revoke all on function public.claim_owner_reservation_notices(integer) from public, anon, authenticated;
grant execute on function public.claim_owner_reservation_notices(integer) to service_role;

create or replace function public.complete_owner_reservation_notice(
  p_event_id text, p_lock_token uuid, p_success boolean,
  p_message_id text default null, p_error text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  update public.restaurant_owner_notice_deliveries d
  set status=case when p_success then 'delivered'
                  when d.attempts >= 8 then 'failed' else 'retrying' end,
      delivered_at=case when p_success then now() else null end,
      next_attempt_at=case when p_success then d.next_attempt_at
        else now() + make_interval(mins => least(5 * power(2,d.attempts-1)::integer,360)) end,
      smtp_message_id=case when p_success then left(p_message_id,255) else d.smtp_message_id end,
      last_error=case when p_success then null else left(coalesce(p_error,'delivery_failed'),500) end,
      lock_token=null,locked_at=null,updated_at=now()
  where d.event_id=p_event_id and d.status='processing' and d.lock_token=p_lock_token
  returning attempts into v_attempts;
  return found;
end;
$$;
revoke all on function public.complete_owner_reservation_notice(text,uuid,boolean,text,text)
  from public, anon, authenticated;
grant execute on function public.complete_owner_reservation_notice(text,uuid,boolean,text,text)
  to service_role;
