import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { NEW_TALGO_RESTAURANT_ID } from "@/lib/owner-notices/new-talgo-claim";
import { POST as dispatch } from "../dispatch/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createdEvent = /^reservation\.created:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Temporary protected Preview probe. Remove immediately after the controlled test.
export async function GET(request: NextRequest) {
  if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "restricted-preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const expectedEventId = request.nextUrl.searchParams.get("eventId") || "";
  if (!createdEvent.test(expectedEventId)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET || "";
  if (secret.length < 32) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
  const { data, error } = await getSupabaseAdmin()
    .from("reservation_webhook_deliveries")
    .select("event_id")
    .eq("restaurante_id", NEW_TALGO_RESTAURANT_ID)
    .eq("delivery_mode", "test")
    .in("status", ["pending", "retrying"])
    .lte("scheduled_for", new Date().toISOString())
    .limit(2);
  if (error || data?.length !== 1 || data[0].event_id !== expectedEventId) {
    return NextResponse.json({ ok: false, error: "TEST_EVENT_MISMATCH" }, { status: 409 });
  }
  return dispatch(new NextRequest(new URL("/api/private/new-talgo/dispatch", request.url), {
    method: "POST",
    headers: { "x-new-talgo-dispatch-secret": secret },
  }));
}
