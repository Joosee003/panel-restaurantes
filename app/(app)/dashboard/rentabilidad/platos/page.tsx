"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ChefHat,
  Euro,
  EyeOff,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { useRestaurante } from "../../../../hooks/useRestaurante";

type Plato = {
  id: string;
  restaurante_id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number | string;
  activo: boolean;
};


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

function getThemeClasses(dark: boolean) {
  return {
    pageClass: clsx(
      "min-h-screen px-4 py-6 transition-colors sm:px-6 lg:px-8",
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

    inputClass: clsx(
      "w-full rounded-2xl border px-4 py-3 text-sm font-medium outline-none transition",
      dark
        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-500"
        : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
    ),

    buttonSecondaryClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    ),

    buttonPrimaryClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98]",
      dark
        ? "bg-white text-slate-900 hover:bg-slate-200"
        : "bg-slate-950 text-white hover:bg-slate-800"
    ),

    dangerButtonClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold transition active:scale-[0.98]",
      dark
        ? "border-rose-500/20 bg-slate-900 text-rose-300 hover:bg-rose-500/10"
        : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
    ),

    smallButtonClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold transition active:scale-[0.98]",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    ),

    tabClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-bold transition active:scale-[0.98]",
      dark
        ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
    ),

    activeTabClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-black",
      dark ? "bg-white text-slate-900" : "bg-slate-950 text-white"
    ),

    pillClass: clsx(
      "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    iconBoxClass: clsx(
      "rounded-2xl p-3",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    emptyClass: clsx(
      "mt-6 rounded-3xl border p-8 transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    activeBadgeClass: clsx(
      "inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1",
      dark
        ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200"
    ),

    inactiveBadgeClass: clsx(
      "inline-flex rounded-full px-2.5 py-1 text-xs font-black ring-1",
      dark
        ? "bg-slate-700 text-slate-300 ring-slate-600"
        : "bg-slate-100 text-slate-700 ring-slate-200"
    ),

    titleClass: dark ? "text-white" : "text-slate-900",
    textClass: dark ? "text-slate-300" : "text-slate-600",
    mutedTextClass: dark ? "text-slate-400" : "text-slate-500",
    strongTextClass: dark ? "text-white" : "text-slate-900",
  };
}

