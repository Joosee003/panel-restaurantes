"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChefHat,
  CheckCircle2,
  Euro,
  Info,
  Package,
  Plus,
  Save,
  Sparkles,
  XCircle,
} from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";
import { useRestaurante } from "../../../../../hooks/useRestaurante";


function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function toNumber(value: string): number {
  if (value === "") return 0;
  const normalized = value.replace(",", ".");
  const n = Number(normalized);
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
      "rounded-3xl border transition-colors",
      dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"
    ),

    inputClass: clsx(
      "w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition",
      dark
        ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-400"
        : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"
    ),

    buttonSecondaryClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
    ),

    buttonPrimaryClass: clsx(
      "inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "bg-white text-slate-900 hover:bg-slate-200"
        : "bg-slate-950 text-white hover:bg-slate-800"
    ),

    iconBoxClass: clsx(
      "rounded-2xl p-3",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    pillClass: clsx(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    checkboxBoxClass: clsx(
      "flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-4 py-4 text-sm transition-colors active:scale-[0.99]",
      dark
        ? "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-900"
        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
    ),

    titleClass: dark ? "text-white" : "text-slate-900",
    textClass: dark ? "text-slate-300" : "text-slate-600",
    mutedTextClass: dark ? "text-slate-400" : "text-slate-500",
    labelClass: dark ? "text-slate-300" : "text-slate-700",
    strongTextClass: dark ? "text-white" : "text-slate-900",
  };
}

