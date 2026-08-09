create table if not exists public.private_integration_endpoints (
  key text primary key,
  url text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint private_integration_endpoints_https_check
    check (url ~ '^https://n8n[.]gastrohelp[.]es/webhook/')
);

alter table public.private_integration_endpoints enable row level security;

revoke all on public.private_integration_endpoints from public, anon, authenticated;
grant select on public.private_integration_endpoints to service_role;

insert into public.private_integration_endpoints (key, url, active)
values (
  'native_booking_webhook',
  'https://n8n.gastrohelp.es/webhook/gh-reservas-a291d7ee7e9d54e53d761579aba8735ab99410b8694426e8',
  true
)
on conflict (key) do update
set url = excluded.url,
    active = excluded.active,
    updated_at = now();
