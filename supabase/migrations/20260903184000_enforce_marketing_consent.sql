-- Los datos de contacto no equivalen a permiso comercial. Las banderas
-- generales se derivan siempre del registro de consentimiento por finalidad.
alter table public.clientes
  alter column permite_whatsapp set default false,
  alter column permite_email set default false;

create or replace function app_private.enforce_client_contact_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_whatsapp boolean := false;
  v_email boolean := false;
begin
  select
    coalesce(bool_or(c.review_whatsapp or c.loyalty_whatsapp), false),
    coalesce(bool_or(c.review_email or c.loyalty_email), false)
  into v_whatsapp, v_email
  from public.cliente_comunicaciones_consentimiento as c
  where c.restaurante_id = new.restaurante_id
    and c.cliente_id = new.id
    and c.revoked_at is null;

  new.permite_whatsapp := v_whatsapp;
  new.permite_email := v_email;
  return new;
end;
$$;

revoke all on function app_private.enforce_client_contact_permissions()
from public, anon, authenticated, service_role;

drop trigger if exists clientes_enforce_contact_permissions on public.clientes;
create trigger clientes_enforce_contact_permissions
before insert or update of permite_whatsapp, permite_email
on public.clientes
for each row
execute function app_private.enforce_client_contact_permissions();

create or replace function app_private.sync_client_contact_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurante_id uuid;
  v_cliente_id uuid;
begin
  if tg_op = 'DELETE' then
    v_restaurante_id := old.restaurante_id;
    v_cliente_id := old.cliente_id;
  else
    v_restaurante_id := new.restaurante_id;
    v_cliente_id := new.cliente_id;
  end if;

  update public.clientes as cliente
  set permite_whatsapp = exists (
        select 1
        from public.cliente_comunicaciones_consentimiento as c
        where c.restaurante_id = v_restaurante_id
          and c.cliente_id = v_cliente_id
          and c.revoked_at is null
          and (c.review_whatsapp or c.loyalty_whatsapp)
      ),
      permite_email = exists (
        select 1
        from public.cliente_comunicaciones_consentimiento as c
        where c.restaurante_id = v_restaurante_id
          and c.cliente_id = v_cliente_id
          and c.revoked_at is null
          and (c.review_email or c.loyalty_email)
      ),
      updated_at = now()
  where cliente.restaurante_id = v_restaurante_id
    and cliente.id = v_cliente_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function app_private.sync_client_contact_permissions()
from public, anon, authenticated, service_role;

drop trigger if exists consent_sync_client_permissions
on public.cliente_comunicaciones_consentimiento;
create trigger consent_sync_client_permissions
after insert or update or delete
on public.cliente_comunicaciones_consentimiento
for each row
execute function app_private.sync_client_contact_permissions();

-- Retira permisos heredados que no tienen una prueba de consentimiento.
update public.clientes as cliente
set permite_whatsapp = exists (
      select 1
      from public.cliente_comunicaciones_consentimiento as c
      where c.restaurante_id = cliente.restaurante_id
        and c.cliente_id = cliente.id
        and c.revoked_at is null
        and (c.review_whatsapp or c.loyalty_whatsapp)
    ),
    permite_email = exists (
      select 1
      from public.cliente_comunicaciones_consentimiento as c
      where c.restaurante_id = cliente.restaurante_id
        and c.cliente_id = cliente.id
        and c.revoked_at is null
        and (c.review_email or c.loyalty_email)
    ),
    updated_at = now();

comment on column public.clientes.permite_whatsapp is
  'Derivada de un consentimiento activo por finalidad; no editar directamente.';
comment on column public.clientes.permite_email is
  'Derivada de un consentimiento activo por finalidad; no editar directamente.';
