type NewTalgoWebhookInput = {
  restaurantId: string;
  configuredRestaurantId?: string;
  url?: string;
  secret?: string;
};

// The white-label deployment uses its own n8n endpoint. Never fall back to
// the shared endpoint when New Talgo's URL or credential is missing.
export function resolveNewTalgoWebhookTarget(input: NewTalgoWebhookInput) {
  const configuredId = input.configuredRestaurantId?.trim();
  if (!configuredId || input.restaurantId !== configuredId) return null;

  const secret = input.secret?.trim() || "";
  if (secret.length < 32) throw new Error("NEW_TALGO_WEBHOOK_SECRET_NOT_CONFIGURED");

  const rawUrl = input.url?.trim();
  if (!rawUrl) throw new Error("NEW_TALGO_WEBHOOK_NOT_CONFIGURED");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEW_TALGO_WEBHOOK_INVALID");
  }

  if (
    url.protocol !== "https:" ||
    url.host !== "n8n.gastrohelp.es" ||
    url.pathname !== "/webhook/new-talgo-reservas" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("NEW_TALGO_WEBHOOK_INVALID");
  }

  return { url: url.toString(), secret };
}

