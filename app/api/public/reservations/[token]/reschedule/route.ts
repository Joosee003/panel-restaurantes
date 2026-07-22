import { NextRequest, NextResponse } from "next/server";
import { getManagedReservation, isUuid } from "../../../../../lib/managedReservation";
import { consumePublicRateLimit } from "../../../../../lib/publicRateLimit";
import { notifyReservationAutomation } from "../../../../../lib/reservationAutomation";
import { getSupabaseAdmin } from "../../../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!isUuid(token)) return json({ ok: false, error: "INVALID_REQUEST" }, 400);

  let start = "";
  try {
    const body = (await request.json()) as { start?: unknown };
    start = String(body.start || "").trim().slice(0, 40);
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}T/.test(start) || Number.isNaN(new Date(start).getTime())) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  try {
    const allowed = await consumePublicRateLimit(request, "manage-reschedule", token, 12);
    if (!allowed) return json({ ok: false, error: "RATE_LIMITED" }, 429);

    const before = await getManagedReservation(token);
    if (!before) return json({ ok: false, error: "RESERVATION_NOT_FOUND" }, 404);

    const { data, error } = await getSupabaseAdmin().rpc(
      "reprogramar_reserva_publica_gestion",
      {
        p_gestion_token: token,
        p_nuevo_inicio_at: start,
      },
    );

    if (error) {
      const code = /SLOT_NOT_AVAILABLE/.test(error.message)
        ? "SLOT_NOT_AVAILABLE"
        : /CANCELLATION_WINDOW_CLOSED/.test(error.message)
          ? "CANCELLATION_WINDOW_CLOSED"
          : /RESERVATION_NOT_FOUND|RESERVATION_CANNOT_BE_RESCHEDULED/.test(error.message)
            ? "RESERVATION_CANNOT_BE_RESCHEDULED"
            : "RESCHEDULE_FAILED";
      return json({ ok: false, error: code }, code === "SLOT_NOT_AVAILABLE" ? 409 : 400);
    }

    const result = data as { ok?: boolean; inicio_at?: string; fin_at?: string } | null;
    if (!result?.ok || !result.inicio_at) {
      return json({ ok: false, error: "RESCHEDULE_FAILED" }, 500);
    }

    await notifyReservationAutomation({
      event: "reservation.rescheduled",
      reservationId: before.reservationId,
      restaurantSlug: before.restaurantSlug,
      restaurantName: before.restaurantName,
      restaurantEmail: before.restaurantEmail || null,
      restaurantTimezone: before.timezone,
      previousStart: before.start,
      start: result.inicio_at,
      end: result.fin_at,
      party: before.party,
      customer: {
        name: before.customerName,
        phone: before.customerPhone || null,
        email: before.customerEmail || null,
      },
      managementUrl: `${(
        process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
      ).replace(/\/$/, "")}/reserva/${token}`,
      source: "gastrohelp_native_web",
    });

    return json({ ok: true, start: result.inicio_at, end: result.fin_at });
  } catch (error) {
    console.error("Error reprogramando reserva pública", error);
    return json({ ok: false, error: "RESCHEDULE_FAILED" }, 500);
  }
}
