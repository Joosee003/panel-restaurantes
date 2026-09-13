import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/app/lib/supabaseAdmin";
import { POST as runChatbot } from "@/app/api/chatbot/messages/route";
import { reconcileWahaReviewAck } from "@/lib/reviews/waha-review-delivery";
import {
  wahaRawMessageId, type WahaEvent,
} from "@/lib/whatsapp/waha-contract.mjs";
import {
  getWahaSession, resolveWahaPhone, getWahaNewMessageId, sendWahaText, wahaConfigured,
} from "@/lib/whatsapp/waha-api";
import {
  getWahaChannelBySession, updateWahaChannel, stageWahaInbound, claimWahaMessage, cacheWahaResponse,
  beginWahaSend, finishWahaSend, failWahaMessage, reserveWahaOutgoingId,
  knownWahaOutgoingMessage, recordWahaAck, isWahaContactPaused, pauseWahaContact,
  type WahaChannelStatus,
} from "@/lib/whatsapp/waha-store";

function json(status: string, code = 200) {
  return NextResponse.json({ ok: code < 400, status }, {
    status: code, headers: { "Cache-Control": "private, no-store", ...(code === 503 ? { "Retry-After": "5" } : {}) },
  });
}

function phone(value: string | null | undefined) {
  return value && /^\+?[1-9]\d{6,14}$/.test(value) ? `+${value.replace(/^\+/, "")}` : null;
}

