import { normalizeText, mealService, minutesOf, serviceAt, parseRequestedTime, explicitParty, informationIntent, asksAvailability, humanRequest, type MealService } from "../../lib/chatbot/booking-details";
import { addCalendarDays, dateInTimezone, isBookingDateAllowed } from "./bookingDate";

export const CHATBOT_STATES = [
  "idle",
  "booking_party",
  "booking_date",
  "booking_time",
  "booking_name",
  "booking_email",
  "booking_confirm",
  "manage_select",
  "manage_action",
  "cancel_confirm",
  "reschedule_date",
  "reschedule_time",
  "reschedule_confirm",
  "handoff",
] as const;

export type ChatbotState = (typeof CHATBOT_STATES)[number];

export type ChatbotSlot = {
  start: string;
  time: string;
  service?: string;
};

export type ChatbotReservation = {
  id: string;
  managementToken: string;
  name: string;
  party: number;
  start: string;
};

export type ChatbotDraft = {
  availabilityRequested?: boolean;
  availabilityDirection?: "later" | "earlier";
  availabilityAnchor?: string;
  unavailableTime?: boolean;
  editingField?: "choose" | "party" | "date" | "time" | "name" | "email";
  confirmationPrompt?: string;
  confirmationVersion?: string;
  party?: number;
  date?: string;
  slots?: ChatbotSlot[];
  start?: string;
  time?: string;
  service?: MealService;
  timeToClarify?: string;
  name?: string;
  email?: string;
  idempotencyKey?: string;
  reservations?: ChatbotReservation[];
  selectedReservation?: ChatbotReservation;
  manageIntent?: "cancel" | "reschedule" | "choose";
};

export type ChatbotRestaurant = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  bookingEnabled: boolean;
  minParty: number;
  maxParty: number;
  maxAdvanceDays: number;
  requiresEmail: boolean;
  address: string;
  mapsUrl: string;
  menuUrl: string;
  hoursLunch: string;
  hoursDinner: string;
  privacyUrl: string;
  bookingTermsUrl: string;
};

export type ChatbotDependencies = {
  getOpeningHours?: (date?: string) => Promise<string | null>;
  getServiceRanges?: (date: string) => Promise<{ service: string; start: string; end: string }[] | null>;
  getAvailability: (
    date: string,
    party: number,
    excludeReservationId?: string,
  ) => Promise<ChatbotSlot[]>;
  createBooking: (input: {
    start: string;
    party: number;
    name: string;
    phone: string;
    email: string;
    idempotencyKey: string;
    confirmation: { prompt: string; response: string; version: string };
  }) => Promise<{ reservationId: string; start: string; managementPath: string; clientAppPath?: string }>;
  listUpcomingReservations: () => Promise<ChatbotReservation[]>;
  cancelReservation: (managementToken: string) => Promise<void>;
  rescheduleReservation: (managementToken: string, start: string) => Promise<void>;
};

export type ChatbotEngineInput = {
  state: ChatbotState;
  draft: ChatbotDraft;
  text: string;
  phone: string;
  contactName: string;
  mode: "live" | "pilot" | "test";
  restaurant: ChatbotRestaurant;
  dependencies: ChatbotDependencies;
};

export type ChatbotEngineResult = {
  reply: string;
  state: ChatbotState;
  draft: ChatbotDraft;
  selectedReservationId: string | null;
  handoff: boolean;
  suppressDelivery?: boolean;
  action?: "booking_created" | "booking_cancelled" | "booking_rescheduled" | "test_only";
};

function isNegative(text: string) {
  return ["no", "salir", "cancelar proceso", "empezar de nuevo", "reiniciar"].includes(
    normalizeText(text),
  );
}

function isHumanRequest(text: string) {
  return humanRequest(text);
}

function parseParty(text: string) {
  const match = normalizeText(text).match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : null;
}

function parseDate(text: string, timezone: string, now = new Date()) {
  const value = normalizeText(text).replace(/\b(?:a nombre de|me llamo|el nombre es)\b.*$/, "").replace(/\b(?:de|por) la manana\b/g, "");
  const today = dateInTimezone(timezone, now);

  if (/\bpasado manana\b/.test(value)) return addCalendarDays(today, 2);
  if (/\bmanana\b/.test(value)) return addCalendarDays(today, 1);
  if (/\bhoy\b/.test(value)) return today;
  if (/\besta (?:noche|tarde)\b/.test(value)) return today;

  const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const weekday = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`).test(value));
  if (weekday >= 0) {
    const distance = (weekday - new Date(`${today}T12:00:00Z`).getUTCDay() + 7) % 7;
    return addCalendarDays(today, distance || (/\bproximo\b/.test(value) ? 7 : 0));
  }

  const iso = value.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (!local) return null;

  const day = Number(local[1]);
  const month = Number(local[2]);
  const currentYear = Number(today.slice(0, 4));
  let year = local[3] ? Number(local[3]) : currentYear;
  if (year < 100) year += 2000;

  const candidate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!local[3] && candidate < today) {
    year += 1;
  }

  const result = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const parsed = new Date(`${result}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === result
    ? result
    : null;
}

function parseEmail(text: string) {
  const match = text.trim().toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  return match ? match[0].slice(0, 254) : null;
}

function formatLocalDate(start: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(start));
  } catch {
    return start;
  }
}

function slotList(slots: ChatbotSlot[]) {
  return slots.map(slot => slot.time.slice(0, 5)).join(", ");
}

