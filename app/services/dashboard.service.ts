import { supabase } from "../(app)/lib/supabaseClient";
import { throwSupabaseError } from "./supabaseError";

export async function getDashboardStats(restauranteId: string) {
  const hoy = new Date();
  const inicioDia = new Date(hoy);
  inicioDia.setHours(0, 0, 0, 0);

  const finDia = new Date(hoy);
  finDia.setHours(23, 59, 59, 999);

  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

  const [
    reservasHoy,
    clientesNuevos,
    resenasPendientes,
    reservasRiesgo,
  ] = await Promise.all([
    supabase
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .gte("fecha_hora_reserva", inicioDia.toISOString())
      .lte("fecha_hora_reserva", finDia.toISOString())
      .neq("estado", "cancelada"),

    supabase
      .from("clientes")
      .select("id", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .gte("created_at", inicioMes.toISOString()),

    supabase
      .from("reseñas")
      .select("id", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .eq("responded", false),

    supabase
      .from("reservas")
      .select("id", { count: "exact", head: true })
      .eq("restaurante_id", restauranteId)
      .eq("estado", "pendiente"),
  ]);

  if (reservasHoy.error) {
    throwSupabaseError(reservasHoy.error, "No se pudieron cargar las reservas de hoy.");
  }

  if (clientesNuevos.error) {
    throwSupabaseError(clientesNuevos.error, "No se pudieron cargar los clientes nuevos.");
  }

  if (resenasPendientes.error) {
    throwSupabaseError(resenasPendientes.error, "No se pudieron cargar las reseñas pendientes.");
  }

  if (reservasRiesgo.error) {
    throwSupabaseError(reservasRiesgo.error, "No se pudieron cargar las reservas en riesgo.");
  }

  return {
    reservasHoy: reservasHoy.count ?? 0,
    clientesNuevos: clientesNuevos.count ?? 0,
    resenasPendientes: resenasPendientes.count ?? 0,
    reservasEnRiesgo: reservasRiesgo.count ?? 0,
  };
}