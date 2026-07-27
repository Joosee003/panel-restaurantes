import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad del sistema de opiniones | GastroHelp",
  robots: { index: false, follow: false },
};

export default function OpinionPrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fbfaf7] px-5 py-10 text-[#3b241f] sm:py-16">
      <article className="mx-auto max-w-3xl rounded-[2rem] border border-black/5 bg-white p-7 shadow-xl sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#1f5fbf]">
          GastroHelp
        </p>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-[#3b241f] sm:text-4xl">
          Aviso de privacidad del sistema de opiniones
        </h1>
        <p className="mt-5 text-sm leading-7 text-[#3b241f]/65">
          Este sistema permite enviar una valoración y, de forma opcional, un
          comentario y un nombre al restaurante mostrado en la página. La
          información se utiliza exclusivamente para gestionar la experiencia
          comunicada, detectar mejoras y realizar seguimiento interno.
        </p>

        <div className="mt-8 space-y-7">
          <Section title="Responsables del tratamiento">
            El restaurante que aparece en la pantalla actúa como responsable de
            la información recibida. GastroHelp presta el servicio tecnológico
            que permite recoger y administrar las opiniones.
          </Section>
          <Section title="Datos tratados">
            Se puede tratar la valoración, el comentario, el nombre opcional,
            el punto de origen del código QR y la fecha de envío. No solicitamos
            datos de pago ni documentos de identidad.
          </Section>
          <Section title="Finalidad y conservación">
            Los datos se emplean para comprender la experiencia del cliente y
            mejorar el servicio. Se conservarán durante el tiempo necesario
            para esa finalidad y para atender posibles obligaciones legales.
          </Section>
          <Section title="Publicación en Google">
            Tras enviar la opinión privada, se muestra a todas las personas,
            independientemente de su valoración, una opción voluntaria para
            abrir Google. El sistema no publica automáticamente el comentario
            ni condiciona el acceso a Google según la puntuación.
          </Section>
          <Section title="Tus derechos">
            Puedes solicitar acceso, rectificación o supresión de tus datos
            contactando con el restaurante o con GastroHelp a través de los
            canales indicados en sus páginas oficiales.
          </Section>
        </div>

        <Link
          href="/"
          className="mt-10 inline-flex rounded-xl border border-[#1f5fbf]/20 px-4 py-2.5 text-sm font-semibold text-[#1f5fbf] transition hover:bg-[#1f5fbf]/5"
        >
          Volver
        </Link>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#3b241f]">{title}</h2>
      <p className="mt-2 text-sm leading-7 text-[#3b241f]/65">{children}</p>
    </section>
  );
}
