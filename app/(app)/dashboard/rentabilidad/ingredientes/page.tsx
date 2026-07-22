"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Package,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  BarChart3,
  ChefHat,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { useRestaurante } from "../../../../hooks/useRestaurante";

type Ingrediente = {
  id: string;
  restaurante_id: string;
  nombre: string;
  unidad: string;
  coste_compra: number | string;
  cantidad_compra: number | string;
  merma_pct: number | string;
  activo: boolean;
};


const UNIDADES = ["g", "kg", "ml", "l", "ud"];

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

function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function calcularCantidadUtil(cantidadCompra: number, mermaPct: number): number {
  if (cantidadCompra <= 0) return 0;
  const mermaFactor = 1 - mermaPct / 100;
  return mermaFactor > 0 ? cantidadCompra * mermaFactor : 0;
}

function calcularCosteUtilPorUnidad(item: Ingrediente): number {
  const costeCompra = toNumber(item.coste_compra);
  const cantidadCompra = toNumber(item.cantidad_compra);
  const mermaPct = toNumber(item.merma_pct);

  const cantidadUtil = calcularCantidadUtil(cantidadCompra, mermaPct);
  if (costeCompra <= 0 || cantidadUtil <= 0) return 0;

  return costeCompra / cantidadUtil;
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

    fullButtonPrimaryClass: clsx(
      "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "bg-white text-slate-900 hover:bg-slate-200"
        : "bg-slate-900 text-white hover:bg-slate-800"
    ),

    fullButtonSecondaryClass: clsx(
      "inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    ),

    dangerButtonClass: clsx(
      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
      dark
        ? "border-rose-500/20 bg-slate-900 text-rose-300 hover:bg-rose-500/10"
        : "border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
    ),

    titleClass: dark ? "text-white" : "text-slate-900",
    textClass: dark ? "text-slate-300" : "text-slate-600",
    mutedTextClass: dark ? "text-slate-400" : "text-slate-500",
    labelClass: dark ? "text-slate-300" : "text-slate-700",
    strongTextClass: dark ? "text-white" : "text-slate-900",

    iconBoxClass: clsx(
      "rounded-2xl p-3",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    pillClass: clsx(
      "mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    previewClass: clsx(
      "rounded-2xl border p-4 text-sm transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    tableRowClass: clsx(
      "rounded-2xl shadow-sm transition",
      dark ? "bg-slate-950 hover:bg-slate-800" : "bg-slate-50 hover:bg-slate-100"
    ),

    emptyClass: clsx(
      "mt-6 rounded-2xl border p-8 transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),
  };
}

export default function IngredientesPage() {
  const { dark } = useTheme();

  const {
    pageClass,
    cardClass,
    softCardClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    tabClass,
    activeTabClass,
    fullButtonPrimaryClass,
    fullButtonSecondaryClass,
    dangerButtonClass,
    titleClass,
    textClass,
    mutedTextClass,
    labelClass,
    strongTextClass,
    iconBoxClass,
    pillClass,
    previewClass,
    tableRowClass,
    emptyClass,
  } = getThemeClasses(dark);

  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;
  const [busqueda, setBusqueda] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    unidad: "g",
    coste_compra: "",
    cantidad_compra: "",
    merma_pct: "",
  });

  const formNombre = form.nombre.trim();
  const formCosteCompra = toNumber(form.coste_compra);
  const formCantidadCompra = toNumber(form.cantidad_compra);
  const formMermaPct = toNumber(form.merma_pct);
  const formCantidadUtil = calcularCantidadUtil(formCantidadCompra, formMermaPct);
  const formCosteUtilUnidad =
    formCosteCompra > 0 && formCantidadUtil > 0 ? formCosteCompra / formCantidadUtil : 0;
  const canCrearIngrediente =
    Boolean(restauranteId) &&
    formNombre.length > 0 &&
    formCosteCompra > 0 &&
    formCantidadCompra > 0 &&
    formMermaPct >= 0 &&
    formMermaPct <= 100 &&
    formCantidadUtil > 0 &&
    !saving;

  const clearMessages = () => {
    if (error) setError(null);
    if (okMessage) setOkMessage(null);
  };

  const cargarRestauranteYDatos = async () => {
    setLoading(true);
    setError(null);

    if (loadingRestaurante) return;

    if (!restauranteId) {
      setError('No se encontró restaurante activo. Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("ingredientes")
      .select("*")
      .eq("restaurante_id", restauranteId)
      .order("nombre", { ascending: true });

    if (error) {
      setError(error.message);
      setIngredientes([]);
      setLoading(false);
      return;
    }

    setIngredientes((data as Ingrediente[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarRestauranteYDatos();
  }, [restauranteId, loadingRestaurante]);

  const ingredientesFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();
    if (!term) return ingredientes;

    return ingredientes.filter((item) =>
      item.nombre.toLowerCase().includes(term)
    );
  }, [ingredientes, busqueda]);

  const stats = useMemo(() => {
    const total = ingredientes.length;
    const activos = ingredientes.filter((i) => i.activo).length;

    const costeMedioCompra =
      total > 0
        ? ingredientes.reduce((acc, item) => acc + toNumber(item.coste_compra), 0) / total
        : 0;

    const costeUtilMedio =
      total > 0
        ? ingredientes.reduce((acc, item) => acc + calcularCosteUtilPorUnidad(item), 0) / total
        : 0;

    return {
      total,
      activos,
      costeMedioCompra,
      costeUtilMedio,
    };
  }, [ingredientes]);

  const limpiarFormulario = () => {
    setForm({
      nombre: "",
      unidad: "g",
      coste_compra: "",
      cantidad_compra: "",
      merma_pct: "",
    });
  };

  const crearIngrediente = async () => {
    if (!restauranteId) {
      setError("No hay restaurante asociado al usuario.");
      return;
    }

    clearMessages();

    const nombre = form.nombre.trim();
    const costeCompra = toNumber(form.coste_compra);
    const cantidadCompra = toNumber(form.cantidad_compra);
    const mermaPct = toNumber(form.merma_pct);

    if (!nombre) {
      setError("El nombre es obligatorio.");
      return;
    }

    if (costeCompra <= 0) {
      setError("El coste de compra debe ser mayor que 0.");
      return;
    }

    if (cantidadCompra <= 0) {
      setError("La cantidad comprada debe ser mayor que 0.");
      return;
    }

    if (mermaPct < 0 || mermaPct > 100) {
      setError("La merma debe estar entre 0 y 100.");
      return;
    }

    const cantidadUtil = calcularCantidadUtil(cantidadCompra, mermaPct);
    if (cantidadUtil <= 0) {
      setError("La cantidad útil resultante debe ser mayor que 0.");
      return;
    }

    setSaving(true);

    const payload = {
      restaurante_id: restauranteId,
      nombre,
      unidad: form.unidad,
      coste_compra: costeCompra,
      cantidad_compra: cantidadCompra,
      merma_pct: mermaPct,
      activo: true,
    };

    const { error } = await supabase.from("ingredientes").insert([payload]);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    limpiarFormulario();
    await cargarRestauranteYDatos();
    setOkMessage("Ingrediente guardado.");
    setSaving(false);
  };

  const borrarIngrediente = async (id: string) => {
    const ok = window.confirm("¿Seguro que quieres borrar este ingrediente?");
    if (!ok) return;

    clearMessages();

    if (!restauranteId) {
      setError("No hay restaurante asociado al usuario.");
      return;
    }

    setDeletingId(id);

    const { error } = await supabase
      .from("ingredientes")
      .delete()
      .eq("id", id)
      .eq("restaurante_id", restauranteId);

    if (error) {
      setError(error.message);
      setDeletingId(null);
      return;
    }

    await cargarRestauranteYDatos();
    setOkMessage("Ingrediente borrado.");
    setDeletingId(null);
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-7xl space-y-6">
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className={pillClass}>
                <Package size={14} />
                Rentabilidad · Ingredientes
              </div>

              <h1 className={`text-3xl font-bold tracking-tight ${titleClass}`}>
                Ingredientes
              </h1>

              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Aquí guardas la base de costes que luego usarás en cada plato.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={cargarRestauranteYDatos}
                disabled={loading || saving}
                className={buttonSecondaryClass}
              >
                <RefreshCw
                  size={16}
                  className={loading ? "animate-spin" : ""}
                />
                {loading ? "Recargando..." : "Recargar"}
              </button>

              <Link href="/dashboard/rentabilidad/platos" className={buttonPrimaryClass}>
                <ChefHat size={16} />
                Ir a platos
              </Link>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/dashboard/rentabilidad" className={tabClass}>
              <BarChart3 size={16} />
              Resumen
            </Link>

            <Link
              href="/dashboard/rentabilidad/ingredientes"
              className={activeTabClass}
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
            <p className={`text-sm ${mutedTextClass}`}>Total ingredientes</p>
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
            <p className={`text-sm ${mutedTextClass}`}>Coste medio compra</p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.costeMedioCompra)}
            </p>
          </div>

          <div className={`${cardClass} p-5`}>
            <p className={`text-sm ${mutedTextClass}`}>
              Coste útil medio / unidad
            </p>
            <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
              {formatEuro(stats.costeUtilMedio)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <div className={`${cardClass} p-6`}>
              <div className="flex items-center gap-3">
                <div className={iconBoxClass}>
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className={`text-lg font-semibold ${strongTextClass}`}>
                    Nuevo ingrediente
                  </h2>
                  <p className={`text-sm ${mutedTextClass}`}>
                    Añádelo una vez y luego reutilízalo.
                  </p>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, nombre: e.target.value }));
                      clearMessages();
                    }}
                    placeholder="Ej. Pollo"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                    Unidad
                  </label>
                  <select
                    value={form.unidad}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, unidad: e.target.value }));
                      clearMessages();
                    }}
                    className={inputClass}
                  >
                    {UNIDADES.map((unidad) => (
                      <option key={unidad} value={unidad}>
                        {unidad}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                    Coste de compra (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.coste_compra}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        coste_compra: e.target.value,
                      }));
                      clearMessages();
                    }}
                    placeholder="Ej. 8.00"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                    Cantidad comprada
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={form.cantidad_compra}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        cantidad_compra: e.target.value,
                      }));
                      clearMessages();
                    }}
                    placeholder="Ej. 1000"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                    Merma (%)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={form.merma_pct}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        merma_pct: e.target.value,
                      }));
                      clearMessages();
                    }}
                    placeholder="Ej. 5"
                    className={inputClass}
                  />
                </div>

                {toNumber(form.coste_compra) > 0 &&
                  toNumber(form.cantidad_compra) > 0 && (
                    <div className={previewClass}>
                      <p className={`font-medium ${strongTextClass}`}>
                        Vista previa
                      </p>
                      <div className={`mt-2 space-y-1 ${textClass}`}>
                        <p>
                          Cantidad útil:{" "}
                          <span className={`font-medium ${strongTextClass}`}>
                            {formatNumber(formCantidadUtil, 3)}{" "}
                            {form.unidad}
                          </span>
                        </p>
                        <p>
                          Coste útil por unidad:{" "}
                          <span className={`font-medium ${strongTextClass}`}>
                            {formatEuro(formCosteUtilUnidad)}{" "}
                            / {form.unidad}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}

                <button
                  onClick={crearIngrediente}
                  disabled={!canCrearIngrediente}
                  className={fullButtonPrimaryClass}
                >
                  {saving ? "Guardando..." : "Guardar ingrediente"}
                </button>

                <Link
                  href="/dashboard/rentabilidad/platos"
                  className={fullButtonSecondaryClass}
                >
                  Siguiente: platos
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className={`${cardClass} p-6`}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className={`text-xl font-semibold ${strongTextClass}`}>
                    Lista de ingredientes
                  </h2>
                  <p className={`mt-1 text-sm ${mutedTextClass}`}>
                    Esta es tu base de costes.
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
                    placeholder="Buscar ingrediente"
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>

              {loading ? (
                <div className={`${emptyClass} text-sm ${mutedTextClass}`}>
                  Cargando ingredientes...
                </div>
              ) : ingredientesFiltrados.length === 0 ? (
                <div className={emptyClass}>
                  <p className={`text-sm ${mutedTextClass}`}>
                    No hay ingredientes todavía.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-6 grid gap-3 lg:hidden">
                    {ingredientesFiltrados.map((item) => {
                      const costeUtilUnidad = calcularCosteUtilPorUnidad(item);
                      const deleting = deletingId === item.id;

                      return (
                        <div
                          key={item.id}
                          className={clsx(
                            "rounded-3xl border p-4 shadow-sm",
                            dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className={`truncate text-base font-bold ${strongTextClass}`}>
                                {item.nombre}
                              </h3>
                              <p className={`mt-1 text-xs font-medium ${mutedTextClass}`}>
                                Unidad: {item.unidad}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => borrarIngrediente(item.id)}
                              disabled={deleting}
                              className={dangerButtonClass}
                            >
                              <Trash2 size={14} />
                              {deleting ? "Borrando..." : "Borrar"}
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <div className={softCardClass + " p-3"}>
                              <p className={`text-xs font-semibold ${mutedTextClass}`}>Compra</p>
                              <p className={`mt-1 text-sm font-bold ${strongTextClass}`}>
                                {formatEuro(toNumber(item.coste_compra))}
                              </p>
                            </div>

                            <div className={softCardClass + " p-3"}>
                              <p className={`text-xs font-semibold ${mutedTextClass}`}>Cantidad</p>
                              <p className={`mt-1 text-sm font-bold ${strongTextClass}`}>
                                {formatNumber(toNumber(item.cantidad_compra), 3)} {item.unidad}
                              </p>
                            </div>

                            <div className={softCardClass + " p-3"}>
                              <p className={`text-xs font-semibold ${mutedTextClass}`}>Merma</p>
                              <p className={`mt-1 text-sm font-bold ${strongTextClass}`}>
                                {formatNumber(toNumber(item.merma_pct), 2)}%
                              </p>
                            </div>

                            <div className={softCardClass + " p-3"}>
                              <p className={`text-xs font-semibold ${mutedTextClass}`}>Coste útil</p>
                              <p className={`mt-1 text-sm font-bold ${strongTextClass}`}>
                                {costeUtilUnidad > 0 ? `${formatEuro(costeUtilUnidad)} / ${item.unidad}` : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 hidden overflow-x-auto lg:block">
                    <table className="min-w-full border-separate border-spacing-y-2">
                    <thead>
                      <tr>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Nombre
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Unidad
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Coste compra
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Cantidad
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Merma
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Coste útil / unidad
                        </th>
                        <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${mutedTextClass}`}>
                          Acciones
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {ingredientesFiltrados.map((item) => {
                        const costeUtilUnidad = calcularCosteUtilPorUnidad(item);

                        return (
                          <tr key={item.id} className={tableRowClass}>
                            <td className={`rounded-l-2xl px-4 py-4 font-medium ${strongTextClass}`}>
                              {item.nombre}
                            </td>

                            <td className={`px-4 py-4 text-sm ${textClass}`}>
                              {item.unidad}
                            </td>

                            <td className={`px-4 py-4 text-sm ${textClass}`}>
                              {formatEuro(toNumber(item.coste_compra))}
                            </td>

                            <td className={`px-4 py-4 text-sm ${textClass}`}>
                              {formatNumber(toNumber(item.cantidad_compra), 3)}
                            </td>

                            <td className={`px-4 py-4 text-sm ${textClass}`}>
                              {formatNumber(toNumber(item.merma_pct), 2)}%
                            </td>

                            <td className={`px-4 py-4 text-sm ${textClass}`}>
                              {costeUtilUnidad > 0
                                ? `${formatEuro(costeUtilUnidad)} / ${item.unidad}`
                                : "—"}
                            </td>

                            <td className="rounded-r-2xl px-4 py-4">
                              <button
                                type="button"
                                onClick={() => borrarIngrediente(item.id)}
                                disabled={deletingId === item.id}
                                className={dangerButtonClass}
                              >
                                <Trash2 size={14} />
                                {deletingId === item.id ? "Borrando..." : "Borrar"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}