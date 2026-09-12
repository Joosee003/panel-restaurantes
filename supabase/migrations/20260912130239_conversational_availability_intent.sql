-- Accept only canonical availability/booking details, still excluding personal text.
create or replace function public.valid_whatsapp_pending_intent(p_text text)
returns boolean language sql immutable security invoker set search_path='' as $$
  select p_text is null or (char_length(p_text)<=200 and (p_text in
    ('reservar','cambiar reserva','cancelar reserva','carta','horario','direccion','persona')
    or p_text ~ '^(?:reservar|disponibilidad)(?: para (?:cenar|comer|desayunar))?(?: para \d{1,3} personas)?(?: (?:hoy|manana|pasado manana|(?:este |proximo )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|el (?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)))?(?: a las \d{1,2}:[0-5]\d)?$'));
$$;
revoke all on function public.valid_whatsapp_pending_intent(text) from public,anon,authenticated;
grant execute on function public.valid_whatsapp_pending_intent(text) to service_role;
