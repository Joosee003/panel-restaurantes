import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_RESERVATION_WEBHOOK =
  "https://n8n.gastrohelp.es/webhook/gh-reservas-a291d7ee7e9d54e53d761579aba8735ab99410b8694426e8";
const DEFAULT_REVIEW_WEBHOOK =
  "https://n8n.gastrohelp.es/webhook/resena-email";

type AutomationEvent = {
  event_id: string;
  event_type: string;
  reservation_id: string | null;
  restaurante_id: string;
  cliente_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  channel: string;
  delivery_mode: "test" | "live";
  lock_token: string;
};

type AutomationConfig = {
  whatsapp_enabled: boolean;
  email_enabled: boolean;
};

type CustomerPermissions = {
  permite_whatsapp: boolean | null;
  permite_email: boolean | null;
};

type MarketingConsent = {
  review_whatsapp: boolean | null;
  review_email: boolean | null;
  loyalty_whatsapp: boolean | null;
  loyalty_email: boolean | null;
};

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function deliveryErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "delivery_failed";
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    return `${error.message}: ${cause.message}`.slice(0, 1000);
  }
  return error.message.slice(0, 1000);
}

function webhookFor(eventType: string) {
  if (eventType === "visit.review_request") {
    return process.env.N8N_REVIEW_WEBHOOK_URL || DEFAULT_REVIEW_WEBHOOK;
  }
  return (
    process.env.N8N_NATIVE_BOOKING_WEBHOOK_URL ||
    DEFAULT_RESERVATION_WEBHOOK
  );
}

async function completeEvent(
  event: AutomationEvent,
  success: boolean,
  httpStatus: number | null,
  error: string | null,
) {
  const { error: completeError } = await getSupabaseAdmin().rpc(
    "complete_reservation_automation_event",
    {
      p_event_id: event.event_id,
      p_lock_token: event.lock_token,
      p_success: success,
      p_http_status: httpStatus,
      p_error: error?.slice(0, 1000) || null,
    },
  );
  if (completeError) throw completeError;
}

