import { NextRequest, NextResponse } from "next/server";
import { isBookingDateAllowed } from "../../../../../lib/bookingDate";
import { getPublicRestaurant } from "../../../../../lib/publicRestaurant";
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
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  const date = request.nextUrl.searchParams.get("date") || "";
  const party = Number(request.nextUrl.searchParams.get("party"));

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({ ok: false, error: "BOOKING_NOT_AVAILABLE" }, 404);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(party) || party < 1 || party > 500) {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 400);
  }

  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant || !restaurant.booking.enabled) {
    return json({ ok: false, error: "BOOKING_NOT_AVAILABLE" }, 404);
  }

  if (
    !isBookingDateAllowed(
      date,
      restaurant.booking.timezone,
      restaurant.booking.maxAdvanceDays,
    )
  ) {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 400);
  }

  // The isolated La Reserva preview fixture has no database id. Return a
  // deterministic, non-persistent schedule so the complete booking UI can be
  // reviewed without reading or writing restaurant data.
  if (restaurant.demo && !restaurant.restauranteId) {
    const times = ["13:30", "14:00", "20:30", "21:00"];
    return json({
      ok: true,
      slots: times.map((time) => ({
        start: `${date}T${time}:00`,
        end: `${date}T${time === "13:30" ? "15:00" : time === "14:00" ? "15:30" : time === "20:30" ? "22:00" : "22:30"}:00`,
        time,
        shift: time < "18:00" ? "Comida" : "Cena",
        availableCapacity: Math.max(party, 8),
      })),
    });
  }

  try {
    const supabase = getSupabaseAdmin();
    const allowed = await consumePublicRateLimit(
      request,
      "booking-availability",
      slug,
      80,
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "RATE_LIMITED" },
        {
          status: 429,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            "Retry-After": "600",
          },
        },
      );
    }

    const { data, error } = await supabase.rpc("obtener_disponibilidad_reservas", {
      p_slug: slug,
      p_fecha: date,
      p_personas: party,
      p_excluir_reserva_id: null,
    });

    if (error) {
      const code = /INVALID_BOOKING_REQUEST/.test(error.message)
        ? "INVALID_BOOKING_REQUEST"
        : /BOOKING_NOT_AVAILABLE/.test(error.message)
          ? "BOOKING_NOT_AVAILABLE"
          : "AVAILABILITY_FAILED";
      return json({ ok: false, error: code }, code === "BOOKING_NOT_AVAILABLE" ? 404 : 400);
    }

    const slots = ((data || []) as AvailabilityRow[]).map((slot) => ({
      start: slot.inicio_at,
      end: slot.fin_at,
      time: slot.hora_local,
      shift: slot.turno,
      availableCapacity: slot.capacidad_disponible,
    }));

    return json({ ok: true, slots });
  } catch (error) {
    console.error("Error consultando disponibilidad pública", error);
    return json({ ok: false, error: "AVAILABILITY_FAILED" }, 500);
  }
}
