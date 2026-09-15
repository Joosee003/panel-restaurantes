import Image from "next/image";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { PublicRestaurant } from "../../lib/publicRestaurant";
import { legalPath } from "../../lib/publicLegal";
import BookingWidget from "./BookingWidget";
import { ReservaShell, ReservaHeader, ReservaMenu, ReservaGallery, ReserveButton, TableSignature } from "./LaReservaInteractions";
import styles from "./la-reserva.module.css";

const roomPhoto = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2000&q=85";
const ambiencePhoto = "/la-reserva/ambiente-demo.webp";

export default function LaReservaExperience({ restaurant }: { restaurant: PublicRestaurant }) {
  const heroPhoto = !restaurant.heroImageUrl || restaurant.heroImageUrl.includes("photo-1517248135467-4c7edcad34c4") ? ambiencePhoto : restaurant.heroImageUrl;
  const gallery = Array.from(new Set([ambiencePhoto, restaurant.heroImageUrl || roomPhoto, ...restaurant.galleryUrls])).slice(0, 5);
  const booking = <BookingWidget slug={restaurant.slug} restaurantName={restaurant.name} timezone={restaurant.booking.timezone} minParty={restaurant.booking.minParty} maxParty={restaurant.booking.maxParty} maxAdvanceDays={restaurant.booking.maxAdvanceDays} requiresPhone={restaurant.booking.requiresPhone} requiresEmail={restaurant.booking.requiresEmail} notice={restaurant.booking.notice} cancellationPolicy={restaurant.booking.cancellationPolicy} primaryColor="#213eab" accentColor="#f4e9c8" demo={restaurant.demo} privacyPath={legalPath(restaurant, "privacidad")} conditionsPath={legalPath(restaurant, "condiciones-reserva")} />;
  return (
    <ReservaShell booking={booking} bookingEnabled={restaurant.booking.enabled}>
      <a className={styles.skip} href="#contenido">Ir al contenido</a>
      <ReservaHeader name={restaurant.name} bookingEnabled={restaurant.booking.enabled} />
      <main id="contenido" className={styles.main}>
        <section className={styles.hero} aria-labelledby="reserva-title">
          <Image src={heroPhoto} alt="Ambiente ilustrativo de La Reserva: mesas de madera, luz cálida y arcos mediterráneos" fill unoptimized priority sizes="100vw" className={styles.heroPhoto} />
          <div className={styles.heroShade} />
          <div className={styles.heroTopline}><span>CASTELLÓN · MEDITERRÁNEO</span><span className={styles.demoTag}>RESTAURANTE DEMO</span></div>
          <div className={styles.heroContent}>
            <p className={styles.heroKicker}>COCINA CON CALMA. MESAS CON VIDA.</p>
            <h1 id="reserva-title"><span>La Reserva</span></h1>
            <p className={styles.heroSubtitle}>Hay sitios a los que se viene.<br /><em>Y sitios en los que apetece quedarse.</em></p>
            <div className={styles.heroActions}>{restaurant.booking.enabled ? <ReserveButton className={styles.lightButton}>Tu sitio en la mesa <TableSignature /></ReserveButton> : null}<a href="#carta" className={styles.heroMenuLink}>Descubre la carta</a></div>
          </div>
          <div className={styles.heroFoot}><a href="#la-casa">Pasa, estás en casa <ArrowDown size={16} aria-hidden="true" /></a><span>PRODUCTO · FUEGO · SOBREMESA</span></div>
        </section>

        <div className={styles.manifestoStrip}><span>LA COCINA NOS REÚNE.</span><TableSignature /><em>La sobremesa nos queda.</em><span>Y AQUÍ HAY SITIO PARA TI.</span></div>

        <section id="la-casa" className={styles.story} aria-labelledby="casa-title">
          <div className={styles.sectionLabel}><span>01 — LA CASA</span><span>MUY DE AQUÍ. MUY A TU AIRE.</span></div>
          <div className={styles.storyGrid}>
            <div className={styles.storyHeading} data-reveal><h2 id="casa-title">Lo bueno<br />se comparte.<br /><em>Lo demás, espera.</em></h2><p>Algo al centro. Una copa servida. El primer bocado.<br />Nos gustan los planes que empiezan así y terminan sin mirar el reloj.</p><a href="#carta" className={styles.roundLink}>Descubre nuestra cocina <ArrowUpRight size={20} aria-hidden="true" /></a></div>
            <div className={styles.storyVisual} data-reveal><div className={styles.storyPhoto}><span className={`${styles.dishSprite} ${styles.storyDish}`} role="img" aria-label="Imagen ilustrativa de entrecot a la brasa con patata y pimientos" /></div><span className={styles.storyStamp}><TableSignature /><em>Sin prisa.</em><span>ESTÁS EN TU SITIO</span></span><div className={styles.photoCaption}><span>DE LA COCINA A TU MESA</span><span>IMAGEN ILUSTRATIVA</span></div></div>
          </div>
        </section>

        <section id="carta" className={styles.menuSection} aria-labelledby="carta-title">
          <div className={styles.sectionLabel}><span>02 — LO QUE APETECE</span><span>PARA COMPARTIR. O NO.</span></div>
          <div className={styles.menuIntro} data-reveal><h2 id="carta-title">¿Por dónde<br /><em>empezamos?</em></h2><p>Empieza compartiendo.<br />Sigue como quieras.<br />Deja sitio para el postre.</p></div>
          <ReservaMenu sections={restaurant.menu.sections} bookingEnabled={restaurant.booking.enabled} />
          <div className={styles.menuFooter}><p>Imágenes ilustrativas · Precios de demostración · IVA incluido.<br />Consulta al equipo sobre alérgenos e intolerancias.</p>{restaurant.menu.enabled && restaurant.menu.publicPath ? <a className={styles.textLink} href={restaurant.menu.publicPath}>Consultar carta digital <ArrowUpRight size={19} aria-hidden="true" /></a> : null}</div>
        </section>

        <section id="el-ambiente" className={styles.ambience} aria-labelledby="ambiente-title">
          <div className={styles.ambienceHeading} data-reveal><div><p className={styles.eyebrow}>03 — QUÉDATE UN RATO</p><h2 id="ambiente-title">La luz baja.<br /><em>El plan se alarga.</em></h2></div><p>El ambiente, la conversación,<br />la última copa que nunca es la última.</p></div>
          <ReservaGallery images={gallery} />
        </section>

        <section id="reservar" className={styles.bookingSection} aria-labelledby="mesa-title">
          <div className={styles.bookingTop}><span>04 — TU PRÓXIMO PLAN</span><TableSignature /></div>
          <div className={styles.bookingContent} data-reveal><h2 id="mesa-title">Te guardamos<br /><em>un sitio.</em></h2><div className={styles.bookingAside}><p>Tú eliges el día y con quién.<br />Nosotros ponemos el resto.</p>{restaurant.booking.enabled ? <ReserveButton className={styles.lightButton}>Buscar mi mesa <TableSignature /></ReserveButton> : <p>Las reservas online están en pausa.</p>}<span>Consulta las horas disponibles al momento.</span></div></div>
          <div className={styles.bookingNote}><span>ESTÁS EN UNA DEMOSTRACIÓN</span><p>La Reserva es un restaurante ficticio con imágenes ilustrativas. Puedes hacer una reserva de prueba y verla en su panel, sin reservar en un negocio real.</p></div>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}><a className={styles.footerMonogram} href="#contenido" aria-label="La Reserva, volver al inicio">LR<span>RESTAURANTE</span></a><p>Producto. Fuego.<br />Y buena compañía.</p><nav aria-label="Navegación del pie"><a href="#la-casa">La casa</a><a href="#carta">La carta</a><a href="#el-ambiente">El ambiente</a></nav><a href="#contenido" className={styles.backTop} aria-label="Volver al inicio"><ArrowUpRight size={26} /></a></div>
        <div className={styles.footerWordmark} aria-hidden="true">La Reserva<span>COCINA & SOBREMESA</span></div>
        <div className={styles.footerBottom}><span>© {new Date().getFullYear()} La Reserva · Restaurante demo</span><div><a href={legalPath(restaurant,"aviso-legal")}>Aviso legal</a><a href={legalPath(restaurant,"privacidad")}>Privacidad</a><a href={legalPath(restaurant,"cookies")}>Cookies</a></div><span className={styles.footerSignature} aria-label="Tu sitio en la mesa"><TableSignature /></span></div>
      </footer>
    </ReservaShell>
  );
}
