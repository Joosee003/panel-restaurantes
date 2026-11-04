import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { NEW_TALGO_RESTAURANT_ID } from "@/lib/owner-notices/new-talgo-claim";
import { claimNewTalgoLiveEvents, type NewTalgoLiveEvent } from "@/lib/owner-notices/new-talgo-live-claim";
import { resolveNewTalgoWebhookTarget } from "@/lib/owner-notices/new-talgo-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

function matchesSecret(provided: string | null, expected: string) {
  if (!provided || expected.length < 32) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function bodyFor(event: NewTalgoLiveEvent) {
  const payload = event.payload || {};
  if (typeof payload.restaurantEmail !== "string" ||
      payload.restaurantEmail.trim().toLowerCase() !== "newtalgo@gmail.com") {
    throw new Error("NEW_TALGO_OWNER_EMAIL_MISMATCH");
  }
  const customer = payload.customer && typeof payload.customer === "object" && !Array.isArray(payload.customer)
    ? payload.customer as Record<string, unknown> : {};
  return {
    ...payload,
    customer: { ...customer, email: null, phone: null },
    event: event.event_type,
    automationEventId: event.event_id,
    reservationId: event.reservation_id,
    restaurantId: NEW_TALGO_RESTAURANT_ID,
    clientId: event.cliente_id,
    channel: event.channel,
    deliveryMode: "live",
    suppressDelivery: false,
    whatsappAllowed: false,
    emailAllowed: false,
    managementUrl: null,
    reviewUrl: null,
    attempt: event.attempts,
  };
}

export async function POST(request: NextRequest) {
  if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "approved-production") return json({ ok: false }, 404);
  if (process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID !== NEW_TALGO_RESTAURANT_ID ||
      process.env.NEW_TALGO_OWNER_NOTICE_CHANNEL !== "n8n" ||
      process.env.NEW_TALGO_OWNER_EMAIL?.trim().toLowerCase() !== "newtalgo@gmail.com") {
    return json({ ok: false, error: "NEW_TALGO_NOT_CONFIGURED" }, 503);
  }
  const secret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET?.trim() || "";
  if (!matchesSecret(request.headers.get("x-new-talgo-dispatch-secret"), secret)) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  let target: { url: string; secret: string };
  try {
    target = resolveNewTalgoWebhookTarget({ restaurantId: NEW_TALGO_RESTAURANT_ID,
      configuredRestaurantId: process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID,
      url: process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL, secret })!;
  } catch {
    return json({ ok: false, error: "WEBHOOK_NOT_CONFIGURED" }, 503);
  }

  try {
    const supabase = getSupabaseAdmin();
    const events = await claimNewTalgoLiveEvents(supabase, new Date(), 3);
    const results: Record<string, unknown>[] = [];
    for (const event of events) {
      let status: number | null = null;
      let accepted = false;
      let errorText: string | null = null;
      try {
        const response = await fetch(target.url, {
          method: "POST",
          headers: { "Content-Type": "application/json",
            "X-GastroHelp-Automation-Event": event.event_id,
            "X-GastroHelp-Delivery-Mode": "live",
            "X-GastroHelp-Webhook-Secret": target.secret },
          body: JSON.stringify(bodyFor(event)),
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        });
        status = response.status;
        const output = await response.json().catch(() => null);
        const result = Array.isArray(output) ? output[0] : output;
        accepted = response.ok && Array.isArray(result?.accepted) &&
          result.accepted.includes("newtalgo@gmail.com") &&
          Array.isArray(result.rejected) && result.rejected.length === 0;
        if (!accepted) errorText = `WEBHOOK_NOT_ACCEPTED_${status}`;
      } catch (error) {
        errorText = error instanceof Error ? error.message.slice(0, 200) : "WEBHOOK_REQUEST_FAILED";
      }
      const completed = await supabase.rpc("complete_reservation_automation_event", {
        p_event_id: event.event_id,
        p_lock_token: event.lock_token,
        p_success: accepted,
        p_http_status: status,
        p_error: errorText,
      });
      if (completed.error || completed.data !== true) throw completed.error || new Error("EVENT_COMPLETION_FAILED");
      results.push({ eventId: event.event_id, status: accepted ? "delivered" : "retrying", httpStatus: status });
    }
    return json({ ok: true, claimed: events.length, results });
  } catch {
    return json({ ok: false, error: "NEW_TALGO_LIVE_DISPATCH_FAILED" }, 500);
  }
}

