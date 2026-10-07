"use client";

import Link from "next/link";
import { Check, Copy, ExternalLink, Printer, QrCode as QrIcon, ScanLine } from "lucide-react";
import { useEffect, useState } from "react";
import QrCode from "@/app/club/[slug]/QrCode";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "@/app/(app)/lib/getRestauranteUsuario";

export default function LoyaltyClubMaterialsPage() {
  const [loading, setLoading] = useState(true);
  const [clubUrl, setClubUrl] = useState("");
  const [restaurantName, setRestaurantName] = useState("Restaurante");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const restaurantId = await getRestauranteUsuario();
      if (!restaurantId) {
        setError("No se pudo resolver el restaurante de esta sesión.");
        setLoading(false);
        return;
      }
      const [restaurant, web] = await Promise.all([
        supabase.from("restaurantes").select("nombre,slug").eq("id", restaurantId).maybeSingle(),
        supabase.from("restaurante_webs").select("slug").eq("restaurante_id", restaurantId).maybeSingle(),
      ]);
      const slug = String(web.data?.slug || restaurant.data?.slug || "").trim();
      if (!slug) setError("Este restaurante todavía no tiene un slug público configurado.");
      else setClubUrl(`${window.location.origin}/club/${slug}`);
      setRestaurantName(String(restaurant.data?.nombre ?? "Restaurante"));
      setLoading(false);
    })();
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(clubUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between print:hidden">
        <div><div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Material del restaurante</div><h1 className="mt-2 text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">QR público del club</h1><p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">Colócalo en mesa o entrada para que el cliente acceda a su club. Escanearlo no suma puntos ni visitas.</p></div>
        <div className="flex flex-wrap gap-2"><Link href="/dashboard/fidelizacion/escanear" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white dark:bg-white dark:text-slate-950"><ScanLine size={17} /> Escanear cliente</Link><Link href="/dashboard/fidelizacion/canjes" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">Canjes</Link></div>
      </header>

      {loading ? <div className="mt-8 text-sm font-bold text-slate-500">Preparando material…</div> : null}
      {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</div> : null}

      {!loading && clubUrl ? <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] print:mt-0 print:block">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950 print:border-0 print:p-0 print:shadow-none">
          <div className="mx-auto max-w-md text-center">
            <div className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{restaurantName}</div>
            <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-slate-950 dark:text-white">Únete a nuestro club</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-relaxed text-slate-500">Escanea para consultar tus puntos, visitas y próximas recompensas.</p>
            <div className="mx-auto mt-6 w-full max-w-[300px] rounded-[36px] border border-slate-100 bg-white p-4"><QrCode value={clubUrl} label={`QR del club de ${restaurantName}`} size={300} /></div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-800"><Check size={15} /> Solo abre el club</div>
            <div className="mt-4 break-all text-xs font-bold text-slate-400">{clubUrl}</div>
          </div>
        </section>

        <aside className="space-y-4 print:hidden">
          <section className="rounded-[24px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950"><div className="flex items-center gap-3"><QrIcon size={21} className="text-blue-700" /><h2 className="text-xl font-black tracking-tight">Listo para compartir</h2></div><p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">Este QR fijo abre el club. No identifica a un cliente ni sirve para canjear premios.</p><div className="mt-5 grid gap-2"><button type="button" onClick={() => void copy()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">{copied ? <Check size={17} /> : <Copy size={17} />} {copied ? "Copiado" : "Copiar enlace"}</button><button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 dark:border-slate-800 dark:text-slate-200"><Printer size={17} /> Imprimir / guardar PDF</button><a href={clubUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700 dark:border-slate-800 dark:text-slate-200"><ExternalLink size={17} /> Abrir club</a></div></section>
        </aside>
      </div> : null}
    </div>
  );
}
