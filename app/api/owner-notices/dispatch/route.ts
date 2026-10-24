import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Notice = {
  event_id: string;
  restaurante_id: string;
  reservation_id: string;
  event_type: string;
  attempts: number;
  lock_token: string;
};

function authorized(value: string | null, secret: string): boolean {
  const received = value?.startsWith("Bearer ") ? value.slice(7) : "";
  const a = Buffer.from(received);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "delivery_failed";
}

async function complete(notice: Notice, success: boolean, messageId?: string, error?: string) {
  const result = await getSupabaseAdmin().rpc("complete_owner_reservation_notice", {
    p_event_id: notice.event_id,
    p_lock_token: notice.lock_token,
    p_success: success,
    p_message_id: messageId || null,
    p_error: error || null,
  });
  if (result.error || result.data !== true) throw new Error("OWNER_NOTICE_COMPLETE_FAILED");
}

async function deliver(notice: Notice) {
  try {
    const admin = getSupabaseAdmin();
    const [configResult, sourceResult, restaurantResult] = await Promise.all([
      admin.from("restaurant_owner_notice_config").select("email,enabled,mobile_verified_at")
        .eq("restaurante_id", notice.restaurante_id).maybeSingle(),
      admin.from("reservation_webhook_deliveries").select("event_type,payload")
        .eq("event_id", notice.event_id).eq("restaurante_id", notice.restaurante_id).single(),
      admin.from("restaurantes").select("nombre").eq("id", notice.restaurante_id).single(),
    ]);
    if (configResult.error || sourceResult.error || restaurantResult.error) throw new Error("NOTICE_SOURCE_UNAVAILABLE");
    const config = configResult.data;
    const source = sourceResult.data;
    if (!config?.enabled || !config.email || source?.event_type !== notice.event_type) {
      throw new Error("OWNER_NOTICE_DISABLED");
    }
    const mode = process.env.OWNER_NOTICE_MODE;
    if (mode === "live" && !config.mobile_verified_at) throw new Error("MOBILE_NOT_VERIFIED");
    const host = process.env.OWNER_NOTICE_SMTP_HOST?.trim() || "";
    const port = Number(process.env.OWNER_NOTICE_SMTP_PORT || 0);
    const from = process.env.OWNER_NOTICE_FROM?.trim() || "";
    if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !from) {
      throw new Error("OWNER_NOTICE_SMTP_UNCONFIGURED");
    }
    if (mode === "local-test" && (!["127.0.0.1", "localhost"].includes(host) ||
      !config.email.endsWith(".invalid"))) throw new Error("LOCAL_NOTICE_DESTINATION_REQUIRED");
    if (mode === "live" && (["127.0.0.1", "localhost"].includes(host) || !config.mobile_verified_at)) {
      throw new Error("LIVE_NOTICE_CONFIGURATION_INVALID");
    }
    const transport = nodemailer.createTransport({
      host, port, secure: mode === "live" && port === 465,
      requireTLS: mode === "live" && port !== 465,
      auth: process.env.OWNER_NOTICE_SMTP_USER
        ? { user: process.env.OWNER_NOTICE_SMTP_USER, pass: process.env.OWNER_NOTICE_SMTP_PASSWORD || "" }
        : undefined,
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    });
    const payload = source.payload && typeof source.payload === "object" ? source.payload as Record<string, unknown> : {};
    const labels: Record<string, string> = {
      "reservation.created": "Nueva reserva",
      "reservation.rescheduled": "Reserva modificada",
      "reservation.cancelled": "Reserva cancelada",
      "reservation.status_changed": "Cambio de estado de reserva",
    };
    const restaurant = asText(restaurantResult.data?.nombre) || "New Talgo";
    const subject = `${labels[notice.event_type] || "Reserva"} · ${restaurant}`;
    const lines = [
      subject,
      `Fecha y hora: ${asText(payload.start) || "Consulta el panel"}`,
      `Personas: ${Number.isInteger(Number(payload.party)) ? Number(payload.party) : "Consulta el panel"}`,
      `Estado: ${asText(payload.status) || "Consulta el panel"}`,
      "Abre el panel privado para consultar la reserva y sus datos.",
      `Referencia: ${notice.reservation_id}`,
    ];
    const messageId = `<${Buffer.from(notice.event_id).toString("hex").slice(0, 160)}@owner-notices.gastrohelp.local>`;
    const sent = await transport.sendMail({
      from, to: config.email, subject, text: lines.join("\n"),
      messageId,
      headers: { "X-GastroHelp-Event": notice.event_id },
    });
    if (!sent.accepted?.includes(config.email)) throw new Error("SMTP_NOT_ACCEPTED");
    await complete(notice, true, sent.messageId);
    return { eventId: notice.event_id, status: "delivered" };
  } catch (error) {
    const reason = safeError(error);
    await complete(notice, false, undefined, reason);
    return { eventId: notice.event_id, status: notice.attempts >= 8 ? "failed" : "retrying", error: reason };
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.OWNER_NOTICE_DISPATCH_SECRET?.trim();
  const mode = process.env.OWNER_NOTICE_MODE;
  if (!secret || secret.length < 32 || !["local-test", "live"].includes(mode || "")) {
    return NextResponse.json({ ok: false, error: "NOT_CONFIGURED" }, { status: 503 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }
  try {
    const result = await getSupabaseAdmin().rpc("claim_owner_reservation_notices", { p_limit: 10 });
    if (result.error) throw result.error;
    const notices = (result.data || []) as Notice[];
    const delivered = await Promise.all(notices.map(deliver));
    return NextResponse.json({ ok: true, claimed: notices.length, results: delivered },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "DISPATCH_FAILED" }, { status: 500 });
  }
}