export async function handleWahaEvent(event: Exclude<WahaEvent, { kind: "ignore" }>) {
  const engineSecret = process.env.N8N_CHATBOT_WEBHOOK_SECRET || process.env.N8N_NATIVE_BOOKING_WEBHOOK_SECRET;
  try {
    const db = getSupabaseAdmin();
    const channel = await getWahaChannelBySession(db, event.session);
    if (!channel) return json("UNKNOWN_CONNECTION");

    if (event.kind === "ack") {
      const recorded = await recordWahaAck(db, channel.id, event.messageId, event.ack);
      if (recorded?.purpose === "review") await reconcileWahaReviewAck(db, recorded.id);
      return json("ACK_RECORDED");
    }
    // A provider status event can arrive late. Read the current provider state
    // instead of overwriting the connection with an older notification.
    if (event.kind === "status") {
      if (channel.status === "STOPPED") return json("CONNECTION_STOPPED");
      const state = await getWahaSession(channel.session_name);
      const observed = phone(state?.phone);
      if (channel.phone_e164 && observed && channel.phone_e164 !== observed) {
        await updateWahaChannel(db, channel.id, { enabled: false, status: "NUMBER_MISMATCH" }, channel.generation, channel.revision);
      } else {
        const status = state?.restricted ? "CAPPED" : state?.status === "UNKNOWN" ? "UNAVAILABLE" : state?.status || "STOPPED";
        await updateWahaChannel(db, channel.id, { status: status as WahaChannelStatus }, channel.generation, channel.revision);
      }
      return json("STATUS_RECORDED");
    }

    if (!channel.enabled || !channel.chatbot_enabled || !channel.phone_e164 || !channel.activated_at) return json("CONNECTION_PAUSED");
    if (event.timestamp * 1000 < Date.parse(channel.activated_at) - 1000) return json("OLD_MESSAGE");
    const contactPhone = phone(event.phone || await resolveWahaPhone(channel.session_name, event.jid));
    if (!contactPhone) return json("IDENTITY_PENDING", 503);

    if (event.fromMe) {
      const known = await knownWahaOutgoingMessage(db, channel.id, event.rawMessageId);
      if (!known) await pauseWahaContact(db, channel.id, contactPhone, "human_reply", new Date(event.timestamp * 1000).toISOString());
      return json(known ? "BOT_ECHO" : "HUMAN_REPLY");
    }
    if (await isWahaContactPaused(db, channel.id, contactPhone)) return json("HUMAN_HANDOFF");
    if (!engineSecret) return json("CHATBOT_NOT_CONFIGURED", 503);
    const turnInput = {
      channelId: channel.id, generation: channel.generation, phoneE164: channel.phone_e164,
      messageId: event.rawMessageId, direction: "inbound" as const, contactPhone,
      chatId: event.jid, messageAt: new Date(event.timestamp * 1000).toISOString(),
      textContent: event.text, contactName: event.name,
    };
    const staged = await stageWahaInbound(db, turnInput);
    if (!staged) return json("INELIGIBLE_MESSAGE");
    const state = await getWahaSession(channel.session_name);
    if (!state || phone(state.phone) !== channel.phone_e164 || state.status !== "WORKING" || state.restricted) return json("CONNECTION_UNAVAILABLE", 503);
    const turn = await claimWahaMessage(db, turnInput);
    if (turn.status === "busy") return json("PROCESSING", 503);
    if (turn.status !== "acquired" || !turn.message || !turn.lockToken) return json(turn.status.toUpperCase());
    const ledgerId = turn.message.id;
    const lock = turn.lockToken;
    let attemptedSend = false;
    try {
      let response = turn.message.engine_response as Record<string, unknown> | null;
      if (!response) {
        const engineMessageId = `waha:${createHash("sha256").update(`${channel.id}:${channel.generation}:${event.rawMessageId}`).digest("hex")}`;
        const result = await runChatbot(new NextRequest("https://gastrohelp.internal/api/chatbot/messages", {
          method: "POST", headers: { "Content-Type": "application/json", "X-GastroHelp-Webhook-Secret": engineSecret },
          body: JSON.stringify({ messageId: engineMessageId, restaurantId: channel.restaurante_id,
            from: contactPhone, name: staged.contact_name || event.name, text: staged.text_content || event.text, mode: "live", sharedInbox: true }),
        }));
        const data = await result.json() as Record<string, unknown>;
        if (!result.ok || data.ok !== true) {
          // Disabled modules and pilot allowlists should not generate repeated
          // network retries. Transient engine failures can safely retry its ID.
          if (result.status === 403 || result.status === 404 || result.status === 409 && data.error !== "CHATBOT_BUSY") {
            response = { ok: true, suppressDelivery: true };
          } else throw new Error("CHATBOT_RETRY");
        } else {
          // A crash may happen after booking commit and before reply caching.
          // The engine returns its original committed response for that same ID.
          response = data.duplicate === true ? data.originalResponse as Record<string, unknown> | null : data;
          if (!response) throw new Error("CHATBOT_RESPONSE_PENDING");
        }
        if (!await cacheWahaResponse(db, ledgerId, lock, response)) return json("CLAIM_EXPIRED", 503);
      }
      if (response.suppressDelivery === true || typeof response.reply !== "string" || !response.reply.trim()) return json("REPLY_SUPPRESSED");
      const fresh = await getWahaChannelBySession(db, channel.session_name);
      if (!fresh || !fresh.enabled || !fresh.chatbot_enabled || fresh.generation !== channel.generation || fresh.phone_e164 !== channel.phone_e164 || await isWahaContactPaused(db, channel.id, contactPhone)) {
        await finishWahaSend(db, ledgerId, lock, { outcome: "blocked", error: "CHANNEL_CHANGED_OR_PAUSED" });
        return json("REPLY_BLOCKED");
      }
      const outgoingId = turn.message.reserved_outgoing_id || await getWahaNewMessageId(channel.session_name);
      const rawOutgoingId = wahaRawMessageId(outgoingId);
      if (!rawOutgoingId || !await reserveWahaOutgoingId(db, ledgerId, lock, rawOutgoingId)) return json("CLAIM_EXPIRED", 503);
      const sendState = await getWahaSession(channel.session_name);
      if (!sendState || phone(sendState.phone) !== channel.phone_e164 || sendState.status !== "WORKING" || sendState.restricted) {
        await failWahaMessage(db, ledgerId, lock, "CONNECTION_UNAVAILABLE");
        return json("CONNECTION_UNAVAILABLE", 503);
      }
      if (!await beginWahaSend(db, ledgerId, lock)) return json("SEND_BLOCKED");
      attemptedSend = true;
      const delivered = await sendWahaText({ session: channel.session_name, chatId: `${contactPhone.slice(1)}@c.us`, text: response.reply, id: outgoingId });
      await finishWahaSend(db, ledgerId, lock, {
        outcome: delivered.status === "accepted" ? "sent" : delivered.status === "rejected" ? "blocked" : "uncertain",
        providerMessageId: delivered.messageId || undefined, error: delivered.error || undefined,
      });
      if (response.handoff === true) await pauseWahaContact(db, channel.id, contactPhone, "customer_requested");
      return json(delivered.status === "accepted" ? "ACCEPTED" : delivered.status.toUpperCase());
    } catch {
      if (attemptedSend) {
        await finishWahaSend(db, ledgerId, lock, { outcome: "uncertain", error: "SEND_RESULT_UNKNOWN" });
        return json("UNCERTAIN");
      }
      await failWahaMessage(db, ledgerId, lock, "PROCESSING_RETRY");
      return json("RETRY", 503);
    }
  } catch {
    // Deliberately omit raw payloads, phone numbers, session keys and API errors.
    return json("RETRY", 503);
  }
}

