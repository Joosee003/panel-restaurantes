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

-- El destino contiene un identificador privado y debe configurarse fuera del
-- repositorio, directamente en Supabase, después de crear el webhook en n8n.
