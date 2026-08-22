"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Building2, LayoutDashboard, Loader2, LogOut, Search, ShieldCheck, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getOpinionesBrowserClient } from "@/lib/opiniones/supabase";

const STORAGE_KEY = "gastrohelp_opinion_restaurante_activo";

type ReputationConfig = {
  id: string;
  restaurante_id: string;
  slug: string;
  logo_url: string | null;
  color_primary: string | null;
};

type Restaurant = {
  id: string;
  nombre: string | null;
  logo_url: string | null;
};

type ReputationRestaurant = ReputationConfig & { name: string; restaurantLogo: string | null };

export default function SelectReputationRestaurantPage() {
  const router = useRouter();
  const supabase = useMemo(() => getOpinionesBrowserClient(), []);
  const [restaurants, setRestaurants] = useState<ReputationRestaurant[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        router.replace("/reputacion/acceso");
        return;
      }

      const { data: admin, error: adminError } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (adminError) {
        setError("No se ha podido comprobar tu acceso.");
        setLoading(false);
        return;
      }
      if (!admin?.user_id) {
        router.replace("/opiniones-admin");
        return;
      }

      const { data: configs, error: configError } = await supabase
        .from("opinion_config")
        .select("id,restaurante_id,slug,logo_url,color_primary")
        .eq("active", true)
        .order("created_at");

      if (!active) return;
      if (configError) {
        setError("No se han podido cargar los paneles de reputación.");
        setLoading(false);
        return;
      }

      const restaurantIds = (configs ?? []).map((config) => config.restaurante_id);
      const restaurantResult = restaurantIds.length
        ? await supabase.from("restaurantes").select("id,nombre,logo_url").in("id", restaurantIds)
        : { data: [] as Restaurant[], error: null };

      if (!active) return;
      if (restaurantResult.error) {
        setError("No se han podido cargar los restaurantes.");
        setLoading(false);
        return;
      }

      const restaurantById = new Map(
        ((restaurantResult.data ?? []) as Restaurant[]).map((restaurant) => [restaurant.id, restaurant]),
      );

      setRestaurants(
        ((configs ?? []) as ReputationConfig[]).map((config) => {
          const restaurant = restaurantById.get(config.restaurante_id);
          return {
            ...config,
            name: restaurant?.nombre || config.slug,
            restaurantLogo: restaurant?.logo_url || config.logo_url,
          };
        }),
      );
      setLoading(false);
    };

    void load();
    return () => { active = false; };
  }, [router, supabase]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return restaurants;
    return restaurants.filter((restaurant) =>
      `${restaurant.name} ${restaurant.slug}`.toLowerCase().includes(normalized),
    );
  }, [query, restaurants]);

  function enterRestaurant(restaurantId: string) {
    window.localStorage.setItem(STORAGE_KEY, restaurantId);
    router.push(`/opiniones-admin?restaurante=${encodeURIComponent(restaurantId)}`);
    router.refresh();
  }

  return (
    <main
      className="min-h-screen px-4 py-12 text-white sm:px-8 sm:py-16"
      style={{ background: "radial-gradient(circle at top right, #3b82f6 0, transparent 30%), linear-gradient(135deg, #031b3b, #062b5c 58%, #1559b6)" }}
    >
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="max-w-3xl">
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-white p-2 shadow-2xl">
                <Image src="/brand/gastrohelp-logo.svg" alt="GastroHelp" width={120} height={120} className="h-full w-full object-contain" priority />
              </div>
              <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-blue-100">GastroHelp Reputation</p><p className="mt-1 text-xl font-black">Cuenta de agencia</p></div>
            </div>
            <h1 className="mt-8 text-4xl font-black tracking-[-.04em] !text-white sm:text-6xl">¿Qué reputación quieres gestionar?</h1>
            <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-blue-100">Elige el restaurante y entrarás únicamente en sus opiniones, estadísticas, seguimientos y materiales.</p>
          </div>
          <Link href="/logout" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-2xl border border-white/20 bg-white/10 px-4 text-xs font-black hover:bg-white/15"><LogOut className="h-4 w-4" /> Cerrar sesión</Link>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="relative block max-w-xl flex-1">
            <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar restaurante" className="min-h-14 w-full rounded-2xl border border-white/15 bg-white pl-11 pr-4 text-sm font-bold text-slate-950 outline-none focus:ring-4 focus:ring-blue-300/30" />
          </label>
          <Link href="/admin/seleccionar-restaurante" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-5 text-sm font-black hover:bg-white/15"><LayoutDashboard className="h-4 w-4" /> Ir al panel general</Link>
        </div>

        {loading ? (
          <div className="mt-12 flex items-center gap-3 text-sm font-black text-blue-100"><Loader2 className="h-5 w-5 animate-spin" /> Cargando paneles…</div>
        ) : error ? (
          <div className="mt-10 rounded-2xl border border-red-300/30 bg-red-950/30 p-5 text-sm font-bold text-red-100">{error}</div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((restaurant) => (
              <button key={restaurant.id} type="button" onClick={() => enterRestaurant(restaurant.restaurante_id)} className="group flex min-h-56 flex-col rounded-[1.8rem] border border-white/15 bg-white p-5 text-left text-slate-950 shadow-2xl transition hover:-translate-y-1 hover:shadow-blue-950/40">
                <div className="flex w-full items-start justify-between gap-4">
                  <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-blue-50 text-blue-700">
                    {restaurant.restaurantLogo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={restaurant.restaurantLogo} alt="" className="h-full w-full object-contain p-2" />
                    ) : <Building2 className="h-7 w-7" />}
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-full text-white transition group-hover:scale-105" style={{ backgroundColor: restaurant.color_primary || "#1559b6" }}><ArrowRight className="h-4 w-4" /></span>
                </div>
                <p className="mt-6 text-xl font-black">{restaurant.name}</p>
                <p className="mt-2 text-xs font-semibold text-slate-500">Panel de reputación</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-xs font-black text-blue-700"><Star className="h-4 w-4" /> Entrar a reputación</span>
              </button>
            ))}
            {!filtered.length && <div className="rounded-3xl border border-white/15 bg-white/10 p-8 text-sm font-bold text-blue-100"><ShieldCheck className="mb-3 h-6 w-6" />No hay paneles de reputación disponibles.</div>}
          </div>
        )}
      </section>
    </main>
  );
}
