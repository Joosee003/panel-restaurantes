import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import {
  createWahaSession, getWahaSession, logoutWahaSession, startWahaSession, stopWahaSession, wahaConfigured,
  type WahaSession,
} from "@/lib/whatsapp/waha-api";
import {
  createWahaChannel, getWahaChannelForRestaurant, getWahaContact, resumeWahaContact,
  updateWahaChannel, type WahaChannel, type WahaChannelStatus,
} from "@/lib/whatsapp/waha-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "Vary": "Authorization" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const statuses = new Set([
  "STOPPED", "STARTING", "SCAN_QR_CODE", "WORKING", "FAILED", "PASSKEY_REQUIRED",
  "PASSKEY_CONFIRMATION_REQUIRED", "CAPPED", "NUMBER_MISMATCH", "UNAVAILABLE",
]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function webhookUrl() {
  try {
    const url = new URL(process.env.GASTROHELP_WAHA_WEBHOOK_URL || "");
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}

async function authorize(request: NextRequest, restaurantId: string) {
  const authorization = request.headers.get("authorization") || "";
  if (!uuid.test(restaurantId) || !/^Bearer \S+$/.test(authorization)) {
    return { error: json({ error: "UNAUTHORIZED" }, 401) };
  }
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = await client.auth.getUser(authorization.slice(7));
  if (user.error || !user.data.user) return { error: json({ error: "UNAUTHORIZED" }, 401) };
  const [access, demo] = await Promise.all([
    client.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId }),
    client.rpc("is_demo_user"),
  ]);
  if (access.error || access.data !== true || demo.error) {
    return { error: json({ error: "FORBIDDEN" }, 403) };
  }
  return { readOnly: demo.data !== false };
}

function publicChannel(channel: WahaChannel | null) {
  if (!channel) return null;
  return {
    id: channel.id, phone: channel.phone_e164, status: channel.status,
    enabled: channel.enabled, chatbotEnabled: channel.chatbot_enabled,
    reviewsEnabled: channel.reviews_enabled, generation: channel.generation,
  };
}

async function modulesFor(restaurantId: string) {
  const result = await getSupabaseAdmin().from("restaurante_modulos")
    .select("chatbot,resenas,estado").eq("restaurante_id", restaurantId).maybeSingle();
  if (result.error) throw new Error("MODULES_UNAVAILABLE");
  return {
    chatbot: result.data?.estado === "activo" && result.data.chatbot === true,
    reviews: result.data?.estado === "activo" && result.data.resenas === true,
  };
}

async function pausedContactsFor(channel: WahaChannel | null) {
  if (!channel) return [];
  const result = await getSupabaseAdmin().from("whatsapp_channel_contacts")
    .select("contact_phone,paused_at").eq("channel_id", channel.id).eq("paused", true)
    .order("paused_at", { ascending: false }).limit(50);
  if (result.error) throw new Error("CONTACTS_UNAVAILABLE");
  return (result.data || []).map((contact) => ({ phone: contact.contact_phone, pausedAt: contact.paused_at }));
}

function phoneOf(session: WahaSession | null) {
  return session?.phone && /^[1-9]\d{6,14}$/.test(session.phone) ? `+${session.phone}` : null;
}

async function synchronize(channel: WahaChannel, session: WahaSession | null) {
  // A different linked number must never take over the restaurant silently.
  if (channel.status === "NUMBER_MISMATCH") return channel;
  const phone = phoneOf(session);
  const mismatch = Boolean(phone && channel.phone_e164 && phone !== channel.phone_e164);
  const status = mismatch ? "NUMBER_MISMATCH" : session?.restricted ? "CAPPED"
    : session && statuses.has(session.status) ? session.status : session ? "UNAVAILABLE" : "STOPPED";
  const patch: Parameters<typeof updateWahaChannel>[2] = { status: status as WahaChannelStatus };
  if (mismatch || !session) patch.enabled = false;
  if (!mismatch && session?.status === "WORKING" && phone && !channel.phone_e164) patch.phone_e164 = phone;
  const updated = await updateWahaChannel(getSupabaseAdmin(), channel.id, patch, channel.generation, channel.revision);
  return updated;
}

export async function GET(request: NextRequest) {
  const restaurantId = request.nextUrl.searchParams.get("restaurantId") || "";
  try {
    const auth = await authorize(request, restaurantId);
    if (auth.error) return auth.error;
    const allowedModules = await modulesFor(restaurantId);
    const configured = wahaConfigured() && Boolean(webhookUrl());
    let channel = await getWahaChannelForRestaurant(getSupabaseAdmin(), restaurantId);
    let connectionError = false;
    if (channel && channel.status !== "STOPPED" && configured && !auth.readOnly) {
      try {
        const result = await synchronize(channel, await getWahaSession(channel.session_name));
        channel = result || await getWahaChannelForRestaurant(getSupabaseAdmin(), restaurantId);
      } catch { connectionError = true; }
    }
    return json({ configured, readOnly: auth.readOnly, allowedModules, channel: publicChannel(channel),
      pausedContacts: await pausedContactsFor(channel), connectionError });
  } catch { return json({ error: "CHANNEL_UNAVAILABLE" }, 503); }
}

