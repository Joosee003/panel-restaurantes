import Image from "next/image";
import { ArrowDown, ArrowUpRight, Clock3, MoveUpRight } from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import { legalPath } from "../../lib/publicLegal";
import BookingWidget from "./BookingWidget";
import { ReservaShell, ReservaHeader, ReservaMenu, ReservaGallery, ReserveButton } from "./LaReservaInteractions";
import styles from "./la-reserva.module.css";

const roomPhoto = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2000&q=85";
const foodPhoto = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1200&q=85";

export default function LaReservaExperience({ restaurant }: { restaurant: PublicRestaurant }) {
  const gallery = Array.from(new Set([restaurant.heroImageUrl || roomPhoto, ...restaurant.galleryUrls, foodPhoto])).slice(0, 5);
  const booking = <BookingWidget slug={restaurant.slug} restaurantName={restaurant.name} timezone={restaurant.booking.timezone} minParty={restaurant.booking.minParty} maxParty={restaurant.booking.maxParty} maxAdvanceDays={restaurant.booking.maxAdvanceDays} requiresPhone={restaurant.booking.requiresPhone} requiresEmail={restaurant.booking.requiresEmail} notice={restaurant.booking.notice} cancellationPolicy={restaurant.booking.cancellationPolicy} primaryColor="#9c261c" accentColor="#f3dfbd" demo={restaurant.demo} privacyPath={legalPath(restaurant, "privacidad")} conditionsPath={legalPath(restaurant, "condiciones-reserva")} />;
  return (
    <ReservaShell booking={booking} bookingEnabled={restaurant.booking.enabled}>
      <a className={styles.skip} href="#contenido">Ir al contenido</a>
      <ReservaHeader name={restaurant.name} bookingEnabled={restaurant.booking.enabled} />
      <main id="contenido" className={styles.main}>
        <section className={styles.hero} aria-labelledby="reserva-title">
          <Image src={restaurant.heroImageUrl || roomPhoto} alt="Interior de restaurante con luz cálida y mesas junto a los ventanales" fill unoptimized priority sizes="100vw" className={styles.heroPhoto} />
          <div className={styles.heroShade} />
          <div className={styles.heroTopline}><span>CASTELLÓN · COCINA MEDITERRÁNEA</span><span className={styles.demoTag}>DEMO GASTROHELP</span></div>
          <div className={styles.heroContent}>
            <h1 id="reserva-title"><span>COMER.</span><span>BRINDAR.</span><span className={styles.heroItalic}>Quedarse.</span></h1>
            <div className={styles.heroAside}><p>El plan empieza en la mesa.<br />Lo de después, ya se verá.</p>{restaurant.booking.enabled ? <ReserveButton className={styles.lightButton}>Reservar una mesa <ArrowUpRight size={20} aria-hidden="true" /></ReserveButton> : <a href="#carta" className={styles.lightButton}>Descubrir la carta <ArrowUpRight size={20} /></a>}</div>
          </div>
          <div className={styles.heroFoot}><a href="#la-casa">Un poco más abajo <ArrowDown size={16} aria-hidden="true" /></a><span>BUENA COCINA. MEJOR COMPAÑÍA.</span></div>
        </section>

        <div className={styles.manifestoStrip} aria-label="Producto, fuego y sobremesa"><span>PRODUCTO</span><span aria-hidden="true">✳</span><span>FUEGO</span><span aria-hidden="true">✳</span><span>SOBREMESA</span><span aria-hidden="true">✳</span><span>SIN PRISA</span></div>

        <section id="la-casa" className={styles.story} aria-labelledby="casa-title">
          <div className={styles.sectionLabel}><span>01 — LA CASA</span><span>MUY DE AQUÍ. MUY A TU AIRE.</span></div>
          <div className={styles.storyGrid}>
            <div className={styles.storyHeading} data-reveal><h2 id="casa-title">La buena vida<br />se sienta<br /><em>a la mesa.</em></h2><p>Una cocina que apetece. Una copa que se alarga.<br />Y esa sensación de estar justo donde quieres.</p><a href="#carta" className={styles.roundLink}>Descubre nuestra cocina <ArrowUpRight size={20} aria-hidden="true" /></a></div>
            <div className={styles.storyVisual} data-reveal><div className={styles.storyPhoto}><Image src={foodPhoto} alt="Carne al fuego servida con verduras, hierbas y salsa" fill unoptimized sizes="(max-width: 760px) 90vw, 44vw" /></div><span className={styles.storyStamp}>MENOS PRISA.<br /><em>Más sabor.</em></span><div className={styles.photoCaption}><span>DE LA COCINA A TU MESA</span><span>LA RESERVA ↗</span></div></div>
          </div>
          <div className={styles.houseNotes} data-reveal><p><span>01</span>Para pedir<br /><strong>al centro.</strong></p><p><span>02</span>Para brindar<br /><strong>por lo que sea.</strong></p><p><span>03</span>Para volver<br /><strong>sin pensarlo.</strong></p></div>
        </section>

        <section id="carta" className={styles.menuSection} aria-labelledby="carta-title">
          <div className={styles.sectionLabel}><span>02 — LO QUE APETECE</span><span>EL PRODUCTO MANDA.</span></div>
          <div className={styles.menuIntro} data-reveal><h2 id="carta-title">Una carta.<br /><em>Muchos antojos.</em></h2><p>Empieza compartiendo.<br />Sigue como quieras.<br />Deja sitio para el postre.</p></div>
          <ReservaMenu sections={restaurant.menu.sections} bookingEnabled={restaurant.booking.enabled} />
          <div className={styles.menuFooter}><p>Precios de demostración · IVA incluido.<br />Consulta al equipo sobre alérgenos e intolerancias.</p>{restaurant.menu.enabled && restaurant.menu.publicPath ? <a className={styles.textLink} href={restaurant.menu.publicPath}>Consultar carta digital <ArrowUpRight size={19} aria-hidden="true" /></a> : null}</div>
        </section>

        <section id="el-ambiente" className={styles.ambience} aria-labelledby="ambiente-title">
          <div className={styles.ambienceHeading} data-reveal><div><p className={styles.eyebrow}>03 — QUÉDATE UN RATO</p><h2 id="ambiente-title">También se viene<br /><em>por esto.</em></h2></div><p>El ambiente, la conversación,<br />la última copa que nunca es la última.</p></div>
          <ReservaGallery images={gallery} />
        </section>

        <section id="reservar" className={styles.bookingSection} aria-labelledby="mesa-title">
          <div className={styles.bookingTop}><span>04 — TU PRÓXIMO PLAN</span><Clock3 size={24} aria-hidden="true" /></div>
          <div className={styles.bookingContent} data-reveal><h2 id="mesa-title">¿NOS VEMOS<br /><em>en la mesa?</em></h2><div className={styles.bookingAside}><p>Tú eliges el día y con quién.<br />Nosotros ponemos el resto.</p>{restaurant.booking.enabled ? <ReserveButton className={styles.lightButton}>Buscar mi mesa <MoveUpRight size={21} aria-hidden="true" /></ReserveButton> : <p>Las reservas online están en pausa.</p>}<span>Consulta las horas disponibles al momento.</span></div></div>
          <div className={styles.bookingNote}><span>ESTÁS EN UNA DEMOSTRACIÓN</span><p>La Reserva es un restaurante ficticio. Puedes hacer una reserva de prueba y verla en su panel, sin reservar en un negocio real.</p></div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}><a className={styles.footerMonogram} href="#contenido" aria-label="La Reserva, volver al inicio">LR<span>RESTAURANTE</span></a><p>Producto. Fuego.<br />Y buena compañía.</p><nav aria-label="Navegación del pie"><a href="#la-casa">La casa</a><a href="#carta">La carta</a><a href="#el-ambiente">El ambiente</a></nav><a href="#contenido" className={styles.backTop} aria-label="Volver al inicio"><ArrowUpRight size={26} /></a></div>
        <div className={styles.footerWordmark} aria-hidden="true">LA RESERVA</div>
        <div className={styles.footerBottom}><span>© {new Date().getFullYear()} La Reserva · Restaurante demo</span><div><a href={legalPath(restaurant,"aviso-legal")}>Aviso legal</a><a href={legalPath(restaurant,"privacidad")}>Privacidad</a><a href={legalPath(restaurant,"cookies")}>Cookies</a></div><a href="https://gastrohelp.es" target="_blank" rel="noopener noreferrer">GastroHelp ↗</a></div>
      </footer>
    </ReservaShell>
  );
}
