"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChefHat,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Euro,
  Pencil,
  EyeOff,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";

type Plato = {
  id: string;
  restaurante_id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number | string;
  activo: boolean;
};

type RestauranteUsuario = {
  restaurante_id: string;
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

    dangerButtonClass: clsx(
      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
      dark
        ? "border-rose-500/20 bg-slate-900 text-rose-300 hover:bg-rose-500/10"
        : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
    ),

    smallButtonClass: clsx(
      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    ),

    pillClass: clsx(
      "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

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

    activeBadgeClass: clsx(
      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
      dark
        ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
        : "bg-emerald-50 text-emerald-700 ring-emerald-200"
    ),

    inactiveBadgeClass: clsx(
      "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
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

export default function PlatosPage() {
  const { dark } = useTheme();

  const {
    pageClass,
    cardClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    dangerButtonClass,
    smallButtonClass,
    pillClass,
    iconBoxClass,
    tableRowClass,
    emptyClass,
    activeBadgeClass,
    inactiveBadgeClass,
    titleClass,
    textClass,
    mutedTextClass,
    strongTextClass,
  } = getThemeClasses(dark);

  const [platos, setPlatos] = useState<Plato[]>([]);
  const [loading, setLoading] = useState(true);
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setError("No se pudo obtener el usuario autenticado.");
      setLoading(false);
      return;
    }

    const { data: restauranteData, error: restauranteError } = await supabase
      .from("usuarios_restaurantes")
      .select("restaurante_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (restauranteError || !restauranteData?.restaurante_id) {
      setError("No se pudo obtener el restaurante del usuario.");
      setLoading(false);
      return;
    }

    const restaurante = restauranteData as RestauranteUsuario;

    const { data, error } = await supabase
      .from("platos")
      .select("*")
      .eq("restaurante_id", restaurante.restaurante_id)
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
  }, []);

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
    const ok = window.confirm("¿Seguro que quieres borrar este plato?");
    if (!ok) return;

    clearMessages();

    const { error } = await supabase.from("platos").delete().eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await cargarDatos();
    setOkMessage("Plato borrado.");
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className={pillClass}>
                <ChefHat size={14} />
                Rentabilidad · Platos
              </div>

              <h1 className={`text-3xl font-bold tracking-tight ${titleClass}`}>
                Platos
              </h1>

              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Aquí gestionas tus platos antes de montar su receta.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={cargarDatos}
                disabled={loading}
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
        </div>

        {error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {okMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
            {okMessage}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Total platos</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {stats.total}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Activos</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {stats.activos}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Inactivos</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {stats.inactivos}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Precio medio</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.precioMedio)}
            </p>
          </div>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className={`text-xl font-semibold ${strongTextClass}`}>
                Lista de platos
              </h2>
              <p className={`mt-1 text-sm ${mutedTextClass}`}>
                Entra a cada plato para ajustar su receta.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-3 md:max-w-2xl md:grid-cols-2">
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
            <div className={`${emptyClass} text-sm ${mutedTextClass}`}>
              Cargando platos...
            </div>
          ) : platosFiltrados.length === 0 ? (
            <div className={emptyClass}>
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <EyeOff size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-semibold ${strongTextClass}`}>
                    No hay platos para mostrar
                  </h3>
                  <p className={`mt-1 text-sm ${mutedTextClass}`}>
                    Ajusta la búsqueda, cambia el filtro o crea un plato nuevo.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr>
                    <th
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}
                    >
                      Plato
                    </th>
                    <th
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}
                    >
                      Categoría
                    </th>
                    <th
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}
                    >
                      Precio
                    </th>
                    <th
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}
                    >
                      Estado
                    </th>
                    <th
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}
                    >
                      Acciones
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {platosFiltrados.map((item) => (
                    <tr key={item.id} className={tableRowClass}>
                      <td className="rounded-l-2xl px-4 py-4">
                        <p className={`font-semibold ${strongTextClass}`}>
                          {item.nombre}
                        </p>
                      </td>

                      <td className={`px-4 py-4 text-sm ${textClass}`}>
                        {item.categoria || "-"}
                      </td>

                      <td
                        className={`px-4 py-4 text-sm font-medium ${strongTextClass}`}
                      >
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
                            className={dangerButtonClass}
                          >
                            <Trash2 size={14} />
                            Borrar
                          </button>
                        </div>
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