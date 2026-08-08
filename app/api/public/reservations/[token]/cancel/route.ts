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

  try {
    const allowed = await consumePublicRateLimit(request, "manage-cancel", token, 8);
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
      "cancelar_reserva_publica_gestion",
      { p_gestion_token: token },
    );

    if (error) {
      const code = /CANCELLATION_WINDOW_CLOSED/.test(error.message)
        ? "CANCELLATION_WINDOW_CLOSED"
        : /RESERVATION_NOT_FOUND/.test(error.message)
          ? "RESERVATION_NOT_FOUND"
          : "CANCELLATION_FAILED";
      return json({ ok: false, error: code }, code === "RESERVATION_NOT_FOUND" ? 404 : 409);
    }

    const result = data as { ok?: boolean; duplicate?: boolean; reserva_id?: string } | null;
    if (!result?.ok) return json({ ok: false, error: "CANCELLATION_FAILED" }, 500);

    return json({ ok: true, status: "cancelada" });
  } catch (error) {
    console.error("Error cancelando reserva pública", error);
    return json({ ok: false, error: "CANCELLATION_FAILED" }, 500);
  }
}
