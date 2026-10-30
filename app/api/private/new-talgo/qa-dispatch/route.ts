import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { NEW_TALGO_RESTAURANT_ID } from "@/lib/owner-notices/new-talgo-claim";
import { POST as dispatch } from "../dispatch/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QA_RESERVATION_ID = "7d748079-16e8-4f43-8a48-d67b6b3ec55b";
const QA_EVENT_ID = `reservation.created:${QA_RESERVATION_ID}`;

// Short-lived probe behind Vercel Authentication. Remove after this one test.
export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "preview"
    || process.env.GASTROHELP_DEPLOYMENT_MODE !== "restricted-preview"
    || process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID !== NEW_TALGO_RESTAURANT_ID
    || request.nextUrl.searchParams.get("eventId") !== QA_EVENT_ID) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET || "";
  if (secret.length < 32) return NextResponse.json({ ok: false }, { status: 503 });
  const supabase = getSupabaseAdmin();
  const [{ data: reservation, error: reservationError }, { data: due, error: dueError }] = await Promise.all([
    supabase.from("reservas").select("id,restaurante_id,origen,nombre_cliente")
      .eq("id", QA_RESERVATION_ID).eq("restaurante_id", NEW_TALGO_RESTAURANT_ID).maybeSingle(),
    supabase.from("reservation_webhook_deliveries").select("event_id")
      .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID).eq("delivery_mode", "test")
      .in("status", ["pending", "retrying"]).lte("scheduled_for", new Date().toISOString()).limit(2),
  ]);
  if (reservationError || dueError || reservation?.origen !== "qa_new_talgo"
    || reservation?.nombre_cliente !== "Prueba tecnica despacho New Talgo"
    || due?.length !== 1 || due[0].event_id !== QA_EVENT_ID) {
    return NextResponse.json({ ok: false, error: "QA_FIXTURE_MISMATCH" }, { status: 409 });
  }
  return dispatch(new NextRequest(new URL("/api/private/new-talgo/dispatch", request.url), {
    method: "POST",
    headers: { "x-new-talgo-dispatch-secret": secret },
  }));
}

