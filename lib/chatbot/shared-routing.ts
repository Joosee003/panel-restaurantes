export type SharedRestaurant = {
  id: string;
  name: string;
  code: string;
  mode: "live" | "pilot";
};

const normalized = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function selectChatbotRestaurant(
  text: string,
  restaurants: SharedRestaurant[],
  currentRestaurantId: string | null,
  replyingToMessage = false,
): { restaurant: SharedRestaurant | null; reset: boolean; reply: string } {
  const value = normalized(text);
  const explicit = value.match(/^(?:reservar|restaurante)\s+(.+)$/);
  const menu = ["restaurantes", "cambiar restaurante", "otro restaurante"].includes(value);
  const matches = restaurants.filter(r => normalized(r.code) === (explicit?.[1] || value)
    || normalized(r.name) === (explicit?.[1] || value));
  if (!menu && matches.length === 1) return { restaurant: matches[0], reset: true, reply: "" };
  if (!menu && !explicit && matches.length === 0 && !replyingToMessage && currentRestaurantId) {
    const current = restaurants.find(r => r.id === currentRestaurantId);
    if (current) return { restaurant: current, reset: false, reply: "" };
  }
  const choices = restaurants.slice(0, 15).map(r => `${r.name}: RESERVAR ${r.code}`).join("\n");
  return {
    restaurant: null,
    reset: false,
    reply: choices
      ? `Soy el asistente de GastroHelp. ¿Con qué restaurante quieres hablar?\n\n${choices}\n\nEscribe RESERVAR seguido del código del local. También puedes entrar desde su enlace de WhatsApp.`
      : "Soy el asistente de GastroHelp. Ahora no hay restaurantes disponibles para reservar por este número. Contacta directamente con el local.",
  };
}
