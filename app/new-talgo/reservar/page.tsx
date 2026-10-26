import type { Metadata } from "next";
import Link from "next/link";
import BookingWidget from "../../restaurante/[slug]/BookingWidget";
import { legalPath } from "../../lib/publicLegal";
import { getPublicRestaurant } from "../../lib/publicRestaurant";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Reservar mesa | New Talgo",
  robots: { index: false, follow: false },
};

export default async function NewTalgoBookingPage() {
  const restaurantId = process.env.NEXT_PUBLIC_WHITE_LABEL_NEW_TALGO_ID;
  const web = restaurantId && /^[0-9a-f-]{36}$/i.test(restaurantId)
    ? await getSupabaseAdmin().from("restaurante_webs").select("slug")
      .eq("restaurante_id", restaurantId).maybeSingle()
    : null;
  const restaurant = web?.data?.slug ? await getPublicRestaurant(web.data.slug) : null;
  const enabled = restaurant?.published && restaurant.booking.enabled && !restaurant.demo;

  return <main className="min-h-screen bg-[#f5f0e6] px-4 py-7 text-[#203831] sm:px-8 sm:py-12">
    <div className="mx-auto max-w-5xl">
      <header className="mb-7 flex items-center justify-between gap-4 border-b border-[#d8cfc1] pb-5">
        <Link href="/new-talgo/index.html" className="text-xl font-black leading-5 tracking-tight">NEW<br />TALGO<span className="text-[#b75b42]">✳</span></Link>
        <Link href="/new-talgo/carta.html" className="rounded-full border border-[#203831] px-4 py-3 text-sm font-bold">Ver la carta</Link>
      </header>
      <div className="grid gap-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <section>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-[#b75b42]">New Talgo · Segovia</p>
          <h1 className="mt-3 font-serif text-5xl leading-tight sm:text-6xl">Ven a comer.<br /><em>Reserva tu mesa.</em></h1>
          <p className="mt-5 max-w-md text-base leading-7">De 1 a 4 personas, la mesa se confirma solo si hay disponibilidad. De 5 a 32, Ángel revisa la solicitud antes de confirmarla. Para más de 32, llámanos.</p>
          <p className="mt-4 text-sm leading-6">Carretera de Villacastín 14, 40006 Segovia. Entrada desde la calle.</p>
          <a href="tel:+34643970267" className="mt-3 inline-block text-sm font-bold underline underline-offset-4">643 97 02 67</a>
        </section>
        {enabled && restaurant ? <BookingWidget
          slug={restaurant.slug}
          restaurantName="New Talgo"
          timezone={restaurant.booking.timezone}
          minParty={restaurant.booking.minParty}
          maxParty={Math.min(restaurant.booking.maxParty, 32)}
          maxAdvanceDays={restaurant.booking.maxAdvanceDays}
          requiresPhone={true}
          requiresEmail={false}
          notice="La disponibilidad se verifica antes de guardar. Los grupos necesitan aprobación de Ángel."
          cancellationPolicy={restaurant.booking.cancellationPolicy}
          primaryColor="#203831"
          accentColor="#b75b42"
          demo={false}
          autoConfirmMaxParty={4}
          showReviewConsent={false}
          privacyPath={legalPath(restaurant, "privacidad")}
          conditionsPath={legalPath(restaurant, "condiciones-reserva")}
        /> : <section className="rounded-3xl border border-[#d8cfc1] bg-white p-7" role="status">
          <h2 className="font-serif text-3xl">Reservas online aún no disponibles</h2>
          <p className="mt-3 leading-7">Estamos comprobando los horarios y los avisos al restaurante. Por ahora, llama a New Talgo para consultar una mesa.</p>
          <a href="tel:+34643970267" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-[#203831] px-6 font-bold text-white">Llamar al 643 97 02 67</a>
        </section>}
      </div>
    </div>
  </main>;
}
