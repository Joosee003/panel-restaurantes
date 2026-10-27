-- PREPARED ONLY. Apply to the GastroHelp Supabase project only after approval.
-- This sets New Talgo's booking limits without opening public bookings or email.
-- Reservation service hours and table duration remain unset until Angel confirms them.
BEGIN;

DO $guard$
DECLARE
  v_restaurant_id constant uuid := '408f0cff-68a0-40a7-b975-d2ed8e2dbfcc';
  v_tables integer;
  v_capacity integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurantes r
    JOIN public.restaurante_webs w ON w.restaurante_id = r.id
    JOIN public.reservas_config c ON c.restaurante_id = r.id
    JOIN public.automatizaciones_config a ON a.restaurante_id = r.id
    WHERE r.id = v_restaurant_id
      AND r.nombre = 'Bar & Tapas New Talgo'
      AND w.publicada = false
      AND c.activo = false
      AND a.enabled = false
      AND a.delivery_mode = 'test'
      AND a.email_enabled = false
  ) THEN
    RAISE EXCEPTION 'NEW_TALGO_CLOSED_STATE_REQUIRED';
  END IF;

  SELECT count(*)::integer, coalesce(sum(capacidad), 0)::integer
    INTO v_tables, v_capacity
  FROM public.sala_mesas
  WHERE restaurante_id = v_restaurant_id AND activa AND NOT bloqueada;
  IF v_tables <> 8 OR v_capacity <> 32 OR EXISTS (
    SELECT 1 FROM public.sala_mesas
    WHERE restaurante_id = v_restaurant_id AND activa AND NOT bloqueada
      AND capacidad <> 4
  ) THEN
    RAISE EXCEPTION 'NEW_TALGO_EIGHT_TABLES_REQUIRED';
  END IF;
END;
$guard$;

UPDATE public.reservas_config
SET personas_minimas = 1,
    personas_maximas = 32,
    capacidad_por_turno = 32,
    confirmacion_automatica = true,
    confirmacion_automatica_hasta = 4,
    mesas_activas_en_disponibilidad = true,
    solicitudes_pendientes_no_ocupan = true,
    requiere_telefono = true,
    requiere_email = false,
    activo = false
WHERE restaurante_id = '408f0cff-68a0-40a7-b975-d2ed8e2dbfcc';

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reservas_config c
    JOIN public.restaurante_webs w ON w.restaurante_id = c.restaurante_id
    WHERE c.restaurante_id = '408f0cff-68a0-40a7-b975-d2ed8e2dbfcc'
      AND c.personas_minimas = 1
      AND c.personas_maximas = 32
      AND c.capacidad_por_turno = 32
      AND c.confirmacion_automatica = true
      AND c.confirmacion_automatica_hasta = 4
      AND c.mesas_activas_en_disponibilidad = true
      AND c.solicitudes_pendientes_no_ocupan = true
      AND c.activo = false
      AND w.publicada = false
  ) THEN
    RAISE EXCEPTION 'NEW_TALGO_CONFIGURATION_FAILED';
  END IF;
END;
$verify$;

COMMIT;
