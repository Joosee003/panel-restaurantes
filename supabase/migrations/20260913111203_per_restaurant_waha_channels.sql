-- Dedicated restaurant channels. Secrets and QR/session credentials stay outside the database.
create table public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null unique references public.restaurantes(id) on delete cascade,
  session_name text not null unique check (session_name ~ '^gh_[a-f0-9]{32}$'),
  phone_e164 text unique check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  status text not null default 'STOPPED' check (status in ('STOPPED','STARTING','SCAN_QR_CODE','WORKING','FAILED','PASSKEY_REQUIRED','PASSKEY_CONFIRMATION_REQUIRED','CAPPED','NUMBER_MISMATCH','UNAVAILABLE')),
  enabled boolean not null default false,
  chatbot_enabled boolean not null default false,
  reviews_enabled boolean not null default false,
  generation integer not null default 1 check (generation > 0),
  revision integer not null default 1 check (revision > 0),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not enabled or (phone_e164 is not null and activated_at is not null))
);

create function public.guard_whatsapp_channel() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.generation:=1; new.revision:=1; new.enabled:=false; new.activated_at:=null;
  else
    if new.id is distinct from old.id or new.restaurante_id is distinct from old.restaurante_id
      or new.session_name is distinct from old.session_name then raise exception 'CHANNEL_BINDING_IMMUTABLE'; end if;
    new.generation:=old.generation;
    new.revision:=old.revision+1;
    if new.phone_e164 is distinct from old.phone_e164 then
      -- Pairing (including the first number) never activates messaging by itself.
      new.enabled:=false; new.activated_at:=null;
    end if;
    if new.phone_e164 is distinct from old.phone_e164 or new.enabled is distinct from old.enabled
      or new.chatbot_enabled is distinct from old.chatbot_enabled or new.reviews_enabled is distinct from old.reviews_enabled then
      new.generation:=old.generation+1;
    end if;
    if new.enabled and not old.enabled then
      if new.phone_e164 is null or new.status<>'WORKING' then raise exception 'CHANNEL_NOT_READY'; end if;
      new.activated_at:=now();
    elsif not new.enabled then new.activated_at:=null;
    else new.activated_at:=old.activated_at;
    end if;
  end if;
  new.updated_at:=now();
  return new;
end;
$$;
create trigger whatsapp_channel_guard before insert or update on public.whatsapp_channels
for each row execute function public.guard_whatsapp_channel();

create table public.whatsapp_channel_contacts (
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  paused boolean not null default false,
  paused_at timestamptz,
  resumed_at timestamptz,
  last_human_message_at timestamptz,
  pause_reason text check (pause_reason is null or char_length(pause_reason)<=120),
  last_message_at timestamptz,
  lock_token uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(channel_id,contact_phone)
);

-- An inbound row stores its engine response and the correlated outgoing reply.
-- An outbound row uses the stable automation event key as provider_message_id.
create table public.whatsapp_channel_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.whatsapp_channels(id) on delete cascade,
  channel_generation integer not null check (channel_generation>0),
  channel_phone_e164 text not null check (channel_phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 512),
  direction text not null check (direction in ('inbound','outbound')),
  purpose text not null check (purpose in ('chatbot','review')),
  contact_phone text not null check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  chat_id text not null check (chat_id ~ '^[1-9][0-9]{5,24}@(c[.]us|lid)$'),
  contact_name text check (contact_name is null or char_length(contact_name)<=120),
  text_content text check (text_content is null or char_length(text_content)<=2000),
  message_at timestamptz not null,
  engine_response jsonb check (engine_response is null or (jsonb_typeof(engine_response)='object' and octet_length(engine_response::text)<=32000)),
  status text not null default 'processing' check (status in ('processing','ready','sending','sent','completed','failed','uncertain','suppressed')),
  lock_token uuid,
  locked_until timestamptz,
  reserved_outgoing_id text check (reserved_outgoing_id is null or reserved_outgoing_id ~ '^[A-Za-z0-9-]{8,190}$'),
  outgoing_message_id text check (outgoing_message_id is null or char_length(outgoing_message_id) between 1 and 512),
  ack integer not null default 0 check (ack between -1 and 4),
  ack_updated_at timestamptz,
  attempts integer not null default 0,
  last_error text check (last_error is null or char_length(last_error)<=120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel_id,provider_message_id)
);
create unique index whatsapp_channel_reserved_outgoing on public.whatsapp_channel_messages(channel_id,reserved_outgoing_id) where reserved_outgoing_id is not null;
create unique index whatsapp_channel_outgoing on public.whatsapp_channel_messages(channel_id,outgoing_message_id) where outgoing_message_id is not null;
create index whatsapp_channel_messages_recovery on public.whatsapp_channel_messages(status,locked_until);
create index whatsapp_channel_messages_contact on public.whatsapp_channel_messages(channel_id,contact_phone,created_at desc);

alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_channel_contacts enable row level security;
alter table public.whatsapp_channel_messages enable row level security;
revoke all on public.whatsapp_channels,public.whatsapp_channel_contacts,public.whatsapp_channel_messages from public,anon,authenticated;
grant select,insert,update,delete on public.whatsapp_channels,public.whatsapp_channel_contacts,public.whatsapp_channel_messages to service_role;

-- Persist authenticated input before any provider network read. Offline channels can
-- retain new customer messages; activation and ownership still cannot be bypassed.
create function public.stage_whatsapp_channel_inbound(
  p_channel_id uuid,p_generation integer,p_phone_e164 text,p_message_id text,
  p_contact_phone text,p_chat_id text,p_message_at timestamptz,p_text_content text,p_contact_name text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_channels%rowtype; m public.whatsapp_channel_messages%rowtype;
begin
  if p_contact_phone !~ '^\+[1-9][0-9]{6,14}$' or p_chat_id !~ '^[1-9][0-9]{5,24}@(c[.]us|lid)$'
    or char_length(coalesce(p_message_id,'')) not between 1 and 512 or p_message_at is null
    or p_message_at>now()+interval '10 minutes' or char_length(coalesce(p_text_content,'')) not between 1 and 2000 then
    raise exception 'INVALID_CHANNEL_MESSAGE'; end if;
  select * into c from public.whatsapp_channels where id=p_channel_id for update;
  if c.id is null or not c.enabled or not c.chatbot_enabled or c.generation<>p_generation
    or c.phone_e164 is distinct from p_phone_e164 or p_message_at<c.activated_at-interval '1 second' then return null; end if;
  insert into public.whatsapp_channel_messages(channel_id,channel_generation,channel_phone_e164,provider_message_id,
    direction,purpose,contact_phone,chat_id,message_at,text_content,contact_name,status,last_error)
  values(p_channel_id,p_generation,p_phone_e164,p_message_id,'inbound','chatbot',p_contact_phone,p_chat_id,p_message_at,
    p_text_content,left(p_contact_name,120),'failed','awaiting_processing') on conflict(channel_id,provider_message_id) do nothing;
  select * into m from public.whatsapp_channel_messages where channel_id=p_channel_id and provider_message_id=p_message_id;
  if m.channel_generation<>p_generation or m.channel_phone_e164<>p_phone_e164 or m.contact_phone<>p_contact_phone
    or m.chat_id<>p_chat_id or m.direction<>'inbound' or m.purpose<>'chatbot' then return null; end if;
  return to_jsonb(m);
end;
$$;

create function public.claim_whatsapp_channel_message(
  p_channel_id uuid,p_generation integer,p_phone_e164 text,p_message_id text,p_direction text,p_purpose text,
  p_contact_phone text,p_chat_id text,p_message_at timestamptz,p_lock_token uuid,
  p_text_content text default null,p_contact_name text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.whatsapp_channels%rowtype; m public.whatsapp_channel_messages%rowtype;
  a public.whatsapp_channel_contacts%rowtype;
begin
  if p_lock_token is null or p_direction not in ('inbound','outbound') or p_purpose not in ('chatbot','review')
    or p_contact_phone !~ '^\+[1-9][0-9]{6,14}$' or p_chat_id !~ '^[1-9][0-9]{5,24}@(c[.]us|lid)$'
    or char_length(coalesce(p_message_id,'')) not between 1 and 512 or p_message_at is null
    or p_message_at>now()+interval '10 minutes' then raise exception 'INVALID_CHANNEL_MESSAGE'; end if;
  select * into c from public.whatsapp_channels where id=p_channel_id for update;
  if c.id is null or not c.enabled or c.status<>'WORKING' or c.generation<>p_generation
    or c.phone_e164 is distinct from p_phone_e164 or (p_purpose='chatbot' and not c.chatbot_enabled)
    or (p_purpose='review' and not c.reviews_enabled) then return jsonb_build_object('status','blocked'); end if;
  if p_direction='inbound' and p_message_at<c.activated_at-interval '1 second' then
    return jsonb_build_object('status','stale'); end if;
  insert into public.whatsapp_channel_contacts(channel_id,contact_phone) values(p_channel_id,p_contact_phone) on conflict do nothing;
  select * into a from public.whatsapp_channel_contacts where channel_id=p_channel_id and contact_phone=p_contact_phone for update;
  select * into m from public.whatsapp_channel_messages where channel_id=p_channel_id and provider_message_id=p_message_id for update;
  if m.id is not null then
    if m.contact_phone<>p_contact_phone or m.chat_id<>p_chat_id or m.direction<>p_direction or m.purpose<>p_purpose
      or m.channel_generation<>p_generation or m.channel_phone_e164<>p_phone_e164 then
      return jsonb_build_object('status','blocked'); end if;
    if m.status in ('sent','completed','suppressed') then return jsonb_build_object('status','duplicate','message',to_jsonb(m)); end if;
    if m.status='uncertain' then return jsonb_build_object('status','blocked','message',to_jsonb(m)); end if;
    if m.status='sending' then
      if m.locked_until>now() then return jsonb_build_object('status','busy'); end if;
      update public.whatsapp_channel_messages set status='uncertain',last_error='send_interrupted',lock_token=null,locked_until=null,updated_at=now() where id=m.id returning * into m;
      update public.whatsapp_channel_contacts set lock_token=null,locked_until=null where channel_id=p_channel_id and contact_phone=p_contact_phone and lock_token=a.lock_token;
      return jsonb_build_object('status','blocked','message',to_jsonb(m));
    end if;
    if m.locked_until>now() and m.lock_token is distinct from p_lock_token then return jsonb_build_object('status','busy'); end if;
  end if;
  if a.locked_until>now() and a.lock_token is distinct from p_lock_token then return jsonb_build_object('status','busy'); end if;
  if p_direction='inbound' and a.last_message_at is not null and p_message_at<a.last_message_at then
    return jsonb_build_object('status','stale'); end if;
  if p_purpose='chatbot' and a.paused then return jsonb_build_object('status','blocked','reason','contact_paused'); end if;
  insert into public.whatsapp_channel_messages(channel_id,channel_generation,channel_phone_e164,provider_message_id,direction,purpose,
    contact_phone,chat_id,message_at,text_content,contact_name,lock_token,locked_until,attempts)
  values(p_channel_id,p_generation,p_phone_e164,p_message_id,p_direction,p_purpose,p_contact_phone,p_chat_id,p_message_at,
    left(p_text_content,2000),left(p_contact_name,120),p_lock_token,now()+interval '2 minutes',1)
  on conflict(channel_id,provider_message_id) do update set
    status=case when public.whatsapp_channel_messages.engine_response is null then 'processing' else 'ready' end,
    lock_token=p_lock_token,locked_until=now()+interval '2 minutes',attempts=public.whatsapp_channel_messages.attempts+1,
    last_error=null,updated_at=now() returning * into m;
  update public.whatsapp_channel_contacts set lock_token=p_lock_token,locked_until=now()+interval '2 minutes',updated_at=now()
    where channel_id=p_channel_id and contact_phone=p_contact_phone;
  return jsonb_build_object('status','acquired','message',to_jsonb(m),'lockToken',p_lock_token);
end;
$$;

create function public.cache_whatsapp_channel_response(p_message_id uuid,p_lock_token uuid,p_response jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_channel_messages%rowtype; v_suppress boolean;
begin
  if p_response is null or jsonb_typeof(p_response)<>'object' or octet_length(p_response::text)>32000 then raise exception 'INVALID_CHANNEL_RESPONSE'; end if;
  select * into m from public.whatsapp_channel_messages where id=p_message_id;
  if m.id is null then return false; end if;
  perform 1 from public.whatsapp_channels where id=m.channel_id for update;
  perform 1 from public.whatsapp_channel_contacts where channel_id=m.channel_id and contact_phone=m.contact_phone for update;
  select * into m from public.whatsapp_channel_messages where id=p_message_id for update;
  if m.id is null or m.lock_token is distinct from p_lock_token or m.locked_until<=now() or m.status not in ('processing','ready') then return false; end if;
  v_suppress:=coalesce(p_response->>'suppressDelivery','false')='true' or nullif(trim(p_response->>'reply'),'') is null;
  update public.whatsapp_channel_messages set engine_response=p_response,status=case when v_suppress then 'suppressed' else 'ready' end,
    lock_token=case when not v_suppress then p_lock_token end,locked_until=case when not v_suppress then now()+interval '2 minutes' end,updated_at=now() where id=m.id;
  update public.whatsapp_channel_contacts set
    last_message_at=case when m.direction='inbound' then greatest(last_message_at,m.message_at) else last_message_at end,
    lock_token=case when not v_suppress then p_lock_token end,locked_until=case when not v_suppress then now()+interval '2 minutes' end,
    updated_at=now() where channel_id=m.channel_id and contact_phone=m.contact_phone and lock_token=p_lock_token;
  return true;
end;
$$;

create function public.begin_whatsapp_channel_send(p_message_id uuid,p_lock_token uuid)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_channel_messages%rowtype; c public.whatsapp_channels%rowtype;
begin
  select * into m from public.whatsapp_channel_messages where id=p_message_id;
  if m.id is null then return false; end if;
  select * into c from public.whatsapp_channels where id=m.channel_id for update;
  perform 1 from public.whatsapp_channel_contacts where channel_id=m.channel_id and contact_phone=m.contact_phone for update;
  select * into m from public.whatsapp_channel_messages where id=p_message_id for update;
  if m.status<>'ready' or m.lock_token is distinct from p_lock_token or m.locked_until<=now() then return false; end if;
  if not c.enabled or c.status<>'WORKING' or c.generation<>m.channel_generation or c.phone_e164 is distinct from m.channel_phone_e164
    or (m.purpose='chatbot' and (not c.chatbot_enabled or exists(select 1 from public.whatsapp_channel_contacts where channel_id=c.id and contact_phone=m.contact_phone and paused)))
    or (m.purpose='review' and not c.reviews_enabled) then
    update public.whatsapp_channel_messages set status='suppressed',last_error='channel_or_contact_changed',lock_token=null,locked_until=null,updated_at=now() where id=m.id;
    update public.whatsapp_channel_contacts set lock_token=null,locked_until=null where channel_id=m.channel_id and contact_phone=m.contact_phone and lock_token=p_lock_token;
    return false;
  end if;
  update public.whatsapp_channel_messages set status='sending',locked_until=now()+interval '2 minutes',updated_at=now() where id=m.id;
  return true;
end;
$$;

create function public.reserve_whatsapp_channel_outgoing_id(p_message_id uuid,p_lock_token uuid,p_outgoing_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_outgoing_id !~ '^[A-Za-z0-9-]{8,190}$' then raise exception 'INVALID_OUTGOING_ID'; end if;
  update public.whatsapp_channel_messages set reserved_outgoing_id=p_outgoing_id,updated_at=now()
    where id=p_message_id and lock_token=p_lock_token and locked_until>now() and status in ('processing','ready','sending')
      and (reserved_outgoing_id is null or reserved_outgoing_id=p_outgoing_id);
  return found;
end;
$$;

create function public.finish_whatsapp_channel_send(p_message_id uuid,p_lock_token uuid,p_outcome text,p_provider_message_id text default null,p_error text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_channel_messages%rowtype;
begin
  if p_outcome not in ('sent','uncertain','blocked') then raise exception 'INVALID_SEND_OUTCOME'; end if;
  select * into m from public.whatsapp_channel_messages where id=p_message_id;
  if m.id is null then return false; end if;
  perform 1 from public.whatsapp_channels where id=m.channel_id for update;
  perform 1 from public.whatsapp_channel_contacts where channel_id=m.channel_id and contact_phone=m.contact_phone for update;
  select * into m from public.whatsapp_channel_messages where id=p_message_id for update;
  if m.status='sent' and m.ack>=1 then return true; end if;
  if m.lock_token is distinct from p_lock_token or m.status not in ('sending','ready') then return false; end if;
  if p_outcome='sent' and nullif(trim(p_provider_message_id),'') is null then raise exception 'SEND_PROOF_MISSING'; end if;
  update public.whatsapp_channel_messages set status=case p_outcome when 'blocked' then 'suppressed' else p_outcome end,
    outgoing_message_id=coalesce(p_provider_message_id,outgoing_message_id),last_error=left(p_error,120),
    lock_token=null,locked_until=null,updated_at=now() where id=m.id;
  update public.whatsapp_channel_contacts set lock_token=null,locked_until=null,updated_at=now()
    where channel_id=m.channel_id and contact_phone=m.contact_phone and lock_token=p_lock_token;
  return true;
end;
$$;

create function public.fail_whatsapp_channel_message(p_message_id uuid,p_lock_token uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_channel_messages%rowtype;
begin
  select * into m from public.whatsapp_channel_messages where id=p_message_id;
  if m.id is null then return false; end if;
  perform 1 from public.whatsapp_channels where id=m.channel_id for update;
  perform 1 from public.whatsapp_channel_contacts where channel_id=m.channel_id and contact_phone=m.contact_phone for update;
  select * into m from public.whatsapp_channel_messages where id=p_message_id for update;
  if m.lock_token is distinct from p_lock_token or m.status not in ('processing','ready','sending') then return false; end if;
  update public.whatsapp_channel_messages set status=case when status='sending' then 'uncertain' else 'failed' end,
    last_error=left(p_error,120),lock_token=null,locked_until=null,updated_at=now() where id=m.id;
  update public.whatsapp_channel_contacts set lock_token=null,locked_until=null,updated_at=now()
    where channel_id=m.channel_id and contact_phone=m.contact_phone and lock_token=p_lock_token;
  return true;
end;
$$;

-- A signed provider event uses a canonical id; sendText allocation returns its raw suffix.
create function public.whatsapp_channel_raw_outgoing_id(p_id text) returns text
language sql immutable security invoker set search_path='' as $$
  select case when p_id ~ '^true_[1-9][0-9]{5,24}@(c[.]us|lid)_[A-Za-z0-9-]{8,190}$' then regexp_replace(p_id,'^true_[^_]+_','')
    when p_id ~ '^[A-Za-z0-9-]{8,190}$' then p_id else null end;
$$;

create function public.record_whatsapp_channel_ack(p_channel_id uuid,p_provider_message_id text,p_ack integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare m public.whatsapp_channel_messages%rowtype; v_raw text;
begin
  if p_ack is null or p_ack not between -1 and 4 then raise exception 'INVALID_MESSAGE_ACK'; end if;
  v_raw:=public.whatsapp_channel_raw_outgoing_id(p_provider_message_id);
  select * into m from public.whatsapp_channel_messages where channel_id=p_channel_id
    and (outgoing_message_id=p_provider_message_id or (v_raw is not null and reserved_outgoing_id=v_raw)) limit 1;
  if m.id is null then return null; end if;
  perform 1 from public.whatsapp_channels where id=m.channel_id for update;
  perform 1 from public.whatsapp_channel_contacts where channel_id=m.channel_id and contact_phone=m.contact_phone for update;
  select * into m from public.whatsapp_channel_messages where id=m.id for update;
  update public.whatsapp_channel_messages set ack=case when p_ack=-1 and ack<=0 then -1 else greatest(ack,p_ack) end,ack_updated_at=now(),
    outgoing_message_id=coalesce(outgoing_message_id,p_provider_message_id),
    status=case when p_ack>=1 and status in ('sending','uncertain','sent') then 'sent' else status end,
    lock_token=case when p_ack<1 then lock_token end,locked_until=case when p_ack<1 then locked_until end,
    updated_at=now() where id=m.id returning * into m;
  if p_ack>=1 then update public.whatsapp_channel_contacts set lock_token=null,locked_until=null
    where channel_id=m.channel_id and contact_phone=m.contact_phone
      and not exists(select 1 from public.whatsapp_channel_messages x where x.channel_id=m.channel_id and x.contact_phone=m.contact_phone
        and x.id<>m.id and x.lock_token=public.whatsapp_channel_contacts.lock_token and x.locked_until>now()); end if;
  return to_jsonb(m);
end;
$$;

create function public.set_whatsapp_channel_contact_pause(p_channel_id uuid,p_contact_phone text,p_paused boolean,p_reason text default null,p_message_at timestamptz default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_restaurante_id uuid; v_session public.chatbot_sessions%rowtype;
  v_contact public.whatsapp_channel_contacts%rowtype; v_message_at timestamptz:=coalesce(p_message_at,now());
begin
  if p_contact_phone !~ '^\+[1-9][0-9]{6,14}$' or p_paused is null then raise exception 'INVALID_CONTACT'; end if;
  select restaurante_id into v_restaurante_id from public.whatsapp_channels where id=p_channel_id for update;
  if not found then return false; end if;
  insert into public.whatsapp_channel_contacts(channel_id,contact_phone) values(p_channel_id,p_contact_phone) on conflict do nothing;
  select * into v_contact from public.whatsapp_channel_contacts where channel_id=p_channel_id and contact_phone=p_contact_phone for update;
  if p_paused and (v_message_at<=v_contact.resumed_at or (p_reason='human_reply' and v_message_at<=v_contact.last_human_message_at)) then return false; end if;
  if not p_paused then
    select * into v_session from public.chatbot_sessions where restaurante_id=v_restaurante_id and contact_phone=p_contact_phone for update;
    -- Do not overwrite the result of a currently executing engine turn.
    if v_session.locked_until>now() then return false; end if;
    update public.chatbot_sessions set
      state=case when state='handoff' or expires_at<=now() then 'idle' else state end,
      draft=case when state='handoff' or expires_at<=now() then '{}'::jsonb else draft end,
      selected_reservation_id=case when state='handoff' or expires_at<=now() then null else selected_reservation_id end,
      handoff=false,expires_at=case when expires_at<=now() then now()+interval '24 hours' else expires_at end,updated_at=now()
      where restaurante_id=v_restaurante_id and contact_phone=p_contact_phone;
  end if;
  update public.whatsapp_channel_contacts set paused=p_paused,paused_at=case when p_paused then now() end,
    pause_reason=case when p_paused then left(p_reason,120) end,
    resumed_at=case when not p_paused then now() else resumed_at end,
    last_human_message_at=case when p_paused and p_reason='human_reply' then greatest(last_human_message_at,v_message_at) else last_human_message_at end,
    updated_at=now() where channel_id=p_channel_id and contact_phone=p_contact_phone;
  if p_paused then
    -- A later resume starts from the next customer message, not a backlog of bot replies.
    -- Provider calls already in flight retain their evidence for ACK reconciliation.
    update public.whatsapp_channel_messages set status='suppressed',last_error='contact_paused',
      lock_token=null,locked_until=null,updated_at=now()
      where channel_id=p_channel_id and contact_phone=p_contact_phone and purpose='chatbot'
        and status in ('processing','ready','failed');
    update public.whatsapp_channel_contacts c set lock_token=null,locked_until=null
      where channel_id=p_channel_id and contact_phone=p_contact_phone
        and not exists(select 1 from public.whatsapp_channel_messages m where m.channel_id=c.channel_id and m.contact_phone=c.contact_phone
          and m.status='sending' and m.lock_token=c.lock_token and m.locked_until>now());
  end if;
  return true;
end;
$$;

-- Returns replay candidates only for safe processing. Interrupted sends are quarantined.
create function public.recover_whatsapp_channel_messages(p_limit integer default 20)
returns setof public.whatsapp_channel_messages language plpgsql security invoker set search_path='' as $$
begin
  update public.whatsapp_channel_messages set status='uncertain',last_error='send_interrupted',lock_token=null,locked_until=null,updated_at=now()
    where status='sending' and locked_until<now();
  return query select m.* from public.whatsapp_channel_messages m join public.whatsapp_channels c on c.id=m.channel_id
    where m.status in ('processing','ready','failed') and (m.locked_until is null or m.locked_until<now())
      and m.created_at>now()-interval '24 hours' and m.attempts<10
      and c.enabled and c.status='WORKING' and c.generation=m.channel_generation and c.phone_e164=m.channel_phone_e164
    order by m.created_at limit greatest(1,least(coalesce(p_limit,20),100));
end;
$$;

create function public.purge_whatsapp_channel_history() returns integer
language plpgsql security invoker set search_path='' as $$
declare v_deleted integer;
begin
  delete from public.whatsapp_channel_messages where updated_at<now()-interval '30 days'
    and status in ('sent','completed','suppressed') and lock_token is null;
  get diagnostics v_deleted=row_count;
  delete from public.whatsapp_channel_contacts c where not c.paused and c.updated_at<now()-interval '30 days'
    and (c.locked_until is null or c.locked_until<now())
    and not exists(select 1 from public.whatsapp_channel_messages m where m.channel_id=c.channel_id and m.contact_phone=c.contact_phone);
  return v_deleted;
end;
$$;

-- Every callable function is service-only and SECURITY INVOKER; browser roles have no access.
revoke all on function public.guard_whatsapp_channel(),
  public.stage_whatsapp_channel_inbound(uuid,integer,text,text,text,text,timestamptz,text,text),
  public.claim_whatsapp_channel_message(uuid,integer,text,text,text,text,text,text,timestamptz,uuid,text,text),
  public.cache_whatsapp_channel_response(uuid,uuid,jsonb),public.begin_whatsapp_channel_send(uuid,uuid),
  public.reserve_whatsapp_channel_outgoing_id(uuid,uuid,text),public.finish_whatsapp_channel_send(uuid,uuid,text,text,text),
  public.fail_whatsapp_channel_message(uuid,uuid,text),public.whatsapp_channel_raw_outgoing_id(text),
  public.record_whatsapp_channel_ack(uuid,text,integer),public.set_whatsapp_channel_contact_pause(uuid,text,boolean,text,timestamptz),
  public.recover_whatsapp_channel_messages(integer),public.purge_whatsapp_channel_history() from public,anon,authenticated;
grant execute on function public.guard_whatsapp_channel(),
  public.stage_whatsapp_channel_inbound(uuid,integer,text,text,text,text,timestamptz,text,text),
  public.claim_whatsapp_channel_message(uuid,integer,text,text,text,text,text,text,timestamptz,uuid,text,text),
  public.cache_whatsapp_channel_response(uuid,uuid,jsonb),public.begin_whatsapp_channel_send(uuid,uuid),
  public.reserve_whatsapp_channel_outgoing_id(uuid,uuid,text),public.finish_whatsapp_channel_send(uuid,uuid,text,text,text),
  public.fail_whatsapp_channel_message(uuid,uuid,text),public.whatsapp_channel_raw_outgoing_id(text),
  public.record_whatsapp_channel_ack(uuid,text,integer),public.set_whatsapp_channel_contact_pause(uuid,text,boolean,text,timestamptz),
  public.recover_whatsapp_channel_messages(integer),public.purge_whatsapp_channel_history() to service_role;
