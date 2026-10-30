CREATE OR REPLACE FUNCTION public.claim_reservation_automation_events(p_limit integer DEFAULT 20)
 RETURNS SETOF reservation_webhook_deliveries
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with candidates as (
    select d.event_id
    from public.reservation_webhook_deliveries d
    join public.automatizaciones_config c on c.restaurante_id = d.restaurante_id
    where (
      d.status in ('pending', 'retrying')
      or (d.status = 'processing' and d.locked_at < now() - interval '10 minutes')
    )
      and d.scheduled_for <= now()
      and coalesce(d.next_attempt_at, d.scheduled_for) <= now()
      and d.attempts < c.max_attempts
      and c.enabled is true
      and c.delivery_mode <> 'paused'
      and d.restaurante_id <> '408f0cff-68a0-40a7-b975-d2ed8e2dbfcc'::uuid
    order by d.scheduled_for, d.created_at
    for update of d skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.reservation_webhook_deliveries d
  set status = 'processing',
      attempts = d.attempts + 1,
      locked_at = now(),
      lock_token = gen_random_uuid(),
      last_attempt_at = now(),
      updated_at = now()
  from candidates c
  where d.event_id = c.event_id
  returning d.*;
end;
$function$

