import type { Metadata } from "next";
import { CalendarX2, ShieldCheck } from "lucide-react";
import { getManagedReservation } from "../../lib/managedReservation";
import ManageReservationClient from "./ManageReservationClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestionar reserva",
  description: "Consulta, cambia o cancela tu reserva.",
  referrer: "no-referrer",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

type ReservationPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ReservationPage({ params }: ReservationPageProps) {
  const { token } = await params;
  const reservation = await getManagedReservation(token);

  if (!reservation) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f4f1e9] px-5 py-16 text-slate-950">
        <section className="w-full max-w-lg rounded-[2rem] border border-white bg-white p-7 text-center shadow-[0_24px_90px_rgba(15,23,42,0.12)] sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <CalendarX2 className="h-8 w-8" />
          </div>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
            Enlace no disponible
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
            No encontramos esta reserva
          </h1>
          <p className="mx-auto mt-4 max-w-sm text-sm font-semibold leading-6 text-slate-600">
            Comprueba que has abierto el enlace completo. Si continúa igual,
            contacta directamente con el restaurante.
          </p>
          <div className="mt-7 flex items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            El enlace de gestión es privado y no aparece en buscadores.
          </div>
        </section>
      </main>
    );
  }

  return <ManageReservationClient initialReservation={reservation} />;
}
