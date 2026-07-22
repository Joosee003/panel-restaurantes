"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChefHat,
  CircleDollarSign,
  Euro,
  Percent,
  RefreshCw,
  Search,
  TrendingDown,
  Package,
  Plus,
  Pencil,
  ShoppingCart,
  ArrowRight,
  Lightbulb,
  Target,
} from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { useRestaurante } from "../../../hooks/useRestaurante";

type PlatoRentabilidad = {
  id: string;
  restaurante_id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number | string | null;
  coste_total: number | string | null;
  beneficio_eur: number | string | null;
  margen_pct: number | string | null;
};

type VentaPlato = {
  id: string;
  restaurante_id: string;
  plato_id: string;
  fecha: string;
  cantidad: number;
  ingreso_total: number | string;
  coste_total: number | string;
  beneficio_total: number | string;
};

type EstadoMargen = "alto" | "medio" | "bajo" | "critico";

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split("T")[0];
}

function getNextMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).toISOString().split("T")[0];
}

function getEstadoMargen(margen: number): EstadoMargen {
  if (margen < 0) return "critico";
  if (margen >= 70) return "alto";
  if (margen >= 50) return "medio";
  return "bajo";
}

function getEstadoLabel(estado: EstadoMargen): string {
  if (estado === "alto") return "Muy rentable";
  if (estado === "medio") return "Correcto";
  if (estado === "bajo") return "Revisar";
  return "Pérdidas";
}

function getAccionSugerida(plato: { margen: number; beneficio: number; coste: number; precio: number }): string {
  if (plato.margen < 0 || plato.beneficio < 0) return "Revisar precio o receta hoy";
  if (plato.margen < 50) return "Subir precio o reducir coste";
  if (plato.margen < 70) return "Vigilar margen";
  return "Potenciar en carta";
}

function badgeEstadoClass(estado: EstadoMargen): string {
  if (estado === "alto") return "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:ring-emerald-500/20";
  if (estado === "medio") return "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:ring-amber-500/20";
  if (estado === "bajo") return "bg-orange-100 text-orange-800 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-200 dark:ring-orange-500/20";
  return "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:ring-rose-500/20";
}

