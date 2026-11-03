import { ArrowLeft, FileText } from "lucide-react";
import {
  legalPath,
  legalUpdatedLabel,
  type LegalDocument,
} from "../../../lib/publicLegal";
import {
  publicRestaurantUrl,
  type PublicRestaurant,
} from "../../../lib/publicRestaurant";
import styles from "../la-reserva.module.css";

const titles: Record<LegalDocument, string> = {
  "aviso-legal": "Aviso legal",
  privacidad: "Política de privacidad",
  "condiciones-reserva": "Condiciones de reserva",
  cookies: "Política de cookies",
};

function Value({ children }: { children: string }) {
  return <strong className="font-black text-slate-950">{children || "Pendiente de completar"}</strong>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-200 pt-7">
      <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
      <div className="mt-3 space-y-3 text-sm font-medium leading-7 text-slate-600">{children}</div>
    </section>
  );
}

function LegalContent({ restaurant, document }: { restaurant: PublicRestaurant; document: LegalDocument }) {
  const legal = restaurant.legal;

  if (restaurant.slug === "new-talgo") {
    if (document === "aviso-legal") return <>
      <Section title="Titular y contacto">
        <p>Este sitio y la actividad de New Talgo pertenecen a <Value>{legal.owner}</Value>, persona física, NIF <Value>{legal.taxId}</Value>, con domicilio fiscal en <Value>{legal.address}</Value>. Contacto: <Value>{legal.email}</Value>.</p>
      </Section>
      <Section title="Uso de la web">
        <p>La web informa sobre el restaurante, su carta y las reservas. Utilízala de forma lícita y facilita datos correctos al solicitar mesa. Los horarios, precios y platos pueden variar; la reserva se rige por el estado indicado al finalizar la solicitud y por sus condiciones publicadas.</p>
      </Section>
      <Section title="Contenidos y enlaces">
        <p>Los textos, fotografías, diseño y signos identificativos pertenecen a sus respectivos titulares. Su reproducción o explotación requiere autorización, salvo los usos permitidos por la ley.</p>
        <p>Los enlaces a Google Maps, Instagram o WhatsApp abren servicios externos sujetos a sus propias condiciones y políticas.</p>
      </Section>
      <Section title="Servicio técnico">
        <p>GastroHelp proporciona por cuenta del titular la infraestructura de la web, el panel y las reservas. Ángel Arranz Ruiz es responsable de la actividad del restaurante, su información comercial y la atención a los clientes.</p>
      </Section>
    </>;

    if (document === "privacidad") return <>
      <Section title="Responsable">
        <p><Value>{legal.owner}</Value>, NIF <Value>{legal.taxId}</Value>, domicilio <Value>{legal.address}</Value>. Para ejercer derechos o consultar sobre privacidad: <Value>{legal.privacyEmail}</Value>.</p>
      </Section>
      <Section title="Datos y finalidades">
        <p>Para reservar se trata el nombre, teléfono, fecha y hora, número de personas y, si los facilitas, correo electrónico y observaciones. Se guardan el estado y cambios de la reserva, la constancia de la información legal mostrada, un enlace de gestión y una ficha interna de cliente vinculada a la reserva. Se tratan datos técnicos de conexión para proteger el servicio.</p>
        <p>Estos datos se usan para comprobar disponibilidad, tramitar la reserva, comunicar sus cambios y atender incidencias. No escribas información médica en las observaciones; para alergias o necesidades especiales contacta directamente con el restaurante. La reserva no autoriza publicidad ni peticiones de reseña por WhatsApp.</p>
      </Section>
      <Section title="Base jurídica y datos necesarios">
        <p>La gestión de la solicitud y la reserva se basa en el artículo 6.1.b del RGPD; las obligaciones legales, en el artículo 6.1.c; y la seguridad y defensa frente a reclamaciones, en el interés legítimo del titular del artículo 6.1.f, limitado a lo necesario. La casilla de lectura acredita que recibiste esta información y no constituye consentimiento publicitario.</p>
        <p>Nombre, teléfono y datos de la mesa son necesarios para reservar online. Correo y observaciones son opcionales. Sin los datos necesarios puedes contactar por teléfono.</p>
      </Section>
      <Section title="Proveedores y transferencias">
        <p>El personal autorizado de New Talgo accede a las reservas y recibe avisos en newtalgo@gmail.com. GastroHelp presta el servicio técnico; intervienen Supabase para la base de datos, Vercel para la aplicación, n8n sobre Hetzner para los avisos y Google para el correo. Los datos podrán comunicarse a autoridades cuando lo exija la ley. No se venden datos.</p>
        <p>Supabase almacena la base de datos en una región europea. Vercel, Supabase y Google pueden implicar tratamiento fuera del Espacio Económico Europeo. Sus <a href="https://vercel.com/legal/dpa" target="_blank" rel="noopener noreferrer">acuerdos de Vercel</a>, <a href="https://supabase.com/legal/customer-resources/data-processing-addendum" target="_blank" rel="noopener noreferrer">Supabase</a> y <a href="https://policies.google.com/privacy/frameworks?hl=es" target="_blank" rel="noopener noreferrer">marcos de Google</a> describen las garantías de transferencia, incluidas decisiones de adecuación o cláusulas contractuales tipo cuando corresponden. Puedes solicitar información sobre las garantías aplicables a <Value>{legal.privacyEmail}</Value>.</p>
      </Section>
      <Section title="Conservación">
        <p>{legal.bookingRetention || "El plazo de conservación de las reservas está pendiente de aprobación por el titular."}</p>
        <p>Los datos técnicos de seguridad se conservan solo mientras sean necesarios para prevenir abusos. Cuando una obligación legal o reclamación exija conservar algún dato durante más tiempo, se limitará a lo necesario.</p>
      </Section>
      <Section title="Derechos">
        <p>Puedes solicitar acceso, rectificación, supresión, limitación, oposición o portabilidad cuando procedan escribiendo a <Value>{legal.privacyEmail}</Value>. También puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).</p>
      </Section>
    </>;

    if (document === "condiciones-reserva") return <>
      <Section title="Solicitud y confirmación">
        <p>Se puede solicitar mesa de martes a domingo, con primera franja de comidas a las 11:30 y cenas desde las 19:00, según la disponibilidad mostrada. El lunes está cerrado. Las solicitudes son para 1 a 10 personas; para más de 10, contacta por WhatsApp en el 643 970 267.</p>
        <p>De 1 a 4 personas, la reserva se confirma si hay mesa disponible. De 5 a 10 queda pendiente hasta que Ángel la apruebe. La pantalla muestra el estado; una solicitud pendiente no equivale a una reserva confirmada.</p>
      </Section>
      <Section title="Datos y necesidades especiales">
        <p>Facilita un nombre y teléfono válidos. El correo electrónico y las observaciones son opcionales. No incluyas datos médicos en el formulario; para alergias o necesidades especiales consulta directamente con el restaurante antes de pedir.</p>
      </Section>
      <Section title="Cambios, cancelación y llegada">
        <p>Puedes modificar o cancelar desde el enlace de gestión hasta 60 minutos antes de la hora prevista. Después, contacta con el restaurante. Si vas a llegar tarde, avisa al 643 970 267; la disponibilidad de la mesa puede verse afectada.</p>
      </Section>
      <Section title="Carta y contacto">
        <p>La carta web es informativa y no permite comprar platos. Antes de pedir, solicita al personal información sobre ingredientes y alérgenos. La disponibilidad de platos y precios puede cambiar.</p>
        <p>New Talgo, Carretera de Villacastín 14, 40006 Segovia. Teléfono 643 970 267. Correo: newtalgo@gmail.com.</p>
      </Section>
    </>;

    return <>
      <Section title="Uso actual">
        <p>La web pública no incorpora actualmente herramientas opcionales de analítica, publicidad, píxeles de seguimiento ni mapas o redes sociales incrustados. Los enlaces a Google Maps, Instagram o WhatsApp abren esos servicios solo cuando los pulsas y se aplican sus propias políticas.</p>
      </Section>
      <Section title="Funciones técnicas">
        <p>La aplicación puede utilizar cookies o almacenamiento técnico necesario para seguridad, funcionamiento del servicio y sesión del panel privado. No se destinan a publicidad y no requieren una casilla de aceptación. Puedes borrarlos o bloquearlos desde el navegador; algunas funciones privadas pueden dejar de funcionar.</p>
      </Section>
      <Section title="Cambios y contacto">
        <p>Si se añadieran herramientas opcionales, se informaría y pediría consentimiento antes de activarlas. Consultas: <Value>{legal.email}</Value>.</p>
      </Section>
    </>;
  }

  if (document === "aviso-legal") {
    return (
      <>
        <Section title="Titular del sitio">
          <p>Este sitio web pertenece a <Value>{legal.owner || restaurant.name}</Value>, con NIF/CIF <Value>{legal.taxId}</Value> y domicilio en <Value>{legal.address || restaurant.address}</Value>.</p>
          <p>Contacto: <Value>{legal.email || restaurant.email}</Value>.</p>
          {legal.registry ? <p>Datos registrales: {legal.registry}.</p> : null}
        </Section>
        <Section title="Uso del sitio">
          <p>La persona usuaria se compromete a utilizar esta web de forma lícita, sin dañar el servicio ni interferir en su funcionamiento.</p>
          <p>Los contenidos, horarios, precios y disponibilidad pueden cambiar. El restaurante procura mantener la información correcta, pero la confirmación de una reserva depende del estado mostrado al finalizar el proceso.</p>
        </Section>
        <Section title="Propiedad intelectual">
          <p>Los textos, imágenes, marcas y demás contenidos pertenecen a sus titulares. No se permite su reproducción o uso comercial sin autorización.</p>
        </Section>
        <Section title="Proveedor técnico">
          <p>GastroHelp presta la infraestructura técnica de la web y del sistema de reservas por cuenta del restaurante. El responsable del contenido, la actividad y la atención al cliente es el titular indicado arriba.</p>
        </Section>
      </>
    );
  }

  if (document === "privacidad") {
    return (
      <>
        <Section title="Responsable del tratamiento">
          <p><Value>{legal.owner || restaurant.name}</Value>, NIF/CIF <Value>{legal.taxId}</Value>, domicilio <Value>{legal.address || restaurant.address}</Value> y correo <Value>{legal.privacyEmail || legal.email || restaurant.email}</Value>.</p>
        </Section>
        <Section title="Datos y finalidad">
          <p>Al reservar se tratan el nombre, los datos de contacto, fecha, hora, número de personas y las observaciones que decidas escribir. Se usan para tramitar, confirmar, modificar o cancelar la reserva y comunicarse contigo sobre ella.</p>
          <p>No escribas datos de salud en las observaciones. Si necesitas comunicar alergias o una necesidad especial, contacta directamente con el restaurante.</p>
        </Section>
        <Section title="Base jurídica y conservación">
          <p>El tratamiento es necesario para atender tu solicitud y aplicar las condiciones de reserva que aceptas. La web registra cuándo recibiste esta información.</p>
          <p>Plazo de conservación: {legal.bookingRetention || "durante el tiempo necesario para gestionar la reserva y atender las obligaciones legales aplicables"}.</p>
        </Section>
        <Section title="Destinatarios y proveedores">
          <p>Los datos no se venden. Pueden acceder proveedores tecnológicos que trabajan por cuenta del restaurante, como GastroHelp, alojamiento y base de datos, con las medidas y acuerdos correspondientes. También podrán comunicarse cuando exista una obligación legal.</p>
        </Section>
        <Section title="Peticiones de opinión por WhatsApp">
          <p>Si marcas la casilla opcional al reservar, el restaurante podrá enviarte por WhatsApp una petición de opinión después de tus visitas, mientras no conste una reseña confirmada. Esta elección no es necesaria para reservar y no da permiso para enviarte promociones.</p>
          <p>El enlace del mensaje permite dejar de recibir estas peticiones. Si pulsas el botón para ir a Google, se registra la apertura del enlace para que el restaurante pueda revisar si has publicado una reseña. Esa apertura no indica tu valoración ni confirma que hayas escrito una reseña. WhatsApp y Google tratan los datos de uso de sus servicios según sus propias condiciones.</p>
        </Section>
        <Section title="Tus derechos">
          <p>Puedes solicitar acceso, rectificación, supresión, oposición, limitación o portabilidad escribiendo a <Value>{legal.privacyEmail || legal.email || restaurant.email}</Value>. También puedes presentar una reclamación ante la Agencia Española de Protección de Datos.</p>
        </Section>
      </>
    );
  }

  if (document === "condiciones-reserva") {
    return (
      <>
        <Section title="Solicitud y confirmación">
          <p>La reserva se realiza con los datos y la hora elegidos. Al terminar, la pantalla indicará si queda confirmada o pendiente. Una solicitud pendiente no se considera confirmada hasta que el restaurante la acepte.</p>
        </Section>
        <Section title="Datos correctos">
          <p>Debes indicar datos reales y un medio de contacto válido. Si hay un error que impida contactar contigo, el restaurante puede cancelar la solicitud.</p>
        </Section>
        <Section title="Cambios, cancelaciones y llegada">
          <p>{restaurant.booking.cancellationPolicy || "Si tus planes cambian, cancela o modifica la reserva con la mayor antelación posible desde el enlace de gestión o contactando con el restaurante."}</p>
          <p>Los retrasos pueden afectar a la disponibilidad de la mesa. Si vas a llegar tarde, avisa directamente al restaurante.</p>
        </Section>
        <Section title="Grupos y necesidades especiales">
          <p>Las reservas que superen el máximo online, eventos, accesibilidad, alergias u otras necesidades deben confirmarse directamente con el restaurante.</p>
        </Section>
      </>
    );
  }

  return (
    <>
      <Section title="Cookies utilizadas">
        <p>Esta web utiliza únicamente cookies o almacenamiento técnico necesario para mantener la seguridad, recordar preferencias básicas y permitir que funcionen la web y las reservas.</p>
      </Section>
      <Section title="Sin publicidad ni medición opcional">
        <p>Actualmente no se instalan cookies publicitarias ni herramientas opcionales de analítica. Por eso no se muestra un panel de aceptación de cookies.</p>
        <p>Si en el futuro se añaden herramientas opcionales, se pedirá una elección antes de activarlas y se actualizará este texto.</p>
      </Section>
      <Section title="Control desde el navegador">
        <p>Puedes borrar o bloquear cookies desde la configuración del navegador. Si bloqueas las técnicas, algunas funciones pueden dejar de responder correctamente.</p>
      </Section>
    </>
  );
}

