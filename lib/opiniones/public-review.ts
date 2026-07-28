export type PublicConfig = {
  restaurante_id: string;
  restaurante_nombre: string;
  slug: string;
  google_review_url: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  color_background: string;
  headline: string;
  subheadline: string;
  auto_open_google: boolean;
  google_delay_ms: number;
  low_rating_threshold: number;
  contact_prompt_enabled: boolean;
};

export type CopyState = "idle" | "copied" | "empty" | "failed";
export type ReviewStep = "rating" | "details" | "handoff";
export type AspectKey =
  | "comida"
  | "servicio"
  | "ambiente"
  | "espera"
  | "limpieza"
  | "calidad_precio";
export type ContactType = "telefono" | "email" | "ninguno";
export type ReviewEventType =
  | "view"
  | "rating_selected"
  | "details_opened"
  | "submitted"
  | "copy_succeeded"
  | "copy_failed"
  | "google_opened"
  | "returned_from_google";

export type CompletedSession = {
  rating: number;
  comment: string;
  name: string;
  aspects: AspectKey[];
  copyState: CopyState;
  completedAt: number;
};

export const allowedOrigins = new Set([
  "mesa",
  "caja",
  "entrada",
  "portacuentas",
  "redes",
]);

export const aspectDefinitions: Array<{
  key: AspectKey;
  label: string;
  positive: string;
  neutral: string;
  negative: string;
}> = [
  {
    key: "comida",
    label: "Comida",
    positive: "La comida estaba muy buena",
    neutral: "La comida estuvo bien, aunque podría mejorar algún detalle",
    negative: "La comida no estuvo a la altura de lo esperado",
  },
  {
    key: "servicio",
    label: "Servicio",
    positive: "El servicio fue atento y cercano",
    neutral: "El servicio fue correcto, aunque podría ser más ágil",
    negative: "El servicio necesita mejorar",
  },
  {
    key: "ambiente",
    label: "Ambiente",
    positive: "El ambiente fue muy agradable",
    neutral: "El ambiente fue correcto",
    negative: "El ambiente no resultó tan agradable como esperábamos",
  },
  {
    key: "espera",
    label: "Tiempo de espera",
    positive: "Nos atendieron con rapidez",
    neutral: "El tiempo de espera fue algo largo",
    negative: "Tuvimos que esperar demasiado",
  },
  {
    key: "limpieza",
    label: "Limpieza",
    positive: "Todo estaba muy limpio y cuidado",
    neutral: "La limpieza fue correcta",
    negative: "La limpieza debería cuidarse más",
  },
  {
    key: "calidad_precio",
    label: "Calidad-precio",
    positive: "La relación calidad-precio nos pareció muy buena",
    neutral: "La relación calidad-precio fue aceptable",
    negative: "La relación calidad-precio no nos convenció",
  },
];

export const ratingCopy: Record<
  number,
  {
    label: string;
    helper: string;
    detailTitle: string;
    detailHelper: string;
  }
> = {
  1: {
    label: "Muy mala",
    helper: "Sentimos que la experiencia no estuviera a la altura.",
    detailTitle: "Ayúdanos a entender qué falló",
    detailHelper: "Marca los puntos que deberíamos revisar. Tu opinión llegará directamente al restaurante.",
  },
  2: {
    label: "Mejorable",
    helper: "Gracias por decírnoslo con claridad.",
    detailTitle: "¿Qué deberíamos mejorar?",
    detailHelper: "Selecciona los aspectos que más influyeron en tu valoración.",
  },
  3: {
    label: "Bien",
    helper: "La experiencia fue correcta, pero todavía podemos mejorar.",
    detailTitle: "¿Qué detalle habría marcado la diferencia?",
    detailHelper: "Puedes destacar lo bueno y señalar qué faltó para que fuera una experiencia excelente.",
  },
  4: {
    label: "Muy buena",
    helper: "Nos alegra saber que disfrutaste.",
    detailTitle: "¿Qué destacarías de la experiencia?",
    detailHelper: "Marca lo que más te gustó y te ayudaremos a preparar un comentario natural.",
  },
  5: {
    label: "Excelente",
    helper: "Muchas gracias. Nos encanta saber que lo disfrutaste.",
    detailTitle: "¿Qué fue lo mejor de tu visita?",
    detailHelper: "Selecciona tus puntos favoritos y prepara tu reseña en unos segundos.",
  },
};

