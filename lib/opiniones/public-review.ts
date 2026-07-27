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
};

export type CopyState = "idle" | "copied" | "empty" | "failed";
export type ReviewStep = "intro" | "form" | "handoff";

export type CompletedSession = {
  rating: number;
  comment: string;
  name: string;
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

export const ratingCopy: Record<number, { label: string; helper: string }> = {
  1: { label: "Muy mala", helper: "Gracias por decírnoslo. Queremos entender qué debemos corregir." },
  2: { label: "Mejorable", helper: "Tu comentario nos ayudará a detectar exactamente qué falló." },
  3: { label: "Bien", helper: "Cuéntanos qué detalle habría hecho la experiencia mejor." },
  4: { label: "Muy buena", helper: "Nos alegra saber que disfrutaste. Cuéntanos qué destacarías." },
  5: { label: "Excelente", helper: "¡Muchas gracias! ¿Qué fue lo que más te gustó?" },
};

export const quickHighlights = [
  "La comida estaba muy buena.",
  "El servicio fue rápido y atento.",
  "El ambiente fue muy agradable.",
  "Las raciones fueron generosas.",
  "Volveremos.",
  "Muy recomendable.",
];

const SESSION_LIFETIME = 30 * 60 * 1000;
export const tokenKey = (slug: string) => `gastrohelp-opinion-token:${slug}`;
export const draftKey = (slug: string) => `gastrohelp-opinion-draft:${slug}`;
export const completedKey = (slug: string) => `gastrohelp-opinion-completed:${slug}`;
export const redirectKey = (slug: string) => `gastrohelp-google-redirect:${slug}`;

export function sessionGet(key: string) {
  try { return window.sessionStorage.getItem(key); } catch { return null; }
}

export function sessionSet(key: string, value: string) {
  try { window.sessionStorage.setItem(key, value); } catch { /* storage is optional */ }
}

export function sessionRemove(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* storage is optional */ }
}

export function readCompletedSession(slug: string): CompletedSession | null {
  const raw = sessionGet(completedKey(slug));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as CompletedSession;
    if (Date.now() - value.completedAt < SESSION_LIFETIME) return value;
  } catch { /* ignore corrupted session */ }
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
  } catch { /* use fallback */ }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.readOnly = true;
    textarea.style.cssText = "position:fixed;left:-9999px;opacity:0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}

export function toggleHighlight(current: string, phrase: string) {
  const clean = current.trim();
  if (clean.includes(phrase)) {
    return clean.replace(phrase, "").replace(/\s{2,}/g, " ").trim().slice(0, 2000);
  }
  const separator = clean ? (/[.!?]$/.test(clean) ? " " : ". ") : "";
  return `${clean}${separator}${phrase}`.slice(0, 2000);
}
