import "server-only";

import { getSupabaseAdmin } from "./supabaseAdmin";

export type ManagedReservation = {
  reservationId: string;
  managementToken: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantAddress: string;
  restaurantPhone: string;
  restaurantEmail: string;
  restaurantMapsUrl: string;
  timezone: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  party: number;
  start: string;
  end: string;
  status: string;
  cancellationPolicy: string;
  canCancel: boolean;
  canReschedule: boolean;
};

type ManagedReservationRow = {
  reserva_id?: string;
  gestion_token?: string;
  restaurante_nombre?: string;
  restaurante_slug?: string;
  restaurante_direccion?: string;
  restaurante_telefono?: string;
  restaurante_email?: string;
  restaurante_maps_url?: string;
  zona_horaria?: string;
  nombre_cliente?: string;
  telefono_cliente?: string;
  email_cliente?: string;
  personas?: number;
  inicio_at?: string;
  fin_at?: string;
  estado?: string;
  politica_cancelacion?: string;
  puede_cancelar?: boolean;
  puede_reprogramar?: boolean;
};

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function getManagedReservation(
  token: string,
): Promise<ManagedReservation | null> {
  if (!isUuid(token)) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("obtener_reserva_publica_gestion", {
    p_gestion_token: token,
  });

  if (error) {
    console.error("No se ha podido cargar la reserva gestionada", error);
    return null;
  }

  const row = data as ManagedReservationRow | null;
  if (!row?.reserva_id || !row.gestion_token || !row.inicio_at) return null;

  return {
    reservationId: row.reserva_id,
    managementToken: row.gestion_token,
    restaurantName: row.restaurante_nombre || "Restaurante",
    restaurantSlug: row.restaurante_slug || "",
    restaurantAddress: row.restaurante_direccion || "",
    restaurantPhone: row.restaurante_telefono || "",
    restaurantEmail: row.restaurante_email || "",
    restaurantMapsUrl: row.restaurante_maps_url || "",
    timezone: row.zona_horaria || "Europe/Madrid",
    customerName: row.nombre_cliente || "Cliente",
    customerPhone: row.telefono_cliente || "",
    customerEmail: row.email_cliente || "",
    party: Number(row.personas || 1),
    start: row.inicio_at,
    end: row.fin_at || row.inicio_at,
    status: row.estado || "pendiente",
    cancellationPolicy: row.politica_cancelacion || "",
    canCancel: row.puede_cancelar === true,
    canReschedule: row.puede_reprogramar === true,
  };
}