// Called only by the existing authenticated automation dispatcher. Recover the
// stored turn, never replay a send whose outcome may already have reached WhatsApp.
export async function recoverWahaInbound(db: SupabaseClient) {
  if (!wahaConfigured()) return { recovered: 0 };
  const maintenance = await Promise.all([
    db.rpc("recover_whatsapp_channel_messages", { p_limit: 1 }),
    db.rpc("purge_whatsapp_channel_history"),
  ]);
  if (maintenance.some(result => result.error)) return { recovered: 0, unavailable: true };
  const now = Date.now();
  const { data, error } = await db.from("whatsapp_channel_messages")
    .select("id,channel_id,provider_message_id,chat_id,contact_phone,contact_name,text_content,message_at,whatsapp_channels!inner(session_name)")
    .eq("direction", "inbound").eq("purpose", "chatbot")
    .in("status", ["processing", "ready", "failed"])
    .lt("attempts", 8).lt("updated_at", new Date(now - 60_000).toISOString())
    .gte("message_at", new Date(now - 24 * 60 * 60_000).toISOString())
    .or(`locked_until.is.null,locked_until.lt.${new Date(now).toISOString()}`)
    .order("message_at", { ascending: true }).limit(3);
  if (error) return { recovered: 0, unavailable: true };
  const rows = (data || []) as unknown as Array<{
    id: string; channel_id: string; provider_message_id: string; chat_id: string;
    contact_phone: string; contact_name: string | null; text_content: string | null;
    message_at: string; whatsapp_channels: { session_name: string };
  }>;
  const results = await Promise.all(rows.map(async row => {
    if (!row.text_content || !row.whatsapp_channels?.session_name) return false;
    const response = await handleWahaEvent({ kind: "message", eventId: `recovery_${row.id}`,
      session: row.whatsapp_channels.session_name, eventTimestamp: now,
      messageId: row.provider_message_id, rawMessageId: row.provider_message_id,
      jid: row.chat_id, phone: row.contact_phone.replace(/^\+/, ""),
      text: row.text_content, name: row.contact_name || "", timestamp: Date.parse(row.message_at) / 1000,
      fromMe: false, source: "unknown", replyToMessageId: null,
    });
    const result = await response.json() as { status: string };
    if (["STALE", "BLOCKED", "OLD_MESSAGE", "CONNECTION_PAUSED"].includes(result.status)) {
      await db.from("whatsapp_channel_messages").update({ status: "suppressed", last_error: "RECOVERY_NO_LONGER_ELIGIBLE", lock_token: null, locked_until: null })
        .eq("id", row.id).eq("channel_id", row.channel_id).in("status", ["processing", "ready", "failed"])
        .or(`locked_until.is.null,locked_until.lt.${new Date().toISOString()}`);
    }
    return response.ok;
  }));
  return { recovered: results.filter(Boolean).length };
}
