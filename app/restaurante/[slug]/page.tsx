import type { Metadata } from "next";
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  Clock3,
  Fish,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import { notFound } from "next/navigation";
import { legalPath } from "../../lib/publicLegal";
import {
  getPublicRestaurant,
  publicRestaurantUrl,
} from "../../lib/publicRestaurant";
import BookingWidget from "./BookingWidget";
import {
  ExpandingImage,
  MobileActionBar,
  RestaurantHeader,
  Reveal,
} from "./RestaurantExperience";

export const dynamic = "force-dynamic";

type RestaurantPageProps = {
  params: Promise<{ slug: string }>;
};

const demoPhotos = [
  "https://images.unsplash.com/photo-1758448786233-2051ecd150c8?auto=format&fit=crop&fm=jpg&q=86&w=2400",
  "https://images.unsplash.com/photo-1676089774723-0acd27ce32ab?auto=format&fit=crop&fm=jpg&q=86&w=2200",
  "https://images.unsplash.com/photo-1632389879997-330b17bf1923?auto=format&fit=crop&fm=jpg&q=86&w=2200",
  "https://images.unsplash.com/photo-1604909052868-dd2ef1e53daa?auto=format&fit=crop&fm=jpg&q=86&w=2200",
  "https://images.unsplash.com/photo-1513271224036-f526ad664968?auto=format&fit=crop&fm=jpg&q=86&w=2200",
];

const demoMenu = [
  {
    title: "Para empezar",
    items: [
      ["Lapas a la plancha", "Mojo verde y limón"],
      ["Chips de morena", "Finas, crujientes y recién hechas"],
      ["Carpaccio de calamar", "Aliño de la casa"],
      ["Tomates de la isla", "Sal marina y aceite de oliva"],
    ],
  },
  {
    title: "Del mar",
    items: [
      ["Pescado del día", "Pregunta por la pieza y la preparación"],
      ["Fritura de pescado", "Selección del día para compartir"],
      ["Sama roquera", "Producto local según mercado"],
      ["Gambones", "A la plancha, ajo y perejil"],
    ],
  },
  {
    title: "El final",
    items: [
      ["Postres caseros", "Pregunta qué hemos preparado hoy"],
      ["Café", "Solo o con un último rato de sobremesa"],
    ],
  },
];

const demoSpecialtyDetails = [
  "La selección cambia con la pesca y el mercado de cada día.",
  "Recetas reconocibles, producto cercano y sabor de la isla.",
  "Ingredientes escogidos para una carta corta y de temporada.",
];

export async function generateMetadata({
  params,
}: RestaurantPageProps): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getPublicRestaurant(slug);

  if (!restaurant) return { title: "Restaurante no encontrado" };

  const previewImage =
    restaurant.heroImageUrl ||
    restaurant.galleryUrls[0] ||
    (restaurant.demo ? demoPhotos[0] : "");

  return {
    title: restaurant.seoTitle,
    description: restaurant.seoDescription,
    robots: restaurant.demo
      ? { index: false, follow: false }
      : { index: true, follow: true },
    alternates: {
      canonical: publicRestaurantUrl(restaurant),
    },
    openGraph: {
      title: restaurant.seoTitle,
      description: restaurant.seoDescription,
      type: "website",
      url: publicRestaurantUrl(restaurant),
      images: previewImage ? [previewImage] : [],
    },
  };
}

function externalHref(value: string) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value}`;
}

function whatsappHref(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits.startsWith("34") ? digits : `34${digits}`}`;
}