async function skipEvent(event: AutomationEvent, reason: string) {
  const { error } = await getSupabaseAdmin()
    .from("reservation_webhook_deliveries")
    .update({
      status: "skipped",
      last_error: reason,
      locked_at: null,
      lock_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", event.event_id)
    .eq("lock_token", event.lock_token);
  if (error) throw error;
}

async function permissionsFor(event: AutomationEvent) {
  const supabase = getSupabaseAdmin();
  const [configResult, customerResult, consentResult] = await Promise.all([
    supabase
      .from("automatizaciones_config")
      .select("whatsapp_enabled,email_enabled")
      .eq("restaurante_id", event.restaurante_id)
      .maybeSingle<AutomationConfig>(),
    event.cliente_id
      ? supabase
          .from("clientes")
          .select("permite_whatsapp,permite_email")
          .eq("id", event.cliente_id)
          .eq("restaurante_id", event.restaurante_id)
          .maybeSingle<CustomerPermissions>()
      : Promise.resolve({ data: null, error: null }),
    event.cliente_id
      ? supabase
          .from("cliente_comunicaciones_consentimiento")
          .select(
            "review_whatsapp,review_email,loyalty_whatsapp,loyalty_email",
          )
          .eq("cliente_id", event.cliente_id)
          .eq("restaurante_id", event.restaurante_id)
          .is("revoked_at", null)
          .maybeSingle<MarketingConsent>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (configResult.error) throw configResult.error;
  if (customerResult.error) throw customerResult.error;
  if (consentResult.error) throw consentResult.error;

  return {
    config: configResult.data,
    customer: customerResult.data,
    consent: consentResult.data,
  };
}

async function deliverEvent(event: AutomationEvent) {
  try {
    const payload = { ...(event.payload || {}) };
    const rawCustomer =
      payload.customer && typeof payload.customer === "object"
        ? (payload.customer as Record<string, unknown>)
        : {};
    const customer = { ...rawCustomer };
    const { config, customer: permissions, consent } =
      await permissionsFor(event);

    let whatsappAllowed =
      config?.whatsapp_enabled === true && Boolean(text(customer.phone));
    let emailAllowed =
      config?.email_enabled === true && Boolean(text(customer.email));

    if (event.delivery_mode === "test") {
      customer.phone = null;
      customer.email = null;
      whatsappAllowed = false;
      emailAllowed = false;
    } else if (event.event_type === "visit.review_request") {
      whatsappAllowed =
        whatsappAllowed &&
        permissions?.permite_whatsapp === true &&
        consent?.review_whatsapp === true;
      emailAllowed =
        emailAllowed &&
        permissions?.permite_email === true &&
        consent?.review_email === true;
    } else if (event.event_type.startsWith("loyalty.")) {
      whatsappAllowed =
        whatsappAllowed &&
        permissions?.permite_whatsapp === true &&
        consent?.loyalty_whatsapp === true;
      emailAllowed =
        emailAllowed &&
        permissions?.permite_email === true &&
        consent?.loyalty_email === true;
    }

    if (
      event.delivery_mode === "live" &&
      ["visit.review_request", "loyalty.points_awarded"].includes(
        event.event_type,
      ) &&
      !whatsappAllowed &&
      !emailAllowed
    ) {
      await skipEvent(event, "marketing_consent_missing");
      return { eventId: event.event_id, status: "skipped" };
    }

    if (
      event.delivery_mode === "live" &&
      event.event_type !== "automation.test" &&
      !whatsappAllowed &&
      !emailAllowed
    ) {
      await skipEvent(event, "delivery_channel_unavailable");
      return { eventId: event.event_id, status: "skipped" };
    }

    const body = {
      ...payload,
      customer,
      event: event.event_type,
      automationEventId: event.event_id,
      reservationId: event.reservation_id,
      restaurantId: event.restaurante_id,
      clientId: event.cliente_id,
      channel: event.channel,
      deliveryMode: event.delivery_mode,
      suppressDelivery: event.delivery_mode === "test",
      whatsappAllowed,
      emailAllowed,
      managementUrl: text(payload.managementPath)
        ? `https://panel.gastrohelp.es${text(payload.managementPath)}`
        : null,
      reviewUrl: text(payload.reviewPath)
        ? `https://panel.gastrohelp.es${text(payload.reviewPath)}`
        : null,
      attempt: event.attempts,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(webhookFor(event.event_type), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-GastroHelp-Automation-Event": event.event_id,
          "X-GastroHelp-Delivery-Mode": event.delivery_mode,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseText = await response.text();
    await completeEvent(
      event,
      response.ok,
      response.status,
      response.ok ? null : responseText || `HTTP_${response.status}`,
    );
    return {
      eventId: event.event_id,
      status: response.ok ? "delivered" : "retrying",
      httpStatus: response.status,
    };
  } catch (error) {
    const message = deliveryErrorMessage(error);
    console.error("Error entregando automatización", event.event_id, message);
    try {
      await completeEvent(event, false, null, message);
    } catch (completeError) {
      console.error("No se pudo cerrar el evento de automatización", completeError);
    }
    return { eventId: event.event_id, status: "retrying", error: message };
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 2_000) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 413);
  }

  let nonce: unknown;
  try {
    nonce = ((await request.json()) as { nonce?: unknown }).nonce;
  } catch {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  if (!isUuid(nonce)) {
    return json({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: consumed, error: nonceError } = await supabase.rpc(
      "consume_automation_dispatch_nonce",
      { p_nonce: nonce },
    );
    if (nonceError) throw nonceError;
    if (consumed !== true) {
      return json({ ok: false, error: "INVALID_OR_EXPIRED_NONCE" }, 401);
    }

    const { data, error } = await supabase.rpc(
      "claim_reservation_automation_events",
      { p_limit: 10 },
    );
    if (error) throw error;

    const events = (data || []) as AutomationEvent[];
    const results = await Promise.all(events.map(deliverEvent));
    return json({ ok: true, claimed: events.length, results });
  } catch (error) {
    console.error("Error procesando la cola de automatizaciones", error);
    return json({ ok: false, error: "AUTOMATION_DISPATCH_FAILED" }, 500);
  }
}
