import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { POST as dispatchNewTalgoTest } from "@/app/api/private/new-talgo/dispatch/route";
import { resolveNewTalgoWebhookTarget } from "@/lib/owner-notices/new-talgo-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEW_TALGO_ID = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";

export async function GET(request: NextRequest) {
  if (process.env.GASTROHELP_DEPLOYMENT_MODE !== "restricted-preview") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  if (process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID !== NEW_TALGO_ID) {
    return NextResponse.json({ ok: false, error: "PREVIEW_RESTAURANT_MISMATCH" }, { status: 503 });
  }

  let target: { url: string; secret: string };
  try {
    target = resolveNewTalgoWebhookTarget({
      restaurantId: NEW_TALGO_ID,
      configuredRestaurantId: process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID,
      url: process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL,
      secret: process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET,
    })!;
  } catch (error) {
    const reason = error instanceof Error && error.message.startsWith("NEW_TALGO_")
      ? error.message
      : "WEBHOOK_NOT_CONFIGURED";
    const runtimeSecret = process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET?.trim() || "";
    let urlValid = false;
    try {
      urlValid = Boolean(resolveNewTalgoWebhookTarget({
        restaurantId: NEW_TALGO_ID,
        configuredRestaurantId: NEW_TALGO_ID,
        url: process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL,
        secret: "diagnostic-only-placeholder-of-32-chars",
      }));
    } catch {
      urlValid = false;
    }
    return NextResponse.json({
      ok: false,
      error: reason,
      secretPresent: runtimeSecret.length > 0,
      secretLengthAtLeast32: runtimeSecret.length >= 32,
      urlPresent: Boolean(process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL?.trim()),
      urlValid,
    }, { status: 503 });
  }

  if (request.nextUrl.searchParams.get("dispatch") === "1") {
    try {
      const supabase = getSupabaseAdmin();
      const [configResult, eventsResult] = await Promise.all([
        supabase.from("automatizaciones_config")
          .select("enabled")
          .eq("restaurante_id", NEW_TALGO_ID)
          .maybeSingle<{ enabled: boolean }>(),
        supabase.from("reservation_webhook_deliveries")
          .select("event_id", { count: "exact", head: true })
          .eq("restaurante_id", NEW_TALGO_ID),
      ]);
      if (configResult.error || eventsResult.error) throw new Error("PREFLIGHT_FAILED");
      if (configResult.data?.enabled !== false || eventsResult.count !== 0) {
        return NextResponse.json({ ok: false, error: "DISPATCH_PREFLIGHT_NOT_EMPTY" }, { status: 409 });
      }

      const dispatchUrl = new URL("/api/private/new-talgo/dispatch", request.url);
      const rejected = await dispatchNewTalgoTest(new NextRequest(dispatchUrl, {
        method: "POST",
        headers: { "X-New-Talgo-Dispatch-Secret": "invalid-new-talgo-test-secret" },
      }));
      const authenticated = await dispatchNewTalgoTest(new NextRequest(dispatchUrl, {
        method: "POST",
        headers: { "X-New-Talgo-Dispatch-Secret": target.secret },
      }));
      const result = await authenticated.json();
      const ok = rejected.status === 401 && authenticated.status === 200 &&
        result?.ok === true && result?.claimed === 0;
      return NextResponse.json(
        { ok, rejectedStatus: rejected.status, authenticatedStatus: authenticated.status, claimed: result?.claimed },
        { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } },
      );
    } catch {
      return NextResponse.json({ ok: false, error: "DISPATCH_PROBE_FAILED" }, { status: 502 });
    }
  }

  const eventId = `automation.test:new-talgo-preview-auth-${crypto.randomUUID()}`;
  const body = JSON.stringify({
    event: "automation.test",
    automationEventId: eventId,
    deliveryMode: "test",
    suppressDelivery: true,
    restaurantId: NEW_TALGO_ID,
  });

  async function probe(secret: string) {
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GastroHelp-Automation-Event": eventId,
        "X-GastroHelp-Delivery-Mode": "test",
        "X-GastroHelp-Webhook-Secret": secret,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => null);
    const result = Array.isArray(payload) ? payload[0] : payload;
    return {
      status: response.status,
      sendEmailFalse: result?.sendEmail === false,
      accepted: result?.accepted === true,
    };
  }

  try {
    const rejected = await probe("invalid-new-talgo-test-secret");
    const authenticated = await probe(target.secret);
    const ok =
      rejected.status === 403 &&
      authenticated.status >= 200 &&
      authenticated.status < 300 &&
      authenticated.accepted &&
      authenticated.sendEmailFalse;
    return NextResponse.json(
      { ok, rejected, authenticated, eventId },
      { status: ok ? 200 : 502, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, error: "WEBHOOK_PROBE_FAILED" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