export async function POST(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 2000) return json({ error: "INVALID_REQUEST" }, 413);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "INVALID_REQUEST" }, 400);
  } catch { return json({ error: "INVALID_REQUEST" }, 400); }
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  try {
    const auth = await authorize(request, restaurantId);
    if (auth.error) return auth.error;
    if (auth.readOnly) return json({ error: "READ_ONLY_DEMO" }, 403);
    const url = webhookUrl();
    const configured = wahaConfigured() && Boolean(url);
    const allowedModules = await modulesFor(restaurantId);
    const db = getSupabaseAdmin();
    let channel = await getWahaChannelForRestaurant(db, restaurantId);
    const action = body.action;
    if (!["connect", "activate", "pause", "disconnect", "resume_contact"].includes(String(action))) return json({ error: "INVALID_REQUEST" }, 400);
    if ((action === "connect" || action === "activate") && !configured) return json({ error: "CONNECTION_NOT_PREPARED" }, 503);
    if (channel && body.generation !== channel.generation) return json({ error: "CHANNEL_CHANGED" }, 409);
    if (action === "connect") {
      if (!allowedModules.chatbot && !allowedModules.reviews) return json({ error: "MODULE_NOT_ENABLED" }, 409);
      if (!channel) {
        try { channel = await createWahaChannel(db, restaurantId); }
        catch { return json({ error: "CHANNEL_CHANGED" }, 409); }
      }
      if (channel.enabled || channel.status === "NUMBER_MISMATCH") return json({ error: "DISCONNECT_FIRST" }, 409);
      const reserved = await updateWahaChannel(db, channel.id, { status: "STARTING", enabled: false }, channel.generation, channel.revision);
      if (!reserved) return json({ error: "CHANNEL_CHANGED" }, 409);
      channel = reserved;
      let session = await getWahaSession(channel.session_name);
      if (!session) {
        try { session = await createWahaSession(channel.session_name, url!); }
        catch {
          session = await getWahaSession(channel.session_name);
          if (!session) throw new Error("CREATE_FAILED");
        }
      }
      if (session.status === "STOPPED" || session.status === "FAILED") session = await startWahaSession(channel.session_name);
      channel = await synchronize(channel, session) || await getWahaChannelForRestaurant(db, restaurantId);
      if (!channel) return json({ error: "CHANNEL_CHANGED" }, 409);
    } else {
      if (!channel) return json({ error: "CHANNEL_NOT_FOUND" }, 404);
      if (action === "resume_contact") {
        const phone = typeof body.contactPhone === "string" ? body.contactPhone : "";
        if (!allowedModules.chatbot || !/^\+[1-9]\d{6,14}$/.test(phone)) return json({ error: "INVALID_REQUEST" }, 400);
        if (!channel.enabled || !channel.chatbot_enabled || channel.status !== "WORKING") return json({ error: "CONNECTION_NOT_READY" }, 409);
        const contact = await getWahaContact(db, channel.id, phone);
        if (!contact?.paused) return json({ error: "CONTACT_NOT_PAUSED" }, 409);
        if (!await resumeWahaContact(db, channel.id, phone)) return json({ error: "CHANNEL_CHANGED" }, 409);
      } else if (action === "pause" || action === "disconnect") {
        // Persist the pause before touching the provider, even when it is offline.
        const paused = await updateWahaChannel(db, channel.id, {
          enabled: false, ...(action === "disconnect" ? { status: "STOPPED" as const } : {}),
        }, channel.generation, channel.revision);
        if (!paused) return json({ error: "CHANNEL_CHANGED" }, 409);
        channel = paused;
        if (action === "disconnect") {
          if (!configured) return json({ error: "CONNECTION_NOT_PREPARED" }, 503);
          // Logout can restart a running provider session, so stop it first.
          await stopWahaSession(channel.session_name);
          await logoutWahaSession(channel.session_name);
          channel = await updateWahaChannel(db, channel.id, {
            status: "STOPPED", phone_e164: null, enabled: false, chatbot_enabled: false, reviews_enabled: false,
          }, channel.generation, channel.revision);
          if (!channel) return json({ error: "CHANNEL_CHANGED" }, 409);
        }
      } else {
        const session = await getWahaSession(channel.session_name);
        const phone = phoneOf(session);
        if (channel.status === "NUMBER_MISMATCH" || !phone || session?.status !== "WORKING" || session.restricted) {
          await synchronize(channel, session);
          return json({ error: "CONNECTION_NOT_READY" }, 409);
        }
        if (!channel.phone_e164 || channel.phone_e164 !== phone) {
          await synchronize(channel, session);
          return json({ error: "CHECK_LINKED_NUMBER" }, 409);
        }
        const chatbot = body.chatbotEnabled === true;
        const reviews = body.reviewsEnabled === true;
        if ((!chatbot && !reviews) || (chatbot && !allowedModules.chatbot) || (reviews && !allowedModules.reviews)) {
          return json({ error: "MODULE_NOT_ENABLED" }, 409);
        }
        channel = await updateWahaChannel(db, channel.id, {
          enabled: true, chatbot_enabled: chatbot, reviews_enabled: reviews,
        }, channel.generation, channel.revision);
        if (!channel) return json({ error: "CHANNEL_CHANGED" }, 409);
      }
    }
    return json({ configured, readOnly: false, allowedModules, channel: publicChannel(channel),
      pausedContacts: await pausedContactsFor(channel), connectionError: false });
  } catch { return json({ error: "CHANNEL_UNAVAILABLE" }, 503); }
}
