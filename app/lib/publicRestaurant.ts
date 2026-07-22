import "server-only";

import { getSupabaseAdmin } from "./supabaseAdmin";

export type PublicRestaurant = {
  restauranteId: string | null;
  slug: string;
  published: boolean;
  demo: boolean;
  name: string;
  eyebrow: string;
  headline: string;
  subtitle: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  whatsapp: string;
  mapsUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  logoUrl: string;
  heroImageUrl: string;
  galleryUrls: string[];
  specialties: string[];
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  seoTitle: string;
  seoDescription: string;
  booking: {
    enabled: boolean;
    timezone: string;
    minParty: number;
    maxParty: number;
    minAdvanceMinutes: number;
    maxAdvanceDays: number;
    requiresPhone: boolean;
    requiresEmail: boolean;
    notice: string;
    cancellationPolicy: string;
  };
};

type WebRow = {
  restaurante_id: string;
  slug: string;
  publicada: boolean;
  nombre_publico: string;
  antetitulo: string | null;
  titular: string | null;
  subtitulo: string | null;
  descripcion: string | null;
  direccion_publica: string | null;
  telefono_publico: string | null;
  email_publico: string | null;
  whatsapp: string | null;
  google_maps_url: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  galeria_urls: string[] | null;
  especialidades: string[] | null;
  color_primario: string;
  color_acento: string;
  color_fondo: string;
  seo_titulo: string | null;
  seo_descripcion: string | null;
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

const pilotFallback: PublicRestaurant = {
  restauranteId: null,
  slug: "el-pescador-casa-barriguita",
  published: true,
  demo: true,
  name: "El Pescador · Casa Barriguita",
  eyebrow: "El Golfo · Lanzarote",
  headline: "El sabor del mar, frente al Atlántico",
  subtitle:
    "Pescado, producto local y sobremesas sin prisa en uno de los paisajes más singulares de Lanzarote.",
  description:
    "Una casa marinera donde la cocina canaria y el producto del día son los protagonistas. Este contenido es una propuesta visual y se podrá editar desde GastroHelp.",
  address: "Avenida Marítima, 2 · El Golfo, Lanzarote",
  phone: "",
  email: "",
  whatsapp: "",
  mapsUrl: "https://maps.app.goo.gl/Wik3rkLAE8F5ykvJ7?g_st=ac",
  instagramUrl: "",
  facebookUrl: "",
  logoUrl: "",
  heroImageUrl: "",
  galleryUrls: [],
  specialties: ["Pescado del día", "Cocina canaria", "Producto local"],
  primaryColor: "#123c3a",
  accentColor: "#e7b75f",
  backgroundColor: "#f7f3e8",
  seoTitle: "El Pescador · Casa Barriguita | El Golfo",
  seoDescription:
    "Restaurante marinero en El Golfo, Lanzarote. Descubre su cocina y reserva mesa online.",
  booking: {
    enabled: true,
    timezone: "Atlantic/Canary",
    minParty: 1,
    maxParty: 12,
    minAdvanceMinutes: 60,
    maxAdvanceDays: 60,
    requiresPhone: true,
    requiresEmail: false,
    notice: "Te confirmaremos la reserva al momento si hay disponibilidad.",
    cancellationPolicy:
      "Si tus planes cambian, avísanos con la mayor antelación posible.",
  },
};

function cleanSlug(slug: string) {
  return slug.trim().toLowerCase();
}

function isPilotPreview(slug: string) {
  return process.env.NODE_ENV !== "production" && slug === pilotFallback.slug;
}

export async function getPublicRestaurant(
  requestedSlug: string,
): Promise<PublicRestaurant | null> {
  const slug = cleanSlug(requestedSlug);

  try {
    const supabase = getSupabaseAdmin();
    const { data: web, error: webError } = await supabase
      .from("restaurante_webs")
      .select(
        "restaurante_id,slug,publicada,nombre_publico,antetitulo,titular,subtitulo,descripcion,direccion_publica,telefono_publico,email_publico,whatsapp,google_maps_url,instagram_url,facebook_url,logo_url,hero_image_url,galeria_urls,especialidades,color_primario,color_acento,color_fondo,seo_titulo,seo_descripcion",
      )
      .eq("slug", slug)
      .eq("publicada", true)
      .maybeSingle<WebRow>();

    if (webError) throw webError;
    if (!web) return isPilotPreview(slug) ? pilotFallback : null;

    const { data: booking, error: bookingError } = await supabase
      .from("reservas_config")
      .select(
        "activo,zona_horaria,personas_minimas,personas_maximas,antelacion_minutos,dias_maximos_antelacion,requiere_telefono,requiere_email,aviso_reserva,politica_cancelacion",
      )
      .eq("restaurante_id", web.restaurante_id)
      .maybeSingle<BookingRow>();

    if (bookingError) throw bookingError;

    return {
      restauranteId: web.restaurante_id,
      slug: web.slug,
      published: web.publicada,
      demo: web.slug === pilotFallback.slug,
      name: web.nombre_publico,
      eyebrow: web.antetitulo || "",
      headline: web.titular || web.nombre_publico,
      subtitle: web.subtitulo || "",
      description: web.descripcion || "",
      address: web.direccion_publica || "",
      phone: web.telefono_publico || "",
      email: web.email_publico || "",
      whatsapp: web.whatsapp || "",
      mapsUrl: web.google_maps_url || "",
      instagramUrl: web.instagram_url || "",
      facebookUrl: web.facebook_url || "",
      logoUrl: web.logo_url || "",
      heroImageUrl: web.hero_image_url || "",
      galleryUrls: web.galeria_urls || [],
      specialties: web.especialidades || [],
      primaryColor: web.color_primario,
      accentColor: web.color_acento,
      backgroundColor: web.color_fondo,
      seoTitle: web.seo_titulo || web.nombre_publico,
      seoDescription: web.seo_descripcion || web.descripcion || "",
      booking: {
        enabled: booking?.activo === true,
        timezone: booking?.zona_horaria || "Europe/Madrid",
        minParty: booking?.personas_minimas || 1,
        maxParty: booking?.personas_maximas || 12,
        minAdvanceMinutes: booking?.antelacion_minutos ?? 60,
        maxAdvanceDays: booking?.dias_maximos_antelacion || 60,
        requiresPhone: booking?.requiere_telefono !== false,
        requiresEmail: booking?.requiere_email === true,
        notice: booking?.aviso_reserva || "",
        cancellationPolicy: booking?.politica_cancelacion || "",
      },
    };
  } catch (error) {
    console.error("No se ha podido cargar la web pública", error);
    return isPilotPreview(slug) ? pilotFallback : null;
  }
}
