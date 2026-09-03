import type { PublicRestaurant } from "./publicRestaurant";

export const BOOKING_LEGAL_VERSION = "2026-08-03";

export const LEGAL_DOCUMENTS = [
  "aviso-legal",
  "privacidad",
  "condiciones-reserva",
  "cookies",
] as const;

export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];

export function isLegalDocument(value: string): value is LegalDocument {
  return LEGAL_DOCUMENTS.includes(value as LegalDocument);
}

export function legalPath(
  restaurant: Pick<PublicRestaurant, "slug" | "customDomain" | "legalBasePath">,
  document: LegalDocument,
) {
  if (restaurant.legalBasePath) {
    return `${restaurant.legalBasePath.replace(/\/$/, "")}/${document}`;
  }
  return restaurant.customDomain
    ? `/legal/${document}`
    : `/restaurante/${restaurant.slug}/legal/${document}`;
}

export function legalUpdatedLabel(value: string) {
  if (!value) return "3 de agosto de 2026";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}