export default function NuevoPlatoPage() {
  const router = useRouter();
  const { dark } = useTheme();
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;

  const {
    pageClass,
    cardClass,
    softCardClass,
    inputClass,
    buttonSecondaryClass,
    buttonPrimaryClass,
    iconBoxClass,
    pillClass,
    checkboxBoxClass,
    titleClass,
    textClass,
    mutedTextClass,
    labelClass,
    strongTextClass,
  } = getThemeClasses(dark);

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [activo, setActivo] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const precioPreview = useMemo(() => toNumber(precioVenta), [precioVenta]);
  const nombreLimpio = nombre.trim();
  const puedeCrear = Boolean(nombreLimpio) && precioPreview > 0 && !saving;

  const crearPlato = async () => {
    setError(null);

    const categoriaLimpia = categoria.trim();
    const precio = toNumber(precioVenta);

    if (!nombreLimpio) {
      setError("El nombre del plato es obligatorio.");
      return;
    }

    if (precio <= 0) {
      setError("El precio de venta debe ser mayor que 0.");
      return;
    }

    setSaving(true);

    if (loadingRestaurante) {
      setError("Cargando restaurante activo. Prueba de nuevo en un segundo.");
      setSaving(false);
      return;
    }

    if (!restauranteId) {
      setError('No se encontró restaurante activo. Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.');
      setSaving(false);
      return;
    }

    const payload = {
      restaurante_id: restauranteId,
      nombre: nombreLimpio,
      categoria: categoriaLimpia || null,
      precio_venta: precio,
      activo,
    };

    const { data, error } = await supabase
      .from("platos")
      .insert([payload])
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push(`/dashboard/rentabilidad/platos/${data.id}`);
  };

  return (
    <div className={pageClass}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/dashboard/rentabilidad/platos" className={buttonSecondaryClass}>
            <ArrowLeft size={16} />
            Volver a platos
          </Link>

          <Link href="/dashboard/rentabilidad" className={buttonSecondaryClass}>
            Rentabilidad
          </Link>
        </div>

        <div className={clsx(cardClass, "overflow-hidden")}> 
          <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="p-6 sm:p-8">
              <div className={pillClass}>
                <Plus size={14} />
                Nuevo plato
              </div>

              <h1 className={clsx("mt-4 text-3xl font-black tracking-tight sm:text-4xl", titleClass)}>
                Crear plato para calcular rentabilidad
              </h1>

              <p className={clsx("mt-3 max-w-2xl text-sm font-medium leading-6 sm:text-base", mutedTextClass)}>
                Primero crea el plato con su precio de venta. Después entrarás a su ficha para añadir ingredientes, cantidades, coste, margen y beneficio.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className={clsx(softCardClass, "p-4")}>
                  <div className={clsx("text-xs font-black uppercase tracking-[0.14em]", mutedTextClass)}>Paso 1</div>
                  <div className={clsx("mt-1 text-sm font-black", strongTextClass)}>Crear plato</div>
                </div>
                <div className={clsx(softCardClass, "p-4")}>
                  <div className={clsx("text-xs font-black uppercase tracking-[0.14em]", mutedTextClass)}>Paso 2</div>
                  <div className={clsx("mt-1 text-sm font-black", strongTextClass)}>Añadir receta</div>
                </div>
                <div className={clsx(softCardClass, "p-4")}>
                  <div className={clsx("text-xs font-black uppercase tracking-[0.14em]", mutedTextClass)}>Paso 3</div>
                  <div className={clsx("mt-1 text-sm font-black", strongTextClass)}>Ver margen</div>
                </div>
              </div>
            </div>

            <div className={clsx("border-t p-6 sm:p-8 lg:border-l lg:border-t-0", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50")}>
              <div className={clsx("rounded-3xl p-5", dark ? "bg-slate-900" : "bg-white")}> 
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className={clsx("text-sm font-bold", mutedTextClass)}>Precio de venta</p>
                    <p className={clsx("mt-1 text-4xl font-black tracking-tight", strongTextClass)}>{formatEuro(precioPreview)}</p>
                  </div>
                  <div className={iconBoxClass}>
                    <Euro size={22} />
                  </div>
                </div>

                <div className={clsx("mt-4 rounded-2xl border p-4", precioPreview > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200")}>
                  <div className="flex items-start gap-2 text-sm font-bold">
                    {precioPreview > 0 ? <CheckCircle2 size={17} /> : <Info size={17} />}
                    <span>{precioPreview > 0 ? "Precio listo para crear el plato." : "Introduce el precio real de carta."}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={clsx("xl:col-span-2", cardClass, "p-6")}> 
            <div className="flex items-start gap-3">
              <div className={iconBoxClass}>
                <ChefHat size={22} />
              </div>
              <div>
                <h2 className={clsx("text-xl font-black", titleClass)}>Datos básicos del plato</h2>
                <p className={clsx("mt-1 text-sm font-medium", mutedTextClass)}>
                  Rellena solo lo necesario para crearlo. La receta se configura en la siguiente pantalla.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={clsx("mb-2 block text-sm font-bold", labelClass)}>
                  Nombre del plato
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ej. Hamburguesa BBQ"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div>
                <label className={clsx("mb-2 block text-sm font-bold", labelClass)}>
                  Categoría
                </label>
                <input
                  type="text"
                  value={categoria}
                  onChange={(e) => {
                    setCategoria(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ej. Hamburguesas"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={clsx("mb-2 block text-sm font-bold", labelClass)}>
                  Precio de venta (€)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={precioVenta}
                  onChange={(e) => {
                    setPrecioVenta(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Ej. 14.90"
                  className={inputClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className={checkboxBoxClass}>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={(e) => setActivo(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div>
                      <div className={clsx("font-black", strongTextClass)}>Plato activo</div>
                      <div className={clsx("text-xs font-semibold", mutedTextClass)}>
                        Si está activo, aparecerá como plato disponible dentro del módulo de rentabilidad.
                      </div>
                    </div>
                  </div>
                  <span className={clsx("rounded-full px-2.5 py-1 text-xs font-black", activo ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300")}>
                    {activo ? "Activo" : "Oculto"}
                  </span>
                </label>
              </div>
            </div>

            {error ? (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                <div className="flex items-start gap-2">
                  <XCircle size={18} />
                  <span>{error}</span>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={crearPlato}
                disabled={!puedeCrear}
                className={clsx(buttonPrimaryClass, "w-full sm:w-auto")}
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-slate-500 dark:border-t-slate-950" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Creando plato..." : "Crear plato y añadir receta"}
              </button>

              <Link href="/dashboard/rentabilidad/platos" className={clsx(buttonSecondaryClass, "w-full sm:w-auto")}>
                Cancelar
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className={clsx(cardClass, "p-5")}> 
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <Package size={18} />
                </div>
                <div>
                  <p className={clsx("text-sm font-black", strongTextClass)}>
                    Después de crear
                  </p>
                  <p className={clsx("mt-1 text-sm leading-6", textClass)}>
                    Irás a la ficha del plato para añadir ingredientes, cantidades usadas y calcular coste real.
                  </p>
                </div>
              </div>
            </div>

            <div className={clsx(cardClass, "p-5")}> 
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className={clsx("text-sm font-black", strongTextClass)}>
                    Consejo rápido
                  </p>
                  <p className={clsx("mt-1 text-sm leading-6", textClass)}>
                    Usa el precio real de la carta. Si luego el margen sale bajo, podrás ajustar precio o receta desde la ficha.
                  </p>
                </div>
              </div>
            </div>

            <div className={clsx(cardClass, "p-5")}> 
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <ChefHat size={18} />
                </div>
                <div>
                  <p className={clsx("text-sm font-black", strongTextClass)}>
                    Campos necesarios
                  </p>
                  <div className={clsx("mt-3 space-y-2 text-sm font-semibold", textClass)}>
                    <div className="flex items-center gap-2"><CheckCircle2 size={16} /> Nombre</div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={16} /> Precio de venta</div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={16} /> Receta después</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
