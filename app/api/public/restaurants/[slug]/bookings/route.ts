import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { isBookingStartAllowed } from "../../../../../lib/bookingDate";
import { getPublicRestaurant } from "../../../../../lib/publicRestaurant";
import { notifyReservationAutomation } from "../../../../../lib/reservationAutomation";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingBody = {
  start?: unknown;
  party?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  notes?: unknown;
  company?: unknown;
  idempotencyKey?: unknown;
};

type BookingRpcResult = {
  ok?: boolean;
  reserva_id?: string;
  estado?: string;
  inicio_at?: string;
  fin_at?: string;
  duplicate?: boolean;
  gestion_token?: string;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function requestFingerprint(request: NextRequest, slug: string) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  const secret =
    process.env.BOOKING_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "local-development";

  return createHash("sha256")
    .update(`${secret}:booking:${slug}:${ip}:${userAgent}`)
    .digest("hex");
}

function rpcErrorCode(message: string) {
  if (/SLOT_NOT_AVAILABLE/.test(message)) return "SLOT_NOT_AVAILABLE";
  if (/INVALID_BOOKING_REQUEST/.test(message)) return "INVALID_BOOKING_REQUEST";
  if (/BOOKING_NOT_AVAILABLE/.test(message)) return "BOOKING_NOT_AVAILABLE";
  return "BOOKING_FAILED";
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return json({ ok: false, error: "BOOKING_NOT_AVAILABLE" }, 404);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 413);
  }

  let body: BookingBody;
  try {
    body = (await request.json()) as BookingBody;
  } catch {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 400);
  }

  if (cleanText(body.company, 100)) {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 400);
  }

  const start = cleanText(body.start, 40);
  const party = Number(body.party);
  const name = cleanText(body.name, 120);
  const phone = cleanText(body.phone, 40);
  const email = cleanText(body.email, 254).toLowerCase();
  const notes = cleanText(body.notes, 800);
  const idempotencyKey = cleanText(body.idempotencyKey, 36);

  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(start) ||
    Number.isNaN(new Date(start).getTime()) ||
    !Number.isInteger(party) ||
    party < 1 ||
    party > 500 ||
    name.length < 2 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  ) {
    return json({ ok: false, error: "INVALID_BOOKING_REQUEST" }, 400);
  }

  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant || !restaurant.booking.enabled) {
    return json({ ok: false, error: "BOOKING_NOT_AVAILABLE" }, 404);
  }

  if (
    !isBookingStartAllowed(
      start,
      restaurant.booking.timezone,
      restaurant.booking.maxAdvanceDays,
      restaurant.booking.minAdvanceMinutes,
    ) ||
    party < restaurant.booking.minParty ||
    party > restaurant.booking.maxParty ||
    (restaurant.booking.requiresPhone && !phone) ||
    (restaurant.booking.requiresEmail && !email) ||
    (!phone && !email) ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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
        p_limite: 12,
        p_ventana_segundos: 600,
      },
    );

    if (limitError) throw limitError;
    if (allowed !== true) return json({ ok: false, error: "RATE_LIMITED" }, 429);

    const { data, error } = await supabase.rpc("crear_reserva_publica", {
      p_slug: slug,
      p_inicio_at: start,
      p_personas: party,
      p_nombre: name,
      p_telefono: phone || null,
      p_email: email || null,
      p_notas: notes || null,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      const code = rpcErrorCode(error.message);
      const status = code === "SLOT_NOT_AVAILABLE" ? 409 : code === "BOOKING_NOT_AVAILABLE" ? 404 : 400;
      return json({ ok: false, error: code }, status);
    }

    const result = data as BookingRpcResult | null;
    if (!result?.ok || !result.reserva_id || !result.inicio_at || !result.gestion_token) {
      return json({ ok: false, error: "BOOKING_FAILED" }, 500);
    }

    if (!result.duplicate) {
      const siteUrl = (
        process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
      ).replace(/\/$/, "");
      await notifyReservationAutomation({
        event: "reservation.created",
        reservationId: result.reserva_id,
        restaurantId: restaurant.restauranteId,
        restaurantSlug: restaurant.slug,
        restaurantName: restaurant.name,
        restaurantEmail: restaurant.email || null,
        restaurantTimezone: restaurant.booking.timezone,
        status: result.estado,
        start: result.inicio_at,
        end: result.fin_at,
        party,
        customer: { name, phone: phone || null, email: email || null },
        managementUrl: `${siteUrl}/reserva/${result.gestion_token}`,
        notes: notes || null,
        source: "gastrohelp_native_web",
      });
    }

    return json(
      {
        ok: true,
        reservation: {
          reservationId: result.reserva_id,
          status: result.estado || "pendiente",
          start: result.inicio_at,
          managePath: `/reserva/${result.gestion_token}`,
        },
      },
      result.duplicate ? 200 : 201,
    );
  } catch (error) {
    console.error("Error creando reserva pública", error);
    return json({ ok: false, error: "BOOKING_FAILED" }, 500);
  }
}