function getTheme(dark: boolean) {
  return {
    page: clsx("min-h-screen px-4 py-6 sm:px-6 lg:px-8", dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-950"),
    card: clsx("rounded-3xl border p-5 shadow-sm", dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"),
    soft: clsx("rounded-2xl border p-4", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"),
    input: clsx("w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none transition", dark ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-400" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"),
    primary: clsx("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98]", dark ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800"),
    secondary: clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition active:scale-[0.98]", dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"),
    muted: dark ? "text-slate-400" : "text-slate-500",
    text: dark ? "text-slate-300" : "text-slate-600",
    title: dark ? "text-white" : "text-slate-950",
    icon: clsx("rounded-2xl p-3", dark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"),
  };
}

function KpiCard({ icon, label, value, helper, dark }: { icon: React.ReactNode; label: string; value: string; helper: string; dark: boolean }) {
  const t = getTheme(dark);
  return (
    <div className={t.card}>
      <div className="flex items-start justify-between gap-3">
        <div className={t.icon}>{icon}</div>
      </div>
      <div className={clsx("mt-4 text-xs font-black uppercase tracking-[0.14em]", t.muted)}>{label}</div>
      <div className={clsx("mt-1 text-3xl font-black tracking-tight", t.title)}>{value}</div>
      <div className={clsx("mt-1 text-sm font-semibold", t.muted)}>{helper}</div>
    </div>
  );
}

export default function RentabilidadPage() {
  const { dark } = useTheme();
  const t = getTheme(dark);
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;

  const [platos, setPlatos] = useState<PlatoRentabilidad[]>([]);
  const [ventas, setVentas] = useState<VentaPlato[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");

  const cargarDatos = async () => {
    setLoading(true);
    setErrorMsg(null);

    if (loadingRestaurante) return;

    const rid = restauranteId;
    if (!rid) {
      setErrorMsg('No se encontró restaurante activo. Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.');
      setLoading(false);
      return;
    }

    const [platosRes, ventasRes] = await Promise.all([
      supabase
        .from("vw_rentabilidad_platos")
        .select("id,restaurante_id,nombre,categoria,precio_venta,coste_total,beneficio_eur,margen_pct")
        .eq("restaurante_id", rid)
        .order("margen_pct", { ascending: true }),
      supabase
        .from("ventas_platos")
        .select("id,restaurante_id,plato_id,fecha,cantidad,ingreso_total,coste_total,beneficio_total")
        .eq("restaurante_id", rid)
        .gte("fecha", getMonthStart())
        .lt("fecha", getNextMonthStart()),
    ]);

    if (platosRes.error) {
      setErrorMsg(platosRes.error.message);
      setPlatos([]);
      setVentas([]);
      setLoading(false);
      return;
    }

    if (ventasRes.error) {
      setErrorMsg(ventasRes.error.message);
    }

    setPlatos((platosRes.data as PlatoRentabilidad[]) ?? []);
    setVentas((ventasRes.data as VentaPlato[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  const platosPreparados = useMemo(() => {
    return platos.map((p) => {
      const precio = toNumber(p.precio_venta);
      const coste = toNumber(p.coste_total);
      const beneficio = toNumber(p.beneficio_eur);
      const margen = toNumber(p.margen_pct);
      const estado = getEstadoMargen(margen);
      return {
        ...p,
        precio,
        coste,
        beneficio,
        margen,
        estado,
        accionSugerida: getAccionSugerida({ margen, beneficio, coste, precio }),
      };
    });
  }, [platos]);

  const categorias = useMemo(() => {
    return Array.from(new Set(platosPreparados.map((p) => (p.categoria ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
  }, [platosPreparados]);

  const platosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return platosPreparados.filter((p) => {
      const matchBusqueda = !texto || p.nombre.toLowerCase().includes(texto) || (p.categoria ?? "").toLowerCase().includes(texto);
      const matchCategoria = categoriaFiltro === "todas" || (p.categoria ?? "") === categoriaFiltro;
      const matchEstado = estadoFiltro === "todos" || p.estado === estadoFiltro;
      return matchBusqueda && matchCategoria && matchEstado;
    });
  }, [platosPreparados, busqueda, categoriaFiltro, estadoFiltro]);

  const resumen = useMemo(() => {
    const total = platosPreparados.length;
    const margenMedio = total ? platosPreparados.reduce((acc, p) => acc + p.margen, 0) / total : 0;
    const beneficioMedio = total ? platosPreparados.reduce((acc, p) => acc + p.beneficio, 0) / total : 0;
    const platosProblema = platosPreparados.filter((p) => p.estado === "bajo" || p.estado === "critico");
    const mejorPlato = [...platosPreparados].sort((a, b) => b.beneficio - a.beneficio)[0] ?? null;
    const peorPlato = [...platosPreparados].sort((a, b) => a.margen - b.margen)[0] ?? null;
    const ingresoMes = ventas.reduce((acc, v) => acc + toNumber(v.ingreso_total), 0);
    const beneficioMes = ventas.reduce((acc, v) => acc + toNumber(v.beneficio_total), 0);
    const unidadesMes = ventas.reduce((acc, v) => acc + toNumber(v.cantidad), 0);

    return { total, margenMedio, beneficioMedio, platosProblema, mejorPlato, peorPlato, ingresoMes, beneficioMes, unidadesMes };
  }, [platosPreparados, ventas]);

  const recomendaciones = useMemo(() => {
    const items: Array<{ title: string; text: string; href: string; level: "danger" | "warning" | "good" }> = [];
    if (resumen.peorPlato && (resumen.peorPlato.estado === "critico" || resumen.peorPlato.estado === "bajo")) {
      items.push({
        title: `Revisar ${resumen.peorPlato.nombre}`,
        text: `Margen ${formatPercent(resumen.peorPlato.margen)}. Puede estar bajando el beneficio del restaurante.`,
        href: `/dashboard/rentabilidad/platos/${resumen.peorPlato.id}`,
        level: "danger",
      });
    }
    if (resumen.mejorPlato) {
      items.push({
        title: `Potenciar ${resumen.mejorPlato.nombre}`,
        text: `Deja ${formatEuro(resumen.mejorPlato.beneficio)} por unidad. Conviene destacarlo en carta o recomendarlo.`,
        href: `/dashboard/rentabilidad/platos/${resumen.mejorPlato.id}`,
        level: "good",
      });
    }
    if (resumen.total === 0) {
      items.push({
        title: "Añadir platos para empezar",
        text: "Crea platos, añade ingredientes y verás margen, coste y beneficio automáticamente.",
        href: "/dashboard/rentabilidad/platos/nuevo",
        level: "warning",
      });
    }
    if (ventas.length === 0 && resumen.total > 0) {
      items.push({
        title: "Registrar ventas reales",
        text: "Así sabrás qué platos dan más dinero de verdad, no solo sobre papel.",
        href: "/dashboard/rentabilidad/ventas",
        level: "warning",
      });
    }
    return items.slice(0, 3);
  }, [resumen, ventas.length]);

  return (
    <div className={t.page}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className={clsx("mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black", dark ? "bg-slate-800 text-slate-300" : "bg-white text-slate-600 ring-1 ring-slate-200")}>
              <CircleDollarSign size={14} /> Rentabilidad del restaurante
            </div>
            <h1 className={clsx("text-3xl font-black tracking-tight sm:text-4xl", t.title)}>Qué platos te hacen ganar dinero</h1>
            <p className={clsx("mt-2 max-w-2xl text-sm font-medium sm:text-base", t.text)}>
              Vista pensada para decidir rápido: qué potenciar, qué revisar y dónde se está quedando el margen.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button onClick={cargarDatos} className={t.secondary} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
            </button>
            <Link href="/dashboard/rentabilidad/ventas" className={t.secondary}>
              <ShoppingCart size={16} /> Registrar venta
            </Link>
            <Link href="/dashboard/rentabilidad/platos/nuevo" className={t.primary}>
              <Plus size={16} /> Nuevo plato
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard dark={dark} icon={<Euro size={22} />} label="Beneficio medio" value={formatEuro(resumen.beneficioMedio)} helper="Por plato de carta" />
          <KpiCard dark={dark} icon={<Percent size={22} />} label="Margen medio" value={formatPercent(resumen.margenMedio)} helper={resumen.margenMedio >= 60 ? "Buen nivel" : "Revisar costes/precios"} />
          <KpiCard dark={dark} icon={<TrendingDown size={22} />} label="Platos a revisar" value={String(resumen.platosProblema.length)} helper="Margen bajo o pérdidas" />
          <KpiCard dark={dark} icon={<ShoppingCart size={22} />} label="Beneficio real mes" value={formatEuro(resumen.beneficioMes)} helper={`${resumen.unidadesMes} unidades registradas`} />
        </div>

        {errorMsg ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {errorMsg}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className={t.card}>
            <div className="flex items-start gap-3">
              <div className={clsx("rounded-2xl p-3", dark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-100 text-emerald-700")}>
                <Target size={22} />
              </div>
              <div>
                <h2 className={clsx("text-xl font-black", t.title)}>Acción recomendada</h2>
                <p className={clsx("mt-1 text-sm font-medium", t.muted)}>Lo que más sentido tiene hacer ahora.</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {recomendaciones.length > 0 ? recomendaciones.map((item) => (
                <Link key={item.title} href={item.href} className={clsx("group rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md", item.level === "danger" ? "border-rose-200 bg-rose-50 dark:border-rose-500/20 dark:bg-rose-500/10" : item.level === "warning" ? "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10" : "border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10")}>
                  <div className="flex items-center justify-between gap-3">
                    <Lightbulb size={20} />
                    <ArrowRight size={16} className="transition group-hover:translate-x-0.5" />
                  </div>
                  <div className={clsx("mt-4 text-base font-black", t.title)}>{item.title}</div>
                  <div className={clsx("mt-1 text-sm font-semibold", dark ? "text-slate-300" : "text-slate-600")}>{item.text}</div>
                </Link>
              )) : (
                <div className={clsx("rounded-3xl border p-4", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>Sin recomendaciones por ahora.</div>
              )}
            </div>
          </div>

          <div className={t.card}>
            <h2 className={clsx("text-xl font-black", t.title)}>Atajos rápidos</h2>
            <div className="mt-4 grid gap-2">
              <Link href="/dashboard/rentabilidad/platos" className={t.secondary}><ChefHat size={16} /> Gestionar platos</Link>
              <Link href="/dashboard/rentabilidad/ingredientes" className={t.secondary}><Package size={16} /> Ingredientes y costes</Link>
              <Link href="/dashboard/rentabilidad/ventas" className={t.secondary}><BarChart3 size={16} /> Ventas reales</Link>
            </div>
          </div>
        </div>

        <div className={t.card}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={clsx("text-xl font-black", t.title)}>Platos por rentabilidad</h2>
              <p className={clsx("mt-1 text-sm font-medium", t.muted)}>Empieza por los rojos. Son los que más daño pueden hacer.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <div className="relative">
                <Search className={clsx("pointer-events-none absolute left-3 top-3.5 h-4 w-4", t.muted)} />
                <input className={clsx(t.input, "pl-10")} placeholder="Buscar plato..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <select className={t.input} value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)}>
                <option value="todas">Todas</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className={t.input} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="critico">Pérdidas</option>
                <option value="bajo">Revisar</option>
                <option value="medio">Correcto</option>
                <option value="alto">Muy rentable</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className={clsx("mt-6 rounded-2xl border p-8 text-center text-sm font-semibold", dark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-slate-50 text-slate-500")}>Cargando rentabilidad...</div>
          ) : platosFiltrados.length === 0 ? (
            <div className={clsx("mt-6 rounded-2xl border p-8 text-center", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>No hay platos con estos filtros.</div>
          ) : (
            <div className="mt-6 grid gap-3">
              {platosFiltrados.map((p) => (
                <div key={p.id} className={clsx("rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={clsx("rounded-full px-2.5 py-1 text-xs font-black ring-1", badgeEstadoClass(p.estado))}>{getEstadoLabel(p.estado)}</span>
                        {p.categoria ? <span className={clsx("text-xs font-bold", t.muted)}>{p.categoria}</span> : null}
                      </div>
                      <h3 className={clsx("mt-2 truncate text-lg font-black", t.title)}>{p.nombre}</h3>
                      <p className={clsx("mt-1 text-sm font-semibold", t.muted)}>{p.accionSugerida}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[520px]">
                      <div className={t.soft}><div className={clsx("text-xs font-bold", t.muted)}>Precio</div><div className={clsx("mt-1 font-black", t.title)}>{formatEuro(p.precio)}</div></div>
                      <div className={t.soft}><div className={clsx("text-xs font-bold", t.muted)}>Coste</div><div className={clsx("mt-1 font-black", t.title)}>{formatEuro(p.coste)}</div></div>
                      <div className={t.soft}><div className={clsx("text-xs font-bold", t.muted)}>Beneficio</div><div className={clsx("mt-1 font-black", p.beneficio < 0 ? "text-rose-600" : t.title)}>{formatEuro(p.beneficio)}</div></div>
                      <div className={t.soft}><div className={clsx("text-xs font-bold", t.muted)}>Margen</div><div className={clsx("mt-1 font-black", p.estado === "critico" || p.estado === "bajo" ? "text-rose-600" : t.title)}>{formatPercent(p.margen)}</div></div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href={`/dashboard/rentabilidad/platos/${p.id}`} className={t.primary}><Pencil size={15} /> Mejorar plato</Link>
                    <Link href="/dashboard/rentabilidad/ventas" className={t.secondary}><ShoppingCart size={15} /> Registrar venta</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
