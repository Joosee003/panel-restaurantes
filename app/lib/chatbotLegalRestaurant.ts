import "server-only";

import type { PublicRestaurant } from "./publicRestaurant";
import { getSupabaseAdmin } from "./supabaseAdmin";

type RestaurantRow = {
  id: string;
  nombre: string;
  slug: string | null;
  direccion: string | null;
  telefono: string | null;
};

type WebRow = {
  nombre_publico: string;
  direccion_publica: string | null;
  telefono_publico: string | null;
  email_publico: string | null;
  google_maps_url: string | null;
  titular_legal: string | null;
  nif_cif: string | null;
  domicilio_legal: string | null;
  email_legal: string | null;
  datos_registrales: string | null;
  privacidad_email: string | null;
  conservacion_reservas: string | null;
  legal_actualizado_en: string | null;
};

type BookingRow = {
  activo: boolean;
  zona_horaria: string;
  personas_minimas: number;
  personas_maximas: number;
  antelacion_minutos: number;
  dias_maximos_antelacion: number;
  requiere_telefono: boolean;
  requiere_email: boolean;
  aviso_reserva: string | null;
  politica_cancelacion: string | null;
};

export async function getChatbotLegalRestaurant(
  restaurantId: string,
): Promise<PublicRestaurant | null> {
  const supabase = getSupabaseAdmin();
  const [restaurantQuery, webQuery, bookingQuery] = await Promise.all([
    supabase
      .from("restaurantes")
      .select("id,nombre,slug,direccion,telefono")
      .eq("id", restaurantId)
      .maybeSingle<RestaurantRow>(),
    supabase
      .from("restaurante_webs")
      .select("nombre_publico,direccion_publica,telefono_publico,email_publico,google_maps_url,titular_legal,nif_cif,domicilio_legal,email_legal,datos_registrales,privacidad_email,conservacion_reservas,legal_actualizado_en")
      .eq("restaurante_id", restaurantId)
      .maybeSingle<WebRow>(),
    supabase
      .from("reservas_config")
      .select("activo,zona_horaria,personas_minimas,personas_maximas,antelacion_minutos,dias_maximos_antelacion,requiere_telefono,requiere_email,aviso_reserva,politica_cancelacion")
      .eq("restaurante_id", restaurantId)
      .maybeSingle<BookingRow>(),
  ]);

  if (restaurantQuery.error || webQuery.error || bookingQuery.error) return null;
  const restaurant = restaurantQuery.data;
  const web = webQuery.data;
  const booking = bookingQuery.data;
  if (!restaurant || !web || !booking) return null;

  const address = web.direccion_publica || restaurant.direccion || "";
  const email = web.email_publico || web.email_legal || web.privacidad_email || "";
  const name = web.nombre_publico || restaurant.nombre;

  return {
    restauranteId: restaurant.id,
    slug: restaurant.slug || restaurant.id,
    published: true,
    demo: false,
    name,
    eyebrow: "",
    headline: name,
    subtitle: "",
    description: "",
    address,
    phone: web.telefono_publico || restaurant.telefono || "",
    email,
    whatsapp: "",
    mapsUrl: web.google_maps_url || "",
    instagramUrl: "",
    facebookUrl: "",
    logoUrl: "",
    heroImageUrl: "",
    galleryUrls: [],
    specialties: [],
    primaryColor: "#0f172a",
    accentColor: "#2563eb",
    backgroundColor: "#f8fafc",
    seoTitle: `Información legal | ${name}`,
    seoDescription: `Privacidad y condiciones de reserva de ${name}.`,
    customDomain: "",
    legalBasePath: `/chatbot/${restaurant.id}/legal`,
    publicUrlOverride: web.google_maps_url || "/",
    legal: {
      owner: web.titular_legal || name,
      taxId: web.nif_cif || "",
      address: web.domicilio_legal || address,
      email: web.email_legal || email,
      registry: web.datos_registrales || "",
      privacyEmail: web.privacidad_email || web.email_legal || email,
      bookingRetention: web.conservacion_reservas || "",
      updatedAt: web.legal_actualizado_en || "",
    },
    menu: { enabled: false, publicPath: "", sections: [] },
    booking: {
      enabled: booking.activo,
      timezone: booking.zona_horaria,
      minParty: booking.personas_minimas,
      maxParty: booking.personas_maximas,
      minAdvanceMinutes: booking.antelacion_minutos,
      maxAdvanceDays: booking.dias_maximos_antelacion,
      requiresPhone: booking.requiere_telefono,
      requiresEmail: booking.requiere_email,
      notice: booking.aviso_reserva || "",
      cancellationPolicy: booking.politica_cancelacion || "",
    },
  };
}