function reset(reply: string, action?: ChatbotEngineResult["action"]): ChatbotEngineResult {
  return {
    reply,
    state: "idle",
    draft: {},
    selectedReservationId: null,
    handoff: false,
    action,
  };
}

function handoff(restaurantName: string): ChatbotEngineResult {
  return {
    reply: `Te paso con el equipo de ${restaurantName}. En cuanto puedan, te responderán por aquí.`,
    state: "handoff",
    draft: {},
    selectedReservationId: null,
    handoff: true,
  };
}

function stateResult(
  reply: string,
  state: ChatbotState,
  draft: ChatbotDraft,
  handoffValue = false,
): ChatbotEngineResult {
  return {
    reply,
    state,
    draft,
    selectedReservationId: draft.selectedReservation?.id || null,
    handoff: handoffValue,
  };
}

function bookingSummary(draft: ChatbotDraft, restaurant: ChatbotRestaurant) {
  return [
    `${draft.name}`,
    `${draft.party} personas`,
    formatLocalDate(String(draft.start), restaurant.timezone),
    draft.email ? `Correo: ${draft.email}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function confirmationReply(draft: ChatbotDraft, restaurant: ChatbotRestaurant) {
  const reply = [
    "Comprueba la reserva:",
    bookingSummary(draft, restaurant),
    "",
    "¿Son correctos estos datos?",
  ].join("\n");
  draft.confirmationPrompt = reply;
  draft.confirmationVersion = "booking-details-v1";
  delete draft.editingField;
  return reply;
}

function isAffirmative(text: string) {
  const value = normalizeText(text).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:si|claro)(?: (?:todo |esta |esta todo |son |estan |los datos son |los datos estan )?(?:correctos?|bien|perfecto))?|(?:todo |esta |esta todo |estan |son |los datos son |los datos estan )?(?:correctos?|bien)|vale|perfecto|adelante|de acuerdo|confirmo|confirmar|acepto reserva|ok|okey|asi esta bien)(?: por favor| gracias)?$/.test(value);
}

function rememberTime(draft: ChatbotDraft, text: string) {
  const request = parseRequestedTime(text, mealService(text) || draft.service, false);
  if (!request) return false;
  draft.time = request.time || undefined;
  draft.timeToClarify = request.ambiguous || undefined;
  draft.service = request.service || draft.service;
  delete draft.start;
  delete draft.slots;
  delete draft.unavailableTime;
  delete draft.availabilityRequested;
  delete draft.availabilityDirection;
  delete draft.availabilityAnchor;
  return true;
}

async function continueBooking(input: ChatbotEngineInput, draft: ChatbotDraft) {
  if (!draft.party || draft.party < input.restaurant.minParty || draft.party > input.restaurant.maxParty) {
    return stateResult("¿Para cuántas personas?", "booking_party", draft);
  }
  if (!draft.date || !isBookingDateAllowed(draft.date, input.restaurant.timezone, input.restaurant.maxAdvanceDays)) {
    return stateResult("¿Para qué día quieres reservar?", "booking_date", draft);
  }
  if (draft.availabilityRequested) return availableTimes(input, draft, false);
  const time = draft.time || draft.timeToClarify;
  if (time) return checkRequestedTime({ ...input, text: `a las ${time}` }, draft, false);
  return stateResult("¿A qué hora quieres reservar?", "booking_time", draft);
}

function correctionQuestion(restaurant: ChatbotRestaurant) {
  return `¿Qué dato está mal: el nombre, las personas, la fecha${restaurant.requiresEmail ? ", el correo" : ""} o la hora?`;
}

async function correctBooking(input: ChatbotEngineInput, draft: ChatbotDraft): Promise<ChatbotEngineResult | null> {
  const text = input.text.trim(), value = normalizeText(text);
  const party = explicitParty(text);
  const date = parseDate(text, input.restaurant.timezone);
  const time = /\b(?:a las?|sobre las?|hacia las?|para las?|hora)\s|\b\d{1,2}[:.]\d{2}\b|^\d{1,2} \d{2}$/.test(value)
    ? parseRequestedTime(text, mealService(text) || draft.service) : null;
  const name = text.match(/(?:a nombre de|me llamo|el nombre es|nombre\s*:)\s+(.+)$/i)?.[1];
  const email = text.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0];
  const field = /\b(nombre|llamo)\b/.test(value) ? "name"
    : /\b(correo|email)\b/.test(value) ? "email"
    : /\b(personas|comensales|somos|seremos)\b/.test(value) ? "party"
    : /\b(fecha|dia)\b/.test(value) ? "date"
    : /\b(hora)\b/.test(value) ? "time" : null;
  if (party === null && !date && !time && !name && !email && !field
      && draft.editingField !== "choose" && !/^(?:no\b|incorrect|hay un error|quiero (?:cambiar|corregir)|cambiar|modificar)/.test(value)) return null;
  delete draft.confirmationPrompt;
  delete draft.confirmationVersion;
  draft.idempotencyKey = crypto.randomUUID();
  if (party !== null) draft.party = party;
  if (date) draft.date = date;
  if (time) rememberTime(draft, text);
  if (name) draft.name = name.replace(/\s+/g, " ").trim().slice(0,120);
  if (email) draft.email = parseEmail(email) || undefined;
  if (party !== null || date || time || name || email) {
    delete draft.editingField;
    delete draft.start;
    delete draft.slots;
    return continueBooking(input, draft);
  }
  if (field) {
    draft.editingField = field;
    delete draft[field];
    if (["party", "date", "time"].includes(field)) { delete draft.start; delete draft.slots; }
    if (field === "time") delete draft.timeToClarify;
    const state = `booking_${field}` as ChatbotState;
    return stateResult(promptForState(state, draft), state, draft);
  }
  draft.editingField = "choose";
  return stateResult(correctionQuestion(input.restaurant), "booking_confirm", draft);
}

function isBookingIntent(text: string) {
  const value = normalizeText(text);
  return /\b(reservar|reserva|mesa)\b/.test(value)
    && !/\b(?:no quiero|no necesito|no deseo|sin)\s+(?:(?:hacer|una)\s+)*(?:reservar|reserva)\b/.test(value);
}

function welcomeReply(restaurantName: string) {
  return `Hola, soy el asistente de ${restaurantName}. ¿En qué puedo ayudarte?\nPuedo ayudarte con la carta, los horarios, la ubicación o tus reservas. También puedes pedir hablar con el equipo.`;
}

function managementIntent(text: string): "cancel" | "reschedule" | "choose" | null {
  const value = normalizeText(text);
  if (/\b(cancelar|anular)\b.*\b(reserva|mesa)\b|\b(reserva|mesa)\b.*\b(cancelar|anular)\b|^(?:(?:quiero|puedes) )?(?:cancelar|anular|cancelala|anulala)$/.test(value)) {
    return "cancel";
  }
  if (/\b(cambiar|modificar|mover|reprogramar)\b.*\b(reserva|mesa)\b|\b(reserva|mesa)\b.*\b(cambiar|modificar|mover|reprogramar)\b|\b(cambiarla|modificarla|moverla)\b/.test(value)) {
    return "reschedule";
  }
  if (/\b(mis reservas|gestionar reserva)\b/.test(value)) return "choose";
  return null;
}

function faqIntent(text: string) {
  return informationIntent(text);
}

function faqReply(intent: "hours" | "address" | "menu", restaurant: ChatbotRestaurant) {
  if (intent === "hours") {
    const lines = [
      restaurant.hoursLunch ? `Comidas: ${restaurant.hoursLunch}` : "",
      restaurant.hoursDinner ? `Cenas: ${restaurant.hoursDinner}` : "",
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : "No se la respuesta. Puedes pedir hablar con el equipo.";
  }

  if (intent === "address") {
    if (!restaurant.address && !restaurant.mapsUrl) {
      return "No se la respuesta. Puedes pedir hablar con el equipo.";
    }
    return [restaurant.address, restaurant.mapsUrl].filter(Boolean).join("\n");
  }

  return restaurant.menuUrl
    ? `Puedes ver la carta aquí: ${restaurant.menuUrl}`
    : "La carta no está publicada. Puedes pedir hablar con el equipo.";
}

function promptForState(state: ChatbotState, draft: ChatbotDraft) {
  switch (state) {
    case "booking_party":
      return "¿Para cuántas personas?";
    case "booking_date":
      return "¿Qué fecha quieres?";
    case "booking_time":
    case "reschedule_time":
      return draft.slots?.length
        ? `Tengo sitio a las ${slotList(draft.slots)}. ¿Qué hora te va bien?`
        : "¿A qué hora quieres reservar?";
    case "booking_name":
      return "¿A qué nombre hago la reserva?";
    case "booking_email":
      return "Necesito un correo válido para esta reserva.";
    case "booking_confirm":
      return draft.editingField === "choose" ? "¿Qué dato quieres corregir?" : "¿Son correctos los datos de la reserva?";
    case "manage_select":
      return "Responde con el número de la reserva que quieres gestionar.";
    case "manage_action":
      return "¿Quieres cambiar la reserva o cancelarla?";
    case "cancel_confirm":
      return "¿Quieres que cancele esta reserva?";
    case "reschedule_date":
      return "¿A qué nueva fecha quieres moverla?";
    case "reschedule_confirm":
      return "¿Son correctos los nuevos datos de la reserva?";
    case "handoff":
      return "El equipo continuará la conversación.";
    default:
      return "¿En qué más puedo ayudarte?";
  }
}

const serviceOrder = { desayuno: 0, comida: 1, cena: 2 };
const serviceLabel = (service: MealService) => ({ desayuno: "desayunar", comida: "comer", cena: "cenar" })[service];
const slotService = (slot: ChatbotSlot) => mealService(slot.service || "") || serviceAt(slot.time);

function groupedSlots(slots: ChatbotSlot[]) {
  const services = [...new Set(slots.map(slotService))];
  return services.map(service => `Para ${serviceLabel(service)}: ${slotList(slots.filter(slot => slotService(slot) === service))}.`).join("\n");
}

function invalidateSummary(draft: ChatbotDraft) {
  delete draft.confirmationPrompt;
  delete draft.confirmationVersion;
  delete draft.start;
  draft.idempotencyKey = crypto.randomUUID();
}

async function availableTimes(input: ChatbotEngineInput, draft: ChatbotDraft, rescheduling: boolean) {
  const party = rescheduling ? draft.selectedReservation?.party : draft.party;
  draft.availabilityRequested = true;
  if (!party || party < input.restaurant.minParty || party > input.restaurant.maxParty) {
    return stateResult("¿Para cuántas personas quieres consultar?", "booking_party", draft);
  }
  if (!draft.date || !isBookingDateAllowed(draft.date, input.restaurant.timezone, input.restaurant.maxAdvanceDays)) {
    return stateResult("¿Para qué día quieres consultar?", rescheduling ? "reschedule_date" : "booking_date", draft);
  }
  const slots = await input.dependencies.getAvailability(draft.date, party, rescheduling ? draft.selectedReservation?.id : undefined);
  const service = draft.service;
  let choices = service ? slots.filter(slot => slotService(slot) === service) : slots;
  // A later service can keep the same day. Never offer breakfast or lunch after a dinner request.
  if (!choices.length && service) choices = slots.filter(slot => serviceOrder[slotService(slot)] > serviceOrder[service]);
  if (draft.availabilityDirection && draft.availabilityAnchor) {
    const anchor = minutesOf(draft.availabilityAnchor);
    choices = choices.filter(slot => draft.availabilityDirection === "later" ? minutesOf(slot.time) > anchor : minutesOf(slot.time) < anchor);
  }
  choices = [...choices].sort((a,b) => minutesOf(a.time)-minutesOf(b.time));
  if (draft.availabilityDirection === "earlier") choices = choices.slice(-6);
  else choices = choices.slice(0,6);
  invalidateSummary(draft);
  delete draft.time;
  delete draft.timeToClarify;
  draft.slots = choices;
  draft.unavailableTime = !choices.length;
  const state = rescheduling ? "reschedule_time" : "booking_time";
  if (!choices.length) return stateResult(
    `No quedan huecos${service ? ` para ${serviceLabel(service)}` : ""}${draft.availabilityDirection === "later" ? " más tarde" : draft.availabilityDirection === "earlier" ? " más temprano" : ""} para ${party} personas ese día. Puedes indicarme otra fecha o consultar otro servicio.`, state, draft);
  const services = [...new Set(choices.map(slotService))];
  if (services.length === 1) draft.service = services[0];
  return stateResult(`Estos son los huecos para ${party} personas:\n${groupedSlots(choices)}\n¿Qué hora te viene bien?`, state, draft);
}

async function unavailableTimeReply(input: ChatbotEngineInput, draft: ChatbotDraft, slots: ChatbotSlot[], rescheduling: boolean) {
  const time = String(draft.time);
  let service = draft.service || serviceAt(time);
  let reason = `A las ${time} no hay disponibilidad.`;
  if (input.dependencies.getServiceRanges && draft.date) {
    try {
      const ranges = await input.dependencies.getServiceRanges(draft.date);
      const containing = ranges?.find(range => range.start <= time && time < range.end);
      if (containing) service = mealService(containing.service) || service;
      else if (ranges !== null) reason = `A las ${time} estamos fuera del horario de servicio.`;
    } catch { /* Availability remains authoritative; do not guess opening hours on a read error. */ }
  }
  let alternatives = slots.filter(slot => slotService(slot) === service)
    .sort((a,b) => Math.abs(minutesOf(a.time)-minutesOf(time))-Math.abs(minutesOf(b.time)-minutesOf(time))).slice(0,4);
  if (!alternatives.length) alternatives = slots.filter(slot => serviceOrder[slotService(slot)] > serviceOrder[service]
    && minutesOf(slot.time) > minutesOf(time)).slice(0,4);
  alternatives.sort((a,b) => minutesOf(a.time)-minutesOf(b.time));
  invalidateSummary(draft);
  delete draft.timeToClarify;
  draft.slots = alternatives;
  draft.unavailableTime = true;
  draft.availabilityRequested = true;
  draft.service = alternatives.length && alternatives.every(slot => slotService(slot) === slotService(alternatives[0]))
    ? slotService(alternatives[0]) : service;
  const state = rescheduling ? "reschedule_time" : "booking_time";
  if (!alternatives.length) return stateResult(
    `${reason} No quedan huecos para ${serviceLabel(service)} ese día. Puedes indicarme otra fecha o consultar otro servicio.`, state, draft);
  return stateResult(`${reason}\n${groupedSlots(alternatives)}\n¿Qué hora te viene bien?`, state, draft);
}

async function checkRequestedTime(input: ChatbotEngineInput, draft: ChatbotDraft, rescheduling: boolean) {
  const state = rescheduling ? "reschedule_time" : "booking_time";
  const service = mealService(input.text) || draft.service;
  const periodAnswer = mealService(input.text) || /\b(tarde|am|pm)\b/.test(normalizeText(input.text));
  const text = draft.timeToClarify && periodAnswer && !parseRequestedTime(input.text, service)
    ? `${draft.timeToClarify} ${input.text}` : input.text;
  const request = parseRequestedTime(text, service);
  if (service) draft.service = service;
  if (!request) return stateResult("¿A qué hora quieres reservar? Dime la hora y compruebo si hay sitio.", state, draft);
  if (request.ambiguous) {
    draft.timeToClarify = request.ambiguous;
    const [hour, minute] = request.ambiguous.split(":");
    return stateResult(`¿Te refieres a las ${hour.padStart(2, "0")}:${minute} o a las ${Number(hour) + 12}:${minute}?`, state, draft);
  }
  if (!draft.date || !isBookingDateAllowed(draft.date, input.restaurant.timezone, input.restaurant.maxAdvanceDays)) {
    return stateResult("Necesito la fecha de la reserva para comprobar esa hora. ¿Qué día quieres venir?",
      rescheduling ? "reschedule_date" : "booking_date", draft);
  }
  const selected = draft.selectedReservation;
  if (rescheduling && !selected) return reset("No encuentro la reserva. Puedes pedir que lo revise el equipo.");
  draft.time = request.time!;
  draft.service = request.service;
  delete draft.unavailableTime;
  delete draft.availabilityRequested;
  delete draft.availabilityDirection;
  delete draft.availabilityAnchor;
  delete draft.timeToClarify;
  // Always recheck the complete current availability, including times outside an earlier suggestion.
  const slots = await input.dependencies.getAvailability(draft.date,
    rescheduling ? selected!.party : Number(draft.party), rescheduling ? selected!.id : undefined);
  const slot = slots.find(candidate => candidate.time.slice(0, 5) === draft.time);
  if (!slot) return unavailableTimeReply(input, draft, slots, rescheduling);
  draft.start = slot.start;
  draft.time = slot.time.slice(0, 5);
  draft.service = mealService(slot.service || "") || request.service;
  delete draft.slots;
  if (rescheduling) {
    return stateResult(
      `La reserva se moverá al ${formatLocalDate(slot.start, input.restaurant.timezone)}.\n¿Son correctos los nuevos datos de la reserva?`,
      "reschedule_confirm", draft,
    );
  }
  if (draft.name) {
    if (input.restaurant.requiresEmail && !draft.email) return stateResult("¿Cuál es tu correo?", "booking_email", draft);
    return stateResult(confirmationReply(draft, input.restaurant), "booking_confirm", draft);
  }
  return stateResult("Sí, hay sitio. ¿A qué nombre hago la reserva?", "booking_name", draft);
}

function errorIncludes(error: unknown, code: string) {
  return error instanceof Error && error.message.includes(code);
}

function startRescheduling(input: ChatbotEngineInput, draft: ChatbotDraft) {
  if (draft.selectedReservation && (draft.time || draft.timeToClarify) && !draft.date) {
    draft.date = dateInTimezone(input.restaurant.timezone, new Date(draft.selectedReservation.start));
  }
  if (!draft.date) return Promise.resolve(stateResult("¿A qué nueva fecha quieres moverla?", "reschedule_date", draft));
  const time = draft.time || draft.timeToClarify;
  if (time) return checkRequestedTime({ ...input, text: `a las ${time}` }, draft, true);
  return Promise.resolve(stateResult("¿A qué hora quieres moverla?", "reschedule_time", draft));
}

async function openManagement(
  intent: "cancel" | "reschedule" | "choose",
  input: ChatbotEngineInput,
) {
  const { restaurant, dependencies } = input;
  let reservations: ChatbotReservation[];
  try {
    reservations = await dependencies.listUpcomingReservations();
  } catch {
    return handoff(restaurant.name);
  }
  if (!reservations.length) {
    return reset("No encuentro reservas próximas asociadas a este WhatsApp. Puedes pedir que lo revise el equipo.");
  }

  const draft: ChatbotDraft = { reservations, manageIntent: intent };
  if (intent === "reschedule") {
    draft.date = parseDate(input.text, restaurant.timezone) || undefined;
    rememberTime(draft, input.text);
  }
  if (reservations.length === 1) {
    draft.selectedReservation = reservations[0];
    if (intent === "cancel") {
      return stateResult(
        `Vas a cancelar la reserva del ${formatLocalDate(reservations[0].start, restaurant.timezone)} para ${reservations[0].party} personas.\n¿Quieres que cancele esta reserva?`,
        "cancel_confirm",
        draft,
      );
    }
    if (intent === "reschedule") {
      return startRescheduling(input, draft);
    }
    return stateResult(
      `Reserva del ${formatLocalDate(reservations[0].start, restaurant.timezone)} para ${reservations[0].party} personas.\n¿Quieres cambiar la reserva o cancelarla?`,
      "manage_action",
      draft,
    );
  }

  const list = reservations
    .map(
      (reservation, index) =>
        `${index + 1}. ${formatLocalDate(reservation.start, restaurant.timezone)} · ${reservation.party} personas`,
    )
    .join("\n");
  return stateResult(`He encontrado estas reservas:\n${list}\nResponde con el número.`, "manage_select", draft);
}

export async function runChatbotTurn(input: ChatbotEngineInput): Promise<ChatbotEngineResult> {
  const { restaurant, dependencies, mode } = input;
  const text = input.text.trim();
  const normalized = normalizeText(text);
  const draft: ChatbotDraft = { ...input.draft };

  if (["reiniciar", "empezar de nuevo", "cancelar proceso", "salir"].includes(normalized)
      || (normalized === "cancelar" && input.state.startsWith("booking_"))) {
    return reset("He cerrado el proceso. ¿Qué necesitas?");
  }

  if (isHumanRequest(text)) return handoff(restaurant.name);

  if (input.state === "handoff") {
    return {
      reply: "",
      state: "handoff",
      draft: {},
      selectedReservationId: null,
      handoff: true,
      suppressDelivery: true,
    };
  }

  if (/^(?:hola+|buenas|hola+ buenas|buenos dias|buenas tardes|buenas noches|buen dia|hey)(?: que tal)?$/.test(normalized)) {
    return reset(welcomeReply(restaurant.name));
  }

  const bookingActive = input.state.startsWith("booking_");
  const rescheduling = input.state.startsWith("reschedule_");
  if ((bookingActive || rescheduling) && /\b(?:otro dia|otra fecha|cambiar (?:el dia|la fecha))\b/.test(normalized)
      && !parseDate(text, restaurant.timezone)) {
    invalidateSummary(draft);
    return stateResult("¿Para qué día quieres consultar?", rescheduling ? "reschedule_date" : "booking_date", draft);
  }
  const availabilityQuestion = asksAvailability(text);
  const serviceOnly = (bookingActive || rescheduling) && mealService(text) && !draft.timeToClarify
    && !parseRequestedTime(text, draft.service, false) && !/\b(carta|menu|platos)\b/.test(normalized)
    && !explicitParty(text) && !parseDate(text, restaurant.timezone);
  if ((availabilityQuestion || serviceOnly) && (input.state === "idle" || bookingActive || rescheduling)) {
    if (!restaurant.bookingEnabled) return handoff(restaurant.name);
    const previousSlots = draft.slots || [];
    const later = /\bmas tarde\b/.test(normalized), earlier = /\bmas (?:temprano|pronto)\b/.test(normalized);
    draft.availabilityAnchor = later ? previousSlots.at(-1)?.time || draft.time : earlier ? previousSlots[0]?.time || draft.time : undefined;
    draft.availabilityDirection = later ? "later" : earlier ? "earlier" : undefined;
    draft.party = explicitParty(text) || draft.party;
    draft.date = parseDate(text, restaurant.timezone) || draft.date;
    draft.service = mealService(text) || draft.service;
    if (/\b(?:cualquier hora|todo el dia|todos los (?:horarios|turnos))\b/.test(normalized)) delete draft.service;
    if (rescheduling && !draft.date && draft.selectedReservation) draft.date = dateInTimezone(restaurant.timezone, new Date(draft.selectedReservation.start));
    invalidateSummary(draft);
    if (parseRequestedTime(text, draft.service, false)) {
      rememberTime(draft, text);
      return rescheduling ? checkRequestedTime(input, draft, true) : continueBooking(input, draft);
    }
    delete draft.time;
    delete draft.timeToClarify;
    draft.availabilityRequested = true;
    return availableTimes(input, draft, rescheduling);
  }

  const bookingRequest = input.state === "idle" && isBookingIntent(text);
  const mealDuringBooking = ["booking_party", "booking_date", "booking_time", "reschedule_date", "reschedule_time"].includes(input.state)
    && mealService(text) && !/\b(carta|menu|platos)\b/.test(normalized);
  const requestedFaq = faqIntent(text);
  const faq = (bookingRequest || mealDuringBooking) && requestedFaq === "menu" ? null : requestedFaq;
  if (faq) {
    let reply = faqReply(faq, restaurant);
    if (faq === "hours" && dependencies.getOpeningHours) {
      let date = parseDate(text, restaurant.timezone) || undefined;
      if (!date && /\b(ahora|esta noche|esta tarde)\b/.test(normalized)) date = dateInTimezone(restaurant.timezone);
      if (!date) {
        const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
        const weekday = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`).test(normalized));
        if (weekday >= 0) {
          const today = dateInTimezone(restaurant.timezone);
          const todayWeekday = new Date(`${today}T12:00:00Z`).getUTCDay();
          date = addCalendarDays(today, (weekday - todayWeekday + 7) % 7);
        }
      }
      try {
        reply = await dependencies.getOpeningHours(date) || reply;
      } catch {
        reply = "No puedo consultar el horario ahora. Puedes pedir hablar con el equipo.";
      }
    }
    return stateResult(
      `${reply}\n\n${promptForState(input.state, draft)}`,
      input.state,
      draft,
    );
  }

  if (input.state === "idle") {
    const manage = managementIntent(text);
    if (manage) return openManagement(manage, input);

    if (isBookingIntent(text)) {
      if (!restaurant.bookingEnabled) {
        return handoff(restaurant.name);
      }
      const initial: ChatbotDraft = { idempotencyKey: crypto.randomUUID(), service: mealService(text),
        party: explicitParty(text) || undefined, date: parseDate(text, restaurant.timezone) || undefined };
      rememberTime(initial, text);
      return continueBooking(input, initial);
    }

    if (/^(?:gracias|muchas gracias|ok|vale|perfecto|de acuerdo)[.!]*$/.test(normalized)) return reset("De nada. ¿En qué más puedo ayudarte?");
    return reset("No he entendido qué necesitas. ¿Me lo puedes contar de otra forma? También puedes pedir hablar con el equipo.");
  }

  // Explicit corrections apply regardless of which booking detail was requested.
  const suppliedParty = explicitParty(text);
  const suppliedDate = input.state === "booking_name" && /^(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/i.test(normalized)
    ? null : parseDate(text, restaurant.timezone);
  const suppliedTime = parseRequestedTime(text, mealService(text) || draft.service, false);
  if (bookingActive && input.state !== "booking_confirm" && input.state !== "booking_party"
      && (suppliedParty !== null || suppliedDate || (input.state !== "booking_time" && suppliedTime))) {
    draft.party = suppliedParty ?? draft.party;
    draft.date = suppliedDate || draft.date;
    draft.service = mealService(text) || draft.service;
    if (suppliedTime) rememberTime(draft, text);
    invalidateSummary(draft);
    return continueBooking(input, draft);
  }

  if (rescheduling && (suppliedDate || (input.state !== "reschedule_time" && suppliedTime))) {
    draft.date = suppliedDate || draft.date || (draft.selectedReservation ? dateInTimezone(restaurant.timezone, new Date(draft.selectedReservation.start)) : undefined);
    if (suppliedTime) rememberTime(draft, text);
    invalidateSummary(draft);
    if (draft.availabilityRequested) return availableTimes(input, draft, true);
    if (draft.time) return checkRequestedTime({ ...input, text: `a las ${draft.time}` }, draft, true);
    return stateResult("¿A qué hora quieres moverla?", "reschedule_time", draft);
  }

  if (/\?|^(?:q|que|como|donde|teneis|tienen|hay|puedo|podemos|se puede)\b/i.test(text)
      && !suppliedParty && !suppliedDate && !suppliedTime) {
    return stateResult(`No tengo ese dato. Puedes pedir hablar con el equipo.\n\n${promptForState(input.state, draft)}`, input.state, draft);
  }

  if (input.state === "booking_party") {
    draft.service = mealService(text) || draft.service;
    if (!/^\d{1,3}$/.test(normalized)) rememberTime(draft, text);
    const party = explicitParty(text, true);
    draft.date = suppliedDate || draft.date;
    if (!party && (suppliedDate || suppliedTime)) return continueBooking(input, draft);
    if (!party || party < restaurant.minParty || party > restaurant.maxParty) {
      return stateResult(
        `El número debe estar entre ${restaurant.minParty} y ${restaurant.maxParty}. ¿Para cuántas personas?`,
        "booking_party",
        draft,
      );
    }
    draft.party = party;
    draft.date = parseDate(text, restaurant.timezone) || draft.date;
    return continueBooking(input, draft);
  }

  if (input.state === "booking_date") {
    const date = parseDate(text, restaurant.timezone);
    if (!date || !isBookingDateAllowed(date, restaurant.timezone, restaurant.maxAdvanceDays)) {
      return stateResult("La fecha no es válida o queda fuera del plazo de reserva. Indica otra fecha.", "booking_date", draft);
    }

    draft.date = date;
    draft.service = mealService(text) || draft.service;
    delete draft.slots;
    delete draft.start;
    rememberTime(draft, text);
    return continueBooking(input, draft);
  }

  if (input.state === "booking_time") {
    return checkRequestedTime(input, draft, false);
  }

  if (input.state === "booking_name") {
    const name = text.replace(/^(?:me llamo|a nombre de|el nombre es)\s+/i, "").replace(/\s+/g, " ").trim().slice(0, 120);
    if (name.length < 2 || /^(?:si|no|vale|ok|correcto)$/.test(normalized) || !/[\p{L}]/u.test(name)) {
      return stateResult("Necesito un nombre válido.", "booking_name", draft);
    }
    draft.name = name;
    if (restaurant.requiresEmail && !draft.email) {
      return stateResult("¿Cuál es tu correo?", "booking_email", draft);
    }
    return stateResult(confirmationReply(draft, restaurant), "booking_confirm", draft);
  }

  if (input.state === "booking_email") {
    const email = parseEmail(text);
    if (!email) return stateResult("Necesito un correo válido.", "booking_email", draft);
    draft.email = email;
    return stateResult(confirmationReply(draft, restaurant), "booking_confirm", draft);
  }

  if (input.state === "booking_confirm") {
    if (/^(?:salir|cancelar|cancelala|cancelar proceso|no quiero reservar|no quiero la reserva)$/.test(normalized)) return reset("No he creado la reserva. ¿En qué más puedo ayudarte?");
    const correction = await correctBooking(input, draft);
    if (correction) return correction;
    if (!isAffirmative(text) || draft.confirmationVersion !== "booking-details-v1" || !draft.confirmationPrompt) {
      return stateResult(confirmationReply(draft, restaurant), "booking_confirm", draft);
    }

    if (!draft.name || !draft.party || !draft.start || !draft.date || !draft.time || !draft.idempotencyKey
        || (restaurant.requiresEmail && !draft.email)) return continueBooking(input, draft);
    // Recheck the exact confirmed slot even in pilot mode; the SQL writer repeats
    // this check under its restaurant/date lock when creating a live reservation.
    const available = await dependencies.getAvailability(draft.date, draft.party);
    if (!available.some(slot => slot.start === draft.start && slot.time.slice(0,5) === draft.time)) {
      return unavailableTimeReply(input, draft, available, false);
    }

    if (mode !== "live") {
      return reset(
        `[PRUEBA] La reserva sería válida para ${bookingSummary(draft, restaurant)}. No se ha creado ninguna reserva real.`,
        "test_only",
      );
    }

    let created: Awaited<ReturnType<ChatbotDependencies["createBooking"]>>;
    try {
      created = await dependencies.createBooking({
        start: String(draft.start),
        party: Number(draft.party),
        name: String(draft.name),
        phone: input.phone,
        email: draft.email || "",
        idempotencyKey: String(draft.idempotencyKey),
        confirmation: { prompt: draft.confirmationPrompt, response: text, version: draft.confirmationVersion },
      });
    } catch (error) {
      if (errorIncludes(error, "SLOT_NOT_AVAILABLE")) {
        draft.idempotencyKey = crypto.randomUUID();
        const slots = await dependencies.getAvailability(String(draft.date), Number(draft.party));
        return unavailableTimeReply(input, draft, slots, false);
      }
      throw error;
    }
    return reset(
      `Reserva registrada para ${formatLocalDate(created.start, restaurant.timezone)} y ${draft.party} personas.\nPuedes gestionarla aquí: ${created.managementPath}${created.clientAppPath ? `\n\nTu app del cliente: ${created.clientAppPath}` : ""}`,
      "booking_created",
    );
  }

  if (input.state === "manage_select") {
    const selectedIndex = parseParty(text);
    const reservations = draft.reservations || [];
    if (!selectedIndex || selectedIndex < 1 || selectedIndex > reservations.length) {
      return stateResult("Ese número no corresponde a una reserva. Responde con uno de la lista.", "manage_select", draft);
    }
    draft.selectedReservation = reservations[selectedIndex - 1];
    if (draft.manageIntent === "cancel") {
      return stateResult(
        `Vas a cancelar la reserva del ${formatLocalDate(draft.selectedReservation.start, restaurant.timezone)}.\n¿Quieres que cancele esta reserva?`,
        "cancel_confirm",
        draft,
      );
    }
    if (draft.manageIntent === "reschedule") {
      return startRescheduling(input, draft);
    }
    return stateResult("¿Quieres cambiar la reserva o cancelarla?", "manage_action", draft);
  }

  if (input.state === "manage_action") {
    if (/\b(cancelar|anular)\b/.test(normalized)) {
      return stateResult(
        `¿Quieres que cancele esta reserva?`,
        "cancel_confirm",
        draft,
      );
    }
    if (/\b(cambiar|modificar|mover|reprogramar)\b/.test(normalized)) {
      return startRescheduling(input, draft);
    }
    return stateResult("¿Quieres cambiar la reserva o cancelarla?", "manage_action", draft);
  }

  if (input.state === "cancel_confirm") {
    if (isNegative(text)) return reset("No he cancelado la reserva. ¿Qué necesitas?");
    if (!isAffirmative(text) && !["confirmar cancelacion", "si cancelala", "si cancela"].includes(normalized)) {
      return stateResult("¿Quieres que cancele esta reserva?", "cancel_confirm", draft);
    }
    const selected = draft.selectedReservation;
    if (!selected) return reset("No encuentro la reserva. Puedes pedir que lo revise el equipo.");
    if (mode !== "live") {
      return reset("[PRUEBA] La cancelación es válida. No se ha cambiado ninguna reserva real.", "test_only");
    }
    try {
      await dependencies.cancelReservation(selected.managementToken);
    } catch (error) {
      if (errorIncludes(error, "CANCELLATION_WINDOW_CLOSED")) {
        return handoff(restaurant.name);
      }
      throw error;
    }
    return reset("Reserva cancelada correctamente.", "booking_cancelled");
  }

  if (input.state === "reschedule_date") {
    const selected = draft.selectedReservation;
    if (!selected) return reset("No encuentro la reserva. Puedes pedir que lo revise el equipo.");
    const date = /\b(?:mismo dia|misma fecha)\b/.test(normalized) ? dateInTimezone(restaurant.timezone, new Date(selected.start)) : parseDate(text, restaurant.timezone);
    if (!date || !isBookingDateAllowed(date, restaurant.timezone, restaurant.maxAdvanceDays)) {
      return stateResult("La fecha no es válida o queda fuera del plazo. Indica otra fecha.", "reschedule_date", draft);
    }
    draft.date = date;
    draft.service = mealService(text) || draft.service;
    delete draft.slots;
    delete draft.start;
    delete draft.time;
    delete draft.timeToClarify;
    if (parseRequestedTime(text, draft.service)) return checkRequestedTime(input, draft, true);
    return stateResult("¿A qué hora quieres reservar?", "reschedule_time", draft);
  }

  if (input.state === "reschedule_time") {
    return checkRequestedTime(input, draft, true);
  }

  if (input.state === "reschedule_confirm") {
    if (isNegative(text)) {
      delete draft.start;
      return stateResult("¿Qué fecha u hora quieres corregir?", "reschedule_time", draft);
    }
    if (!isAffirmative(text) && normalized !== "confirmar cambio") {
      return stateResult("¿Son correctos los nuevos datos de la reserva?", "reschedule_confirm", draft);
    }
    const selected = draft.selectedReservation;
    if (!selected || !draft.start) {
      return reset("No encuentro los datos del cambio. Puedes pedir que lo revise el equipo.");
    }
    if (mode !== "live") {
      return reset("[PRUEBA] El cambio es válido. No se ha cambiado ninguna reserva real.", "test_only");
    }
    const slots = await dependencies.getAvailability(String(draft.date), selected.party, selected.id);
    if (!slots.some(slot => slot.start === draft.start)) return unavailableTimeReply(input, draft, slots, true);
    try {
      await dependencies.rescheduleReservation(selected.managementToken, draft.start);
    } catch (error) {
      if (errorIncludes(error, "SLOT_NOT_AVAILABLE")) {
        const slots = await dependencies.getAvailability(String(draft.date), selected.party, selected.id);
        return unavailableTimeReply(input, draft, slots, true);
      }
      if (errorIncludes(error, "CANCELLATION_WINDOW_CLOSED")) {
        return handoff(restaurant.name);
      }
      throw error;
    }
    return reset(
      `Reserva cambiada al ${formatLocalDate(draft.start, restaurant.timezone)}.`,
      "booking_rescheduled",
    );
  }

  return reset("He reiniciado la conversación. ¿Qué necesitas?");
}
