"use client";

import Link from "next/link";
import { ArrowRight, Building2, LayoutDashboard, Loader2, Search, Settings2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../(app)/lib/supabaseClient";

const STORAGE_KEY = "gastrohelp_restaurante_activo";

type Restaurant = {
  id: string;
  nombre: string | null;
  slug: string | null;
  direccion: string | null;
  logo_url: string | null;
};

export default function SelectRestaurantPage() {
  const router = useRouter();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error: loadError } = await supabase
        .from("restaurantes")
        .select("id,nombre,slug,direccion,logo_url")
        .order("nombre");

      if (loadError) setError("No se han podido cargar los restaurantes.");
      else setRestaurants((data ?? []) as Restaurant[]);
      setLoading(false);
    };

    void load();
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return restaurants;
    return restaurants.filter((restaurant) =>
      [restaurant.nombre, restaurant.slug, restaurant.direccion]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(normalized)),
    );
  }, [query, restaurants]);

  function enterRestaurant(restaurantId: string) {
    window.localStorage.setItem(STORAGE_KEY, restaurantId);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#2563eb_0,transparent_28%),linear-gradient(135deg,#020617,#0f285b_58%,#1559b6)] px-4 py-16 text-white sm:px-8">
      <section className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100">
            <Building2 className="h-4 w-4" /> Cuenta de agencia
          </div>
          <h1 className="mt-5 text-4xl font-black tracking-[-.04em] sm:text-6xl">¿Qué restaurante quieres gestionar?</h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-blue-100">Elige un restaurante antes de entrar al panel general. Los datos y módulos cambiarán a ese restaurante.</p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="relative block max-w-xl flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar restaurante" className="min-h-14 w-full rounded-2xl border border-white/15 bg-white pl-11 pr-4 text-sm font-bold text-slate-950 outline-none focus:ring-4 focus:ring-blue-300/30" />
          </label>
          <Link href="/reputacion/seleccionar" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-black transition hover:bg-white/15">
            <Star className="h-4 w-4" /> Ir a reputación
          </Link>
          <Link href="/admin/restaurantes" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-black transition hover:bg-white/15">
            <Settings2 className="h-4 w-4" /> Administración
          </Link>
        </div>

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-sm font-black text-blue-100"><Loader2 className="h-5 w-5 animate-spin" /> Cargando restaurantes…</div>
        ) : error ? (
          <div className="mt-10 rounded-2xl border border-red-300/30 bg-red-950/30 p-5 text-sm font-bold text-red-100">{error}</div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((restaurant) => (
              <button key={restaurant.id} type="button" onClick={() => enterRestaurant(restaurant.id)} className="group flex min-h-52 flex-col rounded-[1.8rem] border border-white/15 bg-white p-5 text-left text-slate-950 shadow-2xl transition hover:-translate-y-1 hover:shadow-blue-950/40">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700">
                    {restaurant.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={restaurant.logo_url} alt="" className="h-full w-full object-contain p-2" />
                    ) : <Building2 className="h-7 w-7" />}
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-white transition group-hover:bg-blue-700"><ArrowRight className="h-4 w-4" /></span>
                </div>
                <p className="mt-6 text-xl font-black">{restaurant.nombre || "Restaurante sin nombre"}</p>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{restaurant.direccion || "Panel general del restaurante"}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-xs font-black text-blue-700"><LayoutDashboard className="h-4 w-4" /> Entrar al panel</span>
              </button>
            ))}
            {!filtered.length && <div className="rounded-3xl border border-white/15 bg-white/10 p-8 text-sm font-bold text-blue-100">No hay restaurantes que coincidan con la búsqueda.</div>}
          </div>
        )}
      </section>
    </main>
  );
}
