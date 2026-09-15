import { googleReviewUrl } from "@/lib/reviews/review-flow";

export const serviceFields = [
  ["activarReputacion", "Reputación QR"],
  ["activarReservas", "Reservas"],
  ["activarClientes", "Clientes"],
  ["activarResenas", "Reseñas después de la visita"],
  ["activarChatbot", "Chatbot de WhatsApp"],
  ["activarMenuDigital", "Carta QR"],
  ["activarCamarero", "Pedidos desde la mesa"],
  ["activarFidelizacion", "Fidelización"],
  ["activarMetricas", "Estadísticas"],
  ["activarAutomatizaciones", "Automatizaciones"],
] as const;
export type ServiceKey = (typeof serviceFields)[number][0];
export type OnboardingForm = Record<ServiceKey, boolean> & {
  nombre: string;
  telefono: string;
  direccion: string;
  email: string;
  capacidad: string;
  mesas: string;
  plan: "basico" | "premium";
  cartaNombre: string;
  googleReviewUrl: string;
  zonaHoraria: string;
};
export const emptyForm: OnboardingForm = {
  nombre: "",
  telefono: "",
  direccion: "",
  email: "",
  capacidad: "40",
  mesas: "8",
  plan: "basico",
  cartaNombre: "Carta principal",
  googleReviewUrl: "",
  zonaHoraria: "Europe/Madrid",
  activarReputacion: false,
  activarReservas: true,
  activarClientes: true,
  activarResenas: true,
  activarChatbot: true,
  activarMenuDigital: false,
  activarCamarero: false,
  activarFidelizacion: false,
  activarMetricas: true,
  activarAutomatizaciones: true,
};
export function applyServicePreset(
  form: OnboardingForm,
  preset: string,
): OnboardingForm {
  const next = { ...form };
  for (const [key] of serviceFields) next[key] = false;
  if (preset === "reputation") {
    next.activarReputacion = true;
    next.plan = "basico";
  } else if (preset === "complete") {
    for (const [key] of serviceFields) next[key] = true;
    next.plan = "premium";
  } else {
    Object.assign(next, {
      activarReservas: true,
      activarClientes: true,
      activarResenas: true,
      activarChatbot: true,
      activarMetricas: true,
      activarAutomatizaciones: true,
      plan: "basico",
    });
  }
  return next;
}
export function serviceDependencies(
  form: Record<ServiceKey, boolean>,
): string | null {
  if (!serviceFields.some(([key]) => form[key]))
    return "Selecciona al menos un servicio.";
  if (form.activarChatbot && (!form.activarReservas || !form.activarClientes))
    return "El chatbot necesita Reservas y Clientes.";
  if (form.activarResenas && (!form.activarReservas || !form.activarClientes))
    return "Las reseñas después de la visita necesitan Reservas y Clientes.";
  if (form.activarCamarero && !form.activarMenuDigital)
    return "Los pedidos desde la mesa necesitan Carta QR.";
  if (form.activarFidelizacion && !form.activarClientes)
    return "La fidelización necesita Clientes.";
  if (form.activarAutomatizaciones && !form.activarReservas)
    return "Las automatizaciones necesitan Reservas.";
  return null;
}
export function validateOnboardingStep(
  form: OnboardingForm,
  step: number,
): string | null {
  if (step === 0) {
    if (!form.nombre.trim() || form.nombre.trim().length > 120)
      return "Escribe un nombre de restaurante de hasta 120 caracteres.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return "Escribe un correo válido para el acceso del restaurante.";
    const phone = form.telefono.replace(/[\s().+-]/g, "");
    if (!/^[0-9]{7,15}$/.test(phone))
      return "Escribe un teléfono de contacto válido.";
    if (!form.direccion.trim()) return "Añade la dirección del restaurante.";
  }
  if (step === 1) return serviceDependencies(form);
  if (step === 2) {
    if (form.activarReservas || form.activarCamarero) {
      if (
        !Number.isInteger(Number(form.capacidad)) ||
        Number(form.capacidad) < 1 ||
        Number(form.capacidad) > 5000
      )
        return "La capacidad debe estar entre 1 y 5000 personas.";
      if (
        !Number.isInteger(Number(form.mesas)) ||
        Number(form.mesas) < 1 ||
        Number(form.mesas) > 80
      )
        return "Indica entre 1 y 80 mesas.";
    }
    if (
      (form.activarMenuDigital || form.activarCamarero) &&
      !form.cartaNombre.trim()
    )
      return "Pon un nombre a la carta.";
    if (
      form.googleReviewUrl.trim() &&
      !googleReviewUrl(form.googleReviewUrl.trim())
    )
      return "El enlace de reseñas debe ser una dirección válida de Google.";
    if (!["Europe/Madrid", "Atlantic/Canary"].includes(form.zonaHoraria))
      return "Selecciona la zona horaria del restaurante.";
  }
  return null;
}
