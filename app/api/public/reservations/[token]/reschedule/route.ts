import { NextRequest, NextResponse } from "next/server";
import { isUuid } from "../../../../../lib/managedReservation";
import { consumePublicRateLimit } from "../../../../../lib/publicRateLimit";
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
  let party: number | null = null;
  try {
    const body = (await request.json()) as { start?: unknown; party?: unknown };
    start = String(body.start || "").trim().slice(0, 40);
    if (body.party !== undefined) party = Number(body.party);
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  if (!/^\d{4}-\d{2}-\d{2}T/.test(start) || Number.isNaN(new Date(start).getTime())
    || (party !== null && (!Number.isInteger(party) || party < 1 || party > 500))) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  try {
    const allowed = await consumePublicRateLimit(request, "manage-reschedule", token, 12);
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

    const { data, error } = await getSupabaseAdmin().rpc(
      "modificar_reserva_publica_gestion",
      {
        p_gestion_token: token,
        p_nuevo_inicio_at: start,
        p_nuevas_personas: party,
      },
    );

    if (error) {
      const code = /SLOT_NOT_AVAILABLE/.test(error.message)
        ? "SLOT_NOT_AVAILABLE"
        : /INVALID_BOOKING_REQUEST/.test(error.message)
          ? "INVALID_BOOKING_REQUEST"
        : /CANCELLATION_WINDOW_CLOSED/.test(error.message)
          ? "CANCELLATION_WINDOW_CLOSED"
          : /RESERVATION_NOT_FOUND|RESERVATION_CANNOT_BE_RESCHEDULED/.test(error.message)
            ? "RESERVATION_CANNOT_BE_RESCHEDULED"
            : "RESCHEDULE_FAILED";
      return json({ ok: false, error: code }, code === "SLOT_NOT_AVAILABLE" ? 409 : 400);
    }

    const result = data as { ok?: boolean; inicio_at?: string; fin_at?: string; personas?: number } | null;
    if (!result?.ok || !result.inicio_at) {
      return json({ ok: false, error: "RESCHEDULE_FAILED" }, 500);
    }

    return json({ ok: true, start: result.inicio_at, end: result.fin_at, party: result.personas });
  } catch (error) {
    console.error("Error reprogramando reserva pública", error);
    return json({ ok: false, error: "RESCHEDULE_FAILED" }, 500);
  }
}
