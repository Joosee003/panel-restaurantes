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
const kitchenPhoto = "/la-reserva/cocina-demo.webp";
const terracePhoto = "/la-reserva/terraza-demo.webp";

function absoluteAsset(path: string, restaurant: PublicRestaurant) {
  return new URL(path, publicRestaurantUrl(restaurant)).toString();
}

export default function LaReservaExperience({
  restaurant,
}: {
  restaurant: PublicRestaurant;
}) {
  const gallery = [heroPhoto, terracePhoto, kitchenPhoto, tablePhoto];
  const location =
    restaurant.address || restaurant.eyebrow || "Castellón · Mediterráneo";
  const publicUrl = publicRestaurantUrl(restaurant);
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
      privacyPath={legalPath(restaurant, "privacidad")}
      conditionsPath={legalPath(restaurant, "condiciones-reserva")}
    />
  );

  return (
    <ReservaShell
      booking={booking}
      bookingEnabled={restaurant.booking.enabled}
    >
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
            <span>{restaurant.eyebrow || "Castellón · Mediterráneo"}</span>
            <span>Restaurante demo</span>
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
            <span>
              <MapPin size={14} aria-hidden="true" /> {location}
            </span>
            <span>
              <Clock3 size={14} aria-hidden="true" /> Consulta disponibilidad
              al reservar
            </span>
          </div>
          <a className={styles.heroScroll} href="#la-casa">
            Conoce la casa <ArrowDown size={15} aria-hidden="true" />
          </a>
        </section>

        <aside
          className={styles.runningLine}
          aria-label="La esencia de La Reserva"
        >
          <span>Producto de temporada</span>
          <em>·</em>
          <span>Cocina mediterránea</span>
          <em>·</em>
          <span>Sobremesas sin prisa</span>
        </aside>

        <section
          id="la-casa"
          className={styles.story}
          aria-labelledby="casa-title"
        >
          <div className={styles.sectionIndex}>
            <span>01</span>
            <p>La casa</p>
          </div>
          <div className={styles.storyLead} data-reveal>
            <p className={styles.eyebrow}>Muy de aquí. Muy a tu aire.</p>
            <h2 id="casa-title">
              Una mesa no es un lugar. <em>Es lo que ocurre alrededor.</em>
            </h2>
          </div>
          <figure className={styles.tableFigure} data-reveal>
            <div className={styles.tablePhoto}>
              <Image
                src={tablePhoto}
                alt="Mesa preparada con vino, aceitunas y luz de tarde"
                fill
                sizes="(max-width: 760px) 86vw, 38vw"
              />
            </div>
            <figcaption>
              <span>La primera copa</span>
              <span>Imagen de demostración</span>
            </figcaption>
          </figure>
          <div className={styles.storyCopy} data-reveal>
            <p>
              Nos gustan los planes que empiezan con algo al centro y terminan
              sin mirar el reloj. Cocina reconocible, producto bien tratado y
              una sala pensada para quedarse.
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

        <section
          className={styles.kitchen}
          aria-label="La cocina de La Reserva"
        >
          <div className={styles.kitchenPhoto}>
            <Image
              src={kitchenPhoto}
              alt="Cocina abierta de La Reserva durante el servicio"
              fill
              sizes="100vw"
            />
          </div>
          <div className={styles.kitchenShade} />
          <p className={styles.kitchenLabel}>
            Cocina a la vista · Servicio en marcha
          </p>
          <blockquote>
            El punto exacto del fuego. <em>Y luego, dejar hablar al producto.</em>
          </blockquote>
          <span className={styles.kitchenNote}>02 — Entre cocina y sala</span>
        </section>

        <section
          id="carta"
          className={styles.menuSection}
          aria-labelledby="carta-title"
        >
          <div className={styles.sectionIndex}>
            <span>03</span>
            <p>La carta</p>
          </div>
          <div className={styles.menuIntro} data-reveal>
            <h2 id="carta-title">
              Empieza compartiendo. <em>Sigue como quieras.</em>
            </h2>
            <p>
              Una carta breve para elegir por apetito, no por inercia. Los
              platos y precios que ves pertenecen a esta demostración.
            </p>
          </div>
          <ReservaMenu
            sections={restaurant.menu.sections}
            bookingEnabled={restaurant.booking.enabled}
          />
          <div className={styles.menuFooter}>
            <p>
              Precios de demostración · IVA incluido. Consulta al equipo sobre
              alérgenos e intolerancias.
            </p>
            {restaurant.menu.enabled && restaurant.menu.publicPath ? (
              <a
                className={styles.editorialLink}
                href={restaurant.menu.publicPath}
              >
                Abrir carta digital{" "}
                <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </section>

        <section
          id="el-ambiente"
          className={styles.ambience}
          aria-labelledby="ambiente-title"
        >
          <div className={styles.ambienceHeading} data-reveal>
            <div className={styles.sectionIndexLight}>
              <span>04</span>
              <p>El ambiente</p>
            </div>
            <h2 id="ambiente-title">
              La luz baja. <em>El plan se alarga.</em>
            </h2>
            <p>
              Hay noches que empiezan con una reserva y acaban convirtiéndose
              en recuerdo.
            </p>
          </div>
          <ReservaGallery images={gallery} />
        </section>

        <section
          id="visitanos"
          className={styles.visit}
          aria-labelledby="visitanos-title"
        >
          <div className={styles.visitPhoto} data-reveal>
            <Image
              src={terracePhoto}
              alt="Terraza mediterránea de La Reserva al anochecer"
              fill
              sizes="(max-width: 900px) 100vw, 58vw"
            />
          </div>
          <div className={styles.visitContent} data-reveal>
            <div className={styles.sectionIndex}>
              <span>05</span>
              <p>Ven a vernos</p>
            </div>
            <h2 id="visitanos-title">
              Tu próxima sobremesa <em>empieza aquí.</em>
            </h2>
            <dl>
              <div>
                <dt>Ubicación</dt>
                <dd>
                  {restaurant.address ||
                    "Dirección pública pendiente de configurar"}
                </dd>
              </div>
              <div>
                <dt>Horario</dt>
                <dd>
                  Horario público pendiente de configurar en esta demostración.
                </dd>
              </div>
              {restaurant.phone ? (
                <div>
                  <dt>Teléfono</dt>
                  <dd>
                    <a href={`tel:${restaurant.phone}`}>
                      <Phone size={16} aria-hidden="true" /> {restaurant.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {restaurant.email ? (
                <div>
                  <dt>Contacto</dt>
                  <dd>
                    <a href={`mailto:${restaurant.email}`}>
                      <Mail size={16} aria-hidden="true" /> {restaurant.email}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className={styles.visitActions}>
              {restaurant.mapsUrl ? (
                <a
                  href={restaurant.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir en Maps <ArrowUpRight size={18} aria-hidden="true" />
                </a>
              ) : null}
              {restaurant.instagramUrl ? (
                <a
                  href={restaurant.instagramUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Instagram size={17} aria-hidden="true" /> Instagram
                </a>
              ) : null}
            </div>
            <p className={styles.missingDataNote}>
              La dirección mostrada es ficticia. El horario, teléfono y enlace
              de Maps se publicarán cuando el restaurante aporte datos reales.
            </p>
          </div>
        </section>

        <section
          id="reservar"
          className={styles.bookingSection}
          aria-labelledby="mesa-title"
        >
          <div className={styles.bookingIndex}>06 — Reserva</div>
          <div className={styles.bookingContent} data-reveal>
            <h2 id="mesa-title">
              La mesa está puesta. <em>Faltas tú.</em>
            </h2>
            <div className={styles.bookingAside}>
              <p>
                Elige día, número de personas y una hora disponible. En esta
                demo puedes recorrer el flujo sin guardar datos.
              </p>
              {restaurant.booking.enabled ? (
                <ReserveButton className={styles.bookingButton}>
                  Buscar una mesa{" "}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </ReserveButton>
              ) : (
                <p>Las reservas online están en pausa.</p>
              )}
            </div>
          </div>
          <div className={styles.bookingNote}>
            <span>Demostración segura</span>
            <p>
              La Reserva es un restaurante ficticio. La disponibilidad puede
              consultarse, pero no se crean reservas ni se guardan datos
              personales.
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerLead}>
          <a href="#contenido" aria-label="La Reserva, volver al inicio">
            La Reserva
          </a>
          <p>Producto · Fuego · Sobremesa</p>
        </div>
        <nav aria-label="Navegación del pie">
          <a href="#la-casa">La casa</a>
          <a href="#carta">La carta</a>
          <a href="#el-ambiente">El ambiente</a>
          <a href="#visitanos">Visítanos</a>
        </nav>
        <div className={styles.footerLegal}>
          <span>© {new Date().getFullYear()} La Reserva · Restaurante demo</span>
          <div>
            <a href={legalPath(restaurant, "aviso-legal")}>Aviso legal</a>
            <a href={legalPath(restaurant, "privacidad")}>Privacidad</a>
            <a href={legalPath(restaurant, "condiciones-reserva")}>Condiciones</a>
            <a href={legalPath(restaurant, "cookies")}>Cookies</a>
          </div>
          <span>Web conectada por GastroHelp</span>
        </div>
      </footer>
    </ReservaShell>
  );
}
