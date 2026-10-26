import "server-only";

import { getSupabaseAdmin } from "./supabaseAdmin";

// A partially configured New Talgo must never accept a group as an
// automatically confirmed booking. Other restaurants keep their own rules.
export async function newTalgoBookingReady(restaurantId: string | null): Promise<boolean> {
  if (!restaurantId || restaurantId !== process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID) {
    return true;
  }
  if (
    process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production" ||
    process.env.NEW_TALGO_OWNER_NOTICE_CHANNEL !== "n8n" ||
    !process.env.NEW_TALGO_OWNER_EMAIL ||
    !process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET
  ) return false;

  const supabase = getSupabaseAdmin();
  const [config, automation, tables] = await Promise.all([
    supabase.from("reservas_config")
      .select("activo,confirmacion_automatica,confirmacion_automatica_hasta,personas_minimas,personas_maximas,mesas_activas_en_disponibilidad")
      .eq("restaurante_id", restaurantId).maybeSingle(),
    supabase.from("automatizaciones_config").select("email_enabled")
      .eq("restaurante_id", restaurantId).maybeSingle(),
    supabase.from("sala_mesas").select("capacidad")
      .eq("restaurante_id", restaurantId).eq("activa", true),
  ]);
  if (config.error || automation.error || tables.error) return false;
  const booking = config.data;
  return booking?.activo === true &&
    booking.confirmacion_automatica === true &&
    booking.confirmacion_automatica_hasta === 4 &&
    booking.personas_minimas === 1 &&
    booking.personas_maximas === 32 &&
    booking.mesas_activas_en_disponibilidad === true &&
    automation.data?.email_enabled === true &&
    tables.data?.length === 8 && tables.data.every((table) => table.capacidad === 4);
}
