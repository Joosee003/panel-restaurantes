export type SharedRestaurant = {
  id: string;
  name: string;
  code: string;
  mode: "live" | "pilot";
};

export type RestaurantContext = {
  lastRestaurantId?: string | null;
  suggestedRestaurantId?: string | null;
  pendingIntent?: string | null;
  awaitingRestaurantName?: boolean;
};

const normalized = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, " ").trim();

// Keep only a routing intent while asking for the restaurant, never the message body.
const intents = ["reservar", "cambiar reserva", "cancelar reserva", "carta", "horario", "direccion", "persona"];
function intentOf(value: string): string | null {
  if (/\b(cancelar|anular)\b.*\breserva\b/.test(value)) return "cancelar reserva";
  if (/\b(cambiar|modificar|mover|reprogramar)\b.*\breserva\b/.test(value)) return "cambiar reserva";
  if (/\b(carta|menu)\b/.test(value)) return "carta";
  if (/\b(horario|abris|abierto|cerrado)\b/.test(value)) return "horario";
  if (/\b(direccion|ubicacion|donde estais)\b/.test(value)) return "direccion";
  if (/\b(persona|humano|encargado)\b/.test(value)) return "persona";
  if (/\b(reservar|reserva|mesa|comer|cenar)\b/.test(value)) return "reservar";
  return null;
}

function aliases(restaurant: SharedRestaurant) {
  return [...new Set([restaurant.name, restaurant.name.split(/[·|]/)[0], restaurant.code]
    .map(normalized).filter(value => value.length > 2))];
}

export function selectChatbotRestaurant(
  text: string,
  restaurants: SharedRestaurant[],
  currentRestaurantId: string | null,
  replyingToMessage = false,
  context: RestaurantContext = {},
): { restaurant: SharedRestaurant | null; reset: boolean; reply: string;
  engineText: string; suggestedRestaurantId: string | null; pendingIntent: string | null } {
  const value = normalized(text);
  const menu = /\b(?:cambiar de restaurante|cambiar restaurante|otro restaurante|otro local)\b/.test(value)
    || value === "restaurantes" || ["otro", "otra", "no"].includes(value) && !currentRestaurantId;
  const negative = /^(?:no|mejor otro|otro|en otro)(?: |$)/.test(value);
  const rememberedIntent = intents.includes(context.pendingIntent || "") ? context.pendingIntent! : null;
  const pendingIntent = intentOf(value) || rememberedIntent;
  const current = restaurants.find(r => r.id === currentRestaurantId);
  const hits = restaurants.flatMap(restaurant => aliases(restaurant).filter(alias => {
    if (!(` ${value} `).includes(` ${alias} `)) return false;
    // This demo's name also appears in ordinary requests to manage "la reserva".
    if (alias === "la reserva" && value !== alias
        && !/\b(?:en|con|restaurante|local)\s+la reserva\b/.test(value)) return false;
    return true;
  }).map(alias => ({ restaurant, alias })));
  // A longer complete name disambiguates its shorter prefix, but two distinct names never do.
  const specific = hits.filter(hit => !hits.some(other => other.alias !== hit.alias
    && (` ${other.alias} `).includes(` ${hit.alias} `)));
  const matches = restaurants.filter(r => specific.some(hit => hit.restaurant.id === r.id));
  const selected = (restaurant: SharedRestaurant, reset: boolean, engineText: string) => ({
    restaurant, reset, reply: "", engineText, suggestedRestaurantId: null, pendingIntent: null,
  });
  if (!negative && matches.length === 1) {
    const restaurant = matches[0];
    const reset = restaurant.id !== current?.id || replyingToMessage;
    // The routing name itself must not be interpreted as a booking instruction or a person's name.
    let remaining = value;
    for (const hit of hits.filter(hit => hit.restaurant.id === restaurant.id)) {
      remaining = (` ${remaining} `).replace(` ${hit.alias} `, " ").trim();
    }
    const meaningful = intentOf(remaining);
    return selected(restaurant, reset,
      reset ? (meaningful || rememberedIntent || "reservar") : (meaningful || text));
  }
  const asksUnknownRestaurant = /^restaurante\s+/.test(value)
    || /^reservar\s+(?!(?:para|una|mesa|el|hoy|manana|esta|este|a|en)\b)[a-z]/.test(value)
    || /\b(?:restaurante|local)\s+\S+/.test(value)
    || /\b(?:reservar|reserva|mesa|cenar|comer)\b.*\ben\s+(?!(?:la )?(?:terraza|interior|sala|comedor)\b)/.test(value);
  const uncertain = menu || matches.length > 1 || (negative && matches.length > 0)
    || asksUnknownRestaurant || replyingToMessage;
  if (!uncertain && current) return selected(current, false, text);

  const last = restaurants.find(r => r.id === context.lastRestaurantId);
  const suggested = restaurants.find(r => r.id === context.suggestedRestaurantId);
  if (!uncertain && !negative && suggested
      && /^(?:si|si por favor|claro|vale|correcto|ese|el mismo|si el mismo|si ahi|alli|ahi)$/.test(value)) {
    // This yes confirms only the restaurant. Start an empty booking conversation, never resume a stale confirmation.
    return selected(suggested, true, rememberedIntent || "reservar");
  }
  if (!uncertain && !negative && (suggested || (last && !context.awaitingRestaurantName))) {
    const restaurant = suggested || last!;
    return { restaurant: null, reset: false, engineText: "", pendingIntent,
      suggestedRestaurantId: restaurant.id,
      reply: `¿Quieres hablar con ${restaurant.name}, como la última vez? Responde sí o dime el nombre de otro restaurante.` };
  }
  const choices = (matches.length > 1 ? matches : restaurants).slice(0, 10)
    .map(r => `• ${r.name}`).join("\n");
  return { restaurant: null, reset: false, engineText: "", suggestedRestaurantId: null, pendingIntent,
    reply: choices
      ? `${matches.length > 1 ? "Hay varios restaurantes que coinciden. " : ""}¿En qué restaurante quieres reservar? Dime su nombre.\n\n${choices}`
      : "Ahora no hay restaurantes disponibles para reservar por este número. Contacta directamente con el local.",
  };
}
