import { NextResponse } from "next/server";
import { resolveNewTalgoWebhookTarget } from "@/lib/owner-notices/new-talgo-routing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NEW_TALGO_ID = "408f0cff-68a0-40a7-b975-d2ed8e2dbfcc";

export async function GET() {
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
    return NextResponse.json({
      ok: false,
      error: reason,
      secretPresent: runtimeSecret.length > 0,
      secretLengthAtLeast32: runtimeSecret.length >= 32,
      urlPresent: Boolean(process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL?.trim()),
    }, { status: 503 });
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

