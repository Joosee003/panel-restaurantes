import { supabase } from "../(app)/lib/supabaseClient";
import { throwSupabaseError } from "./supabaseError";

export async function getReservasByRestaurante(params: {
  restauranteId: string;
  desde: string;
  hasta: string;
}) {
  const { restauranteId, desde, hasta } = params;

  const { data, error } = await supabase
    .from("reservas")
    .select(
      `
        id,
        nombre_cliente,
        cliente_id,
        telefono,
        email,
        restaurante_id,
        fecha_hora_reserva,
        personas,
        estado,
        atendida,
        resena_solicitada,
        clientes:cliente_id (
          ya_dejo_resena
        )
      `
    )
    .eq("restaurante_id", restauranteId)
    .gte("fecha_hora_reserva", desde)
    .lte("fecha_hora_reserva", hasta)
    .order("fecha_hora_reserva", { ascending: true })
    .limit(300);

  if (error) {
    throwSupabaseError(error, "No se pudieron cargar las reservas.");
  }

  return data ?? [];
}

export async function getConfigPuntosByRestaurante(restauranteId: string) {
  const { data, error } = await supabase
    .from("fidelizacion_config")
    .select("puntos_por_euro")
    .eq("restaurante_id", restauranteId)
    .maybeSingle();

  if (error) {
    throwSupabaseError(error, "No se pudo cargar la configuración de puntos.");
  }

  return data;
}