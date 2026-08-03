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
