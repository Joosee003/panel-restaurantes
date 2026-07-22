"use client";

import Link from "next/link";
import { ShieldAlert, ArrowRight } from "lucide-react";

export default function OnboardingRestauranteClienteBloqueado() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-950">
      <section className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white">
            <ShieldAlert size={28} />
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">Pantalla interna GastroHelp</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
            La instalación de nuevos restaurantes ya no está disponible dentro del panel del cliente.
            Esta zona se ha movido al admin interno para que los restaurantes no la vean ni la usen por error.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700"
            >
              Volver al panel <ArrowRight size={16} />
            </Link>
            <Link
              href="/admin/restaurantes"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50"
            >
              Ir al admin
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
