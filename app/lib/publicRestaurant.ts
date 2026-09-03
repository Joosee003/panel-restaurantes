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
  customDomain: string;
  legalBasePath?: string;
  publicUrlOverride?: string;
  legal: {
    owner: string;
    taxId: string;
    address: string;
    email: string;
    registry: string;
    privacyEmail: string;
    bookingRetention: string;
    updatedAt: string;
  };
  menu: {
    enabled: boolean;
    publicPath: string;
    sections: Array<{
      title: string;
      items: Array<{
        name: string;
        description: string;
        price: number | null;
        imageUrl: string;
        recommended: boolean;
      }>;
    }>;
  };
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
  dominio_personalizado: string | null;
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

type MenuCategoryRow = {
  id: string;
  nombre: string;
  orden: number;
};

type MenuProductRow = {
  categoria_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number | null;
  imagen_url: string | null;
  recomendado: boolean;
  orden: number;
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
  customDomain: "",
  legal: {
    owner: "",
    taxId: "",
    address: "",
    email: "",
    registry: "",
    privacyEmail: "",
    bookingRetention: "",
    updatedAt: "",
  },
  menu: {
    enabled: true,
    publicPath: "",
    sections: [],
  },
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

export function normalizePublicDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(":")[0]
    .replace(/^www\./, "");
}

export function isPlatformDomain(value: string) {
  const domain = normalizePublicDomain(value);
  return (
    !domain ||
    domain === "localhost" ||
    domain === "127.0.0.1" ||
    domain === "panel.gastrohelp.es" ||
    domain.endsWith(".vercel.app")
  );
}

export function publicRestaurantUrl(restaurant: PublicRestaurant) {
  if (restaurant.publicUrlOverride) return restaurant.publicUrlOverride;
  if (restaurant.customDomain) return `https://${restaurant.customDomain}`;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://panel.gastrohelp.es").replace(/\/$/, "");
  return `${siteUrl}/restaurante/${restaurant.slug}`;
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
        "restaurante_id,slug,publicada,nombre_publico,antetitulo,titular,subtitulo,descripcion,direccion_publica,telefono_publico,email_publico,whatsapp,google_maps_url,instagram_url,facebook_url,logo_url,hero_image_url,galeria_urls,especialidades,color_primario,color_acento,color_fondo,seo_titulo,seo_descripcion,dominio_personalizado,titular_legal,nif_cif,domicilio_legal,email_legal,datos_registrales,privacidad_email,conservacion_reservas,legal_actualizado_en",
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

    const { data: modules, error: modulesError } = await supabase
      .from("restaurante_modulos")
      .select("menu_digital")
      .eq("restaurante_id", web.restaurante_id)
      .maybeSingle<{ menu_digital: boolean | null }>();

    if (modulesError) {
      console.error("No se ha podido comprobar el módulo Carta QR", modulesError);
    }

    const menuEnabled = modules?.menu_digital === true;
    let digitalMenu: { id: string; public_token: string } | null = null;
    let menuSections: PublicRestaurant["menu"]["sections"] = [];
    if (menuEnabled) {
      try {
        const { data, error: menuError } = await supabase
          .from("cartas_digitales")
          .select("id,public_token")
          .eq("restaurante_id", web.restaurante_id)
          .in("estado", ["activa", "publicada"])
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; public_token: string }>();

        if (menuError) throw menuError;
        digitalMenu = data;

        if (digitalMenu) {
          const [
            { data: categories, error: categoriesError },
            { data: products, error: productsError },
          ] = await Promise.all([
            supabase
              .from("carta_categorias")
              .select("id,nombre,orden")
              .eq("carta_id", digitalMenu.id)
              .eq("activa", true)
              .order("orden", { ascending: true }),
            supabase
              .from("carta_productos")
              .select("categoria_id,nombre,descripcion,precio,imagen_url,recomendado,orden")
              .eq("carta_id", digitalMenu.id)
              .eq("activo", true)
              .order("orden", { ascending: true }),
          ]);

          if (categoriesError) throw categoriesError;
          if (productsError) throw productsError;

          const typedProducts = (products || []) as MenuProductRow[];
          menuSections = ((categories || []) as MenuCategoryRow[])
            .map((category) => ({
              title: category.nombre,
              items: typedProducts
                .filter((product) => product.categoria_id === category.id)
                .map((product) => ({
                  name: product.nombre,
                  description: product.descripcion || "",
                  price: product.precio == null ? null : Number(product.precio),
                  imageUrl: product.imagen_url || "",
                  recommended: product.recomendado === true,
                })),
            }))
            .filter((section) => section.items.length > 0);
        }
      } catch (error) {
        console.error("No se ha podido cargar la Carta QR pública", error);
      }
    }

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
      customDomain: web.dominio_personalizado || "",
      legal: {
        owner: web.titular_legal || "",
        taxId: web.nif_cif || "",
        address: web.domicilio_legal || "",
        email: web.email_legal || "",
        registry: web.datos_registrales || "",
        privacyEmail: web.privacidad_email || web.email_legal || "",
        bookingRetention: web.conservacion_reservas || "",
        updatedAt: web.legal_actualizado_en || "",
      },
      menu: {
        enabled: menuEnabled,
        publicPath:
          menuEnabled && digitalMenu && web.slug !== pilotFallback.slug
            ? `/carta/${digitalMenu.public_token}`
            : "",
        sections: web.slug === pilotFallback.slug ? [] : menuSections,
      },
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

export async function getPublicRestaurantByDomain(
  requestedDomain: string,
): Promise<PublicRestaurant | null> {
  const domain = normalizePublicDomain(requestedDomain);
  if (isPlatformDomain(domain)) return null;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("restaurante_webs")
      .select("slug")
      .eq("dominio_personalizado", domain)
      .eq("publicada", true)
      .maybeSingle<{ slug: string }>();

    if (error) throw error;
    return data?.slug ? getPublicRestaurant(data.slug) : null;
  } catch (error) {
    console.error("No se ha podido resolver el dominio del restaurante", error);
    return null;
  }
}
