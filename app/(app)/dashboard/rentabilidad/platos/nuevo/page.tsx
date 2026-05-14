"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChefHat,
  Plus,
  Save,
  Euro,
  Package,
} from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";
import { useTheme } from "@/app/(app)/components/ThemeProvider";

type RestauranteUsuario = {
  restaurante_id: string;
};

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

function toNumber(value: string): number {
  if (value === "") return 0;
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
      "inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
      dark
        ? "bg-white text-slate-900 hover:bg-slate-200"
        : "bg-slate-900 text-white hover:bg-slate-800"
    ),

    iconBoxClass: clsx(
      "rounded-2xl p-3",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    pillClass: clsx(
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium",
      dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"
    ),

    checkboxBoxClass: clsx(
      "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
      dark
        ? "border-slate-700 bg-slate-950 text-slate-300"
        : "border-slate-200 bg-slate-50 text-slate-700"
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

  const {
    pageClass,
    cardClass,
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

  const crearPlato = async () => {
    setError(null);

    const nombreLimpio = nombre.trim();
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

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      setError("No se pudo obtener el usuario autenticado.");
      setSaving(false);
      return;
    }

    const { data: restauranteData, error: restauranteError } = await supabase
      .from("usuarios_restaurantes")
      .select("restaurante_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (restauranteError || !restauranteData?.restaurante_id) {
      setError("No se pudo obtener el restaurante del usuario.");
      setSaving(false);
      return;
    }

    const restaurante = restauranteData as RestauranteUsuario;

    const payload = {
      restaurante_id: restaurante.restaurante_id,
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
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/rentabilidad/platos"
            className={buttonSecondaryClass}
          >
            <ArrowLeft size={16} />
            Volver a platos
          </Link>
        </div>

        <div className={`${cardClass} p-6`}>
          <div className="flex items-center gap-3">
            <div className={iconBoxClass}>
              <ChefHat size={22} />
            </div>

            <div>
              <div className={pillClass}>
                <Plus size={14} />
                Rentabilidad · Nuevo plato
              </div>

              <h1 className={`mt-3 text-3xl font-bold tracking-tight ${titleClass}`}>
                Crear nuevo plato
              </h1>

              <p className={`mt-2 text-sm leading-6 ${mutedTextClass}`}>
                Primero crea el plato. Después entrarás a su ficha para montar la
                receta e introducir ingredientes.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className={`xl:col-span-2 ${cardClass} p-6`}>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
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
                />
              </div>

              <div>
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
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
                <label className={`mb-2 block text-sm font-medium ${labelClass}`}>
                  Precio de venta (€)
                </label>
                <input
                  type="number"
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
                  <input
                    type="checkbox"
                    checked={activo}
                    onChange={(e) => setActivo(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Plato activo
                </label>
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                {error}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={crearPlato}
                disabled={saving}
                className={buttonPrimaryClass}
              >
                <Save size={16} />
                {saving ? "Guardando..." : "Crear plato y continuar"}
              </button>

              <Link
                href="/dashboard/rentabilidad/platos"
                className={buttonSecondaryClass}
              >
                Cancelar
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`${cardClass} p-5`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm ${mutedTextClass}`}>
                  Vista previa precio
                </p>
                <Euro size={18} className="text-slate-400" />
              </div>
              <p className={`mt-2 text-3xl font-bold ${strongTextClass}`}>
                {formatEuro(precioPreview)}
              </p>
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <Package size={18} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${strongTextClass}`}>
                    Qué pasará después
                  </p>
                  <p className={`mt-1 text-sm ${textClass}`}>
                    Al crear el plato entrarás a su ficha para añadir ingredientes,
                    ajustar cantidades y calcular el coste real.
                  </p>
                </div>
              </div>
            </div>

            <div className={`${cardClass} p-5`}>
              <div className="flex items-start gap-3">
                <div className={iconBoxClass}>
                  <ChefHat size={18} />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${strongTextClass}`}>
                    Recomendación
                  </p>
                  <p className={`mt-1 text-sm ${textClass}`}>
                    Pon primero el precio de venta real. Luego ya afinas la receta
                    para ver margen y beneficio.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}