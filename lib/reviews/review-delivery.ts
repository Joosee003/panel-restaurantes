import { isReviewToken, whatsappPhone } from "./review-flow";

export type ReviewEvent = { event_id: string; restaurante_id: string; lock_token: string };
type Delivery = { allowed: boolean; reason?: string; token: string; name: string; phone: string; restaurantName: string; deliveryMode: "test" | "live" };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Environment = Record<string, string | undefined>;
type Outcome = { outcome: "sent" | "blocked" | "uncertain"; messageId?: string; error?: string };

export function reviewWhatsAppConfigured(env: Environment, restaurantId: string) {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN?.trim()
    && /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID || "")
    && /^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION || "")
    && /^[a-z0-9_]+$/.test(env.WHATSAPP_REVIEW_TEMPLATE_NAME || "")
    && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(env.WHATSAPP_REVIEW_TEMPLATE_LANGUAGE || "")
    && (env.WHATSAPP_REVIEW_RESTAURANT_IDS || "").split(",").map(id=>id.trim()).includes(restaurantId));
}

// Template must have two body parameters (first name, restaurant) and one URL button
// https://panel.gastrohelp.es/r/{{1}}. No fallback to free-form or another channel.
export async function sendReviewTemplate(delivery: Delivery, env: Environment, transport: typeof fetch = fetch): Promise<Outcome> {
  const phone = whatsappPhone(delivery.phone);
  if (!phone || !isReviewToken(delivery.token)) return { outcome: "blocked", error: "review_contact_invalid" };
  const singleLine = (value: string) => value.replace(/\s+/g," ").trim().slice(0,120);
  try {
    const response = await transport(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "template",
        template: { name: env.WHATSAPP_REVIEW_TEMPLATE_NAME, language: { code: env.WHATSAPP_REVIEW_TEMPLATE_LANGUAGE },
          components: [
            { type: "body", parameters: [
              { type: "text", text: singleLine(delivery.name).split(" ")[0] || "cliente" },
              { type: "text", text: singleLine(delivery.restaurantName) },
            ] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: delivery.token }] },
          ],
        },
      }),
      cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error",
    });
    // A timeout or server error may happen after acceptance. Never retry it blindly.
    if (!response.ok) return { outcome: response.status >= 500 ? "uncertain" : "blocked", error: `whatsapp_http_${response.status}` };
    const result = await response.json() as { messages?: { id?: unknown }[] };
    const id = result.messages?.[0]?.id;
    if (typeof id !== "string" || !id.trim() || id.length > 512) return { outcome: "uncertain", error: "whatsapp_ack_missing" };
    return { outcome: "sent", messageId: id };
  } catch {
    return { outcome: "uncertain", error: "whatsapp_delivery_unknown" };
  }
}

export async function deliverVisitReview(event: ReviewEvent, rpc: Rpc, env: Environment, transport: typeof fetch = fetch) {
  const result = (status: string) => ({ eventId: event.event_id, status });
  const finish = async (outcome: "sent" | "test" | "blocked" | "uncertain", error?: string, messageId?: string) => {
    const completed = await rpc("complete_visit_review_delivery", {
      p_event_id: event.event_id, p_lock_token: event.lock_token, p_outcome: outcome,
      p_message_id: messageId || null, p_error: error || null,
    });
    if (completed.error || completed.data !== true) return result("needs_review");
    return result(outcome === "sent" ? "accepted_by_whatsapp" : outcome);
  };
  try {
    const checked = await rpc("get_visit_review_delivery", { p_event_id: event.event_id, p_lock_token: event.lock_token });
    if (checked.error || !checked.data) return result("needs_review");
    const delivery = checked.data as Delivery;
    if (!delivery.allowed) {
      if (["delivery_lock_lost", "review_delivery_in_progress"].includes(delivery.reason || "")) return result("skipped");
      return await finish(delivery.reason === "review_delivery_uncertain" ? "uncertain" : "blocked", delivery.reason);
    }
    if (delivery.deliveryMode === "test") return await finish("test");
    if (delivery.deliveryMode !== "live" || !reviewWhatsAppConfigured(env, event.restaurante_id)) return await finish("blocked", "whatsapp_not_configured");
    const sent = await sendReviewTemplate(delivery, env, transport);
    return await finish(sent.outcome, sent.error, sent.messageId);
  } catch {
    // In particular, never route a review through the generic webhook retry handler.
    // The DB keeps its active token if recording provider acceptance failed.
    return result("needs_review");
  }
}
