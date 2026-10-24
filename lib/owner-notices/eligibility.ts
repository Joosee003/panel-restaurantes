const events = new Set([
  "reservation.created", "reservation.rescheduled",
  "reservation.cancelled", "reservation.status_changed",
]);

type OwnerNoticeInput = {
  deliveryMode: string;
  deploymentMode?: string;
  channel?: string;
  restaurantId: string;
  configuredRestaurantId?: string;
  eventType: string;
  emailEnabled: boolean;
  ownerEmail?: string;
  payloadRestaurantEmail: unknown;
};

// The active GastroHelp n8n workflow sends the restaurant copy even when the
// guest has no email. Keep the exception limited to the approved New Talgo
// channel and require the exact recipient to avoid n8n's fallback address.
export function allowsNewTalgoOwnerNotice(input: OwnerNoticeInput): boolean {
  const email = input.ownerEmail?.trim().toLowerCase() || "";
  const recipient = typeof input.payloadRestaurantEmail === "string"
    ? input.payloadRestaurantEmail.trim().toLowerCase() : "";
  return input.deliveryMode === "live" &&
    input.deploymentMode === "approved-production" &&
    input.channel === "n8n" &&
    Boolean(input.configuredRestaurantId) &&
    input.restaurantId === input.configuredRestaurantId &&
    events.has(input.eventType) &&
    input.emailEnabled &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    recipient === email;
}
