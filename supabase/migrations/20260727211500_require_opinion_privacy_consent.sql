-- Refuerza la inserción pública: el consentimiento se valida también en base de datos.

create or replace function public.submit_opinion_qr(
  p_slug text,
  p_rating integer,
  p_comentario text default null,
  p_nombre_cliente text default null,
  p_origen text default 'desconocido',
  p_submission_token uuid default gen_random_uuid(),
  p_consentimiento_privacidad boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_restaurante_id uuid;
  v_opinion_id uuid;
  v_origen text;
begin
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Valoración no válida' using errcode = '22023';
  end if;

  if coalesce(p_consentimiento_privacidad, false) is not true then
    raise exception 'Consentimiento de privacidad requerido' using errcode = '22023';
  end if;

  if p_comentario is not null and char_length(trim(p_comentario)) > 2000 then
    raise exception 'Comentario demasiado largo' using errcode = '22001';
  end if;

  if p_nombre_cliente is not null and char_length(trim(p_nombre_cliente)) > 100 then
    raise exception 'Nombre demasiado largo' using errcode = '22001';
  end if;

  select oc.restaurante_id into v_restaurante_id
  from public.opinion_config oc
  where oc.slug = lower(trim(p_slug)) and oc.active = true
  limit 1;

  if v_restaurante_id is null then
    raise exception 'Sistema de opiniones no disponible' using errcode = 'P0002';
  end if;

  v_origen := case lower(coalesce(trim(p_origen), 'desconocido'))
    when 'mesa' then 'mesa'
    when 'caja' then 'caja'
    when 'entrada' then 'entrada'
    when 'portacuentas' then 'portacuentas'
    when 'redes' then 'redes'
    else 'desconocido'
  end;

  insert into public.opiniones_qr (
    restaurante_id, rating, comentario, nombre_cliente, origen,
    submission_token, consentimiento_privacidad
  ) values (
    v_restaurante_id, p_rating,
    nullif(trim(coalesce(p_comentario, '')), ''),
    nullif(trim(coalesce(p_nombre_cliente, '')), ''),
    v_origen, coalesce(p_submission_token, gen_random_uuid()), true
  )
  on conflict (submission_token) do nothing
  returning id into v_opinion_id;

  if v_opinion_id is null then
    select id into v_opinion_id
    from public.opiniones_qr
    where submission_token = p_submission_token
      and restaurante_id = v_restaurante_id
    limit 1;
  end if;

  return v_opinion_id;
end;
$$;

revoke all on function public.submit_opinion_qr(text, integer, text, text, text, uuid, boolean) from public;
grant execute on function public.submit_opinion_qr(text, integer, text, text, text, uuid, boolean)
  to anon, authenticated;
