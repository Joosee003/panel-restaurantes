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
};

export type ChatbotReservation = {
  id: string;
  managementToken: string;
  name: string;
  party: number;
  start: string;
};

export type ChatbotDraft = {
  party?: number;
  date?: string;
  slots?: ChatbotSlot[];
  start?: string;
  time?: string;
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
  }) => Promise<{ reservationId: string; start: string; managementPath: string }>;
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
  mode: "live" | "test";
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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@.+:/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNegative(text: string) {
  return ["no", "salir", "cancelar proceso", "empezar de nuevo", "reiniciar"].includes(
    normalizeText(text),
  );
}

function isHumanRequest(text: string) {
  const value = normalizeText(text);
  return /\b(persona|humano|equipo|encargado|responsable|hablar con alguien)\b/.test(value);
}

function parseParty(text: string) {
  const match = normalizeText(text).match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : null;
}

function parseDate(text: string, timezone: string, now = new Date()) {
  const value = normalizeText(text);
  const today = dateInTimezone(timezone, now);

  if (/\bpasado manana\b/.test(value)) return addCalendarDays(today, 2);
  if (/\bmanana\b/.test(value)) return addCalendarDays(today, 1);
  if (/\bhoy\b/.test(value)) return today;

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

function selectSlot(text: string, slots: ChatbotSlot[]) {
  const value = normalizeText(text);
  if (/^\d{1,2}$/.test(value)) {
    const index = Number(value) - 1;
    if (index >= 0 && index < slots.length) return slots[index];
  }

  const match = value.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (!match) return null;
  const time = `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
  return slots.find((slot) => slot.time.slice(0, 5) === time) || null;
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
  return slots.map((slot, index) => `${index + 1}. ${slot.time.slice(0, 5)}`).join("\n");
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
  return [
    "Comprueba la reserva:",
    bookingSummary(draft, restaurant),
    "",
    `Privacidad: ${restaurant.privacyUrl}`,
    `Condiciones de reserva: ${restaurant.bookingTermsUrl}`,
    "",
    "Si estás de acuerdo, responde exactamente: ACEPTO RESERVA",
    "Para salir, responde: NO",
  ].join("\n");
}

function isBookingIntent(text: string) {
  return /\b(reservar|reserva|mesa)\b/.test(normalizeText(text));
}

function managementIntent(text: string): "cancel" | "reschedule" | "choose" | null {
  const value = normalizeText(text);
  if (/\b(cancelar|anular)\b.*\b(reserva|mesa)\b|\b(reserva|mesa)\b.*\b(cancelar|anular)\b/.test(value)) {
    return "cancel";
  }
  if (/\b(cambiar|modificar|mover|reprogramar)\b.*\b(reserva|mesa)\b|\b(reserva|mesa)\b.*\b(cambiar|modificar|mover|reprogramar)\b/.test(value)) {
    return "reschedule";
  }
  if (/\b(mis reservas|gestionar reserva)\b/.test(value)) return "choose";
  return null;
}

function faqIntent(text: string): "hours" | "address" | "menu" | null {
  const value = normalizeText(text);
  if (/\b(horario|hora de abrir|hora de cierre|cuando abri)\b/.test(value)) return "hours";
  if (/\b(direccion|ubicacion|donde est|como llegar|maps)\b/.test(value)) return "address";
  if (/\b(menu|carta|platos|comida)\b/.test(value)) return "menu";
  return null;
}

function faqReply(intent: "hours" | "address" | "menu", restaurant: ChatbotRestaurant) {
  if (intent === "hours") {
    const lines = [
      restaurant.hoursLunch ? `Comidas: ${restaurant.hoursLunch}` : "",
      restaurant.hoursDinner ? `Cenas: ${restaurant.hoursDinner}` : "",
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : "No se la respuesta. Escribe PERSONA y te atenderá el equipo.";
  }

  if (intent === "address") {
    if (!restaurant.address && !restaurant.mapsUrl) {
      return "No se la respuesta. Escribe PERSONA y te atenderá el equipo.";
    }
    return [restaurant.address, restaurant.mapsUrl].filter(Boolean).join("\n");
  }

  return restaurant.menuUrl
    ? `Puedes ver la carta aquí: ${restaurant.menuUrl}`
    : "La carta no está publicada. Escribe PERSONA y te atenderá el equipo.";
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
        ? `Elige una hora respondiendo con su número:\n${slotList(draft.slots)}`
        : "Indica otra fecha.";
    case "booking_name":
      return "¿A qué nombre hago la reserva?";
    case "booking_email":
      return "Necesito un correo válido para esta reserva.";
    case "manage_select":
      return "Responde con el número de la reserva que quieres gestionar.";
    case "manage_action":
      return "Responde CAMBIAR o CANCELAR.";
    case "cancel_confirm":
      return "Para confirmar, responde exactamente: CONFIRMAR CANCELACIÓN";
    case "reschedule_date":
      return "¿A qué nueva fecha quieres moverla?";
    case "reschedule_confirm":
      return "Para confirmar, responde exactamente: CONFIRMAR CAMBIO";
    case "handoff":
      return "El equipo continuará la conversación.";
    default:
      return "Puedes escribir RESERVAR, CAMBIAR RESERVA, CANCELAR RESERVA, HORARIO, DIRECCIÓN, CARTA o PERSONA.";
  }
}

function errorIncludes(error: unknown, code: string) {
  return error instanceof Error && error.message.includes(code);
}

async function openManagement(
  intent: "cancel" | "reschedule" | "choose",
  restaurant: ChatbotRestaurant,
  dependencies: ChatbotDependencies,
) {
  let reservations: ChatbotReservation[];
  try {
    reservations = await dependencies.listUpcomingReservations();
  } catch {
    return handoff(restaurant.name);
  }
  if (!reservations.length) {
    return reset("No encuentro reservas próximas asociadas a este WhatsApp. Escribe PERSONA si quieres que lo revise el equipo.");
  }

  const draft: ChatbotDraft = { reservations, manageIntent: intent };
  if (reservations.length === 1) {
    draft.selectedReservation = reservations[0];
    if (intent === "cancel") {
      return stateResult(
        `Vas a cancelar la reserva del ${formatLocalDate(reservations[0].start, restaurant.timezone)} para ${reservations[0].party} personas.\nPara confirmar, responde exactamente: CONFIRMAR CANCELACIÓN`,
        "cancel_confirm",
        draft,
      );
    }
    if (intent === "reschedule") {
      return stateResult("¿A qué nueva fecha quieres moverla?", "reschedule_date", draft);
    }
    return stateResult(
      `Reserva del ${formatLocalDate(reservations[0].start, restaurant.timezone)} para ${reservations[0].party} personas.\nResponde CAMBIAR o CANCELAR.`,
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

  if (["reiniciar", "empezar de nuevo", "cancelar proceso", "cancelar", "salir", "no"].includes(normalized)) {
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

  const faq = faqIntent(text);
  if (faq) {
    return stateResult(
      `${faqReply(faq, restaurant)}\n\n${promptForState(input.state, draft)}`,
      input.state,
      draft,
    );
  }

  if (input.state === "idle") {
    const manage = managementIntent(text);
    if (manage) return openManagement(manage, restaurant, dependencies);

    if (isBookingIntent(text)) {
      if (!restaurant.bookingEnabled) {
        return handoff(restaurant.name);
      }
      return stateResult(
        `Vamos a preparar tu reserva en ${restaurant.name}. ¿Para cuántas personas?`,
        "booking_party",
        { idempotencyKey: crypto.randomUUID() },
      );
    }

    return reset(
      `Hola, soy el asistente de ${restaurant.name}.\nPuedes escribir RESERVAR, CAMBIAR RESERVA, CANCELAR RESERVA, HORARIO, DIRECCIÓN, CARTA o PERSONA.`,
    );
  }

  if (input.state === "booking_party") {
    const party = parseParty(text);
    if (!party || party < restaurant.minParty || party > restaurant.maxParty) {
      return stateResult(
        `El número debe estar entre ${restaurant.minParty} y ${restaurant.maxParty}. ¿Para cuántas personas?`,
        "booking_party",
        draft,
      );
    }
    draft.party = party;
    return stateResult("¿Qué fecha quieres? Puedes escribirla como DD/MM/AAAA.", "booking_date", draft);
  }

  if (input.state === "booking_date") {
    const date = parseDate(text, restaurant.timezone);
    if (!date || !isBookingDateAllowed(date, restaurant.timezone, restaurant.maxAdvanceDays)) {
      return stateResult("La fecha no es válida o queda fuera del plazo de reserva. Indica otra fecha.", "booking_date", draft);
    }

    const slots = await dependencies.getAvailability(date, Number(draft.party));
    if (!slots.length) {
      return stateResult("No quedan horas disponibles para ese día. Indica otra fecha.", "booking_date", draft);
    }
    draft.date = date;
    draft.slots = slots.slice(0, 12);
    return stateResult(
      `Estas son las horas disponibles:\n${slotList(draft.slots)}\nResponde con el número o la hora.`,
      "booking_time",
      draft,
    );
  }

  if (input.state === "booking_time") {
    const slot = selectSlot(text, draft.slots || []);
    if (!slot) {
      return stateResult(`Esa hora no está en la lista.\n${promptForState("booking_time", draft)}`, "booking_time", draft);
    }
    draft.start = slot.start;
    draft.time = slot.time;
    delete draft.slots;
    return stateResult("¿A qué nombre hago la reserva?", "booking_name", draft);
  }

  if (input.state === "booking_name") {
    const name = text.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name.length < 2) {
      return stateResult("Necesito un nombre válido.", "booking_name", draft);
    }
    draft.name = name;
    if (restaurant.requiresEmail) {
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
    if (isNegative(text)) return reset("No he creado la reserva. ¿Qué necesitas?");
    if (normalized !== "acepto reserva") {
      return stateResult(confirmationReply(draft, restaurant), "booking_confirm", draft);
    }

    if (mode === "test") {
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
      });
    } catch (error) {
      if (errorIncludes(error, "SLOT_NOT_AVAILABLE")) {
        return stateResult(
          "Esa hora acaba de dejar de estar disponible. Indica otra fecha para volver a consultar.",
          "booking_date",
          {
            party: draft.party,
            name: draft.name,
            email: draft.email,
            idempotencyKey: crypto.randomUUID(),
          },
        );
      }
      throw error;
    }
    return reset(
      `Reserva registrada para ${formatLocalDate(created.start, restaurant.timezone)} y ${draft.party} personas.\nPuedes gestionarla aquí: ${created.managementPath}`,
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
        `Vas a cancelar la reserva del ${formatLocalDate(draft.selectedReservation.start, restaurant.timezone)}.\nPara confirmar, responde exactamente: CONFIRMAR CANCELACIÓN`,
        "cancel_confirm",
        draft,
      );
    }
    if (draft.manageIntent === "reschedule") {
      return stateResult("¿A qué nueva fecha quieres moverla?", "reschedule_date", draft);
    }
    return stateResult("Responde CAMBIAR o CANCELAR.", "manage_action", draft);
  }

  if (input.state === "manage_action") {
    if (/\b(cancelar|anular)\b/.test(normalized)) {
      return stateResult(
        `Para confirmar la cancelación, responde exactamente: CONFIRMAR CANCELACIÓN`,
        "cancel_confirm",
        draft,
      );
    }
    if (/\b(cambiar|modificar|mover|reprogramar)\b/.test(normalized)) {
      return stateResult("¿A qué nueva fecha quieres moverla?", "reschedule_date", draft);
    }
    return stateResult("Responde CAMBIAR o CANCELAR.", "manage_action", draft);
  }

  if (input.state === "cancel_confirm") {
    if (isNegative(text)) return reset("No he cancelado la reserva. ¿Qué necesitas?");
    if (normalized !== "confirmar cancelacion") {
      return stateResult("Para confirmar, responde exactamente: CONFIRMAR CANCELACIÓN", "cancel_confirm", draft);
    }
    const selected = draft.selectedReservation;
    if (!selected) return reset("No encuentro la reserva. Escribe PERSONA para que lo revise el equipo.");
    if (mode === "test") {
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
    if (!selected) return reset("No encuentro la reserva. Escribe PERSONA para que lo revise el equipo.");
    const date = parseDate(text, restaurant.timezone);
    if (!date || !isBookingDateAllowed(date, restaurant.timezone, restaurant.maxAdvanceDays)) {
      return stateResult("La fecha no es válida o queda fuera del plazo. Indica otra fecha.", "reschedule_date", draft);
    }
    const slots = await dependencies.getAvailability(date, selected.party, selected.id);
    if (!slots.length) {
      return stateResult("No quedan horas disponibles para ese día. Indica otra fecha.", "reschedule_date", draft);
    }
    draft.date = date;
    draft.slots = slots.slice(0, 12);
    return stateResult(
      `Estas son las horas disponibles:\n${slotList(draft.slots)}\nResponde con el número o la hora.`,
      "reschedule_time",
      draft,
    );
  }

  if (input.state === "reschedule_time") {
    const slot = selectSlot(text, draft.slots || []);
    if (!slot) {
      return stateResult(`Esa hora no está en la lista.\n${promptForState("reschedule_time", draft)}`, "reschedule_time", draft);
    }
    draft.start = slot.start;
    draft.time = slot.time;
    delete draft.slots;
    return stateResult(
      `La reserva se moverá al ${formatLocalDate(slot.start, restaurant.timezone)}.\nPara confirmar, responde exactamente: CONFIRMAR CAMBIO`,
      "reschedule_confirm",
      draft,
    );
  }

  if (input.state === "reschedule_confirm") {
    if (isNegative(text)) return reset("No he cambiado la reserva. ¿Qué necesitas?");
    if (normalized !== "confirmar cambio") {
      return stateResult("Para confirmar, responde exactamente: CONFIRMAR CAMBIO", "reschedule_confirm", draft);
    }
    const selected = draft.selectedReservation;
    if (!selected || !draft.start) {
      return reset("No encuentro los datos del cambio. Escribe PERSONA para que lo revise el equipo.");
    }
    if (mode === "test") {
      return reset("[PRUEBA] El cambio es válido. No se ha cambiado ninguna reserva real.", "test_only");
    }
    try {
      await dependencies.rescheduleReservation(selected.managementToken, draft.start);
    } catch (error) {
      if (errorIncludes(error, "SLOT_NOT_AVAILABLE")) {
        return stateResult(
          "Esa hora acaba de dejar de estar disponible. Indica otra fecha.",
          "reschedule_date",
          draft,
        );
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
