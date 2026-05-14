"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useTheme } from "../components/ThemeProvider";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Building2,
  Users,
  MessageSquare,
  CalendarDays,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Euro,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

type RowReservas = {
  restaurante_id: string;
  restaurante_nombre: string | null;
  reservas_mes_actual: number | string | null;
  reservas_mes_anterior: number | string | null;
  diferencia?: number | string | null;
  variacion_pct?: number | string | null;
};

type RowClientes = {
  restaurante_id: string;
  restaurante_nombre: string | null;
  clientes_nuevos_mes_actual: number | string | null;
  clientes_nuevos_mes_anterior: number | string | null;
  diferencia?: number | string | null;
  variacion_pct?: number | string | null;
};

type RowResenas = {
  restaurante_id: string;
  restaurante_nombre: string | null;
  resenas_nuevas_mes_actual: number | string | null;
  resenas_nuevas_mes_anterior: number | string | null;
  diferencia?: number | string | null;
  variacion_pct?: number | string | null;
};

type RowUI = {
  restaurante_id: string;
  restaurante_nombre: string | null;

  reservas_mes_actual: number;
  reservas_mes_anterior: number;
  reservas_diferencia: number;
  reservas_variacion_pct: number;

  clientes_nuevos_mes_actual: number;
  clientes_nuevos_mes_anterior: number;
  clientes_nuevos_diferencia: number;
  clientes_nuevos_variacion_pct: number;

  resenas_nuevas_mes_actual: number;
  resenas_nuevas_mes_anterior: number;
  resenas_nuevas_diferencia: number;
  resenas_nuevas_variacion_pct: number;
};

type VentaPlato = {
  id: string;
  restaurante_id: string;
  plato_id: string;
  fecha: string;
  cantidad: number | string;
  ingreso_total: number | string | null;
  coste_total: number | string | null;
  beneficio_total: number | string | null;
  platos?: {
    nombre: string | null;
    categoria: string | null;
  } | null;
};

function clsx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

const fmtInt = (n: number) => new Intl.NumberFormat("es-ES").format(n);

const fmtPct = (n: number) =>
  `${Number.isFinite(n) ? n.toFixed(2) : "0.00"}%`;

const fmtEuro = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(n) ? n : 0);

function toNum(v: unknown) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
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

function metricDelta(actual: number, anterior: number) {
  const diferencia = actual - anterior;
  let variacion = 0;

  if (anterior === 0 && actual > 0) variacion = 100;
  else if (anterior === 0 && actual === 0) variacion = 0;
  else variacion = Number((((actual - anterior) / anterior) * 100).toFixed(2));

  return { diferencia, variacion };
}

function TrendBadge({
  diff,
  dark,
  label,
}: {
  diff: number;
  dark: boolean;
  label?: string;
}) {
  const sube = diff > 0;
  const baja = diff < 0;

  return (
    <div
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        sube
          ? dark
            ? "bg-emerald-500/20 text-emerald-200"
            : "bg-emerald-100 text-emerald-700"
          : baja
          ? dark
            ? "bg-red-500/20 text-red-200"
            : "bg-red-100 text-red-700"
          : dark
          ? "bg-gray-700 text-gray-200"
          : "bg-gray-100 text-gray-700"
      )}
    >
      {sube ? (
        <TrendingUp size={12} />
      ) : baja ? (
        <TrendingDown size={12} />
      ) : (
        <Minus size={12} />
      )}
      <span>
        {sube ? "sube" : baja ? "baja" : "igual"}
        {label ? ` · ${label}` : ""}
      </span>
    </div>
  );
}

