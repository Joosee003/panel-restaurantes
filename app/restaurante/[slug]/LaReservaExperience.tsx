import Image from "next/image";
import { ArrowDown, ArrowUpRight, CalendarDays } from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import { legalPath } from "../../lib/publicLegal";
import BookingWidget from "./BookingWidget";
import { ReservaHeader, ReservaMenu } from "./LaReservaInteractions";
import styles from "./la-reserva.module.css";

// Existing demonstration photography. The page is deliberately a separate theme:
// only the published La Reserva demo is routed here; all data keeps its tenant ID.
const roomPhoto = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2200&q=85";
const foodPhoto = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1300&q=85";

export default function LaReservaExperience({ restaurant }: { restaurant: PublicRestaurant }) {
  return (
    <div className={styles.site}>
      <a className={styles.skip} href="#contenido">Ir al contenido</a>
      <div className={styles.demoBar}>Un restaurante de muestra. Una experiencia real. <span>DEMO GASTROHELP</span></div>
      <ReservaHeader name={restaurant.name} bookingEnabled={restaurant.booking.enabled} />

      <main id="contenido" className={styles.main}>
        <section className={styles.hero} aria-labelledby="reserva-title">
          <Image src={restaurant.heroImageUrl || roomPhoto} alt="Una sala cálida, mesas vestidas y luz tenue para una larga sobremesa" fill unoptimized priority sizes="100vw" className={styles.heroPhoto} />
          <div className={styles.heroShade} />
          <div className={styles.heroContent}>
            <p className={styles.eyebrow}><span /> CASTELLÓN · COCINA MEDITERRÁNEA</p>
            <h1 id="reserva-title">El gusto de<br /><em>quedarse.</em></h1>
            <div className={styles.heroBottom}>
              <p>Buena mesa. Una copa más.<br />Y ninguna prisa por marcharse.</p>
              <a href={restaurant.booking.enabled ? "#reservar" : "#carta"} className={styles.primaryLink}>
                {restaurant.booking.enabled ? "RESERVAR UNA MESA" : "DESCUBRIR LA CARTA"}<ArrowUpRight size={20} aria-hidden="true" />
              </a>
            </div>
          </div>
          <div className={styles.heroFoot}><a href="#la-casa">DESCUBRE LA RESERVA <ArrowDown size={16} aria-hidden="true" /></a><span>PRODUCTO · FUEGO · SOBREMESA</span></div>
        </section>

        <section id="la-casa" className={styles.story} aria-labelledby="casa-title">
          <div className={styles.storyHeading}>
            <p className={styles.eyebrow}>01 / LA CASA</p>
            <h2 id="casa-title">Hay planes.<br />Y hay <em>mesas.</em></h2>
          </div>
          <div className={styles.storyCopy}>
            <p>Las que empiezan con un «¿pedimos algo para compartir?» y terminan cuando ya no queda nadie mirando el reloj.</p>
            <p>En La Reserva cocinamos para esos momentos. Arroces con fondo, carnes a la brasa y platos que saben a Mediterráneo.</p>
            <a href="#carta" className={styles.textLink}>Esto es lo que sale de nuestra cocina <ArrowUpRight size={19} aria-hidden="true" /></a>
          </div>
        </section>

        <section className={styles.foodSection} aria-labelledby="cocina-title">
          <div className={styles.foodImage}>
            <Image src={foodPhoto} alt="Una propuesta de carne cocinada al fuego con verduras y hierbas" fill unoptimized sizes="(max-width: 760px) 100vw, 60vw" />
            <span className={styles.photoLabel}>EL PRODUCTO MARCA EL CAMINO.</span>
          </div>
          <div className={styles.foodCopy}>
            <span className={styles.smallMark} aria-hidden="true">LR</span>
            <p className={styles.eyebrow}>NUESTRA FORMA DE COCINAR</p>
            <h2 id="cocina-title">Pocas vueltas.<br /><em>Mucho sabor.</em></h2>
            <p>Una buena materia prima, el punto justo de fuego y el placer de llevar algo rico al centro de la mesa.</p>
            <span className={styles.foodNote}>Para compartir. O para no dejar nada.</span>
          </div>
        </section>

        <section id="carta" className={styles.menuSection} aria-labelledby="carta-title">
          <div className={styles.sectionTop}><p className={styles.eyebrow}>02 / LA CARTA</p><span>A TU GUSTO. A NUESTRO ESTILO.</span></div>
          <div className={styles.menuIntro}><h2 id="carta-title">Elige bien.<br /><em>Disfruta más.</em></h2><p>Para abrir boca, para quedarse a gusto<br className={styles.desktopBreak} /> y para hacerle un hueco al postre.</p></div>
          <ReservaMenu sections={restaurant.menu.sections} />
          <div className={styles.menuFooter}><p>Precios de demostración · IVA incluido.<br />Consulta al equipo sobre alérgenos e intolerancias.</p>{restaurant.menu.enabled && restaurant.menu.publicPath ? <a className={styles.textLink} href={restaurant.menu.publicPath}>Abrir carta digital <ArrowUpRight size={19} aria-hidden="true" /></a> : null}</div>
        </section>

        <section className={styles.interlude} aria-label="La sobremesa">
          <Image src={roomPhoto} alt="El ambiente acogedor de una mesa entre amigos" fill unoptimized sizes="100vw" />
          <div className={styles.interludeShade} />
          <p>Lo mejor de la mesa<br />es <em>con quién la compartes.</em></p>
          <span>LA RESERVA · QUÉDATE UN RATO MÁS</span>
        </section>

        <section id="reservar" className={styles.bookingSection} aria-labelledby="mesa-title">
          <div className={styles.bookingCopy}>
            <p className={styles.eyebrow}>03 / TU MESA</p>
            <h2 id="mesa-title">El próximo<br />buen rato<br /><em>empieza aquí.</em></h2>
            <p>Elige el día, cuántos sois y la hora.<br />Nosotros ponemos la mesa.</p>
            <div className={styles.bookingDetail}><CalendarDays size={21} aria-hidden="true" /><p>Disponibilidad al momento<br /><span>Gestiona tu reserva desde su enlace privado.</span></p></div>
            <div className={styles.demoNote}><span>ESTÁS EN UNA DEMOSTRACIÓN</span><p>La Reserva es un restaurante ficticio. Puedes probar el proceso: tu reserva llegará a su panel de prueba, sin reservar una mesa en un negocio real.</p></div>
          </div>
          <div className={styles.bookingWidget}>
            {restaurant.booking.enabled ? <BookingWidget slug={restaurant.slug} restaurantName={restaurant.name} timezone={restaurant.booking.timezone} minParty={restaurant.booking.minParty} maxParty={restaurant.booking.maxParty} maxAdvanceDays={restaurant.booking.maxAdvanceDays} requiresPhone={restaurant.booking.requiresPhone} requiresEmail={restaurant.booking.requiresEmail} notice={restaurant.booking.notice} cancellationPolicy={restaurant.booking.cancellationPolicy} primaryColor="#35251e" accentColor="#d9a079" demo={restaurant.demo} privacyPath={legalPath(restaurant, "privacidad")} conditionsPath={legalPath(restaurant, "condiciones-reserva")} /> : <div className={styles.bookingPaused}><h3>Reservas online en pausa</h3><p>Vuelve a consultar más adelante.</p></div>}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerTop}><a href="#" className={styles.footerBrand}>{restaurant.name}</a><p>Cocina mediterránea.<br />Buenos momentos.</p><a href="#contenido" className={styles.backTop} aria-label="Volver al inicio"><ArrowUpRight size={24} /></a></div>
        <div className={styles.footerBottom}><span>© {new Date().getFullYear()} La Reserva · Demo GastroHelp</span><div><a href={legalPath(restaurant,"aviso-legal")}>Aviso legal</a><a href={legalPath(restaurant,"privacidad")}>Privacidad</a><a href={legalPath(restaurant,"cookies")}>Cookies</a></div><a href="https://gastrohelp.es" target="_blank" rel="noopener noreferrer">Creado con GastroHelp ↗</a></div>
      </footer>
      <div className={styles.mobileBar}><a href="#carta">VER CARTA</a>{restaurant.booking.enabled ? <a href="#reservar">RESERVAR MESA <ArrowUpRight size={17} aria-hidden="true" /></a> : null}</div>
    </div>
  );
}
