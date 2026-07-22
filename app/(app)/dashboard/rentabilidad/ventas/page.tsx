"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChefHat,
  Euro,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { useRestaurante } from "../../../../hooks/useRestaurante";

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
  precio_unitario: number | string;
  coste_unitario: number | string;
  beneficio_unitario: number | string;
  ingreso_total: number | string;
  coste_total: number | string;
  beneficio_total: number | string;
  created_at: string | null;
  platos?: {
    nombre: string;
    categoria: string | null;
  } | null;
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

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 0,
  }).format(value);
}

function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth(), 1)
    .toISOString()
    .split("T")[0];
}

function getNextMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
    .toISOString()
    .split("T")[0];
}

function getPrevMonthStart(date = new Date()): string {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
    .toISOString()
    .split("T")[0];
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
      "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
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

    titleClass: dark ? "text-white" : "text-slate-900",
    textClass: dark ? "text-slate-300" : "text-slate-600",
    mutedTextClass: dark ? "text-slate-400" : "text-slate-500",
    labelClass: dark ? "text-slate-300" : "text-slate-700",
    strongTextClass: dark ? "text-white" : "text-slate-900",
  };
}

export default function VentasPlatosPage() {
  const { dark } = useTheme();

  const {
    pageClass,
    cardClass,
    softCardClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    dangerButtonClass,
    tabClass,
    activeTabClass,
    pillClass,
    iconBoxClass,
    tableRowClass,
    emptyClass,
    titleClass,
    textClass,
    mutedTextClass,
    labelClass,
    strongTextClass,
  } = getThemeClasses(dark);

  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;
  const [platos, setPlatos] = useState<PlatoRentabilidad[]>([]);
  const [ventas, setVentas] = useState<VentaPlato[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [platoId, setPlatoId] = useState("");
  const [fecha, setFecha] = useState(getTodayDate());
  const [cantidad, setCantidad] = useState("1");
  const [busqueda, setBusqueda] = useState("");

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

    const { data: platosData, error: platosError } = await supabase
      .from("vw_rentabilidad_platos")
      .select("id, restaurante_id, nombre, categoria, precio_venta, coste_total, beneficio_eur, margen_pct")
      .eq("restaurante_id", restauranteId)
      .order("nombre", { ascending: true });

    if (platosError) {
      setError(platosError.message);
      setPlatos([]);
      setVentas([]);
      setLoading(false);
      return;
    }

    setPlatos((platosData as PlatoRentabilidad[]) ?? []);

    const { data: ventasData, error: ventasError } = await supabase
      .from("ventas_platos")
      .select(
        `
        *,
        platos (
          nombre,
          categoria
        )
      `
      )
      .eq("restaurante_id", restauranteId)
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false });

    if (ventasError) {
      setError(ventasError.message);
      setVentas([]);
      setLoading(false);
      return;
    }

    setVentas((ventasData as VentaPlato[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  const platoSeleccionado = useMemo(() => {
    return platos.find((p) => p.id === platoId) ?? null;
  }, [platos, platoId]);

  const preview = useMemo(() => {
    const qty = Math.max(0, Math.floor(toNumber(cantidad)));
    const precio = toNumber(platoSeleccionado?.precio_venta);
    const coste = toNumber(platoSeleccionado?.coste_total);
    const beneficio = toNumber(platoSeleccionado?.beneficio_eur);

    return {
      cantidad: qty,
      ingresoTotal: qty * precio,
      costeTotal: qty * coste,
      beneficioTotal: qty * beneficio,
    };
  }, [platoSeleccionado, cantidad]);

  const ventasFiltradas = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    if (!term) return ventas;

    return ventas.filter((v) => {
      const nombre = v.platos?.nombre ?? "";
      const categoria = v.platos?.categoria ?? "";
      return (
        nombre.toLowerCase().includes(term) ||
        categoria.toLowerCase().includes(term) ||
        v.fecha.includes(term)
      );
    });
  }, [ventas, busqueda]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = getMonthStart(now);
    const nextMonthStart = getNextMonthStart(now);
    const prevMonthStart = getPrevMonthStart(now);

    const ventasMes = ventas.filter(
      (v) => v.fecha >= monthStart && v.fecha < nextMonthStart
    );

    const ventasMesAnterior = ventas.filter(
      (v) => v.fecha >= prevMonthStart && v.fecha < monthStart
    );

    const sum = (arr: VentaPlato[], key: keyof VentaPlato) =>
      arr.reduce((acc, item) => acc + toNumber(item[key] as any), 0);

    const unidadesMes = ventasMes.reduce(
      (acc, item) => acc + toNumber(item.cantidad),
      0
    );

    const ingresoMes = sum(ventasMes, "ingreso_total");
    const costeMes = sum(ventasMes, "coste_total");
    const beneficioMes = sum(ventasMes, "beneficio_total");

    const beneficioAnterior = sum(ventasMesAnterior, "beneficio_total");
    const diferenciaBeneficio = beneficioMes - beneficioAnterior;

    return {
      unidadesMes,
      ingresoMes,
      costeMes,
      beneficioMes,
      beneficioAnterior,
      diferenciaBeneficio,
    };
  }, [ventas]);

  const crearVenta = async () => {
    clearMessages();

    if (!restauranteId) {
      setError("No hay restaurante asociado al usuario.");
      return;
    }

    if (!platoSeleccionado) {
      setError("Selecciona un plato.");
      return;
    }

    const qty = Math.floor(toNumber(cantidad));

    if (!fecha) {
      setError("Selecciona una fecha.");
      return;
    }

    if (qty <= 0) {
      setError("La cantidad debe ser mayor que 0.");
      return;
    }

    const precio = toNumber(platoSeleccionado.precio_venta);
    const coste = toNumber(platoSeleccionado.coste_total);
    const beneficio = toNumber(platoSeleccionado.beneficio_eur);

    if (precio <= 0) {
      setError("Este plato no tiene precio de venta válido.");
      return;
    }

    setSaving(true);

    const payload = {
      restaurante_id: restauranteId,
      plato_id: platoSeleccionado.id,
      fecha,
      cantidad: qty,
      precio_unitario: precio,
      coste_unitario: coste,
      beneficio_unitario: beneficio,
    };

    const { error } = await supabase.from("ventas_platos").insert([payload]);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setCantidad("1");
    setPlatoId("");
    await cargarDatos();
    setOkMessage("Venta registrada.");
    setSaving(false);
  };

  const borrarVenta = async (id: string) => {
    const ok = window.confirm("¿Seguro que quieres borrar esta venta?");
    if (!ok) return;

    clearMessages();

    if (!restauranteId) {
      setError("No hay restaurante asociado al usuario.");
      return;
    }

    const { error } = await supabase
      .from("ventas_platos")
      .delete()
      .eq("id", id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setError(error.message);
      return;
    }

    await cargarDatos();
    setOkMessage("Venta borrada.");
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/rentabilidad" className={buttonSecondaryClass}>
            <ArrowLeft size={16} />
            Volver a rentabilidad
          </Link>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className={pillClass}>
                <ShoppingCart size={14} />
                Rentabilidad · Ventas
              </div>

              <h1 className={`text-3xl font-bold tracking-tight ${titleClass}`}>
                Ventas por plato
              </h1>

              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Registra unidades vendidas para calcular ingresos, costes y beneficio estimado por mes.
              </p>
            </div>

            <button
              onClick={cargarDatos}
              disabled={loading || saving}
              className={buttonSecondaryClass}
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              {loading ? "Recargando..." : "Recargar"}
            </button>
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

            <Link href="/dashboard/rentabilidad/platos" className={tabClass}>
              <ChefHat size={16} />
              Platos
            </Link>

            <Link href="/dashboard/rentabilidad/ventas" className={activeTabClass}>
              <ShoppingCart size={16} />
              Ventas
            </Link>
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
            <p className={`text-sm ${mutedTextClass}`}>Ingresos estimados mes</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.ingresoMes)}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Costes estimados mes</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.costeMes)}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Beneficio estimado mes</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.beneficioMes)}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>Unidades vendidas mes</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatNumber(stats.unidadesMes)}
            </p>
            <p
              className={clsx(
                "mt-2 text-sm font-medium",
                stats.diferenciaBeneficio >= 0
                  ? "text-emerald-600 dark:text-emerald-300"
                  : "text-rose-600 dark:text-rose-300"
              )}
            >
              {stats.diferenciaBeneficio >= 0 ? "+" : ""}
              {formatEuro(stats.diferenciaBeneficio)} vs mes anterior
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={`${cardClass} p-6 xl:col-span-1`}>
            <div className="flex items-center gap-3">
              <div className={iconBoxClass}>
                <Plus size={20} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${strongTextClass}`}>
                  Registrar venta
                </h2>
                <p className={`text-sm ${mutedTextClass}`}>
                  Añade unidades vendidas de un plato.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                  Plato
                </label>
                <select
                  value={platoId}
                  onChange={(e) => {
                    setPlatoId(e.target.value);
                    clearMessages();
                  }}
                  className={inputClass}
                >
                  <option value="">Selecciona un plato</option>
                  {platos.map((plato) => (
                    <option key={plato.id} value={plato.id}>
                      {plato.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                  Fecha
                </label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    clearMessages();
                  }}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                  Cantidad vendida
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={cantidad}
                  onChange={(e) => {
                    setCantidad(e.target.value);
                    clearMessages();
                  }}
                  placeholder="Ej. 8"
                  className={inputClass}
                />
              </div>

              <div className={`${softCardClass} p-4`}>
                <p className={`text-sm font-semibold ${strongTextClass}`}>
                  Vista previa
                </p>

                <div className={`mt-3 space-y-2 text-sm ${textClass}`}>
                  <div className="flex justify-between gap-3">
                    <span>Ingresos</span>
                    <span className={`font-semibold ${strongTextClass}`}>
                      {formatEuro(preview.ingresoTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Coste estimado</span>
                    <span className={`font-semibold ${strongTextClass}`}>
                      {formatEuro(preview.costeTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Beneficio estimado</span>
                    <span className={`font-semibold ${strongTextClass}`}>
                      {formatEuro(preview.beneficioTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={crearVenta}
                disabled={saving || !platoSeleccionado || preview.cantidad <= 0 || !fecha}
                className={`${buttonPrimaryClass} w-full justify-center`}
              >
                <Save size={16} />
                {saving ? "Guardando..." : "Guardar venta"}
              </button>
            </div>
          </div>

          <div className={`${cardClass} p-6 xl:col-span-2`}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className={`text-xl font-semibold ${strongTextClass}`}>
                  Ventas registradas
                </h2>
                <p className={`mt-1 text-sm ${mutedTextClass}`}>
                  Historial de ventas usadas para calcular el beneficio mensual estimado.
                </p>
              </div>

              <div className="relative w-full md:max-w-sm">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar plato, categoría o fecha"
                  className={`${inputClass} pl-9`}
                />
              </div>
            </div>

            {loading ? (
              <div className={`${emptyClass} text-sm ${mutedTextClass}`}>
                Cargando ventas...
              </div>
            ) : ventasFiltradas.length === 0 ? (
              <div className={emptyClass}>
                <p className={`text-sm ${mutedTextClass}`}>
                  Todavía no hay ventas registradas.
                </p>
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Fecha
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Plato
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Cant.
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Ingresos
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Coste
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Beneficio
                      </th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                        Acción
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {ventasFiltradas.map((venta) => (
                      <tr key={venta.id} className={tableRowClass}>
                        <td className={`rounded-l-2xl px-4 py-4 text-sm ${textClass}`}>
                          <div className="inline-flex items-center gap-2">
                            <CalendarDays size={14} />
                            {venta.fecha}
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <p className={`font-semibold ${strongTextClass}`}>
                            {venta.platos?.nombre ?? "Plato eliminado"}
                          </p>
                          <p className={`text-xs ${mutedTextClass}`}>
                            {venta.platos?.categoria ?? "Sin categoría"}
                          </p>
                        </td>

                        <td className={`px-4 py-4 text-sm ${textClass}`}>
                          {formatNumber(toNumber(venta.cantidad))}
                        </td>

                        <td className={`px-4 py-4 text-sm font-medium ${strongTextClass}`}>
                          {formatEuro(toNumber(venta.ingreso_total))}
                        </td>

                        <td className={`px-4 py-4 text-sm ${textClass}`}>
                          {formatEuro(toNumber(venta.coste_total))}
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20">
                            <TrendingUp size={13} />
                            {formatEuro(toNumber(venta.beneficio_total))}
                          </span>
                        </td>

                        <td className="rounded-r-2xl px-4 py-4">
                          <button
                            type="button"
                            onClick={() => borrarVenta(venta.id)}
                            className={dangerButtonClass}
                          >
                            <Trash2 size={14} />
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className={`${cardClass} p-5`}>
          <div className="flex items-start gap-3">
            <div className={iconBoxClass}>
              <Euro size={18} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${strongTextClass}`}>
                Nota importante
              </p>
              <p className={`mt-1 text-sm leading-6 ${mutedTextClass}`}>
                Estos datos son una estimación basada en las ventas que registres y en el coste de receta guardado en el módulo de rentabilidad. No sustituye al TPV ni a la contabilidad real.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}