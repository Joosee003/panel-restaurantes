export type ReviewRequest = {
  id: string;
  reserva_id: string;
  cliente_id: string;
  nombre: string;
  telefono: string | null;
  visit_at: string;
  scheduled_for: string;
  status: "scheduled" | "ready" | "prepared" | "sent" | "blocked" | "uncertain" | "cancelled";
  sent_at: string | null;
  google_opened_at: string | null;
  checked_at: string | null;
  confirmed: boolean;
  consent: boolean;
  last_error: string | null;
  previous_requests: number;
};

export type ReviewSettings = {
  google_review_url: string | null;
  review_enabled: boolean;
  review_delay_hours: number;
  automation_ready: boolean;
};

export function googleReviewUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    const shortLink = host === "g.page" || host === "maps.app.goo.gl";
    const maps = ["google.com", "www.google.com", "google.es", "www.google.es"].includes(host)
      && (/^\/maps(?:\/|$)/.test(url.pathname) || url.pathname === "/local/writereview");
    const search = host === "search.google.com" && url.pathname === "/local/writereview";
    const legacyMaps = host === "maps.google.com" || host === "maps.google.es";
    return shortLink || maps || search || legacyMaps ? url.toString() : null;
  } catch {
    return null;
  }
}

export function whatsappPhone(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 9 && !raw.startsWith("+")) digits = `34${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function reviewMessage(name: string, restaurant: string, url: string): string {
  const firstName = name.trim().split(/\s+/)[0] || "";
  return `Hola${firstName ? ` ${firstName}` : ""}, gracias por tu visita a ${restaurant}.\n\n¿Nos cuentas tu experiencia en Google? Tu opinión nos ayuda a mejorar.\n${url}\n\nSi prefieres no recibir más peticiones, puedes indicarlo en ese enlace.`;
}

export function reviewStage(request: ReviewRequest, now = Date.now()) {
  if (request.confirmed) return { key: "confirmed", label: "Reseña confirmada", tone: "green" } as const;
  if (request.google_opened_at) return { key: "opened", label: "Abrió el enlace de Google", tone: "blue" } as const;
  if (request.sent_at) return { key: "sent", label: "Petición enviada", tone: "slate" } as const;
  if (request.status === "uncertain") return { key: "uncertain", label: "GastroHelp está revisando el envío", tone: "amber" } as const;
  if (request.status === "cancelled") return { key: "cancelled", label: "Petición cancelada", tone: "slate" } as const;
  if (!request.consent) return { key: "blocked", label: "Sin permiso de WhatsApp", tone: "amber" } as const;
  if (new Date(request.scheduled_for).getTime() > now) return { key: "scheduled", label: "Programada tras la visita", tone: "slate" } as const;
  if (request.status === "prepared") return { key: "prepared", label: "Envío pendiente de revisión", tone: "amber" } as const;
  if (request.status === "blocked") return { key: "blocked", label: "Envío pendiente de activación", tone: "amber" } as const;
  return { key: "ready", label: request.previous_requests ? "Nueva petición automática pendiente" : "Envío automático pendiente", tone: "blue" } as const;
}

export function canPrepareReview(request: ReviewRequest, now = Date.now()): boolean {
  return !request.confirmed && !request.sent_at && request.consent
    && !["cancelled", "uncertain"].includes(request.status)
    && Number.isFinite(new Date(request.scheduled_for).getTime())
    && new Date(request.scheduled_for).getTime() <= now
    && whatsappPhone(request.telefono) !== null;
}

export function isReviewToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
