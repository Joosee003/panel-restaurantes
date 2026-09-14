import type { SupabaseClient } from "@supabase/supabase-js";
import { getWahaNewMessageId, getWahaSession, sendWahaText, wahaConfigured } from "../whatsapp/waha-api";
import {
  beginWahaSend, cacheWahaResponse, claimWahaMessage, failWahaMessage,
  finishWahaSend, getWahaChannelForRestaurant, reserveWahaOutgoingId,
  type WahaMessageClaim,
} from "../whatsapp/waha-store";
import { isReviewToken, whatsappPhone } from "./review-flow";
import type { ReviewChannelSender, ReviewDelivery, ReviewOutcome } from "./review-delivery";

const defaults = {
  getWahaChannelForRestaurant, getWahaNewMessageId, getWahaSession, sendWahaText, wahaConfigured,
  beginWahaSend, cacheWahaResponse, claimWahaMessage, failWahaMessage, finishWahaSend, reserveWahaOutgoingId,
};
type Services = typeof defaults;
const blocked = (error: string): ReviewOutcome => ({ outcome: "blocked", error });
const deferred = (error: string): ReviewOutcome => ({ outcome: "deferred", error });
const uncertain = (error: string): ReviewOutcome => ({ outcome: "uncertain", error });
const line = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 120);

export function wahaReviewText(delivery: ReviewDelivery): string {
  const firstName = line(delivery.name).split(" ")[0] || "cliente";
  return `Hola ${firstName}, gracias por tu visita a ${line(delivery.restaurantName)}. ¿Nos cuentas qué tal ha ido? Puedes dejar tu reseña aquí: https://panel.gastrohelp.es/r/${delivery.token}/google\n\nPara dejar de recibir estas peticiones: https://panel.gastrohelp.es/r/${delivery.token}`;
}

/** No channel row means legacy Meta. A row always keeps this restaurant on WAHA. */
export function createWahaReviewSender(db: SupabaseClient, overrides: Partial<Services> = {}): ReviewChannelSender {
  const service = { ...defaults, ...overrides };
  return async (event, delivery, rpc) => {
    const channel = await service.getWahaChannelForRestaurant(db, event.restaurante_id);
    if (!channel) return null;
    if (channel.restaurante_id !== event.restaurante_id) return blocked("waha_restaurant_mismatch");
    if (delivery.deliveryMode === "test") return { outcome: "test" };
    if (delivery.deliveryMode !== "live" || !delivery.allowed) return blocked("review_delivery_invalid");
    if (!channel.enabled || !channel.reviews_enabled || !channel.phone_e164) return blocked("waha_reviews_disabled");
    if (channel.status === "NUMBER_MISMATCH") return blocked("waha_number_mismatch");
    if (channel.status !== "WORKING" || !service.wahaConfigured()) return deferred("waha_temporarily_unavailable");
    const phone = whatsappPhone(delivery.phone);
    if (!phone || !isReviewToken(delivery.token)) return blocked("review_contact_invalid");
    const chatId = `${phone}@c.us`;
    let claim: WahaMessageClaim | null = null;
    let sendStarted = false;
    try {
      claim = await service.claimWahaMessage(db, {
        channelId: channel.id, generation: channel.generation, phoneE164: channel.phone_e164,
        messageId: event.event_id, direction: "outbound", purpose: "review",
        contactPhone: `+${phone}`, chatId, messageAt: new Date().toISOString(),
      });
      if (claim.status !== "acquired" || !claim.message) {
        if (claim.status === "busy") return deferred("waha_contact_busy");
        if (claim.message?.status === "sent" && claim.message.outgoing_message_id) {
          return { outcome: "sent", messageId: `waha:${claim.message.outgoing_message_id}` };
        }
        if (["sending", "uncertain"].includes(claim.message?.status || "")) return uncertain("waha_delivery_unknown");
        return blocked("waha_delivery_already_handled");
      }
      const message = claim.message;
      const rawId = message.reserved_outgoing_id || await service.getWahaNewMessageId(channel.session_name);
      if (!await service.reserveWahaOutgoingId(db, message.id, claim.lockToken, rawId)) throw new Error("WAHA_ID_NOT_RESERVED");
      // Fresh device identity, then fresh consent/visit data. Neither the public
      // request payload nor a stale cached session decides the sending number.
      const current = await service.getWahaSession(channel.session_name);
      if (!current || current.status !== "WORKING" || current.restricted) {
        await service.failWahaMessage(db, message.id, claim.lockToken, "waha_temporarily_unavailable");
        return deferred("waha_temporarily_unavailable");
      }
      if (current.name !== channel.session_name || `+${current.phone}` !== channel.phone_e164
        || (current.engine && !["GOWS", "NOWEB"].includes(current.engine))) {
        await service.failWahaMessage(db, message.id, claim.lockToken, "waha_number_or_engine_mismatch");
        return blocked("waha_number_or_engine_mismatch");
      }
      const checked = await rpc("recheck_visit_review_delivery", {
        p_event_id: event.event_id, p_lock_token: event.lock_token, p_restaurante_id: event.restaurante_id,
      });
      if (checked.error || !checked.data) throw new Error("REVIEW_RECHECK_FAILED");
      const fresh = checked.data as ReviewDelivery;
      if (!fresh.allowed || fresh.deliveryMode !== "live" || whatsappPhone(fresh.phone) !== phone
        || fresh.token !== delivery.token || !isReviewToken(fresh.token)) {
        const reason = fresh.allowed ? "review_recipient_changed" : (fresh.reason || "review_delivery_invalid");
        await service.failWahaMessage(db, message.id, claim.lockToken, reason);
        return blocked(reason);
      }
      const text = wahaReviewText(fresh);
      if (!await service.cacheWahaResponse(db, message.id, claim.lockToken, {
        reply: text, automationEventId: event.event_id, reviewLockToken: event.lock_token,
      })) throw new Error("REVIEW_CACHE_FAILED");
      if (!await service.beginWahaSend(db, message.id, claim.lockToken)) return blocked("waha_channel_changed");
      sendStarted = true;
      const receipt = await service.sendWahaText({ session: channel.session_name, chatId, text, id: rawId });
      const outcome = receipt.status === "accepted" && receipt.messageId ? "sent"
        : receipt.status === "rejected" ? "blocked" : "uncertain";
      const error = outcome === "sent" ? undefined : (receipt.error?.toLowerCase() || "waha_delivery_unknown");
      if (!await service.finishWahaSend(db, message.id, claim.lockToken, {
        outcome, providerMessageId: outcome === "sent" ? receipt.messageId! : undefined, error,
      })) return uncertain("waha_receipt_not_recorded");
      return { outcome, ...(outcome === "sent" ? { messageId: `waha:${receipt.messageId}` } : { error }) };
    } catch {
      if (claim?.message) {
        try { await service.failWahaMessage(db, claim.message.id, claim.lockToken, sendStarted ? "waha_delivery_unknown" : "waha_presend_unavailable"); }
        catch { return uncertain("waha_delivery_state_unknown"); }
      }
      return sendStarted ? uncertain("waha_delivery_unknown") : deferred("waha_presend_unavailable");
    }
  };
}

/** Called only after the webhook's signature and outbox ACK correlation pass. */
export async function reconcileWahaReviewAck(db: SupabaseClient, messageId: string): Promise<boolean> {
  const { data, error } = await db.rpc("reconcile_waha_review_ack", { p_message_id: messageId });
  if (error) throw new Error("WAHA_REVIEW_ACK_RECORD_FAILED");
  return data === true;
}