function StatCard({
  title,
  value,
  helper,
  icon,
  className,
}: {
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  className: string;
}) {
  return (
    <div className={`${className} p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>{icon}</div>
      </div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
        {helper}
      </p>
    </div>
  );
}

export default function PlatosPage() {
  const { dark } = useTheme();

  const {
    pageClass,
    cardClass,
    softCardClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    dangerButtonClass,
    smallButtonClass,
    tabClass,
    activeTabClass,
    pillClass,
    iconBoxClass,
    emptyClass,
    activeBadgeClass,
    inactiveBadgeClass,
    titleClass,
    textClass,
    mutedTextClass,
    strongTextClass,
  } = getThemeClasses(dark);

  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;
  const [platos, setPlatos] = useState<Plato[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");

  const clearMessages = () => {
    if (error) setError(null);
    if (okMessage) setOkMessage(null);
  };

  const cargarDatos = async () => {
    setLoading(true);
    setError(null);

    if (loadingRestaurante) return;

    if (!restauranteId) {
      setError('No se encontró restaurante activo. Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("platos")
      .select("id, restaurante_id, nombre, categoria, precio_venta, activo")
      .eq("restaurante_id", restauranteId)
      .order("nombre", { ascending: true });

    if (error) {
      setError(error.message);
      setPlatos([]);
      setLoading(false);
      return;
    }

    setPlatos((data as Plato[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  const platosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return platos.filter((item) => {
      const matchBusqueda =
        !texto ||
        item.nombre.toLowerCase().includes(texto) ||
        (item.categoria ?? "").toLowerCase().includes(texto);

      const matchEstado =
        estadoFiltro === "todos" ||
        (estadoFiltro === "activos" && item.activo) ||
        (estadoFiltro === "inactivos" && !item.activo);

      return matchBusqueda && matchEstado;
    });
  }, [platos, busqueda, estadoFiltro]);

  const stats = useMemo(() => {
    const total = platos.length;
    const activos = platos.filter((p) => p.activo).length;
    const inactivos = total - activos;
    const precioMedio =
      total > 0
        ? platos.reduce((acc, p) => acc + toNumber(p.precio_venta), 0) / total
        : 0;

    return {
      total,
      activos,
      inactivos,
      precioMedio,
    };
  }, [platos]);

  const borrarPlato = async (id: string) => {
    if (!restauranteId) {
      setError("No se pudo validar el restaurante.");
      return;
    }

    const ok = window.confirm("¿Seguro que quieres borrar este plato?");
    if (!ok) return;

    clearMessages();
    setDeletingId(id);

    const { error } = await supabase
      .from("platos")
      .delete()
      .eq("id", id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setError(error.message);
      setDeletingId(null);
      return;
    }

    await cargarDatos();
    setOkMessage("Plato borrado.");
    setDeletingId(null);
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`${cardClass} overflow-hidden p-6`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className={pillClass}>
                <ChefHat size={14} />
                Rentabilidad · Platos
              </div>

              <h1 className={`text-3xl font-black tracking-tight ${titleClass}`}>
                Platos
              </h1>

              <p className={`mt-2 max-w-2xl text-sm font-medium leading-6 ${mutedTextClass}`}>
                Crea platos, entra a cada ficha y monta la receta. Después el sistema calcula coste, margen y beneficio.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={cargarDatos}
                disabled={loading || Boolean(deletingId)}
                className={buttonSecondaryClass}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Recargando..." : "Recargar"}
              </button>

              <Link
                href="/dashboard/rentabilidad/platos/nuevo"
                className={buttonPrimaryClass}
              >
                <Plus size={16} />
                Nuevo plato
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/dashboard/rentabilidad" className={tabClass}>
              <BarChart3 size={16} />
              Resumen
            </Link>

            <Link href="/dashboard/rentabilidad/ingredientes" className={tabClass}>
              <Package size={16} />
              Ingredientes
            </Link>

            <Link href="/dashboard/rentabilidad/platos" className={activeTabClass}>
              <ChefHat size={16} />
              Platos
            </Link>

            <Link href="/dashboard/rentabilidad/ventas" className={tabClass}>
              <ShoppingCart size={16} />
              Ventas
            </Link>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {okMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {okMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            className={cardClass}
            icon={<ChefHat size={22} />}
            title="Total platos"
            value={String(stats.total)}
            helper="Platos creados"
          />

          <StatCard
            className={cardClass}
            icon={<ChefHat size={22} />}
            title="Activos"
            value={String(stats.activos)}
            helper="Visibles para trabajar"
          />

          <StatCard
            className={cardClass}
            icon={<EyeOff size={22} />}
            title="Inactivos"
            value={String(stats.inactivos)}
            helper="Ocultos o pausados"
          />

          <StatCard
            className={cardClass}
            icon={<Euro size={22} />}
            title="Precio medio"
            value={formatEuro(stats.precioMedio)}
            helper="Media de precio de carta"
          />
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className={`text-xl font-black ${strongTextClass}`}>
                Lista de platos
              </h2>
              <p className={`mt-1 text-sm font-medium ${mutedTextClass}`}>
                Entra a cada plato para ajustar su receta y calcular su rentabilidad.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 md:max-w-2xl md:grid-cols-2">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato o categoría"
                  className={`${inputClass} pl-11`}
                />
              </div>

              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value)}
                className={inputClass}
              >
                <option value="todos">Todos los estados</option>
                <option value="activos">Solo activos</option>
                <option value="inactivos">Solo inactivos</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className={`${emptyClass} text-sm font-semibold ${mutedTextClass}`}>
              Cargando platos...
            </div>
          ) : platosFiltrados.length === 0 ? (
            <div className={emptyClass}>
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <EyeOff size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-black ${strongTextClass}`}>
                    No hay platos para mostrar
                  </h3>
                  <p className={`mt-1 text-sm font-medium ${mutedTextClass}`}>
                    Ajusta la búsqueda, cambia el filtro o crea un plato nuevo.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 lg:hidden">
                {platosFiltrados.map((item) => (
                  <div key={item.id} className={`${softCardClass} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`truncate text-lg font-black ${strongTextClass}`}>
                          {item.nombre}
                        </p>
                        <p className={`mt-1 text-sm font-semibold ${mutedTextClass}`}>
                          {item.categoria || "Sin categoría"}
                        </p>
                      </div>

                      <span
                        className={
                          item.activo ? activeBadgeClass : inactiveBadgeClass
                        }
                      >
                        {item.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between rounded-2xl bg-white p-3 text-sm dark:bg-slate-900">
                      <span className={mutedTextClass}>Precio</span>
                      <span className={`font-black ${strongTextClass}`}>
                        {formatEuro(toNumber(item.precio_venta))}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Link
                        href={`/dashboard/rentabilidad/platos/${item.id}`}
                        className={smallButtonClass}
                      >
                        <Pencil size={14} />
                        Editar
                      </Link>

                      <button
                        type="button"
                        onClick={() => borrarPlato(item.id)}
                        disabled={deletingId === item.id}
                        className={dangerButtonClass}
                      >
                        <Trash2 size={14} />
                        {deletingId === item.id ? "Borrando..." : "Borrar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 hidden overflow-x-auto lg:block">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className={`px-4 py-3 text-left text-xs font-black uppercase tracking-wide ${mutedTextClass}`}>
                        Plato
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-black uppercase tracking-wide ${mutedTextClass}`}>
                        Categoría
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-black uppercase tracking-wide ${mutedTextClass}`}>
                        Precio
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-black uppercase tracking-wide ${mutedTextClass}`}>
                        Estado
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-black uppercase tracking-wide ${mutedTextClass}`}>
                        Acciones
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {platosFiltrados.map((item) => (
                      <tr
                        key={item.id}
                        className={clsx(
                          "rounded-2xl shadow-sm transition",
                          dark
                            ? "bg-slate-950 hover:bg-slate-800"
                            : "bg-slate-50 hover:bg-slate-100"
                        )}
                      >
                        <td className="rounded-l-2xl px-4 py-4">
                          <p className={`font-black ${strongTextClass}`}>
                            {item.nombre}
                          </p>
                        </td>

                        <td className={`px-4 py-4 text-sm font-semibold ${textClass}`}>
                          {item.categoria || "-"}
                        </td>

                        <td className={`px-4 py-4 text-sm font-black ${strongTextClass}`}>
                          <div className="inline-flex items-center gap-1">
                            <Euro size={14} />
                            {formatEuro(toNumber(item.precio_venta))}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={
                              item.activo ? activeBadgeClass : inactiveBadgeClass
                            }
                          >
                            {item.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>

                        <td className="rounded-r-2xl px-4 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/dashboard/rentabilidad/platos/${item.id}`}
                              className={smallButtonClass}
                            >
                              <Pencil size={14} />
                              Editar receta
                            </Link>

                            <button
                              type="button"
                              onClick={() => borrarPlato(item.id)}
                              disabled={deletingId === item.id}
                              className={dangerButtonClass}
                            >
                              <Trash2 size={14} />
                              {deletingId === item.id ? "Borrando..." : "Borrar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}