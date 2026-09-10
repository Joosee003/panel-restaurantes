import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { selectChatbotRestaurant, type SharedRestaurant } from "../../../../lib/chatbot/shared-routing";
import { GASTROHELP_PHONE_NUMBER_ID } from "../../../../lib/whatsapp/channel.mjs";
import { POST as processRestaurantMessage } from "../messages/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "private, no-store, max-age=0" },
});

export async function POST(request: NextRequest) {
  const expected = process.env.N8N_CHATBOT_WEBHOOK_SECRET || process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET || "";
  const received = request.headers.get("x-gastrohelp-webhook-secret") || "";
  if (!expected || !received || Buffer.byteLength(expected) !== Buffer.byteLength(received)
      || !timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
    return json({ ok: false, error: "UNAUTHORIZED" }, 401);
  }
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return json({ ok: false, error: "INVALID_MESSAGE" }, 400);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return json({ ok: false, error: "INVALID_MESSAGE" }, 400); }
  const phoneNumberId = String(body.phoneNumberId || "");
  const from = String(body.from || "").replace(/[^0-9]/g, "");
  const messageId = String(body.messageId || "");
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const timestamp = Number(body.timestamp);
  const now = Date.now() / 1000;
  const test = body.mode === "test";
  // Restaurant and delivery mode are resolved here. An inbound body cannot pick live.
  if (phoneNumberId !== GASTROHELP_PHONE_NUMBER_ID || !/^[1-9][0-9]{6,14}$/.test(from)
      || !messageId || messageId.length > 190 || !text || text.length > 2000
      || !Number.isInteger(timestamp) || timestamp < now - 86400 || timestamp > now + 600) {
    return json({ ok: false, error: "INVALID_MESSAGE" }, 400);
  }
  const supabase = getSupabaseAdmin();
  const lockToken = crypto.randomUUID();
  const rpcArgs = { p_phone_number_id: phoneNumberId, p_contact_phone: `+${from}`,
    p_message_id: messageId, p_lock_token: lockToken, p_test: test };
  const { data: turn, error: beginError } = await supabase.rpc("begin_whatsapp_inbox_turn", {
    ...rpcArgs, p_message_at: new Date(timestamp * 1000).toISOString(),
  });
  if (beginError || !turn) return json({ ok: false, error: "INBOX_STATE_FAILED" }, 500);
  if (["duplicate", "stale"].includes(turn.status)) {
    return json({ ok: true, duplicate: true, suppressDelivery: true });
  }
  if (turn.status !== "acquired") return json({ ok: false, error: "CHATBOT_BUSY" }, 409);
  try {
    const { data: routes, error: routesError } = await supabase.rpc("list_whatsapp_restaurants", {
      p_contact_phone: `+${from}`,
    });
    if (routesError) throw new Error("ROUTES_FAILED");
    const restaurants: SharedRestaurant[] = (routes || []).map((r: {
      restaurante_id: string; display_name: string; routing_code: string; delivery_mode: "pilot" | "live";
    }) => ({ id: r.restaurante_id, name: r.display_name, code: r.routing_code, mode: r.delivery_mode }));
    const selection = selectChatbotRestaurant(text, restaurants, turn.restaurantId || null, !!body.replyToMessageId, turn);
    let result: Record<string, unknown> = { ok: true, reply: selection.reply, suppressDelivery: test, mode: test ? "test" : "selection" };
    if (selection.restaurant) {
      const restaurant = selection.restaurant;
      if (test) {
        // A routing rehearsal never changes a customer's real booking conversation.
        result = { ok: true, mode: "test", suppressDelivery: true,
          restaurantId: restaurant.id, restaurantName: restaurant.name,
          preview: { from, restaurantCode: restaurant.code, configuredMode: restaurant.mode } };
      } else {
      const engineRequest = new NextRequest(new URL("/api/chatbot/messages", request.url), {
        method: "POST", headers: { "Content-Type": "application/json", "X-GastroHelp-Webhook-Secret": received },
        body: JSON.stringify({ messageId, restaurantId: restaurant.id, from,
          name: String(body.name || "Cliente WhatsApp").slice(0, 120),
          text: selection.engineText, startNewConversation: selection.reset, sharedInbox: true, mode: restaurant.mode }),
      });
      const engineResponse = await processRestaurantMessage(engineRequest);
      const engine = await engineResponse.json();
      if (!engineResponse.ok || !engine.ok) throw new Error("ENGINE_FAILED");
      // A retry after an uncertain completion may find the engine turn already done.
      // Its cached reply is never sent a second time.
      result = { ...engine, restaurantId: restaurant.id, restaurantName: restaurant.name,
        reply: engine.reply ? (selection.reset ? `*${restaurant.name}*\n${engine.reply}` : engine.reply) : "",
        suppressDelivery: engine.suppressDelivery === true };
      }
    }
    const { data: saved, error: saveError } = await supabase.rpc("complete_whatsapp_inbox_selection", {
      ...rpcArgs, p_restaurante_id: selection.restaurant?.id || null,
      p_suggested_restaurante_id: selection.suggestedRestaurantId, p_pending_intent: selection.pendingIntent,
    });
    if (saveError || saved !== true) throw new Error("INBOX_COMMIT_FAILED");
    return json(result);
  } catch {
    await supabase.rpc("fail_whatsapp_inbox_turn", rpcArgs);
    return json({ ok: false, error: "CHATBOT_FAILED", retryable: true }, 500);
  }
}
