export type MealService = "desayuno" | "comida" | "cena";

const numberWords: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuna: 21, veintiuno: 21, veintidos: 22, veintitres: 23 };

function numericWords(text: string) {
  return normalizeText(text).replace(/\b[a-z]+\b/g, word => word in numberWords ? String(numberWords[word]) : word);
}

// This canonical routing value contains booking details only, never names or contact data.
export const pendingBookingPattern = /^(?:reservar|disponibilidad)(?: para (?:cenar|comer|desayunar))?(?: para \d{1,3} personas)?(?: (?:hoy|manana|pasado manana|(?:este |proximo )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)|el (?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)))?(?: a las \d{1,2}:[0-5]\d)?$/;

export function explicitParty(text: string, answeringParty = false) {
  const value = numericWords(text);
  const match = value.match(/\b(?:somos|seremos|para)\s+(\d{1,3})(?![\d/:.-])\b/)
    || value.match(/\b(\d{1,3})\s+(?:personas?|comensal(?:es)?)\b/)
    || (answeringParty ? value.match(/^(\d{1,3})(?: (?:por favor|gracias))?[.!]?$/) : null);
  if (match && /^\s+(?:reservas?\b|mesas?\b|\d)/.test(value.slice((match.index || 0) + match[0].length))) return null;
  return match ? Number(match[1]) : null;
}

export function bookingIntentDetails(text: string, availability = false) {
  const value = normalizeText(text);
  const service = mealService(text);
  const party = explicitParty(text);
  const date = value.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/)?.[0];
  const relative = value.replace(/\b(?:de|por) la manana\b/g, "").match(/\b(pasado manana|manana|hoy|(?:este |proximo )?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/)?.[0]
    || (/\besta (?:noche|tarde)\b/.test(value) ? "hoy" : "");
  const time = parseRequestedTime(text, service, false);
  return [availability ? "disponibilidad" : "reservar", service ? `para ${service === "cena" ? "cenar" : service === "comida" ? "comer" : "desayunar"}` : "",
    party ? `para ${party} personas` : "", date ? `el ${date}` : relative || "",
    time ? `a las ${time.time || time.ambiguous}` : ""].filter(Boolean).join(" ");
}

export function informationIntent(text: string): "hours" | "address" | "menu" | null {
  const value = normalizeText(text);
  if (/\b(h?orarios?|abris|abren?|abrir|abiert[oa]s?|apertura|cerrais|cierran?|cerrar|cerrad[oa]s?|cierre)\b/.test(value)) return "hours";
  if (/\b(direccion|ubicacion|donde (?:estais|estan|queda|est[aá])|como llegar|maps)\b/.test(value)) return "address";
  if (/\b(menu|carta|carya|platos|comida)\b/.test(value)) return "menu";
  return null;
}

export function asksAvailability(text: string) {
  const value = normalizeText(text).replace(/\bq\b/g, "que");
  if (informationIntent(text) === "hours" && !/\b(?:todos los (?:horarios|turnos))\b/.test(value)) return false;
  return /\b(disponibilidad|disponibles?|huecos?|alternativas?)\b|\b(?:cualquier hora|todo el dia|todos los (?:horarios|turnos))\b/.test(value)
    || /\b(?:que|cuales|otras?) horas?\b|\bhoras? (?:hay|tienes|teneis|quedan|libres)\b/.test(value)
    || /\b(?:hay|tienes|teneis|queda) (?:sitio|mesa)\b/.test(value)
    || /\b(?:mas tarde|mas temprano|mas pronto|a que hora (?:puedo|podemos|se puede))\b/.test(value);
}

export function humanRequest(text: string) {
  const value = normalizeText(text);
  return /\b(humano|equipo|encargado|responsable|hablar con alguien|hablar con una persona)\b/.test(value)
    || (/\bpersona\b/.test(value) && explicitParty(text) === null);
}

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+:/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mealService(text: string): MealService | undefined {
  const value = normalizeText(text).replace(/_/g, " ");
  if (/\b(cenar|cena|noche|dinner)\b/.test(value)) return "cena";
  if (/\b(comer|comida|mediodia|lunch)\b/.test(value)) return "comida";
  if (/\b(desayunar|desayuno|breakfast)\b|\b(?:de|por) la manana\b/.test(value)) return "desayuno";
  return undefined;
}

export function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function serviceAt(time: string): MealService {
  const minutes = minutesOf(time);
  return minutes >= 18 * 60 || minutes < 5 * 60 ? "cena" : minutes >= 11 * 60 ? "comida" : "desayuno";
}

export function parseRequestedTime(text: string, preferredService?: MealService, answeringTime = true) {
  const value = numericWords(text);
  // A bare number is an hour only when answering the time question. Its suffix must
  // also describe a time: the article in "una reserva" is never a clock value.
  const bare = value.match(/^(\d{1,2})(?:(?:[:.]|\s+)([0-5]\d)|\s+(y media|y cuarto|menos cuarto))?(?:\s*(am|pm|h|horas?))?(?=\s|[.!?]?$)/);
  const bareSuffix = bare ? value.slice(bare[0].length).trim() : "";
  const bareIsTime = bare && (answeringTime || bare[2] || bare[3] || bare[4])
    && /^(?:(?:(?:de|por) la (?:manana|tarde|noche)|para (?:cenar|comer|desayunar)|del mediodia)\s*)?(?:(?:por favor|gracias)\s*)?[.!]?$/.test(bareSuffix);
  const match = value.match(/\b(?:a las?|sobre las?|hacia las?|para las?|hora(?: es| seria)?[: ]*)\s+(\d{1,2})(?:(?:[:.]|\s+)([0-5]\d)|\s+(y media|y cuarto|menos cuarto))?(?:\s*(am|pm|h|horas?))?(?=\s|[.!?]?$)/)
    || value.match(/\b(\d{1,2})[:.]([0-5]\d)(?:\s+(y media|y cuarto|menos cuarto))?(?:\s*(am|pm|h|horas?))?(?=\s|[.!?]?$)/)
    || (bareIsTime ? bare : null);
  if (!match || Number(match[1]) > 23 || /^\s+(?:\d|personas\b|comensales\b)/.test(value.slice((match.index || 0) + match[0].length))) return null;
  let hour = Number(match[1]);
  let minute = Number(match[2] || 0);
  if (match[3] === "y media") minute = 30;
  if (match[3] === "y cuarto") minute = 15;
  if (match[3] === "menos cuarto") { hour = (hour + 23) % 24; minute = 45; }
  const explicitService = mealService(text);
  const service = explicitService || preferredService;
  const afternoon = match[4] === "pm" || /\b(?:tarde|noche)\b/.test(value);
  const morning = match[4] === "am" || /\b(?:de|por) la manana\b/.test(value);
  const explicit24 = match[1].startsWith("0") || Number(match[1]) > 12 || match[4] === "h" || /^hora/.test(match[4] || "");
  if (afternoon && hour < 12) hour += 12;
  else if (morning && hour === 12) hour = 0;
  else if (!morning && !explicit24 && service === "cena" && hour < 12) hour += 12;
  else if (!morning && !explicit24 && service === "comida" && hour >= 1 && hour <= 5) hour += 12;
  else if (!morning && !explicit24 && service !== "desayuno" && hour > 0 && hour < 12) {
    return { ambiguous: `${hour}:${String(minute).padStart(2, "0")}`, time: null, service };
  }
  if (Number(match[1]) === 12 && match[3] !== "menos cuarto" && /\b(?:media ?noche|12 de la noche)\b/.test(value)) hour = 0;
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return { ambiguous: null, time, service: explicitService || serviceAt(time) };
}