export const closingPhrasesByRating: Record<number, string[]> = {
  1: ["Esperamos que puedan solucionarlo.", "Nos gustaría que se tuviera en cuenta."],
  2: ["Con algunos cambios la experiencia podría mejorar mucho.", "Esperamos que sirva para mejorar."],
  3: ["Con unos pequeños ajustes la experiencia sería mucho mejor.", "En general estuvo bien."],
  4: ["Volveremos.", "Una experiencia muy recomendable."],
  5: ["Volveremos sin duda.", "Muy recomendable.", "Repetiremos seguro."],
};

const SESSION_LIFETIME = 45 * 60 * 1000;
export const tokenKey = (slug: string) => `gastrohelp-opinion-token:${slug}`;
export const draftKey = (slug: string) => `gastrohelp-opinion-draft:${slug}`;
export const completedKey = (slug: string) => `gastrohelp-opinion-completed:${slug}`;
export const redirectKey = (slug: string) => `gastrohelp-google-redirect:${slug}`;
export const eventKey = (slug: string, event: string) =>
  `gastrohelp-opinion-event:${slug}:${event}`;

export function sessionGet(key: string) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage is an enhancement; the flow remains usable without it.
  }
}

export function sessionRemove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage is optional.
  }
}

export function readCompletedSession(slug: string): CompletedSession | null {
  const raw = sessionGet(completedKey(slug));
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as CompletedSession;
    if (Date.now() - value.completedAt < SESSION_LIFETIME) return value;
  } catch {
    // Ignore malformed session data.
  }

  sessionRemove(completedKey(slug));
  sessionRemove(redirectKey(slug));
  return null;
}

export function createSubmissionToken(slug: string) {
  const key = tokenKey(slug);
  const stored = sessionGet(key);
  if (stored) return stored;
  const token = crypto.randomUUID();
  sessionSet(key, token);
  return token;
}

export async function copyText(text: string) {
  if (!text.trim()) return false;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Continue with the legacy fallback.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function toggleAspect(current: AspectKey[], aspect: AspectKey) {
  return current.includes(aspect)
    ? current.filter((item) => item !== aspect)
    : [...current, aspect].slice(0, 6);
}

function joinNatural(parts: string[]) {
  const clean = parts.map((part) => part.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  if (clean.length === 2) return `${clean[0]} y ${clean[1].toLowerCase()}`;
  return `${clean.slice(0, -1).join(", ")} y ${clean.at(-1)?.toLowerCase()}`;
}

export function buildSuggestedComment(
  rating: number,
  aspects: AspectKey[],
  closing?: string,
) {
  const tone = rating >= 4 ? "positive" : rating === 3 ? "neutral" : "negative";
  const selected = aspectDefinitions
    .filter((definition) => aspects.includes(definition.key))
    .map((definition) => definition[tone]);

  let body = joinNatural(selected);
  if (body && !/[.!?]$/.test(body)) body += ".";
  if (closing) body = `${body}${body ? " " : ""}${closing}`;

  return body.slice(0, 2000);
}

export function normalizeContactType(value: string): ContactType {
  return value === "telefono" || value === "email" ? value : "ninguno";
}

export function isValidContact(type: ContactType, value: string) {
  const clean = value.trim();
  if (type === "telefono") return /^[+\d][\d\s().-]{6,24}$/.test(clean);
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  return false;
}

export function trackPublicEvent({
  slug,
  token,
  event,
  origin,
  rating,
  once = false,
}: {
  slug: string;
  token: string;
  event: ReviewEventType;
  origin: string;
  rating?: number;
  once?: boolean;
}) {
  if (once) {
    const key = eventKey(slug, event);
    if (sessionGet(key) === "done") return;
    sessionSet(key, "done");
  }

  void fetch(`/api/opiniones/${encodeURIComponent(slug)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submissionToken: token,
      eventType: event,
      origen: origin,
      rating: rating ?? null,
    }),
    keepalive: true,
  }).catch(() => {
    // Analytics must never block the customer experience.
  });
}
