"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChefHat,
  Package,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  CircleDollarSign,
  Percent,
  Euro,
  PencilLine,
  TriangleAlert,
} from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";

type Plato = {
  id: string;
  restaurante_id: string;
  nombre: string;
  categoria: string | null;
  precio_venta: number | string;
  activo: boolean;
};

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

type PlatoIngrediente = {
  id: string;
  plato_id: string;
  ingrediente_id: string;
  cantidad_usada: number | string;
};

type RentabilidadRow = {
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

const UNIDADES = ["g", "kg", "ml", "l", "ud"];

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

function formatNumber(value: number, decimals = 3): string {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function calcularCantidadUtil(cantidadCompra: number, mermaPct: number): number {
  if (cantidadCompra <= 0) return 0;
  const factor = 1 - mermaPct / 100;
  return factor > 0 ? cantidadCompra * factor : 0;
}

function calcularCosteUtilPorUnidad(ingrediente: Ingrediente | null | undefined): number {
  if (!ingrediente) return 0;

  const costeCompra = toNumber(ingrediente.coste_compra);
  const cantidadCompra = toNumber(ingrediente.cantidad_compra);
  const mermaPct = toNumber(ingrediente.merma_pct);

  const cantidadUtil = calcularCantidadUtil(cantidadCompra, mermaPct);
  if (costeCompra <= 0 || cantidadUtil <= 0) return 0;

  return costeCompra / cantidadUtil;
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

function getEstadoClass(estado: EstadoMargen): string {
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

function getMensajeMargen(estado: EstadoMargen): string {
  if (estado === "alto") return "Plato rentable. Conviene potenciarlo.";
  if (estado === "medio") return "Margen aceptable. Vigílalo.";
  if (estado === "bajo") return "Margen bajo. Revisa coste o precio.";
  return "Plato en pérdidas. Revisión urgente.";
}

const cardClass =
  "rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";
const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500";
const buttonSecondaryClass =
  "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800";

export default function PlatoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const platoId = String(params.id ?? "");

  const [plato, setPlato] = useState<Plato | null>(null);
  const [ingredientes, setIngredientes] = useState<Ingrediente[]>([]);
  const [relaciones, setRelaciones] = useState<PlatoIngrediente[]>([]);
  const [rentabilidad, setRentabilidad] = useState<RentabilidadRow | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingPlato, setSavingPlato] = useState(false);
  const [savingRelacion, setSavingRelacion] = useState(false);
  const [creatingIngrediente, setCreatingIngrediente] = useState(false);
  const [savingCantidadId, setSavingCantidadId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [activo, setActivo] = useState(true);

  const [ingredienteSeleccionado, setIngredienteSeleccionado] = useState("");
  const [cantidadUsada, setCantidadUsada] = useState("");

  const [mostrarNuevoIngrediente, setMostrarNuevoIngrediente] = useState(false);
  const [nuevoIngrediente, setNuevoIngrediente] = useState({
    nombre: "",
    unidad: "g",
    coste_compra: "",
    cantidad_compra: "",
    merma_pct: "",
  });

  const [cantidadesEditables, setCantidadesEditables] = useState<Record<string, string>>({});

  const clearMessages = () => {
    if (error) setError(null);
    if (okMessage) setOkMessage(null);
  };

  const cargarDatos = async () => {
    if (!platoId) return;

    setLoading(true);
    setError(null);

    const [platoRes, ingredientesRes, relacionesRes, rentabilidadRes] =
      await Promise.all([
        supabase.from("platos").select("*").eq("id", platoId).single(),
        supabase.from("ingredientes").select("*").order("nombre", { ascending: true }),
        supabase.from("plato_ingredientes").select("*").eq("plato_id", platoId),
        supabase.from("vw_rentabilidad_platos").select("*").eq("id", platoId).maybeSingle(),
      ]);

    if (platoRes.error) {
      setError(platoRes.error.message);
      setLoading(false);
      return;
    }

    const platoData = platoRes.data as Plato;
    setPlato(platoData);
    setNombre(platoData.nombre ?? "");
    setCategoria(platoData.categoria ?? "");
    setPrecioVenta(String(toNumber(platoData.precio_venta)));
    setActivo(Boolean(platoData.activo));

    if (ingredientesRes.error) {
      setError(ingredientesRes.error.message);
      setIngredientes([]);
    } else {
      setIngredientes((ingredientesRes.data as Ingrediente[]) ?? []);
    }

    if (relacionesRes.error) {
      setError(relacionesRes.error.message);
      setRelaciones([]);
      setCantidadesEditables({});
    } else {
      const relacionesData = (relacionesRes.data as PlatoIngrediente[]) ?? [];
      setRelaciones(relacionesData);

      const cantidades: Record<string, string> = {};
      for (const rel of relacionesData) {
        cantidades[rel.id] = String(toNumber(rel.cantidad_usada));
      }
      setCantidadesEditables(cantidades);
    }

    if (rentabilidadRes.error) {
      setRentabilidad(null);
    } else {
      setRentabilidad((rentabilidadRes.data as RentabilidadRow | null) ?? null);
    }

    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [platoId]);

  const relacionesConIngrediente = useMemo(() => {
    return relaciones.map((rel) => {
      const ingrediente = ingredientes.find((i) => i.id === rel.ingrediente_id) ?? null;
      const costeUnidad = calcularCosteUtilPorUnidad(ingrediente);
      const cantidad = toNumber(rel.cantidad_usada);
      const costeEstimado = costeUnidad * cantidad;

      return {
        ...rel,
        ingrediente,
        costeUnidad,
        costeEstimado,
      };
    });
  }, [relaciones, ingredientes]);

  const ingredientesDisponibles = useMemo(() => {
    const usados = new Set(relaciones.map((r) => r.ingrediente_id));
    return ingredientes.filter((i) => !usados.has(i.id));
  }, [ingredientes, relaciones]);

  const estadoMargen = useMemo<EstadoMargen>(() => {
    return getEstadoMargen(toNumber(rentabilidad?.margen_pct));
  }, [rentabilidad]);

  const previewNuevoIngrediente = useMemo(() => {
    const costeCompra = toNumber(nuevoIngrediente.coste_compra);
    const cantidadCompra = toNumber(nuevoIngrediente.cantidad_compra);
    const mermaPct = toNumber(nuevoIngrediente.merma_pct);

    const cantidadUtil = calcularCantidadUtil(cantidadCompra, mermaPct);
    const costeUtil = cantidadUtil > 0 ? costeCompra / cantidadUtil : 0;

    return {
      cantidadUtil,
      costeUtil,
    };
  }, [nuevoIngrediente]);

  const guardarPlato = async () => {
    if (!plato) return;

    clearMessages();

    if (!nombre.trim()) {
      setError("El nombre del plato es obligatorio.");
      return;
    }

    if (toNumber(precioVenta) <= 0) {
      setError("El precio de venta debe ser mayor que 0.");
      return;
    }

    setSavingPlato(true);

    const { error } = await supabase
      .from("platos")
      .update({
        nombre: nombre.trim(),
        categoria: categoria.trim() || null,
        precio_venta: toNumber(precioVenta),
        activo,
      })
      .eq("id", plato.id);

    if (error) {
      setError(error.message);
      setSavingPlato(false);
      return;
    }

    await cargarDatos();
    setOkMessage("Cambios del plato guardados.");
    setSavingPlato(false);
  };

  const agregarIngrediente = async () => {
    if (!plato) return;

    clearMessages();

    if (!ingredienteSeleccionado) {
      setError("Selecciona un ingrediente.");
      return;
    }

    if (toNumber(cantidadUsada) <= 0) {
      setError("La cantidad usada debe ser mayor que 0.");
      return;
    }

    setSavingRelacion(true);

    const { error } = await supabase.from("plato_ingredientes").insert([
      {
        plato_id: plato.id,
        ingrediente_id: ingredienteSeleccionado,
        cantidad_usada: toNumber(cantidadUsada),
      },
    ]);

    if (error) {
      setError(error.message);
      setSavingRelacion(false);
      return;
    }

    setIngredienteSeleccionado("");
    setCantidadUsada("");
    await cargarDatos();
    setOkMessage("Ingrediente añadido a la receta.");
    setSavingRelacion(false);
  };

  const guardarCantidadRelacion = async (relacionId: string) => {
    clearMessages();

    const valor = toNumber(cantidadesEditables[relacionId]);
    if (valor <= 0) {
      setError("La cantidad usada debe ser mayor que 0.");
      return;
    }

    setSavingCantidadId(relacionId);

    const { error } = await supabase
      .from("plato_ingredientes")
      .update({ cantidad_usada: valor })
      .eq("id", relacionId);

    if (error) {
      setError(error.message);
      setSavingCantidadId(null);
      return;
    }

    await cargarDatos();
    setOkMessage("Cantidad actualizada.");
    setSavingCantidadId(null);
  };

  const borrarRelacion = async (id: string) => {
    const ok = window.confirm("¿Seguro que quieres quitar este ingrediente del plato?");
    if (!ok) return;

    clearMessages();

    const { error } = await supabase
      .from("plato_ingredientes")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message);
      return;
    }

    await cargarDatos();
    setOkMessage("Ingrediente quitado de la receta.");
  };

  const crearIngredienteRapido = async () => {
    if (!plato) return;

    clearMessages();

    const nombreIngrediente = nuevoIngrediente.nombre.trim();
    const costeCompra = toNumber(nuevoIngrediente.coste_compra);
    const cantidadCompra = toNumber(nuevoIngrediente.cantidad_compra);
    const mermaPct = toNumber(nuevoIngrediente.merma_pct);

    if (!nombreIngrediente) {
      setError("El nombre del ingrediente es obligatorio.");
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

    if (calcularCantidadUtil(cantidadCompra, mermaPct) <= 0) {
      setError("La cantidad útil del ingrediente debe ser mayor que 0.");
      return;
    }

    setCreatingIngrediente(true);

    const { data, error } = await supabase
      .from("ingredientes")
      .insert([
        {
          restaurante_id: plato.restaurante_id,
          nombre: nombreIngrediente,
          unidad: nuevoIngrediente.unidad,
          coste_compra: costeCompra,
          cantidad_compra: cantidadCompra,
          merma_pct: mermaPct,
          activo: true,
        },
      ])
      .select("*")
      .single();

    if (error) {
      setError(error.message);
      setCreatingIngrediente(false);
      return;
    }

    setNuevoIngrediente({
      nombre: "",
      unidad: "g",
      coste_compra: "",
      cantidad_compra: "",
      merma_pct: "",
    });
    setMostrarNuevoIngrediente(false);

    await cargarDatos();

    if (data?.id) {
      setIngredienteSeleccionado(data.id);
    }

    setOkMessage("Ingrediente creado. Ya puedes añadirlo a la receta.");
    setCreatingIngrediente(false);
  };

  const borrarPlato = async () => {
    if (!plato) return;

    const ok = window.confirm("¿Seguro que quieres borrar este plato?");
    if (!ok) return;

    clearMessages();

    const { error } = await supabase.from("platos").delete().eq("id", plato.id);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/dashboard/rentabilidad/platos");
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/rentabilidad/platos"
            className={buttonSecondaryClass}
          >
            <ArrowLeft size={16} />
            Volver a platos
          </Link>

          <Link
            href="/dashboard/rentabilidad"
            className={buttonSecondaryClass}
          >
            Rentabilidad
          </Link>

          <button
            onClick={cargarDatos}
            disabled={loading}
            className={buttonSecondaryClass}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {loading ? "Recargando..." : "Recargar"}
          </button>
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

        {loading ? (
          <div className={`${cardClass} p-8 text-sm text-slate-500 dark:text-slate-400`}>
            Cargando plato...
          </div>
        ) : !plato ? (
          <div className={`${cardClass} p-8 text-sm text-slate-500 dark:text-slate-400`}>
            No se encontró el plato.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className={`xl:col-span-2 ${cardClass} p-6`}>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ChefHat size={22} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                      Editar plato
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Aquí cambias lo básico del plato.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Nombre del plato
                    </label>
                    <input
                      type="text"
                      value={nombre}
                      onChange={(e) => {
                        setNombre(e.target.value);
                        clearMessages();
                      }}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Categoría
                    </label>
                    <input
                      type="text"
                      value={categoria}
                      onChange={(e) => {
                        setCategoria(e.target.value);
                        clearMessages();
                      }}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                      Precio de venta (€)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={precioVenta}
                      onChange={(e) => {
                        setPrecioVenta(e.target.value);
                        clearMessages();
                      }}
                      className={inputClass}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={activo}
                        onChange={(e) => {
                          setActivo(e.target.checked);
                          clearMessages();
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Plato activo
                    </label>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    onClick={guardarPlato}
                    disabled={savingPlato}
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                  >
                    <Save size={16} />
                    {savingPlato ? "Guardando..." : "Guardar cambios"}
                  </button>

                  <button
                    onClick={borrarPlato}
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-5 py-3 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/20 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                  >
                    <Trash2 size={16} />
                    Borrar plato
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className={`${cardClass} p-5`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Coste total
                    </p>
                    <Euro size={18} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {formatEuro(toNumber(rentabilidad?.coste_total))}
                  </p>
                </div>

                <div className={`${cardClass} p-5`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Beneficio
                    </p>
                    <CircleDollarSign size={18} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {formatEuro(toNumber(rentabilidad?.beneficio_eur))}
                  </p>
                </div>

                <div className={`${cardClass} p-5`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Margen
                    </p>
                    <Percent size={18} className="text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {formatPercent(toNumber(rentabilidad?.margen_pct))}
                  </p>
                  <div className="mt-3">
                    <span className={getEstadoClass(estadoMargen)}>
                      {getEstadoLabel(estadoMargen)}
                    </span>
                  </div>
                </div>

                <div className={`${cardClass} p-5`}>
                  <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-amber-100 p-3 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                      <TriangleAlert size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Lectura rápida
                      </p>
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                        {getMensajeMargen(estadoMargen)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="xl:col-span-1 space-y-6">
                <div className={`${cardClass} p-6`}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Plus size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                        Añadir a la receta
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Selecciona ingrediente y cantidad.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Ingrediente
                      </label>
                      <select
                        value={ingredienteSeleccionado}
                        onChange={(e) => {
                          setIngredienteSeleccionado(e.target.value);
                          clearMessages();
                        }}
                        className={inputClass}
                      >
                        <option value="">Selecciona un ingrediente</option>
                        {ingredientesDisponibles.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre} ({item.unidad})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                        Cantidad usada
                      </label>
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={cantidadUsada}
                        onChange={(e) => {
                          setCantidadUsada(e.target.value);
                          clearMessages();
                        }}
                        placeholder="Ej. 180"
                        className={inputClass}
                      />
                    </div>

                    <button
                      onClick={agregarIngrediente}
                      disabled={savingRelacion}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      <Package size={16} />
                      {savingRelacion ? "Añadiendo..." : "Añadir ingrediente"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMostrarNuevoIngrediente((v) => !v);
                        clearMessages();
                      }}
                      className={buttonSecondaryClass + " w-full justify-center"}
                    >
                      <Plus size={16} />
                      {mostrarNuevoIngrediente ? "Ocultar creación rápida" : "Nuevo ingrediente rápido"}
                    </button>

                    <Link
                      href="/dashboard/rentabilidad/ingredientes"
                      className={buttonSecondaryClass + " w-full justify-center"}
                    >
                      Gestionar ingredientes
                    </Link>
                  </div>
                </div>

                {mostrarNuevoIngrediente && (
                  <div className={`${cardClass} p-6`}>
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <Package size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                          Nuevo ingrediente rápido
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Créalo aquí sin salir de este plato.
                        </p>
                      </div>
                    </div>

                    <div className="mt-6 space-y-4">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Nombre
                        </label>
                        <input
                          type="text"
                          value={nuevoIngrediente.nombre}
                          onChange={(e) =>
                            setNuevoIngrediente((prev) => ({
                              ...prev,
                              nombre: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Unidad
                        </label>
                        <select
                          value={nuevoIngrediente.unidad}
                          onChange={(e) =>
                            setNuevoIngrediente((prev) => ({
                              ...prev,
                              unidad: e.target.value,
                            }))
                          }
                          className={inputClass}
                        >
                          {UNIDADES.map((unidad) => (
                            <option key={unidad} value={unidad}>
                              {unidad}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Coste compra (€)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={nuevoIngrediente.coste_compra}
                            onChange={(e) =>
                              setNuevoIngrediente((prev) => ({
                                ...prev,
                                coste_compra: e.target.value,
                              }))
                            }
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Cantidad comprada
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            value={nuevoIngrediente.cantidad_compra}
                            onChange={(e) =>
                              setNuevoIngrediente((prev) => ({
                                ...prev,
                                cantidad_compra: e.target.value,
                              }))
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                          Merma (%)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={nuevoIngrediente.merma_pct}
                          onChange={(e) =>
                            setNuevoIngrediente((prev) => ({
                              ...prev,
                              merma_pct: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>

                      {toNumber(nuevoIngrediente.coste_compra) > 0 &&
                        toNumber(nuevoIngrediente.cantidad_compra) > 0 && (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-950">
                            <p className="font-medium text-slate-900 dark:text-white">
                              Vista previa
                            </p>
                            <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-400">
                              <p>
                                Cantidad útil:{" "}
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {formatNumber(previewNuevoIngrediente.cantidadUtil)} {nuevoIngrediente.unidad}
                                </span>
                              </p>
                              <p>
                                Coste útil por unidad:{" "}
                                <span className="font-medium text-slate-900 dark:text-white">
                                  {formatEuro(previewNuevoIngrediente.costeUtil)} / {nuevoIngrediente.unidad}
                                </span>
                              </p>
                            </div>
                          </div>
                        )}

                      <button
                        onClick={crearIngredienteRapido}
                        disabled={creatingIngrediente}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                      >
                        {creatingIngrediente ? "Creando..." : "Crear ingrediente"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="xl:col-span-2">
                <div className={`${cardClass} p-6`}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Package size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                        Receta del plato
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Aquí cambias cantidades rápido, sin borrar nada.
                      </p>
                    </div>
                  </div>

                  {relacionesConIngrediente.length === 0 ? (
                    <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-8 dark:border-slate-800 dark:bg-slate-950">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Este plato todavía no tiene ingredientes asignados.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-6 overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-y-2">
                        <thead>
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Ingrediente
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Unidad
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Coste útil / unidad
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Cantidad usada
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Coste estimado
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Guardar
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              Quitar
                            </th>
                          </tr>
                        </thead>

                        <tbody>
                          {relacionesConIngrediente.map((item) => (
                            <tr
                              key={item.id}
                              className="rounded-2xl bg-slate-50 shadow-sm transition hover:bg-slate-100 dark:bg-slate-950 dark:hover:bg-slate-800"
                            >
                              <td className="rounded-l-2xl px-4 py-4 font-medium text-slate-900 dark:text-white">
                                {item.ingrediente?.nombre ?? "Ingrediente"}
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                                {item.ingrediente?.unidad ?? "-"}
                              </td>

                              <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                                {item.costeUnidad > 0
                                  ? `${formatEuro(item.costeUnidad)} / ${item.ingrediente?.unidad ?? ""}`
                                  : "—"}
                              </td>

                              <td className="px-4 py-4">
                                <input
                                  type="number"
                                  step="0.001"
                                  min="0"
                                  value={cantidadesEditables[item.id] ?? ""}
                                  onChange={(e) => {
                                    setCantidadesEditables((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.value,
                                    }));
                                    clearMessages();
                                  }}
                                  className="w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-slate-500"
                                />
                              </td>

                              <td className="px-4 py-4 text-sm font-medium text-slate-900 dark:text-white">
                                {formatEuro(item.costeEstimado)}
                              </td>

                              <td className="px-4 py-4">
                                <button
                                  onClick={() => guardarCantidadRelacion(item.id)}
                                  disabled={savingCantidadId === item.id}
                                  className={buttonSecondaryClass}
                                >
                                  <PencilLine size={14} />
                                  {savingCantidadId === item.id ? "Guardando..." : "Guardar"}
                                </button>
                              </td>

                              <td className="rounded-r-2xl px-4 py-4">
                                <button
                                  onClick={() => borrarRelacion(item.id)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-500/20 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-500/10"
                                >
                                  <Trash2 size={14} />
                                  Quitar
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}