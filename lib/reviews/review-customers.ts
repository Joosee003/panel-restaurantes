import { googleReviewUrl, reviewStage, whatsappPhone, type ReviewRequest } from "./review-flow";

export type CustomerFilter = "all" | "pending" | "confirmed" | "queued" | "stopped";
export type ReviewCustomer = {
  id: string;
  latest: ReviewRequest;
  history: ReviewRequest[];
  reviewRequest: ReviewRequest | null;
  confirmed: boolean;
  consent: boolean;
  sentCount: number;
  lastSentAt: string | null;
  lastOpenedAt: string | null;
  lastCheckedAt: string | null;
  category: Exclude<CustomerFilter, "all">;
};

function timestamp(value: string | null) {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : 0;
}

function latestDate(values: (string | null)[]) {
  return values.reduce<string | null>((latest, value) => timestamp(value) > timestamp(latest) ? value : latest, null);
}

// The API is scoped to a restaurant. Group by customer ID, never by name or phone.
export function groupReviewCustomers(requests: ReviewRequest[]): ReviewCustomer[] {
  const groups = new Map<string, ReviewRequest[]>();
  for (const request of requests) {
    const history = groups.get(request.cliente_id) || [];
    history.push(request);
    groups.set(request.cliente_id, history);
  }
  return Array.from(groups, ([id, rows]) => {
    const history = rows.sort((a, b) => timestamp(b.visit_at) - timestamp(a.visit_at) || a.reserva_id.localeCompare(b.reserva_id));
    const latest = history[0];
    const confirmed = latest.confirmed;
    const consent = latest.consent;
    const reviewRequest = history.find(request => request.sent_at || request.google_opened_at) || null;
    const category: ReviewCustomer["category"] = confirmed ? "confirmed" : !consent ? "stopped" : reviewRequest ? "pending" : "queued";
    return {
      id, latest, history, reviewRequest, confirmed, consent, category,
      sentCount: history.filter(request => request.sent_at).length,
      lastSentAt: latestDate(history.map(request => request.sent_at)),
      lastOpenedAt: latestDate(history.map(request => request.google_opened_at)),
      lastCheckedAt: latestDate(history.map(request => request.checked_at)),
    };
  }).sort((a, b) => timestamp(b.latest.visit_at) - timestamp(a.latest.visit_at) || a.id.localeCompare(b.id));
}

export function customerReviewStage(customer: ReviewCustomer, now = Date.now()) {
  if (customer.confirmed) return { label: "Reseña confirmada", tone: "green" } as const;
  if (!customer.consent) return { label: "Sin permiso", tone: "slate" } as const;
  if (customer.lastOpenedAt) return { label: "Enlace abierto", tone: "blue" } as const;
  if (customer.lastSentAt) return { label: "Petición enviada", tone: "blue" } as const;
  return reviewStage(customer.latest, now);
}

export function matchesCustomerFilter(customer: ReviewCustomer, filter: CustomerFilter): boolean {
  if (filter === "all") return true;
  // Losing messaging consent stops requests, but does not settle a published review.
  if (filter === "pending") return Boolean(customer.reviewRequest) && !customer.confirmed;
  return customer.category === filter;
}

export function whatsappConversationUrl(value: unknown): string | null {
  const phone = whatsappPhone(value);
  // Opening a conversation must not prepare, send or mark a review request as sent.
  return phone ? `https://wa.me/${phone}` : null;
}

export function googleBusinessUrl(value: unknown, restaurantName: string): string | null {
  const allowed = googleReviewUrl(value);
  if (!allowed) return null;
  const url = new URL(allowed);
  if (url.pathname === "/local/writereview") {
    const placeId = url.searchParams.get("placeid");
    if (!placeId) return null;
    // Managers inspect the business listing; the customer keeps the write-review URL.
    // https://developers.google.com/maps/documentation/urls/get-started#search-action
    const listing = new URL("https://www.google.com/maps/search/");
    listing.searchParams.set("api", "1");
    listing.searchParams.set("query", restaurantName.trim() || "Restaurante");
    listing.searchParams.set("query_place_id", placeId);
    return listing.toString();
  }
  if (url.hostname === "g.page" && /\/review\/?$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/review\/?$/, "");
  }
  return url.toString();
}