export default function LegalPage({ restaurant, document }: { restaurant: PublicRestaurant; document: LegalDocument }) {
  if (["la-reserva-demo", "la-reserva"].includes(restaurant.slug)) {
    return (
      <main className={`${styles.site} ${styles.legalPage} restaurant-public-site`}>
        <article className={styles.legalArticle}>
          <header className={styles.legalHeader}>
            <a href={`/restaurante/${restaurant.slug}`} className={styles.legalBack}>
              <ArrowLeft className="h-4 w-4" /> Volver a {restaurant.name}
            </a>
            <p>La Reserva · Información legal</p>
            <h1>{titles[document]}</h1>
            <span>Última actualización: {legalUpdatedLabel(restaurant.legal.updatedAt)}</span>
          </header>
          <div className={styles.legalBody}>
            <LegalContent restaurant={restaurant} document={document} />
            <nav aria-label="Otros textos legales">
              <a href={legalPath(restaurant, "aviso-legal")}>Aviso legal</a>
              <a href={legalPath(restaurant, "privacidad")}>Privacidad</a>
              <a href={legalPath(restaurant, "condiciones-reserva")}>Condiciones de reserva</a>
              <a href={legalPath(restaurant, "cookies")}>Cookies</a>
            </nav>
          </div>
        </article>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-950 sm:px-8 sm:py-16">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
        <header className="bg-slate-950 px-6 py-8 text-white sm:px-10 sm:py-10">
          <a href={publicRestaurantUrl(restaurant)} className="inline-flex items-center gap-2 text-xs font-black text-white/70 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" /> Volver a {restaurant.name}
          </a>
          <div className="mt-8 flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><FileText className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Información legal</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">{titles[document]}</h1>
              <p className="mt-2 text-xs font-semibold text-white/55">Última actualización: {legalUpdatedLabel(restaurant.legal.updatedAt)}</p>
            </div>
          </div>
        </header>
        <div className="space-y-8 px-6 py-8 sm:px-10 sm:py-10">
          <LegalContent restaurant={restaurant} document={document} />
          <nav className="flex flex-wrap gap-3 border-t border-slate-200 pt-7 text-xs font-black text-blue-700" aria-label="Otros textos legales">
            <a href={legalPath(restaurant, "aviso-legal")}>Aviso legal</a>
            <a href={legalPath(restaurant, "privacidad")}>Privacidad</a>
            <a href={legalPath(restaurant, "condiciones-reserva")}>Condiciones de reserva</a>
            <a href={legalPath(restaurant, "cookies")}>Cookies</a>
          </nav>
        </div>
      </article>
    </main>
  );
}

