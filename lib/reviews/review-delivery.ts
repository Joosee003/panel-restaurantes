import { isReviewToken, whatsappPhone } from "./review-flow";

export type ReviewEvent = { event_id: string; restaurante_id: string; lock_token: string };
type Delivery = { allowed: boolean; reason?: string; token: string; name: string; phone: string; restaurantName: string; deliveryMode: "test" | "live" };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
type Environment = Record<string, string | undefined>;
type Outcome = { outcome: "sent" | "blocked" | "uncertain"; messageId?: string; error?: string };

export function reviewWhatsAppConfigured(env: Environment, restaurantId: string) {
  return Boolean(restaurantId.trim() && reviewWebhookUrl(env)
    && env.N8N_REVIEW_WEBHOOK_SECRET?.trim()
    && !/[\r\n]/.test(env.N8N_REVIEW_WEBHOOK_SECRET)
    && (env.WHATSAPP_REVIEW_RESTAURANT_IDS || "").split(",").map(id=>id.trim()).includes(restaurantId));
}

function reviewWebhookUrl(env: Environment): string | null {
  try {
    const url = new URL(env.N8N_REVIEW_WEBHOOK_URL?.trim() || "");
    if (url.protocol !== "https:" || url.hostname !== "n8n.gastrohelp.es"
      || url.port || url.username || url.password || url.href.includes("?") || url.href.includes("#")
      || !url.pathname.startsWith("/webhook/") || url.pathname === "/webhook/") return null;
    return url.toString();
  } catch {
    return null;
  }
}

// n8n owns the approved WhatsApp template and provider credentials. A generic
// webhook acceptance is not proof of a send; only its correlated provider ACK is.
export async function sendReviewTemplate(event: ReviewEvent, delivery: Delivery, env: Environment, transport: typeof fetch = fetch): Promise<Outcome> {
  if (!delivery.allowed || delivery.deliveryMode !== "live") return { outcome: "blocked", error: "review_delivery_not_live" };
  const webhookUrl = reviewWebhookUrl(env);
  if (!webhookUrl || !reviewWhatsAppConfigured(env, event.restaurante_id)) return { outcome: "blocked", error: "whatsapp_not_configured" };
  const phone = whatsappPhone(delivery.phone);
  if (!phone || !isReviewToken(delivery.token)) return { outcome: "blocked", error: "review_contact_invalid" };
  const singleLine = (value: string) => value.replace(/\s+/g," ").trim().slice(0,120);
  try {
    const response = await transport(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GastroHelp-Webhook-Secret": env.N8N_REVIEW_WEBHOOK_SECRET!.trim(),
        "X-GastroHelp-Automation-Event": event.event_id,
        "X-GastroHelp-Delivery-Mode": "live",
      },
      body: JSON.stringify({
        event: "visit.review_request",
        automationEventId: event.event_id,
        restaurantId: event.restaurante_id,
        deliveryMode: "live",
        whatsappAllowed: true,
        review: {
          token: delivery.token,
          name: singleLine(delivery.name).split(" ")[0] || "cliente",
          phone,
          restaurantName: singleLine(delivery.restaurantName),
        },
      }),
      cache: "no-store", signal: AbortSignal.timeout(25_000), redirect: "error",
    });
    // A timeout or server error may happen after acceptance. Never retry it blindly.
    if (response.status >= 500) return { outcome: "uncertain", error: `n8n_review_http_${response.status}` };
    const result = await response.json() as Record<string, unknown> | null;
    if (!result || result.eventId !== event.event_id || result.deliveryMode !== "live") {
      return { outcome: "uncertain", error: "n8n_review_ack_mismatch" };
    }
    if (result.ok === false && result.outcome === "blocked" && typeof result.error === "string" && result.error.trim()) {
      const error = /^[a-z0-9_:-]{1,120}$/i.test(result.error) ? result.error : "n8n_review_blocked";
      return { outcome: "blocked", error };
    }
    const id = result.messageId;
    if (!response.ok || result.ok !== true || result.provider !== "whatsapp" || result.outcome !== "sent"
      || typeof id !== "string" || !/^wamid\.[A-Za-z0-9._~+\/=-]+$/.test(id) || id.length > 512) {
      return { outcome: "uncertain", error: "n8n_review_ack_missing" };
    }
    return { outcome: "sent", messageId: id };
  } catch {
    return { outcome: "uncertain", error: "n8n_review_delivery_unknown" };
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
    const sent = await sendReviewTemplate(event, delivery, env, transport);
    return await finish(sent.outcome, sent.error, sent.messageId);
  } catch {
    // In particular, never route a review through the generic webhook retry handler.
    // The DB keeps its active token if recording provider acceptance failed.
    return result("needs_review");
  }
}
