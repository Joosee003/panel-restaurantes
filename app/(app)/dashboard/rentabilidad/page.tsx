"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChefHat,
  CircleDollarSign,
  Euro,
  Filter,
  Percent,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Package,
  Plus,
  Pencil,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";

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
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getEstadoMargen(margen: number): EstadoMargen {
  if (margen < 0) return "critico";
  if (margen >= 70) return "alto";
  if (margen >= 50) return "medio";
  return "bajo";
}

function getEstadoLabel(estado: EstadoMargen): string {
  if (estado === "alto") return "Margen alto";
  if (estado === "medio") return "Margen medio";
  if (estado === "bajo") return "Margen bajo";
  return "Margen crítico";
}

function getAccionSugerida(plato: {
  margen: number;
  beneficio: number;
  coste: number;
  precio: number;
}): string {
  if (plato.margen < 0 || plato.beneficio < 0) return "Revisar precio o receta";
  if (plato.margen < 50) return "Ajustar coste";
  if (plato.margen < 70) return "Vigilar margen";
  return "Potenciar venta";
}

function getThemeClasses(dark: boolean) {
  return {
    pageClass: clsx(
      "min-h-screen p-6 transition-colors",
      dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"
    ),

    cardClass: clsx(
      "rounded-3xl border shadow-sm transition-colors",
      dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
    ),

    softCardClass: clsx(
      "rounded-2xl border transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    innerCardClass: clsx(
      "rounded-2xl border p-4 transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    mutedBoxClass: clsx(
      "rounded-2xl p-3 text-xs leading-5",
      dark ? "bg-slate-950 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    inputClass: clsx(
      "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition",
      dark
        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-500"
        : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
    ),

    buttonSecondaryClass: clsx(
      "inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    ),

    buttonPrimaryClass: clsx(
      "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
      dark
        ? "bg-white text-slate-900 hover:bg-slate-200"
        : "bg-slate-900 text-white hover:bg-slate-800"
    ),

    tabClass: clsx(
      "inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition",
      dark
        ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
    ),

    activeTabClass: clsx(
      "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold",
      dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"
    ),

    highlightCardClass: clsx(
      "rounded-3xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
      dark
        ? "border-emerald-500/20 bg-emerald-500/10"
        : "border-emerald-200 bg-emerald-50"
    ),

    highlightIconClass: clsx(
      "rounded-2xl p-3",
      dark
        ? "bg-emerald-500/20 text-emerald-200"
        : "bg-emerald-100 text-emerald-700"
    ),

    titleClass: dark ? "text-white" : "text-slate-900",
    textClass: dark ? "text-slate-300" : "text-slate-700",
    mutedTextClass: dark ? "text-slate-400" : "text-slate-500",
    strongTextClass: dark ? "text-white" : "text-slate-900",

    iconBoxClass: clsx(
      "rounded-2xl p-3",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    tableRowClass: clsx(
      "rounded-2xl shadow-sm transition",
      dark ? "bg-slate-950 hover:bg-slate-800" : "bg-slate-50 hover:bg-slate-100"
    ),

    emptyClass: clsx(
      "mt-6 rounded-2xl border p-8 transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    pillClass: clsx(
      "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),
  };
}

function badgeEstadoClass(estado: EstadoMargen): string {
  if (estado === "alto") {
    return "inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200";
  }
  if (estado === "medio") {
    return "inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200";
  }
  if (estado === "bajo") {
    return "inline-flex rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-200";
  }
  return "inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-200";
}

export default function RentabilidadPage() {
  const { dark } = useTheme();

  const {
    pageClass,
    cardClass,
    softCardClass,
    innerCardClass,
    mutedBoxClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    tabClass,
    activeTabClass,
    highlightCardClass,
    highlightIconClass,
    titleClass,
    textClass,
    mutedTextClass,
    strongTextClass,
    iconBoxClass,
    tableRowClass,
    emptyClass,
    pillClass,
  } = getThemeClasses(dark);

  const [platos, setPlatos] = useState<PlatoRentabilidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");

  const cargarDatos = async () => {
    setLoading(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("vw_rentabilidad_platos")
      .select("*")
      .order("margen_pct", { ascending: false });

    if (error) {
      setErrorMsg(error.message);
      setPlatos([]);
      setLoading(false);
      return;
    }

    setPlatos((data as PlatoRentabilidad[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const categorias = useMemo(() => {
    return Array.from(
      new Set(
        platos
          .map((p) => (p.categoria ?? "").trim())
          .filter((c) => c.length > 0)
      )
    ).sort((a, b) => a.localeCompare(b, "es"));
  }, [platos]);

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
        accionSugerida: getAccionSugerida({
          margen,
          beneficio,
          coste,
          precio,
        }),
      };
    });
  }, [platos]);

  const platosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return platosPreparados.filter((p) => {
      const matchBusqueda =
        !texto ||
        p.nombre.toLowerCase().includes(texto) ||
        (p.categoria ?? "").toLowerCase().includes(texto);

      const matchCategoria =
        categoriaFiltro === "todas" || (p.categoria ?? "") === categoriaFiltro;

      const matchEstado =
        estadoFiltro === "todos" || p.estado === estadoFiltro;

      return matchBusqueda && matchCategoria && matchEstado;
    });
  }, [platosPreparados, busqueda, categoriaFiltro, estadoFiltro]);

  const resumen = useMemo(() => {
    const totalPlatos = platosFiltrados.length;

    const costeMedio =
      totalPlatos > 0
        ? platosFiltrados.reduce((acc, p) => acc + p.coste, 0) / totalPlatos
        : 0;

    const beneficioMedio =
      totalPlatos > 0
        ? platosFiltrados.reduce((acc, p) => acc + p.beneficio, 0) / totalPlatos
        : 0;

    const margenMedio =
      totalPlatos > 0
        ? platosFiltrados.reduce((acc, p) => acc + p.margen, 0) / totalPlatos
        : 0;

    const altos = platosFiltrados.filter((p) => p.estado === "alto").length;
    const medios = platosFiltrados.filter((p) => p.estado === "medio").length;
    const bajos = platosFiltrados.filter((p) => p.estado === "bajo").length;
    const criticos = platosFiltrados.filter((p) => p.estado === "critico").length;

    const mejorPlato =
      [...platosFiltrados].sort((a, b) => b.margen - a.margen)[0] ?? null;

    const peorPlato =
      [...platosFiltrados].sort((a, b) => a.margen - b.margen)[0] ?? null;

    let mensajePrincipal = "Tu carta está equilibrada.";
    let mensajeSecundario = "Sigue vigilando los platos con peor margen.";

    if (totalPlatos === 0) {
      mensajePrincipal = "Todavía no hay datos de rentabilidad.";
      mensajeSecundario = "Crea ingredientes y platos para empezar.";
    } else if (criticos === totalPlatos) {
      mensajePrincipal = "Toda la carta está en pérdidas.";
      mensajeSecundario = "Conviene revisar precios o costes de ingredientes.";
    } else if (criticos > 0) {
      mensajePrincipal = "Tienes platos con pérdidas.";
      mensajeSecundario = "Prioriza los platos en estado crítico.";
    } else if (bajos > 0) {
      mensajePrincipal = "Hay platos con margen bajo.";
      mensajeSecundario = "Revisa receta, coste o precio de venta.";
    } else if (altos === totalPlatos) {
      mensajePrincipal = "Toda la carta tiene buen margen.";
      mensajeSecundario = "Puedes potenciar ventas de los platos más rentables.";
    }

    return {
      totalPlatos,
      costeMedio,
      beneficioMedio,
      margenMedio,
      altos,
      medios,
      bajos,
      criticos,
      mejorPlato,
      peorPlato,
      mensajePrincipal,
      mensajeSecundario,
    };
  }, [platosFiltrados]);

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className={pillClass}>
                <BarChart3 size={14} />
                Rentabilidad de carta
              </div>

              <h1 className={`text-3xl font-bold tracking-tight ${titleClass}`}>
                Rentabilidad por plato
              </h1>

              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Aquí ves qué platos dejan más margen y cuáles toca revisar.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={cargarDatos}
                disabled={loading}
                className={buttonSecondaryClass}
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {loading ? "Recargando..." : "Recargar"}
              </button>

              <Link
                href="/dashboard/rentabilidad/ventas"
                className={buttonPrimaryClass}
              >
                <ShoppingCart size={16} />
                Ventas por plato
              </Link>

              <Link
                href="/dashboard/rentabilidad/platos/nuevo"
                className={buttonSecondaryClass}
              >
                <Plus size={16} />
                Nuevo plato
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/dashboard/rentabilidad" className={activeTabClass}>
              <BarChart3 size={16} />
              Resumen
            </Link>

            <Link
              href="/dashboard/rentabilidad/ingredientes"
              className={tabClass}
            >
              <Package size={16} />
              Ingredientes
            </Link>

            <Link href="/dashboard/rentabilidad/platos" className={tabClass}>
              <ChefHat size={16} />
              Platos
            </Link>

            <Link href="/dashboard/rentabilidad/ventas" className={tabClass}>
              <ShoppingCart size={16} />
              Ventas por plato
            </Link>
          </div>

          <div className={`mt-5 ${innerCardClass}`}>
            <p className={`text-sm font-semibold ${strongTextClass}`}>
              {resumen.mensajePrincipal}
            </p>
            <p className={`mt-1 text-sm ${mutedTextClass}`}>
              {resumen.mensajeSecundario}
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className={`${softCardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${mutedTextClass}`}>Platos</p>
                <ChefHat size={18} className="text-slate-400" />
              </div>
              <p className={`mt-3 text-3xl font-bold ${strongTextClass}`}>
                {resumen.totalPlatos}
              </p>
            </div>

            <div className={`${softCardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${mutedTextClass}`}>
                  Coste medio
                </p>
                <Euro size={18} className="text-slate-400" />
              </div>
              <p className={`mt-3 text-3xl font-bold ${strongTextClass}`}>
                {formatEuro(resumen.costeMedio)}
              </p>
            </div>

            <div className={`${softCardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${mutedTextClass}`}>
                  Beneficio medio
                </p>
                <CircleDollarSign size={18} className="text-slate-400" />
              </div>
              <p className={`mt-3 text-3xl font-bold ${strongTextClass}`}>
                {formatEuro(resumen.beneficioMedio)}
              </p>
            </div>

            <div className={`${softCardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${mutedTextClass}`}>
                  Margen medio
                </p>
                <Percent size={18} className="text-slate-400" />
              </div>
              <p className={`mt-3 text-3xl font-bold ${strongTextClass}`}>
                {formatPercent(resumen.margenMedio)}
              </p>
            </div>

            <div className={`${softCardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-medium ${mutedTextClass}`}>
                  Estado general
                </p>
                <Filter size={18} className="text-slate-400" />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <span className={badgeEstadoClass("alto")}>
                  Alto: {resumen.altos}
                </span>
                <span className={badgeEstadoClass("medio")}>
                  Medio: {resumen.medios}
                </span>
                <span className={badgeEstadoClass("bajo")}>
                  Bajo: {resumen.bajos}
                </span>
                <span className={badgeEstadoClass("critico")}>
                  Crítico: {resumen.criticos}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Link href="/dashboard/rentabilidad/ventas" className={highlightCardClass}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className={highlightIconClass}>
                <ShoppingCart size={22} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Ventas por plato
                </p>
                <p className={`mt-1 text-sm ${textClass}`}>
                  Registra unidades vendidas para calcular ingresos, costes y beneficio estimado del mes.
                </p>
              </div>
            </div>

            <div
              className={clsx(
                "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold",
                dark ? "bg-white text-slate-900" : "bg-slate-900 text-white"
              )}
            >
              Abrir ventas
              <ShoppingCart size={16} />
            </div>
          </div>
        </Link>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={`${cardClass} p-6`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className={`text-sm ${mutedTextClass}`}>Mejor resultado</p>
                <h3 className={`text-lg font-semibold ${strongTextClass}`}>
                  {resumen.mejorPlato?.nombre ?? "Sin datos"}
                </h3>
              </div>
            </div>

            <div className={`mt-5 space-y-2 text-sm ${textClass}`}>
              <div className="flex items-center justify-between">
                <span>Margen</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.mejorPlato
                    ? formatPercent(resumen.mejorPlato.margen)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Beneficio</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.mejorPlato
                    ? formatEuro(resumen.mejorPlato.beneficio)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Acción</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.mejorPlato?.accionSugerida ?? "-"}
                </span>
              </div>
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-100 p-3 text-red-700 dark:bg-red-500/20 dark:text-red-200">
                <TrendingDown size={20} />
              </div>
              <div>
                <p className={`text-sm ${mutedTextClass}`}>Plato a revisar</p>
                <h3 className={`text-lg font-semibold ${strongTextClass}`}>
                  {resumen.peorPlato?.nombre ?? "Sin datos"}
                </h3>
              </div>
            </div>

            <div className={`mt-5 space-y-2 text-sm ${textClass}`}>
              <div className="flex items-center justify-between">
                <span>Margen</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.peorPlato
                    ? formatPercent(resumen.peorPlato.margen)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Beneficio</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.peorPlato
                    ? formatEuro(resumen.peorPlato.beneficio)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Acción</span>
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.peorPlato?.accionSugerida ?? "-"}
                </span>
              </div>
            </div>
          </div>

          <div className={`${cardClass} p-6`}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-amber-100 p-3 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                <TriangleAlert size={20} />
              </div>
              <div>
                <p className={`text-sm ${mutedTextClass}`}>Lectura rápida</p>
                <h3 className={`text-lg font-semibold ${strongTextClass}`}>
                  Resumen útil
                </h3>
              </div>
            </div>

            <div className={`mt-5 space-y-3 text-sm ${textClass}`}>
              <p>
                Alto margen:{" "}
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.altos}
                </span>
              </p>
              <p>
                Margen medio:{" "}
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.medios}
                </span>
              </p>
              <p>
                Margen bajo:{" "}
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.bajos}
                </span>
              </p>
              <p>
                Margen crítico:{" "}
                <span className={`font-semibold ${strongTextClass}`}>
                  {resumen.criticos}
                </span>
              </p>
              <p className={mutedBoxClass}>
                Aquí ves rápido qué platos te interesa potenciar y cuáles conviene
                revisar primero.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <Link
            className={`${cardClass} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
            href="/dashboard/rentabilidad/ingredientes"
          >
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}>
                <Package size={20} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Ingredientes
                </p>
                <p className={`text-sm ${mutedTextClass}`}>
                  Crea y ajusta tu base de costes.
                </p>
              </div>
            </div>
          </Link>

          <Link
            className={`${cardClass} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
            href="/dashboard/rentabilidad/platos"
          >
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}>
                <ChefHat size={20} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Platos
                </p>
                <p className={`text-sm ${mutedTextClass}`}>
                  Entra a cada plato y edita su receta.
                </p>
              </div>
            </div>
          </Link>

          <Link
            className={`${cardClass} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
            href="/dashboard/rentabilidad/ventas"
          >
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}>
                <ShoppingCart size={20} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Ventas por plato
                </p>
                <p className={`text-sm ${mutedTextClass}`}>
                  Registra ventas y calcula beneficio mensual.
                </p>
              </div>
            </div>
          </Link>

          <Link
            className={`${cardClass} p-5 transition hover:-translate-y-0.5 hover:shadow-md`}
            href="/dashboard/rentabilidad/platos/nuevo"
          >
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}>
                <Plus size={20} />
              </div>
              <div>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Nuevo plato
                </p>
                <p className={`text-sm ${mutedTextClass}`}>
                  Crea uno y añade ingredientes después.
                </p>
              </div>
            </div>
          </Link>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className={`text-xl font-semibold ${strongTextClass}`}>
                Platos
              </h2>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>
                Busca por nombre o deja solo los platos que más conviene revisar.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato o categoría"
                  className={`${inputClass} pl-9`}
                />
              </div>

              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
                className={inputClass}
              >
                <option value="todas">Todas las categorías</option>
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>

              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                className={inputClass}
              >
                <option value="todos">Todos los márgenes</option>
                <option value="alto">Margen alto</option>
                <option value="medio">Margen medio</option>
                <option value="bajo">Margen bajo</option>
                <option value="critico">Margen crítico</option>
              </select>
            </div>
          </div>

          {errorMsg && (
            <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className={`mt-6 text-sm ${mutedTextClass}`}>
              Cargando rentabilidad...
            </div>
          ) : platosFiltrados.length === 0 ? (
            <div className={emptyClass}>
              <div className="flex flex-col items-start gap-3">
                <div className={iconBoxClass}>
                  <ChefHat size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-semibold ${strongTextClass}`}>
                    No hay platos para mostrar
                  </h3>
                  <p className={`mt-1 text-sm ${mutedTextClass}`}>
                    Primero crea ingredientes y platos.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Plato
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Categoría
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Precio
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Coste
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Beneficio
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Margen
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Estado
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Acción sugerida
                    </th>
                    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                      Editar
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {platosFiltrados.map((plato) => (
                    <tr key={plato.id} className={tableRowClass}>
                      <td className="rounded-l-2xl px-4 py-4">
                        <p className={`font-semibold ${strongTextClass}`}>
                          {plato.nombre}
                        </p>
                      </td>

                      <td className={`px-4 py-4 text-sm ${textClass}`}>
                        {plato.categoria || "-"}
                      </td>

                      <td className={`px-4 py-4 text-sm font-medium ${strongTextClass}`}>
                        {formatEuro(plato.precio)}
                      </td>

                      <td className={`px-4 py-4 text-sm ${textClass}`}>
                        {formatEuro(plato.coste)}
                      </td>

                      <td className={`px-4 py-4 text-sm font-medium ${strongTextClass}`}>
                        {formatEuro(plato.beneficio)}
                      </td>

                      <td className={`px-4 py-4 text-sm font-medium ${strongTextClass}`}>
                        {formatPercent(plato.margen)}
                      </td>

                      <td className="px-4 py-4">
                        <span className={badgeEstadoClass(plato.estado)}>
                          {getEstadoLabel(plato.estado)}
                        </span>
                      </td>

                      <td className={`px-4 py-4 text-sm ${textClass}`}>
                        {plato.accionSugerida}
                      </td>

                      <td className="rounded-r-2xl px-4 py-4">
                        <Link
                          href={`/dashboard/rentabilidad/platos/${plato.id}`}
                          className={buttonSecondaryClass}
                        >
                          <Pencil size={14} />
                          Editar receta
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}