function KPI({
  dark,
  title,
  value,
  subtitle,
  icon: Icon,
  tone = "default",
}: {
  dark: boolean;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  tone?: "default" | "emerald" | "red" | "blue" | "violet" | "amber";
}) {
  const toneMap: Record<string, string> = {
    default: dark ? "bg-gray-800/60 text-gray-200" : "bg-gray-100 text-gray-700",
    emerald: dark
      ? "bg-emerald-500/15 text-emerald-200"
      : "bg-emerald-100 text-emerald-700",
    red: dark ? "bg-red-500/15 text-red-200" : "bg-red-100 text-red-700",
    blue: dark ? "bg-blue-500/15 text-blue-200" : "bg-blue-100 text-blue-700",
    violet: dark
      ? "bg-violet-500/15 text-violet-200"
      : "bg-violet-100 text-violet-700",
    amber: dark
      ? "bg-amber-500/15 text-amber-200"
      : "bg-amber-100 text-amber-700",
  };

  return (
    <div
      className={clsx(
        "rounded-2xl border p-4 shadow-sm",
        dark ? "border-gray-800 bg-gray-950/40" : "border-gray-200 bg-white"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p
            className={clsx(
              "text-xs uppercase tracking-wider",
              dark ? "text-gray-400" : "text-gray-500"
            )}
          >
            {title}
          </p>
          <p
            className={clsx(
              "mt-1 text-2xl font-extrabold",
              dark ? "text-white" : "text-gray-900"
            )}
          >
            {value}
          </p>
          {subtitle ? (
            <p className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
              {subtitle}
            </p>
          ) : null}
        </div>

        <div className={clsx("flex h-11 w-11 items-center justify-center rounded-xl", toneMap[tone])}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function EstadisticasMensualesPage() {
  const { dark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [row, setRow] = useState<RowUI | null>(null);
  const [ventasPlatos, setVentasPlatos] = useState<VentaPlato[]>([]);

  const cardBase = useMemo(
    () =>
      clsx(
        "rounded-2xl border shadow-sm",
        dark ? "border-gray-800 bg-gray-950/40" : "border-gray-200 bg-white"
      ),
    [dark]
  );

  const btn = useMemo(
    () =>
      clsx(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition",
        dark
          ? "border-gray-700 bg-transparent text-gray-100 hover:bg-gray-900"
          : "border-gray-300 bg-white text-gray-900 hover:bg-gray-50"
      ),
    [dark]
  );

  const pieColors = dark
    ? ["#10b981", "#3b82f6", "#8b5cf6"]
    : ["#059669", "#2563eb", "#7c3aed"];

  const cargar = async () => {
    setLoading(true);
    setErrorMsg(null);

    const rid = await getRestauranteUsuario();
    if (!rid) {
      setErrorMsg("No se encontró el restaurante del usuario.");
      setLoading(false);
      return;
    }

    setRestauranteId(rid);

    const [r1, r2, r3, r4] = await Promise.all([
      supabase
        .from("vw_reservas_comparativa_mensual")
        .select("*")
        .eq("restaurante_id", rid)
        .maybeSingle(),

      supabase
        .from("vw_clientes_nuevos_comparativa_mensual")
        .select("*")
        .eq("restaurante_id", rid)
        .maybeSingle(),

      supabase
        .from("vw_resenas_nuevas_comparativa_mensual")
        .select("*")
        .eq("restaurante_id", rid)
        .maybeSingle(),

      supabase
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
        .eq("restaurante_id", rid),
    ]);

    if (r1.error || r2.error || r3.error || r4.error) {
      setErrorMsg(
        r1.error?.message ||
          r2.error?.message ||
          r3.error?.message ||
          r4.error?.message ||
          "Error cargando estadísticas"
      );
      setLoading(false);
      return;
    }

    setVentasPlatos((r4.data as VentaPlato[]) ?? []);

    const reservas = (r1.data ?? null) as RowReservas | null;
    const clientes = (r2.data ?? null) as RowClientes | null;
    const resenas = (r3.data ?? null) as RowResenas | null;

    const nombre =
      reservas?.restaurante_nombre ||
      clientes?.restaurante_nombre ||
      resenas?.restaurante_nombre ||
      "Restaurante";

    const reservasActual = toNum(reservas?.reservas_mes_actual);
    const reservasAnterior = toNum(reservas?.reservas_mes_anterior);
    const dReservas = metricDelta(reservasActual, reservasAnterior);

    const clientesActual = toNum(clientes?.clientes_nuevos_mes_actual);
    const clientesAnterior = toNum(clientes?.clientes_nuevos_mes_anterior);
    const dClientes = metricDelta(clientesActual, clientesAnterior);

    const resenasActual = toNum(resenas?.resenas_nuevas_mes_actual);
    const resenasAnterior = toNum(resenas?.resenas_nuevas_mes_anterior);
    const dResenas = metricDelta(resenasActual, resenasAnterior);

    setRow({
      restaurante_id: rid,
      restaurante_nombre: nombre,

      reservas_mes_actual: reservasActual,
      reservas_mes_anterior: reservasAnterior,
      reservas_diferencia: dReservas.diferencia,
      reservas_variacion_pct: dReservas.variacion,

      clientes_nuevos_mes_actual: clientesActual,
      clientes_nuevos_mes_anterior: clientesAnterior,
      clientes_nuevos_diferencia: dClientes.diferencia,
      clientes_nuevos_variacion_pct: dClientes.variacion,

      resenas_nuevas_mes_actual: resenasActual,
      resenas_nuevas_mes_anterior: resenasAnterior,
      resenas_nuevas_diferencia: dResenas.diferencia,
      resenas_nuevas_variacion_pct: dResenas.variacion,
    });

    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const chartComparativaGlobal = useMemo(() => {
    if (!row) return [];

    return [
      {
        nombre: "Reservas",
        actual: row.reservas_mes_actual,
        anterior: row.reservas_mes_anterior,
      },
      {
        nombre: "Clientes nuevos",
        actual: row.clientes_nuevos_mes_actual,
        anterior: row.clientes_nuevos_mes_anterior,
      },
      {
        nombre: "Reseñas nuevas",
        actual: row.resenas_nuevas_mes_actual,
        anterior: row.resenas_nuevas_mes_anterior,
      },
    ];
  }, [row]);

  const chartDistribucion = useMemo(() => {
    if (!row) return [];

    return [
      { name: "Reservas", value: row.reservas_mes_actual },
      { name: "Clientes nuevos", value: row.clientes_nuevos_mes_actual },
      { name: "Reseñas nuevas", value: row.resenas_nuevas_mes_actual },
    ].filter((x) => x.value > 0);
  }, [row]);

  const chartRadar = useMemo(() => {
    if (!row) return [];

    return [
      { metric: "Reservas", valor: row.reservas_mes_actual },
      { metric: "Clientes", valor: row.clientes_nuevos_mes_actual },
      { metric: "Reseñas", valor: row.resenas_nuevas_mes_actual },
    ];
  }, [row]);

  const rentabilidadMensual = useMemo(() => {
    const now = new Date();
    const monthStart = getMonthStart(now);
    const nextMonthStart = getNextMonthStart(now);
    const prevMonthStart = getPrevMonthStart(now);

    const ventasMes = ventasPlatos.filter(
      (v) => v.fecha >= monthStart && v.fecha < nextMonthStart
    );

    const ventasMesAnterior = ventasPlatos.filter(
      (v) => v.fecha >= prevMonthStart && v.fecha < monthStart
    );

    const ingresoMes = ventasMes.reduce(
      (acc, v) => acc + toNum(v.ingreso_total),
      0
    );

    const costeMes = ventasMes.reduce(
      (acc, v) => acc + toNum(v.coste_total),
      0
    );

    const beneficioMes = ventasMes.reduce(
      (acc, v) => acc + toNum(v.beneficio_total),
      0
    );

    const beneficioAnterior = ventasMesAnterior.reduce(
      (acc, v) => acc + toNum(v.beneficio_total),
      0
    );

    const unidadesMes = ventasMes.reduce(
      (acc, v) => acc + toNum(v.cantidad),
      0
    );

    const diferenciaBeneficio = beneficioMes - beneficioAnterior;

    const porPlato = new Map<
      string,
      {
        nombre: string;
        categoria: string;
        beneficio: number;
        unidades: number;
      }
    >();

    ventasMes.forEach((v) => {
      const key = v.plato_id;
      const actual = porPlato.get(key) ?? {
        nombre: v.platos?.nombre ?? "Plato eliminado",
        categoria: v.platos?.categoria ?? "Sin categoría",
        beneficio: 0,
        unidades: 0,
      };

      actual.beneficio += toNum(v.beneficio_total);
      actual.unidades += toNum(v.cantidad);

      porPlato.set(key, actual);
    });

    const topPlato =
      Array.from(porPlato.values()).sort((a, b) => b.beneficio - a.beneficio)[0] ??
      null;

    return {
      ingresoMes,
      costeMes,
      beneficioMes,
      beneficioAnterior,
      diferenciaBeneficio,
      unidadesMes,
      topPlato,
    };
  }, [ventasPlatos]);

  if (loading && !row) {
    return <div className="p-4 text-sm">Cargando…</div>;
  }

  return (
    <div className="space-y-5">
      {/* HEADER */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3
              size={20}
              className={dark ? "text-gray-300" : "text-gray-700"}
            />
            <h1
              className={clsx(
                "text-2xl font-extrabold uppercase tracking-wider",
                dark ? "text-white" : "text-gray-900"
              )}
            >
              Estadísticas mensuales
            </h1>
          </div>

          <p className={clsx("mt-1 text-sm", dark ? "text-gray-400" : "text-gray-600")}>
            {row?.restaurante_nombre ?? "Restaurante"} · mes actual vs mes anterior
          </p>

          {restauranteId ? (
            <p className={clsx("mt-1 text-xs", dark ? "text-gray-500" : "text-gray-500")}>
              ID: {restauranteId}
            </p>
          ) : null}
        </div>

        <button className={btn} onClick={cargar} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recargar
        </button>
      </div>

      {errorMsg && (
        <div
          className={clsx(
            "rounded-2xl border p-4 text-sm",
            dark
              ? "border-red-800 bg-red-950/30 text-red-200"
              : "border-red-300 bg-red-50 text-red-700"
          )}
        >
          {errorMsg}
        </div>
      )}

      {!row ? (
        <div className={clsx(cardBase, "p-4 text-sm")}>
          No hay datos para este restaurante.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KPI
              dark={dark}
              title="Restaurante"
              value={row.restaurante_nombre ?? "—"}
              subtitle="Panel actual"
              icon={Building2}
            />

            <KPI
              dark={dark}
              title="Reservas actual"
              value={fmtInt(row.reservas_mes_actual)}
              subtitle={`Ant.: ${fmtInt(row.reservas_mes_anterior)}`}
              icon={CalendarDays}
              tone="emerald"
            />

            <KPI
              dark={dark}
              title="Clientes nuevos"
              value={fmtInt(row.clientes_nuevos_mes_actual)}
              subtitle={`Ant.: ${fmtInt(row.clientes_nuevos_mes_anterior)}`}
              icon={Users}
              tone="blue"
            />

            <KPI
              dark={dark}
              title="Reseñas nuevas"
              value={fmtInt(row.resenas_nuevas_mes_actual)}
              subtitle={`Ant.: ${fmtInt(row.resenas_nuevas_mes_anterior)}`}
              icon={MessageSquare}
              tone="violet"
            />

            <KPI
              dark={dark}
              title="Δ reservas"
              value={`${row.reservas_diferencia > 0 ? "+" : ""}${fmtInt(
                row.reservas_diferencia
              )}`}
              subtitle={fmtPct(row.reservas_variacion_pct)}
              icon={row.reservas_diferencia >= 0 ? ArrowUpRight : ArrowDownRight}
              tone={row.reservas_diferencia >= 0 ? "emerald" : "red"}
            />

            <KPI
              dark={dark}
              title="Tendencia"
              value={
                row.reservas_diferencia > 0
                  ? "Sube"
                  : row.reservas_diferencia < 0
                  ? "Baja"
                  : "Igual"
              }
              subtitle="Según reservas"
              icon={
                row.reservas_diferencia > 0
                  ? TrendingUp
                  : row.reservas_diferencia < 0
                  ? TrendingDown
                  : Minus
              }
              tone={
                row.reservas_diferencia > 0
                  ? "emerald"
                  : row.reservas_diferencia < 0
                  ? "red"
                  : "default"
              }
            />
          </div>

          {/* RENTABILIDAD MENSUAL ESTIMADA */}
          <div className={clsx(cardBase, "p-4 md:p-5")}>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ShoppingCart
                    size={18}
                    className={dark ? "text-emerald-300" : "text-emerald-700"}
                  />
                  <p
                    className={clsx(
                      "text-sm font-semibold",
                      dark ? "text-white" : "text-gray-900"
                    )}
                  >
                    Rentabilidad mensual estimada
                  </p>
                </div>

                <p
                  className={clsx(
                    "mt-1 text-xs",
                    dark ? "text-gray-400" : "text-gray-500"
                  )}
                >
                  Basado en las ventas registradas por plato y el coste de receta guardado.
                </p>
              </div>

              <div
                className={clsx(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                  rentabilidadMensual.diferenciaBeneficio >= 0
                    ? dark
                      ? "bg-emerald-500/20 text-emerald-200"
                      : "bg-emerald-100 text-emerald-700"
                    : dark
                    ? "bg-red-500/20 text-red-200"
                    : "bg-red-100 text-red-700"
                )}
              >
                {rentabilidadMensual.diferenciaBeneficio >= 0 ? (
                  <TrendingUp size={12} />
                ) : (
                  <TrendingDown size={12} />
                )}
                <span>
                  {rentabilidadMensual.diferenciaBeneficio >= 0 ? "+" : ""}
                  {fmtEuro(rentabilidadMensual.diferenciaBeneficio)} vs mes anterior
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <KPI
                dark={dark}
                title="Ingresos estimados"
                value={fmtEuro(rentabilidadMensual.ingresoMes)}
                subtitle="Mes actual"
                icon={Euro}
                tone="emerald"
              />

              <KPI
                dark={dark}
                title="Costes estimados"
                value={fmtEuro(rentabilidadMensual.costeMes)}
                subtitle="Según receta"
                icon={Euro}
                tone="amber"
              />

              <KPI
                dark={dark}
                title="Beneficio estimado"
                value={fmtEuro(rentabilidadMensual.beneficioMes)}
                subtitle="Ingresos - costes"
                icon={TrendingUp}
                tone={rentabilidadMensual.beneficioMes >= 0 ? "emerald" : "red"}
              />

              <KPI
                dark={dark}
                title="Unidades vendidas"
                value={fmtInt(rentabilidadMensual.unidadesMes)}
                subtitle="Registradas este mes"
                icon={ShoppingCart}
                tone="blue"
              />

              <div
                className={clsx(
                  "rounded-2xl border p-4 shadow-sm",
                  dark ? "border-gray-800 bg-gray-950/40" : "border-gray-200 bg-white"
                )}
              >
                <p
                  className={clsx(
                    "text-xs uppercase tracking-wider",
                    dark ? "text-gray-400" : "text-gray-500"
                  )}
                >
                  Top plato por beneficio
                </p>

                <p
                  className={clsx(
                    "mt-1 truncate text-lg font-extrabold",
                    dark ? "text-white" : "text-gray-900"
                  )}
                >
                  {rentabilidadMensual.topPlato?.nombre ?? "Sin datos"}
                </p>

                <p
                  className={clsx(
                    "mt-1 text-xs",
                    dark ? "text-gray-400" : "text-gray-500"
                  )}
                >
                  {rentabilidadMensual.topPlato
                    ? `${fmtEuro(rentabilidadMensual.topPlato.beneficio)} · ${fmtInt(
                        rentabilidadMensual.topPlato.unidades
                      )} uds.`
                    : "Registra ventas para verlo"}
                </p>
              </div>
            </div>
          </div>

          {/* BLOQUES VISUALES */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Reservas
                </p>
                <TrendBadge
                  diff={row.reservas_diferencia}
                  dark={dark}
                  label={fmtPct(row.reservas_variacion_pct)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Actual
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-emerald-600">
                    {fmtInt(row.reservas_mes_actual)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Anterior
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {fmtInt(row.reservas_mes_anterior)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Dif.
                  </p>
                  <p
                    className={clsx(
                      "mt-1 text-xl font-extrabold",
                      row.reservas_diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {row.reservas_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.reservas_diferencia)}
                  </p>
                </div>
              </div>
            </div>

            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Clientes nuevos
                </p>
                <TrendBadge
                  diff={row.clientes_nuevos_diferencia}
                  dark={dark}
                  label={fmtPct(row.clientes_nuevos_variacion_pct)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Actual
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-blue-600">
                    {fmtInt(row.clientes_nuevos_mes_actual)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Anterior
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {fmtInt(row.clientes_nuevos_mes_anterior)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Dif.
                  </p>
                  <p
                    className={clsx(
                      "mt-1 text-xl font-extrabold",
                      row.clientes_nuevos_diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {row.clientes_nuevos_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.clientes_nuevos_diferencia)}
                  </p>
                </div>
              </div>
            </div>

            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3 flex items-center justify-between">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Reseñas nuevas
                </p>
                <TrendBadge
                  diff={row.resenas_nuevas_diferencia}
                  dark={dark}
                  label={fmtPct(row.resenas_nuevas_variacion_pct)}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Actual
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-violet-600">
                    {fmtInt(row.resenas_nuevas_mes_actual)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Anterior
                  </p>
                  <p className="mt-1 text-xl font-extrabold text-red-600">
                    {fmtInt(row.resenas_nuevas_mes_anterior)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Dif.
                  </p>
                  <p
                    className={clsx(
                      "mt-1 text-xl font-extrabold",
                      row.resenas_nuevas_diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {row.resenas_nuevas_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.resenas_nuevas_diferencia)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* GRAFICOS */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Comparativa global
                </p>
                <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  Actual vs anterior
                </p>
              </div>

              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartComparativaGlobal}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={dark ? "#374151" : "#e5e7eb"}
                    />
                    <XAxis
                      dataKey="nombre"
                      stroke={dark ? "#d1d5db" : "#4b5563"}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke={dark ? "#d1d5db" : "#4b5563"}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: dark ? "#111827" : "#ffffff",
                        border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
                        borderRadius: 12,
                        color: dark ? "#fff" : "#111827",
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="anterior"
                      name="Mes anterior"
                      radius={[6, 6, 0, 0]}
                      fill={dark ? "#6b7280" : "#94a3b8"}
                    />
                    <Bar
                      dataKey="actual"
                      name="Mes actual"
                      radius={[6, 6, 0, 0]}
                      fill={dark ? "#10b981" : "#059669"}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Distribución (mes actual)
                </p>
                <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  Reservas / clientes / reseñas
                </p>
              </div>

              {chartDistribucion.length === 0 ? (
                <div
                  className={clsx(
                    "flex h-[320px] items-center justify-center text-sm",
                    dark ? "text-gray-400" : "text-gray-500"
                  )}
                >
                  No hay datos para mostrar
                </div>
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={{
                          background: dark ? "#111827" : "#ffffff",
                          border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
                          borderRadius: 12,
                          color: dark ? "#fff" : "#111827",
                        }}
                      />
                      <Legend />
                      <Pie
                        data={chartDistribucion}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={65}
                        outerRadius={110}
                        paddingAngle={3}
                      >
                        {chartDistribucion.map((_, i) => (
                          <Cell key={i} fill={pieColors[i % pieColors.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className={clsx(cardBase, "p-4 xl:col-span-2")}>
              <div className="mb-3">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Ranking interno de métricas
                </p>
                <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  Comparación de las 3 métricas del restaurante
                </p>
              </div>

              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { nombre: "Reservas", valor: row.reservas_mes_actual },
                      { nombre: "Clientes nuevos", valor: row.clientes_nuevos_mes_actual },
                      { nombre: "Reseñas nuevas", valor: row.resenas_nuevas_mes_actual },
                    ]}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={dark ? "#374151" : "#e5e7eb"}
                    />
                    <XAxis
                      dataKey="nombre"
                      stroke={dark ? "#d1d5db" : "#4b5563"}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis
                      stroke={dark ? "#d1d5db" : "#4b5563"}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: dark ? "#111827" : "#ffffff",
                        border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
                        borderRadius: 12,
                        color: dark ? "#fff" : "#111827",
                      }}
                    />
                    <Bar dataKey="valor" name="Mes actual" radius={[6, 6, 0, 0]}>
                      {[
                        { nombre: "Reservas", valor: row.reservas_mes_actual },
                        { nombre: "Clientes nuevos", valor: row.clientes_nuevos_mes_actual },
                        { nombre: "Reseñas nuevas", valor: row.resenas_nuevas_mes_actual },
                      ].map((entry, index) => {
                        const color =
                          entry.nombre === "Reservas"
                            ? dark
                              ? "#10b981"
                              : "#059669"
                            : entry.nombre === "Clientes nuevos"
                            ? dark
                              ? "#3b82f6"
                              : "#2563eb"
                            : dark
                            ? "#8b5cf6"
                            : "#7c3aed";

                        return <Cell key={`cell-${index}`} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={clsx(cardBase, "p-4")}>
              <div className="mb-3">
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Perfil del restaurante
                </p>
                <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  {row.restaurante_nombre ?? "Restaurante"}
                </p>
              </div>

              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={chartRadar}>
                    <PolarGrid stroke={dark ? "#374151" : "#d1d5db"} />
                    <PolarAngleAxis
                      dataKey="metric"
                      tick={{
                        fill: dark ? "#d1d5db" : "#4b5563",
                        fontSize: 12,
                      }}
                    />
                    <PolarRadiusAxis
                      tick={{
                        fill: dark ? "#9ca3af" : "#6b7280",
                        fontSize: 10,
                      }}
                    />
                    <Radar dataKey="valor" fillOpacity={0.35} />
                    <Tooltip
                      contentStyle={{
                        background: dark ? "#111827" : "#ffffff",
                        border: `1px solid ${dark ? "#374151" : "#e5e7eb"}`,
                        borderRadius: 12,
                        color: dark ? "#fff" : "#111827",
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TARJETA DETALLE */}
          <div className={clsx(cardBase, "p-4 md:p-5")}>
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <p className={clsx("text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                  Detalle del restaurante
                </p>
                <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  Resumen mensual visual
                </p>
              </div>

              <TrendBadge
                diff={row.reservas_diferencia}
                dark={dark}
                label={fmtPct(row.reservas_variacion_pct)}
              />
            </div>

            <div
              className={clsx(
                "max-w-3xl rounded-2xl border p-4 shadow-sm",
                dark ? "border-gray-800 bg-gray-950/30" : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={clsx("truncate text-sm font-semibold", dark ? "text-white" : "text-gray-900")}>
                    {row.restaurante_nombre ?? "Restaurante"}
                  </p>
                  <p className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Resumen mensual
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between">
                  <p
                    className={clsx(
                      "text-xs font-semibold uppercase tracking-wider",
                      dark ? "text-gray-400" : "text-gray-500"
                    )}
                  >
                    Reservas
                  </p>

                  <div
                    className={clsx(
                      "text-xs font-semibold",
                      row.reservas_diferencia >= 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {row.reservas_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.reservas_diferencia)}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                    <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                      Mes actual
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-emerald-600">
                      {fmtInt(row.reservas_mes_actual)}
                    </p>
                  </div>

                  <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                    <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                      Mes anterior
                    </p>
                    <p className="mt-1 text-2xl font-extrabold text-red-600">
                      {fmtInt(row.reservas_mes_anterior)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                      Clientes nuevos
                    </p>

                    {row.clientes_nuevos_diferencia > 0 ? (
                      <TrendingUp size={13} className="text-emerald-600" />
                    ) : row.clientes_nuevos_diferencia < 0 ? (
                      <TrendingDown size={13} className="text-red-600" />
                    ) : (
                      <Minus size={13} className={dark ? "text-gray-400" : "text-gray-500"} />
                    )}
                  </div>

                  <p className="mt-1 text-xl font-extrabold text-blue-600">
                    {fmtInt(row.clientes_nuevos_mes_actual)}
                  </p>

                  <p className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Ant.: {fmtInt(row.clientes_nuevos_mes_anterior)} ·{" "}
                    {row.clientes_nuevos_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.clientes_nuevos_diferencia)}
                  </p>
                </div>

                <div className={clsx("rounded-xl border p-3", dark ? "border-gray-800 bg-gray-900/40" : "border-gray-200 bg-gray-50")}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={clsx("text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                      Reseñas nuevas
                    </p>

                    {row.resenas_nuevas_diferencia > 0 ? (
                      <TrendingUp size={13} className="text-emerald-600" />
                    ) : row.resenas_nuevas_diferencia < 0 ? (
                      <TrendingDown size={13} className="text-red-600" />
                    ) : (
                      <Minus size={13} className={dark ? "text-gray-400" : "text-gray-500"} />
                    )}
                  </div>

                  <p className="mt-1 text-xl font-extrabold text-violet-600">
                    {fmtInt(row.resenas_nuevas_mes_actual)}
                  </p>

                  <p className={clsx("mt-1 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                    Ant.: {fmtInt(row.resenas_nuevas_mes_anterior)} ·{" "}
                    {row.resenas_nuevas_diferencia > 0 ? "+" : ""}
                    {fmtInt(row.resenas_nuevas_diferencia)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <p className={clsx("mb-2 text-xs", dark ? "text-gray-400" : "text-gray-500")}>
                  Actual vs anterior (reservas)
                </p>

                <div
                  className={clsx(
                    "h-2 overflow-hidden rounded-full",
                    dark ? "bg-gray-800" : "bg-gray-200"
                  )}
                >
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${Math.max(
                        row.reservas_mes_actual + row.reservas_mes_anterior === 0
                          ? 0
                          : (row.reservas_mes_actual /
                              (row.reservas_mes_actual + row.reservas_mes_anterior)) *
                              100,
                        row.reservas_mes_actual > 0 ? 4 : 0
                      )}%`,
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={dark ? "text-gray-400" : "text-gray-500"}>
                    Actual: {fmtInt(row.reservas_mes_actual)}
                  </span>
                  <span className={dark ? "text-gray-400" : "text-gray-500"}>
                    Anterior: {fmtInt(row.reservas_mes_anterior)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}