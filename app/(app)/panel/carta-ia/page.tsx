import Link from "next/link";

export default function CartaIADesactivadaPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white/5">
        <p className="text-sm font-black uppercase tracking-[0.14em] text-blue-600 dark:text-blue-300">
          Traducción manual activa
        </p>
        <h1 className="mt-3 text-3xl font-black">Generar carta con IA está desactivado</h1>
        <p className="mt-3 font-semibold text-slate-500 dark:text-slate-400">
          Para este proyecto, las traducciones y cambios de platos se editan a mano desde el panel de productos.
        </p>
        <Link
          href="/panel/carta-productos"
          className="mt-6 inline-flex rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 dark:bg-white dark:text-slate-950"
        >
          Ir a productos de carta
        </Link>
      </div>
    </main>
  );
}