function formatPrice(value: number | null) {
  if (value == null) return "";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export async function RestaurantPageContent({ slug }: { slug: string }) {
  const restaurant = await getPublicRestaurant(slug);
  if (!restaurant) notFound();

  const { primaryColor, accentColor, backgroundColor } = restaurant;
  const gallery = Array.from(
    new Set(
      [
        restaurant.heroImageUrl,
        ...restaurant.galleryUrls,
        ...(restaurant.demo ? demoPhotos : []),
      ].filter(Boolean),
    ),
  );
  const heroImage = gallery[0] || "";
  const portraitImage = gallery[1] || gallery[0] || "";
  const wideImage = gallery[2] || gallery[1] || gallery[0] || "";
  const menuImage = gallery[3] || gallery[2] || gallery[0] || "";
  const placeImage = gallery[4] || gallery[1] || gallery[0] || "";
  const specialties = restaurant.specialties.length
    ? restaurant.specialties
    : ["Pescado del día", "Cocina canaria", "Producto local"];
  const menuSections = restaurant.demo
    ? demoMenu.map((section) => ({
        title: section.title,
        items: section.items.map(([name, description]) => ({
          name,
          description,
          price: null,
          imageUrl: "",
          recommended: false,
        })),
      }))
    : restaurant.menu.sections;
  const publicUrl = publicRestaurantUrl(restaurant);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
    description: restaurant.seoDescription,
    url: publicUrl,
    image: gallery,
    telephone: restaurant.phone || undefined,
    email: restaurant.email || undefined,
    address: restaurant.address || undefined,
    servesCuisine: specialties,
    hasMenu: restaurant.menu.publicPath
      ? new URL(restaurant.menu.publicPath, publicUrl).toString()
      : undefined,
    acceptsReservations: restaurant.booking.enabled,
  };

  return (
    <div
      className="restaurant-public-site min-h-screen overflow-hidden bg-[#f8f5ef] text-[#111916] selection:bg-amber-200"
      style={{
        backgroundColor,
        "--restaurant-primary": primaryColor,
        "--restaurant-accent": accentColor,
      } as React.CSSProperties}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <RestaurantHeader
        name={restaurant.name}
        logoUrl={restaurant.logoUrl}
        primaryColor={primaryColor}
        accentColor={accentColor}
      />
      <MobileActionBar menuPath={restaurant.menu.publicPath} />

      {restaurant.demo ? (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/15 bg-slate-950/90 px-3.5 py-2 text-[9px] font-black uppercase tracking-[0.17em] text-white shadow-2xl backdrop-blur md:bottom-5 md:px-4 md:text-[10px]">
          Demostración GastroHelp
        </div>
      ) : null}

      <main>
        <section id="inicio" className="restaurant-dark relative min-h-[100svh] overflow-hidden bg-[#07100d] text-white">
          {heroImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroImage}
              alt={`El espacio y la cocina de ${restaurant.name}`}
              className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center"
              fetchPriority="high"
            />
          ) : (
            <div className="absolute inset-0" style={{ backgroundColor: primaryColor }} />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,12,10,0.91)_0%,rgba(4,12,10,0.67)_45%,rgba(4,12,10,0.08)_100%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07100d] via-transparent to-black/25" />

          <div className="relative mx-auto flex min-h-[100svh] max-w-[96rem] flex-col justify-end px-5 pb-7 pt-32 sm:px-8 sm:pb-9 lg:px-10 xl:px-12">
            <div className="max-w-6xl pb-12 sm:pb-16 lg:pb-20">
              <Reveal>
                <p className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.28em] sm:text-[11px]" style={{ color: accentColor }}>
                  <span className="h-px w-9" style={{ backgroundColor: accentColor }} />
                  {restaurant.eyebrow || "El Golfo · Lanzarote"}
                </p>
              </Reveal>
              <Reveal delay={80}>
                <h1 className="mt-6 max-w-6xl break-words text-[clamp(3.1rem,10vw,10rem)] font-black leading-[0.8] tracking-[-0.085em] text-white sm:leading-[0.78] sm:tracking-[-0.09em]">
                  {restaurant.headline}
                </h1>
              </Reveal>
              <Reveal delay={160} className="mt-7 flex max-w-5xl flex-col gap-6 sm:mt-9 lg:flex-row lg:items-end lg:justify-between">
                <p className="max-w-xl text-sm font-semibold leading-7 text-white/72 sm:text-lg sm:leading-8">
                  {restaurant.subtitle}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  <a
                    href="#reservar"
                    className="group inline-flex w-fit shrink-0 items-center gap-3 rounded-full px-5 py-3.5 text-xs font-black shadow-xl transition hover:-translate-y-0.5 sm:px-6 sm:text-sm"
                    style={{ backgroundColor: accentColor, color: primaryColor }}
                  >
                    Reservar mesa
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                  </a>
                  <a
                    href="#carta"
                    className="group inline-flex w-fit shrink-0 items-center gap-3 rounded-full border border-white/25 bg-white/10 px-5 py-3.5 text-xs font-black text-white backdrop-blur transition hover:bg-white hover:text-slate-950 sm:px-6 sm:text-sm"
                  >
                    Ver la carta
                    <ArrowDown className="h-4 w-4 transition group-hover:translate-y-1" />
                  </a>
                </div>
              </Reveal>
            </div>

            <div className="grid divide-y divide-white/10 overflow-hidden rounded-[1.25rem] border border-white/15 bg-white/[0.07] backdrop-blur-xl sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:rounded-[1.5rem]">
              {specialties.slice(0, 3).map((specialty, index) => (
                <div key={specialty} className="flex items-center gap-4 px-5 py-3.5 sm:px-6 sm:py-4">
                  <span className="text-[9px] font-black text-white/35 sm:text-[10px]">0{index + 1}</span>
                  <span className="text-xs font-black text-white/90 sm:text-sm">{specialty}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="quienes-somos" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36 xl:px-12">
          <div className="mx-auto max-w-[96rem]">
            <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
              <Reveal>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] sm:text-[11px]" style={{ color: primaryColor }}>
                  Quiénes somos
                </p>
              </Reveal>
              <div>
                <Reveal>
                  <h2 className="max-w-5xl text-[clamp(2.8rem,6.8vw,7.4rem)] font-black leading-[0.86] tracking-[-0.075em] text-slate-950">
                    {restaurant.demo ? "Una casa de comidas en El Golfo." : `Así es ${restaurant.name}.`}
                  </h2>
                </Reveal>
                <div className="mt-9 grid gap-7 border-t border-black/15 pt-8 sm:grid-cols-2 sm:gap-12">
                  <Reveal delay={80}>
                    <p className="text-base font-semibold leading-8 text-slate-700 sm:text-lg">
                      {restaurant.description}
                    </p>
                  </Reveal>
                  <Reveal delay={140}>
                    <p className="text-sm font-medium leading-7 text-slate-500 sm:text-base sm:leading-8">
                      {restaurant.demo
                        ? "Trabajamos con una carta corta y producto del día. Pescado, recetas canarias y una sobremesa mirando al Atlántico."
                        : `Una propuesta centrada en ${specialties.slice(0, 3).join(", ").toLowerCase()}. Consulta la carta y elige cuándo quieres visitarnos.`}
                    </p>
                  </Reveal>
                </div>
              </div>
            </div>

            {portraitImage ? (
              <div className="mt-14 sm:mt-20">
                <ExpandingImage
                  src={portraitImage}
                  alt={`La mesa de ${restaurant.name}`}
                  className="h-[58svh] min-h-[28rem] sm:h-[75svh] sm:min-h-[40rem]"
                />
              </div>
            ) : null}

            <div className="mt-14 grid gap-8 border-y border-black/15 py-9 sm:grid-cols-3 sm:py-11">
              {specialties.slice(0, 3).map((specialty, index) => (
                <Reveal key={specialty} delay={index * 80} className="grid grid-cols-[2.5rem_1fr] gap-3 sm:block">
                  <span className="text-[10px] font-black text-slate-400">0{index + 1}</span>
                  <div className="sm:mt-6">
                    <h3 className="text-xl font-black tracking-tight text-slate-950 sm:text-2xl">{specialty}</h3>
                    <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-slate-500">
                      {restaurant.demo
                        ? demoSpecialtyDetails[index]
                        : `Parte de la propuesta gastronómica de ${restaurant.name}.`}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section id="carta" className="restaurant-dark scroll-mt-20 bg-[#0b1512] px-5 py-20 text-white sm:px-8 sm:py-28 lg:px-10 lg:py-36 xl:px-12">
          <div className="mx-auto max-w-[96rem]">
            <div className="grid gap-9 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
              <Reveal>
                <div className="lg:sticky lg:top-28">
                  <p className="text-[10px] font-black uppercase tracking-[0.26em] sm:text-[11px]" style={{ color: accentColor }}>
                    La carta
                  </p>
                  <h2 className="mt-5 max-w-lg text-5xl font-black leading-[0.86] tracking-[-0.07em] text-white sm:text-7xl">
                    {restaurant.demo ? "Lo que hay, bien hecho." : "Descubre nuestra carta."}
                  </h2>
                  <p className="mt-6 max-w-md text-sm font-medium leading-7 text-white/50 sm:text-base">
                    {restaurant.demo
                      ? "Esta selección es orientativa. El pescado y algunos platos cambian según mercado."
                      : "Platos, precios y disponibilidad gestionados directamente por el restaurante."}
                  </p>
                  {restaurant.menu.publicPath ? (
                    <a
                      href={restaurant.menu.publicPath}
                      className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-xs font-black text-white transition hover:bg-white hover:text-slate-950"
                    >
                      Ver carta completa <ArrowRight className="h-4 w-4" />
                    </a>
                  ) : null}
                </div>
              </Reveal>

              <div className="divide-y divide-white/15 border-y border-white/15">
                {menuSections.map((section, sectionIndex) => (
                  <Reveal key={section.title} delay={sectionIndex * 70} className="py-8 sm:py-10">
                    <div className="grid gap-6 sm:grid-cols-[10rem_1fr] sm:gap-10">
                      <h3 className="text-xs font-black uppercase tracking-[0.2em]" style={{ color: accentColor }}>
                        {section.title}
                      </h3>
                      <div className="space-y-6">
                        {section.items.map((item) => (
                          <div key={item.name} className="grid gap-1 border-b border-white/[0.07] pb-5 last:border-b-0 last:pb-0 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-6">
                            <div>
                              <p className="flex items-center gap-2 text-lg font-black tracking-tight text-white sm:text-xl">
                                {item.name}
                                {item.recommended ? <Star className="h-3.5 w-3.5 fill-current" style={{ color: accentColor }} /> : null}
                              </p>
                              {item.description ? (
                                <p className="mt-1 text-xs font-semibold leading-5 text-white/42 sm:text-sm">{item.description}</p>
                              ) : null}
                            </div>
                            <span className="text-xs font-black uppercase tracking-[0.12em] text-white/50">
                              {item.price == null ? "Según mercado" : formatPrice(item.price)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Reveal>
                ))}
                {!menuSections.length ? (
                  <Reveal className="py-10">
                    <p className="text-lg font-black text-white">La carta se está preparando.</p>
                    <p className="mt-2 max-w-lg text-sm font-semibold leading-6 text-white/50">
                      Contacta con el restaurante para consultar platos, precios y alérgenos.
                    </p>
                  </Reveal>
                ) : null}
              </div>
            </div>

            {menuImage ? (
              <div className="mt-16 sm:mt-24">
                <ExpandingImage
                  src={menuImage}
                  alt={`Un plato de la cocina de ${restaurant.name}`}
                  className="h-[52svh] min-h-[26rem] sm:h-[70svh] sm:min-h-[38rem]"
                />
              </div>
            ) : null}
          </div>
        </section>

        {wideImage ? (
          <section aria-label={`La experiencia de ${restaurant.name}`} className="restaurant-dark bg-[#0b1512] pb-0">
            <div className="relative h-[60svh] min-h-[30rem] overflow-hidden sm:h-[82svh] sm:min-h-[44rem]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wideImage} alt={`El ambiente de ${restaurant.name}`} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/10" />
              <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[96rem] px-5 pb-9 sm:px-8 sm:pb-14 lg:px-10 xl:px-12">
                <Reveal>
                  <p className="max-w-3xl text-3xl font-black leading-[0.95] tracking-[-0.05em] text-white sm:text-6xl">
                    {restaurant.demo ? "Ven con tiempo. El mar hace el resto." : "Tu próxima mesa te está esperando."}
                  </p>
                </Reveal>
              </div>
            </div>
          </section>
        ) : null}

        <section id="contacto" className="scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36 xl:px-12">
          <div className="mx-auto max-w-[96rem]">
            <div className="grid gap-12 lg:grid-cols-[1fr_0.86fr] lg:items-start lg:gap-20">
              <Reveal>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] sm:text-[11px]" style={{ color: primaryColor }}>
                  Contacto y ubicación
                </p>
                <h2 className="mt-5 max-w-3xl text-[clamp(3rem,6.5vw,7rem)] font-black leading-[0.86] tracking-[-0.075em] text-slate-950">
                  {restaurant.demo ? "Nos vemos en El Golfo." : "Ven a visitarnos."}
                </h2>
              </Reveal>

              <Reveal delay={100}>
                <div className="border-t border-black/15 pt-7">
                  <div className="space-y-7">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Dirección</p>
                      <p className="mt-2 text-xl font-black leading-snug text-slate-950 sm:text-2xl">
                        {restaurant.address || "El Golfo · Lanzarote"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Disponibilidad</p>
                      <p className="mt-2 text-base font-bold leading-7 text-slate-700">
                        Consulta en tiempo real los días y horas disponibles al reservar.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      {restaurant.mapsUrl ? (
                        <a href={externalHref(restaurant.mapsUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-xs font-black text-white transition hover:-translate-y-0.5" style={{ backgroundColor: primaryColor }}>
                          <MapPin className="h-4 w-4" /> Cómo llegar
                        </a>
                      ) : null}
                      {restaurant.phone ? (
                        <a href={`tel:${restaurant.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-black text-slate-900 transition hover:-translate-y-0.5">
                          <Phone className="h-4 w-4" /> Llamar
                        </a>
                      ) : null}
                      {restaurant.whatsapp && whatsappHref(restaurant.whatsapp) ? (
                        <a href={whatsappHref(restaurant.whatsapp)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-black text-slate-900 transition hover:-translate-y-0.5">
                          <MessageCircle className="h-4 w-4" /> WhatsApp
                        </a>
                      ) : null}
                      {restaurant.instagramUrl ? (
                        <a href={externalHref(restaurant.instagramUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-black text-slate-900 transition hover:-translate-y-0.5">
                          <Instagram className="h-4 w-4" /> Instagram
                        </a>
                      ) : null}
                      {restaurant.email ? (
                        <a href={`mailto:${restaurant.email}`} className="inline-flex items-center gap-2 rounded-full border border-black/15 bg-white px-5 py-3 text-xs font-black text-slate-900 transition hover:-translate-y-0.5">
                          Escribir
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>

            {placeImage ? (
              <div className="mt-14 sm:mt-20">
                <ExpandingImage
                  src={placeImage}
                  alt={`El espacio de ${restaurant.name}`}
                  className="h-[52svh] min-h-[25rem] sm:h-[68svh] sm:min-h-[36rem]"
                />
              </div>
            ) : null}
          </div>
        </section>

        <section id="reservar" className="scroll-mt-20 bg-[#e9e1d3] px-5 py-20 sm:px-8 sm:py-28 lg:px-10 lg:py-36 xl:px-12">
          <div className="mx-auto max-w-[96rem]">
            <div className="mb-12 grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20 sm:mb-16">
              <Reveal>
                <p className="text-[10px] font-black uppercase tracking-[0.26em] sm:text-[11px]" style={{ color: primaryColor }}>
                  Reservar
                </p>
              </Reveal>
              <Reveal>
                <h2 className="max-w-5xl text-[clamp(3rem,7vw,8rem)] font-black leading-[0.84] tracking-[-0.08em] text-slate-950">
                  Elige tu mesa.
                </h2>
                <p className="mt-6 max-w-xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
                  Selecciona día, número de personas y una hora disponible. La reserva llega directamente al restaurante.
                </p>
              </Reveal>
            </div>

            <div className="grid gap-8 lg:grid-cols-[0.68fr_1.32fr] lg:items-start lg:gap-12">
              <Reveal>
                <div className="space-y-6 border-t border-black/15 pt-7 lg:sticky lg:top-28">
                  {[
                    [CalendarDays, "Disponibilidad real", "Solo aparecen las horas que todavía se pueden reservar."],
                    [Clock3, "Cambios sencillos", "Después podrás consultar, cambiar o cancelar desde tu enlace privado."],
                    [UtensilsCrossed, "Conectado al restaurante", "La solicitud aparece directamente en su panel de GastroHelp."],
                  ].map(([Icon, title, copy]) => {
                    const DetailIcon = Icon as typeof CalendarDays;
                    return (
                      <div key={String(title)} className="flex gap-4">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: primaryColor }}>
                          <DetailIcon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-sm font-black text-slate-950">{String(title)}</p>
                          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{String(copy)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Reveal>

              <Reveal delay={100}>
                {restaurant.booking.enabled ? (
                  <BookingWidget
                    slug={restaurant.slug}
                    restaurantName={restaurant.name}
                    timezone={restaurant.booking.timezone}
                    minParty={restaurant.booking.minParty}
                    maxParty={restaurant.booking.maxParty}
                    maxAdvanceDays={restaurant.booking.maxAdvanceDays}
                    requiresPhone={restaurant.booking.requiresPhone}
                    requiresEmail={restaurant.booking.requiresEmail}
                    notice={restaurant.booking.notice}
                    cancellationPolicy={restaurant.booking.cancellationPolicy}
                    primaryColor={primaryColor}
                    accentColor={accentColor}
                    demo={restaurant.demo}
                    privacyPath={legalPath(restaurant, "privacidad")}
                    conditionsPath={legalPath(restaurant, "condiciones-reserva")}
                  />
                ) : (
                  <div className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-xl sm:p-9">
                    <h3 className="text-2xl font-black text-slate-950">Reservas por contacto</h3>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
                      La reserva online está pausada temporalmente. Contacta directamente con el restaurante.
                    </p>
                  </div>
                )}
              </Reveal>
            </div>
          </div>
        </section>
      </main>

      <footer className="restaurant-dark bg-[#07100d] px-5 pb-28 pt-12 text-white md:pb-20 sm:px-8 sm:pt-14 lg:px-10 xl:px-12">
        <div className="mx-auto max-w-[96rem]">
          <div className="flex flex-col gap-8 border-b border-white/10 pb-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Fish className="h-6 w-6" style={{ color: accentColor }} />
              <p className="mt-4 text-2xl font-black tracking-tight text-white sm:text-3xl">{restaurant.name}</p>
              <p className="mt-2 max-w-md text-xs font-semibold leading-6 text-white/42 sm:text-sm">{restaurant.address}</p>
            </div>
            <a href="#inicio" className="inline-flex w-fit items-center gap-2 text-xs font-black text-white/60 transition hover:text-white">
              Volver arriba <ArrowRight className="h-4 w-4 -rotate-90" />
            </a>
          </div>
          <div className="flex flex-col gap-3 pt-6 text-[9px] font-bold uppercase tracking-[0.16em] text-white/28 sm:flex-row sm:items-center sm:justify-between sm:text-[10px]">
            <span>Web y reservas conectadas con GastroHelp</span>
            {restaurant.demo ? <span>Imágenes de demostración · Unsplash</span> : null}
          </div>
          <nav aria-label="Información legal" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[10px] font-bold text-white/50">
            <a className="transition hover:text-white" href={legalPath(restaurant, "aviso-legal")}>Aviso legal</a>
            <a className="transition hover:text-white" href={legalPath(restaurant, "privacidad")}>Privacidad</a>
            <a className="transition hover:text-white" href={legalPath(restaurant, "condiciones-reserva")}>Condiciones de reserva</a>
            <a className="transition hover:text-white" href={legalPath(restaurant, "cookies")}>Cookies</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default async function RestaurantPage({ params }: RestaurantPageProps) {
  const { slug } = await params;
  return <RestaurantPageContent slug={slug} />;
}
