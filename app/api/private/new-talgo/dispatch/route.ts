import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  NEW_TALGO_RESTAURANT_ID,
  claimNewTalgoTestEvents,
  newTalgoSupabaseClaimStore,
  type NewTalgoQueueEvent,
} from "@/lib/owner-notices/new-talgo-claim";
import { resolveNewTalgoWebhookTarget } from "@/lib/owner-notices/new-talgo-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function matchesSecret(provided: string | null, expected: string) {
  if (!provided || expected.length < 32) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function testBody(event: NewTalgoQueueEvent) {
  const payload = event.payload || {};
  const originalCustomer =
    payload.customer && typeof payload.customer === "object" && !Array.isArray(payload.customer)
      ? payload.customer as Record<string, unknown>
      : {};
  return {
    ...payload,
    customer: { ...originalCustomer, email: null, phone: null },
    event: event.event_type,
    automationEventId: event.event_id,
    reservationId: event.reservation_id,
    restaurantId: NEW_TALGO_RESTAURANT_ID,
    clientId: event.cliente_id,
    channel: event.channel,
    deliveryMode: "test",
    suppressDelivery: true,
    whatsappAllowed: false,
    emailAllowed: false,
    managementUrl: null,
    reviewUrl: null,
    attempt: event.attempts,
  };
}

export async function POST(request: NextRequest) {
  if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "restricted-preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if (process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID !== NEW_TALGO_RESTAURANT_ID) {
    return NextResponse.json({ ok: false, error: "PREVIEW_RESTAURANT_MISMATCH" }, { status: 503 });
  }

  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET?.trim() || "";
  if (!matchesSecret(request.headers.get("x-new-talgo-dispatch-secret"), secret)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  let target: { url: string; secret: string };
  try {
    target = resolveNewTalgoWebhookTarget({
      restaurantId: NEW_TALGO_RESTAURANT_ID,
      configuredRestaurantId: process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID,
      url: process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL,
      secret,
    })!;
  } catch {
    return NextResponse.json({ ok: false, error: "WEBHOOK_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const events = await claimNewTalgoTestEvents(newTalgoSupabaseClaimStore(supabase), new Date(), 3);
    const results = [];

    for (const event of events) {
      let status: number | null = null;
      let accepted = false;
      try {
        const response = await fetch(target.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-GastroHelp-Automation-Event": event.event_id,
            "X-GastroHelp-Delivery-Mode": "test",
            "X-GastroHelp-Webhook-Secret": target.secret,
          },
          body: JSON.stringify(testBody(event)),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        status = response.status;
        const payload = await response.json().catch(() => null);
        const output = Array.isArray(payload) ? payload[0] : payload;
        accepted = response.ok && output?.accepted === true && output?.sendEmail === false;
      } catch {
        accepted = false;
      }

      const { data: completed, error } = await supabase.rpc(
        "complete_reservation_automation_event",
        {
          p_event_id: event.event_id,
          p_lock_token: event.lock_token,
          p_success: accepted,
          p_http_status: status,
          p_error: accepted ? null : status ? `HTTP_${status}` : "WEBHOOK_REQUEST_FAILED",
        },
      );
      if (error || completed !== true) throw error || new Error("EVENT_COMPLETION_FAILED");
      results.push({ eventId: event.event_id, status: accepted ? "delivered_test" : "retrying", httpStatus: status });
    }

    return NextResponse.json(
      { ok: true, claimed: events.length, results },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "NEW_TALGO_DISPATCH_FAILED" },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

