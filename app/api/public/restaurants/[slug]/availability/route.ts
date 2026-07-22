import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isBookingDateAllowed } from "../../../../../lib/bookingDate";
import { getPublicRestaurant } from "../../../../../lib/publicRestaurant";
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

function requestFingerprint(request: NextRequest, slug: string) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const secret =
    process.env.BOOKING_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-development";

  return createHash("sha256")
    .update(`${secret}:availability:${slug}:${ip}`)
    .digest("hex");
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

  try {
    const supabase = getSupabaseAdmin();
    const fingerprint = requestFingerprint(request, slug);
    const { data: allowed, error: limitError } = await supabase.rpc(
      "consumir_limite_reserva_publica",
      {
        p_key_hash: fingerprint,
        p_limite: 80,
        p_ventana_segundos: 600,
      },
    );

    if (limitError) throw limitError;
    if (allowed !== true) return json({ ok: false, error: "RATE_LIMITED" }, 429);

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
