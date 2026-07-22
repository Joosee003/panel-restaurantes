import { NextRequest, NextResponse } from "next/server";
import { getManagedReservation, isUuid } from "../../../../../lib/managedReservation";
import { consumePublicRateLimit } from "../../../../../lib/publicRateLimit";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AvailabilityRow = {
  inicio_at: string;
  fin_at: string;
  hora_local: string;
  turno: string;
  capacidad_disponible: number;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const date = request.nextUrl.searchParams.get("date") || "";

  if (!isUuid(token) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  try {
    const allowed = await consumePublicRateLimit(
      request,
      "manage-availability",
      token,
      80,
    );
    if (!allowed) return json({ ok: false, error: "RATE_LIMITED" }, 429);

    const reservation = await getManagedReservation(token);
    if (!reservation) return json({ ok: false, error: "RESERVATION_NOT_FOUND" }, 404);
    if (!reservation.canReschedule || !reservation.restaurantSlug) {
      return json({ ok: false, error: "RESERVATION_CANNOT_BE_RESCHEDULED" }, 409);
    }

    const { data, error } = await getSupabaseAdmin().rpc(
      "obtener_disponibilidad_reservas",
      {
        p_slug: reservation.restaurantSlug,
        p_fecha: date,
        p_personas: reservation.party,
        p_excluir_reserva_id: reservation.reservationId,
      },
    );

    if (error) throw error;
    const slots = ((data || []) as AvailabilityRow[]).map((slot) => ({
      start: slot.inicio_at,
      end: slot.fin_at,
      time: slot.hora_local,
      shift: slot.turno,
      availableCapacity: slot.capacidad_disponible,
    }));

    return json({ ok: true, slots });
  } catch (error) {
    console.error("Error consultando horas para reprogramar", error);
    return json({ ok: false, error: "AVAILABILITY_FAILED" }, 500);
  }
}
