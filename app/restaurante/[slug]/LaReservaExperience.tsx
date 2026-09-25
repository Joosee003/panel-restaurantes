import Image from "next/image";
import {
  ArrowDown,
  ArrowUpRight,
  Clock3,
  Instagram,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import { publicRestaurantUrl } from "../../lib/publicRestaurant";
import { legalPath } from "../../lib/publicLegal";
import BookingWidget from "./BookingWidget";
import {
  ReservaGallery,
  ReservaHeader,
  ReservaMenu,
  ReservaShell,
  ReserveButton,
} from "./LaReservaInteractions";
import styles from "./la-reserva.module.css";

const heroPhoto = "/la-reserva/ambiente-demo.webp";
const tablePhoto = "/la-reserva/mesa-demo.webp";
const terracePhoto = "/la-reserva/terraza-demo.webp";
const productPhoto = "/la-reserva/producto-tomate.webp";
const servicePhoto = "/la-reserva/servicio-fuego.webp";
const livedTablePhoto = "/la-reserva/mesa-vivida.webp";

function absoluteAsset(path: string, restaurant: PublicRestaurant) {
  return new URL(path, publicRestaurantUrl(restaurant)).toString();
}

export default function LaReservaExperience({
  restaurant,
}: {
  restaurant: PublicRestaurant;
}) {
  const gallery = [livedTablePhoto, heroPhoto, servicePhoto, tablePhoto];
  const publicUrl = publicRestaurantUrl(restaurant);
  const hasVisitDetails = Boolean(
    restaurant.address ||
      restaurant.phone ||
      restaurant.email ||
      restaurant.mapsUrl ||
      restaurant.instagramUrl,
  );
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: restaurant.name,
    description: restaurant.seoDescription,
    url: publicUrl,
    image: gallery.map((image) => absoluteAsset(image, restaurant)),
    address: restaurant.address || undefined,
    telephone: restaurant.phone || undefined,
    email: restaurant.email || undefined,
    servesCuisine: restaurant.specialties.length
      ? restaurant.specialties
      : ["Cocina mediterránea"],
    acceptsReservations: restaurant.booking.enabled,
    hasMenu: restaurant.menu.publicPath
      ? new URL(restaurant.menu.publicPath, publicUrl).toString()
      : undefined,
    sameAs: [restaurant.instagramUrl, restaurant.facebookUrl].filter(Boolean),
  };
  const booking = (
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
      primaryColor="#25362c"
      accentColor="#cbb98e"
      demo={restaurant.demo}
      variant="la-reserva"
      privacyPath={legalPath(restaurant, "privacidad")}
      conditionsPath={legalPath(restaurant, "condiciones-reserva")}
    />
  );

  return (
    <ReservaShell booking={booking} bookingEnabled={restaurant.booking.enabled}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <a className={styles.skip} href="#contenido">
        Ir al contenido
      </a>
      <ReservaHeader
        name={restaurant.name}
        bookingEnabled={restaurant.booking.enabled}
      />

      <main id="contenido" className={styles.main}>
        <section className={styles.hero} aria-labelledby="reserva-title">
          <Image
            src={heroPhoto}
            alt="Comedor mediterráneo de La Reserva con mesas de madera y luz cálida"
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            className={styles.heroPhoto}
          />
          <div className={styles.heroShade} />
          <div className={styles.heroTopline}>
            <span>{restaurant.eyebrow}</span>
            <span>Producto · Fuego · Sobremesa</span>
          </div>
          <div className={styles.heroContent}>
            <p className={styles.heroKicker}>Cocina con calma · Mesas con vida</p>
            <h1 id="reserva-title" className={styles.heroTitle}>
              <span>La</span>
              <em>Reserva</em>
            </h1>
            <div className={styles.heroStatement}>
              <p>
                Producto que se reconoce, fuego que se escucha y una sobremesa
                que decide su propia hora.
              </p>
              <div className={styles.heroActions}>
                {restaurant.booking.enabled ? (
                  <ReserveButton className={styles.primaryButton}>
                    Reservar mesa <ArrowUpRight size={18} aria-hidden="true" />
                  </ReserveButton>
                ) : null}
                <a href="#carta" className={styles.ghostLink}>
                  Ver la carta
                </a>
              </div>
            </div>
          </div>
          <div className={styles.heroMeta}>
            {restaurant.address ? (
              <span>
                <MapPin size={14} aria-hidden="true" /> {restaurant.address}
              </span>
            ) : (
              <span>Producto · Brasa · Temporada</span>
            )}
            <span>
              <Clock3 size={14} aria-hidden="true" /> Reserva online
            </span>
          </div>
          <a className={styles.heroScroll} href="#la-casa">
            Conoce la casa <ArrowDown size={15} aria-hidden="true" />
          </a>
        </section>

        <aside className={styles.runningLine} aria-label="La esencia de La Reserva">
          <span>Producto de temporada</span>
          <em>·</em>
          <span>Cocina mediterránea</span>
          <em>·</em>
          <span>Sobremesas sin prisa</span>
        </aside>

        <section id="la-casa" className={styles.story} aria-labelledby="casa-title">
          <div className={styles.sectionIndex}>
            <span>01</span>
            <p>La casa</p>
          </div>
          <div className={`${styles.storyLead} ${styles.storyLeadCompact}`} data-reveal>
            <p className={styles.eyebrow}>Muy de aquí. Muy a tu aire.</p>
            <h2 id="casa-title">La cocina empieza mucho antes del plato.</h2>
          </div>
          <figure className={styles.tableFigure} data-reveal>
            <div className={styles.tablePhoto}>
              <Image
                src={productPhoto}
                alt="Manos preparando tomates y hierbas frescas en cocina"
                fill
                sizes="(max-width: 760px) 86vw, 38vw"
              />
            </div>
            <figcaption>
              <span>Materia prima</span>
              <span>Antes del servicio</span>
            </figcaption>
          </figure>
          <div className={styles.storyCopy} data-reveal>
            <p>
              Aquí el producto se toca, se corta y pasa por el fuego sin perder
              su nombre. La sala hace el resto: servir, observar y dejar que la
              mesa encuentre su ritmo.
            </p>
            <ul aria-label="Especialidades de La Reserva">
              {(restaurant.specialties.length
                ? restaurant.specialties
                : ["Producto", "Fuego", "Temporada"]
              ).map((specialty) => (
                <li key={specialty}>{specialty}</li>
              ))}
            </ul>
            <a href="#carta" className={styles.editorialLink}>
              Entrar en la carta <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          </div>
        </section>

        <section className={styles.serviceSequence} aria-labelledby="servicio-title">
          <header className={styles.sequenceHeader} data-reveal>
            <div className={styles.sectionIndexLight}>
              <span>02</span>
              <p>Dentro del servicio</p>
            </div>
            <h2 id="servicio-title">Tres gestos. Una misma mesa.</h2>
            <p>
              Del primer corte al último plato: materia, fuego y una sobremesa
              que ya ha empezado a desordenarlo todo.
            </p>
          </header>
          <div className={styles.sequenceTrack}>
            <figure className={`${styles.sequenceFrame} ${styles.sequenceProduct}`} data-reveal>
              <div className={styles.sequenceImage}>
                <Image
                  src={productPhoto}
                  alt="Tomates, hierbas y manos trabajando sobre una mesa de cocina"
                  fill
                  sizes="(max-width: 760px) 82vw, 30vw"
                />
              </div>
              <figcaption><span>01</span><p>El producto llega sin disfraz.</p></figcaption>
            </figure>
            <figure className={`${styles.sequenceFrame} ${styles.sequenceService}`} data-reveal>
              <div className={styles.sequenceImage}>
                <Image
                  src={servicePhoto}
                  alt="Cocinero terminando un plato junto al fuego durante el servicio"
                  fill
                  sizes="(max-width: 760px) 82vw, 36vw"
                />
              </div>
              <figcaption><span>02</span><p>El pase exige pulso.</p></figcaption>
            </figure>
            <figure className={`${styles.sequenceFrame} ${styles.sequenceTable}`} data-reveal>
              <div className={styles.sequenceImage}>
                <Image
                  src={livedTablePhoto}
                  alt="Mesa vivida después del primer plato, con pan, vino y servilletas"
                  fill
                  sizes="(max-width: 760px) 82vw, 27vw"
                />
              </div>
              <figcaption><span>03</span><p>La mesa guarda la historia.</p></figcaption>
            </figure>
          </div>
        </section>

        <section id="carta" className={styles.menuSection} aria-labelledby="carta-title">
          <div className={styles.sectionIndex}>
            <span>03</span>
            <p>La carta</p>
          </div>
          <div className={`${styles.menuIntro} ${styles.menuIntroCompact}`} data-reveal>
            <h2 id="carta-title">Una carta breve, pensada para volver.</h2>
            <p>
              Empieza al centro, sigue por lo que marque el apetito y deja sitio
              para el último bocado.
            </p>
          </div>
          <ReservaMenu
            sections={restaurant.menu.sections}
            bookingEnabled={restaurant.booking.enabled}
          />
          <div className={styles.menuFooter}>
            <p>IVA incluido. Para alérgenos e intolerancias, consulta al equipo.</p>
            {restaurant.menu.enabled && restaurant.menu.publicPath ? (
              <a className={styles.editorialLink} href={restaurant.menu.publicPath}>
                Abrir carta digital <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </section>

        <section id="el-ambiente" className={styles.ambience} aria-labelledby="ambiente-title">
          <div className={`${styles.ambienceHeading} ${styles.ambienceHeadingCompact}`} data-reveal>
            <div className={styles.sectionIndexLight}>
              <span>04</span>
              <p>La mesa vivida</p>
            </div>
            <h2 id="ambiente-title">Cuando la sala empieza a contar cosas.</h2>
            <p>
              Migas, copas a medias, el pase en marcha. La belleza está en lo
              que ocurre, no en dejarlo todo intacto.
            </p>
          </div>
          <ReservaGallery images={gallery} />
        </section>

        <section id="visitanos" className={styles.visit} aria-labelledby="visitanos-title">
          <div className={styles.visitPhoto} data-reveal>
            <Image
              src={terracePhoto}
              alt="Terraza de La Reserva al anochecer"
              fill
              sizes="(max-width: 900px) 100vw, 58vw"
            />
          </div>
          <div className={styles.visitContent} data-reveal>
            <div className={styles.sectionIndex}>
              <span>05</span>
              <p>La próxima mesa</p>
            </div>
            <h2 id="visitanos-title">Ven con hambre. Quédate sin prisa.</h2>
            {hasVisitDetails ? (
              <>
                <dl>
                  {restaurant.address ? (
                    <div><dt>Ubicación</dt><dd>{restaurant.address}</dd></div>
                  ) : null}
                  {restaurant.phone ? (
                    <div><dt>Teléfono</dt><dd><a href={`tel:${restaurant.phone}`}><Phone size={16} aria-hidden="true" /> {restaurant.phone}</a></dd></div>
                  ) : null}
                  {restaurant.email ? (
                    <div><dt>Contacto</dt><dd><a href={`mailto:${restaurant.email}`}><Mail size={16} aria-hidden="true" /> {restaurant.email}</a></dd></div>
                  ) : null}
                </dl>
                <div className={styles.visitActions}>
                  {restaurant.mapsUrl ? (
                    <a href={restaurant.mapsUrl} target="_blank" rel="noreferrer">Abrir en Maps <ArrowUpRight size={18} aria-hidden="true" /></a>
                  ) : null}
                  {restaurant.instagramUrl ? (
                    <a href={restaurant.instagramUrl} target="_blank" rel="noreferrer"><Instagram size={17} aria-hidden="true" /> Instagram</a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className={styles.visitReserve}>
                <p>
                  Elige el día, las personas y una hora. Nosotros empezamos a
                  preparar la mesa.
                </p>
                {restaurant.booking.enabled ? (
                  <ReserveButton className={styles.primaryButton}>
                    Ver mesas disponibles <ArrowUpRight size={18} aria-hidden="true" />
                  </ReserveButton>
                ) : null}
              </div>
            )}
          </div>
        </section>

        <section id="reservar" className={styles.bookingSection} aria-labelledby="mesa-title">
          <div className={styles.bookingIndex}>06 — Reserva</div>
          <div className={styles.bookingContent} data-reveal>
            <h2 id="mesa-title">La mesa está puesta.</h2>
            <div className={styles.bookingAside}>
              <p>Día, comensales y hora. Tres decisiones antes de sentarte.</p>
              {restaurant.booking.enabled ? (
                <ReserveButton className={styles.bookingButton}>
                  Buscar una mesa <ArrowUpRight size={18} aria-hidden="true" />
                </ReserveButton>
              ) : (
                <p>Las reservas online están en pausa.</p>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLead}>
          <a href="#contenido" aria-label="La Reserva, volver al inicio">La Reserva</a>
          <p>Producto · Fuego · Sobremesa</p>
        </div>
        <nav aria-label="Navegación del pie">
          <a href="#la-casa">La casa</a>
          <a href="#carta">La carta</a>
          <a href="#el-ambiente">La mesa</a>
          <a href="#visitanos">Reserva</a>
        </nav>
        <div className={styles.footerLegal}>
          <span>© {new Date().getFullYear()} La Reserva</span>
          <div>
            <a href={legalPath(restaurant, "aviso-legal")}>Aviso legal</a>
            <a href={legalPath(restaurant, "privacidad")}>Privacidad</a>
            <a href={legalPath(restaurant, "condiciones-reserva")}>Condiciones</a>
            <a href={legalPath(restaurant, "cookies")}>Cookies</a>
          </div>
        </div>
      </footer>
    </ReservaShell>
  );
}
