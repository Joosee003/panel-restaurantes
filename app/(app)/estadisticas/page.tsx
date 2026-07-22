"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChefHat,
  Minus,
  RefreshCw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { supabase } from "../lib/supabaseClient";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import { useTheme } from "../components/ThemeProvider";
import { withTimeout } from "../lib/safeQuery";

type ReservaRow = {
  id: string;
  fecha_hora_reserva: string | null;
  estado?: string | null;
  personas?: number | string | null;
};

type ClienteRow = {
  id: string;
  created_at: string | null;
};

type ResenaRow = {
  id: string;
  created_at: string | null;
  responded?: boolean | null;
};

type PedidoQR = {
  id: string;
  mesa?: string | null;
  estado: string | null;
  total: number | string | null;
  created_at: string | null;
};

type CierreMesa = {
  id: string;
  mesa?: string | null;
  total_cobrado: number | string | null;
  metodo_pago: string | null;
  creado_en: string | null;
};

type QueryResult = {
  data?: unknown;
  error?: {
    message?: string;
  } | null;
};

type Metric = {
  id: string;
  label: string;
  value: string;
  previous: string;
  diff: number;
  pct: number;
  icon: ComponentType<{ size?: number; className?: string }>;
  tone: "blue" | "emerald" | "violet" | "amber";
  help: string;
};

function clsx(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function asRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toNum(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(value: number) {
  return new Intl.NumberFormat("es-ES").format(Math.round(value || 0));
}

function fmtEuro(value: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function fmtPct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  const fixed = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? "+" : ""}${fixed}%`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function labelDia(dateText: string) {
  const [, month, day] = dateText.split("-");
  return `${day}/${month}`;
}

function monthRanges(date = new Date()) {
  const startCurrent = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0);
  const startNext = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0);
  const startPrev = new Date(date.getFullYear(), date.getMonth() - 1, 1, 0, 0, 0);

  return {
    startCurrent,
    startNext,
    startPrev,
    startCurrentText: `${formatDate(startCurrent)} 00:00:00`,
    startNextText: `${formatDate(startNext)} 00:00:00`,
    startPrevText: `${formatDate(startPrev)} 00:00:00`,
  };
}

function isBetween(fecha: string | null | undefined, start: Date, end: Date) {
  if (!fecha) return false;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d < end;
}

function dateKey(fecha: string | null | undefined) {
  if (!fecha) return "";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "";
  return formatDate(d);
}

function delta(actual: number, anterior: number) {
  const diff = actual - anterior;
  const pct = anterior === 0 ? (actual > 0 ? 100 : 0) : ((actual - anterior) / anterior) * 100;
  return { diff, pct };
}

function cleanEstado(estado?: string | null) {
  return String(estado || "nuevo")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function statusColor(diff: number, dark: boolean) {
  if (diff > 0) return dark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700";
  if (diff < 0) return dark ? "bg-rose-500/15 text-rose-200" : "bg-rose-50 text-rose-700";
  return dark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-600";
}

function TrendPill({ diff, pct, dark }: { diff: number; pct: number; dark: boolean }) {
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black", statusColor(diff, dark))}>
      <Icon size={13} /> {fmtPct(pct)}
    </span>
  );
}

function KpiCard({ metric, dark }: { metric: Metric; dark: boolean }) {
  const Icon = metric.icon;
  const tones = {
    blue: dark ? "bg-blue-500/15 text-blue-200" : "bg-blue-50 text-blue-700",
    emerald: dark ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-50 text-emerald-700",
    violet: dark ? "bg-violet-500/15 text-violet-200" : "bg-violet-50 text-violet-700",
    amber: dark ? "bg-amber-500/15 text-amber-200" : "bg-amber-50 text-amber-700",
  } as const;

  return (
    <div className={clsx("rounded-3xl border p-5 shadow-sm", dark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-white")}>
      <div className="flex items-start justify-between gap-3">
        <div className={clsx("flex h-12 w-12 items-center justify-center rounded-2xl", tones[metric.tone])}>
          <Icon size={22} />
        </div>
        <TrendPill diff={metric.diff} pct={metric.pct} dark={dark} />
      </div>

      <p className={clsx("mt-5 text-xs font-black uppercase tracking-widest", dark ? "text-slate-400" : "text-slate-500")}>
        {metric.label}
      </p>
      <p className={clsx("mt-2 text-3xl font-black tracking-tight", dark ? "text-white" : "text-slate-950")}>{metric.value}</p>
      <p className={clsx("mt-1 text-sm font-semibold", dark ? "text-slate-400" : "text-slate-500")}>{metric.previous}</p>
      <p className={clsx("mt-4 rounded-2xl px-3 py-2 text-xs font-bold", dark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-600")}>
        {metric.help}
      </p>
    </div>
  );
}

function ChartCard({
  dark,
  title,
  subtitle,
  children,
  className,
}: {
  dark: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("rounded-3xl border p-5 shadow-sm", dark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-white", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className={clsx("text-lg font-black", dark ? "text-white" : "text-slate-950")}>{title}</h2>
          {subtitle && <p className={clsx("mt-1 text-sm font-semibold", dark ? "text-slate-400" : "text-slate-500")}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ dark, text = "Todavía no hay datos suficientes" }: { dark: boolean; text?: string }) {
  return (
    <div className={clsx("flex h-[320px] items-center justify-center rounded-2xl border border-dashed text-sm font-bold", dark ? "border-slate-800 text-slate-500" : "border-slate-200 text-slate-400")}>
      {text}
    </div>
  );
}

export default function EstadisticasPage() {
  const { dark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restauranteNombre, setRestauranteNombre] = useState("Restaurante");

  const [reservas, setReservas] = useState<ReservaRow[]>([]);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [resenas, setResenas] = useState<ResenaRow[]>([]);
  const [pedidos, setPedidos] = useState<PedidoQR[]>([]);
  const [cierres, setCierres] = useState<CierreMesa[]>([]);

  const pageBg = dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-950";
  const chartGrid = dark ? "#1f2937" : "#e2e8f0";
  const chartText = dark ? "#cbd5e1" : "#475569";

  const ranges = useMemo(() => monthRanges(), []);

  const cargar = useCallback(async () => {
    setError(null);
    setRefreshing(true);

    try {
      const rid = await withTimeout(getRestauranteUsuario(), 9000);

      if (!rid) {
        setError("No se ha encontrado restaurante para este usuario.");
        return;
      }

      const [restauranteResult, reservasResult, clientesResult, resenasResult, pedidosResult, cierresResult] = await Promise.allSettled([
        withTimeout(supabase.from("restaurantes").select("nombre").eq("id", rid).maybeSingle(), 9000),
        withTimeout(
          supabase
            .from("reservas")
            .select("id,fecha_hora_reserva,estado,personas")
            .eq("restaurante_id", rid)
            .gte("fecha_hora_reserva", ranges.startPrevText)
            .lt("fecha_hora_reserva", ranges.startNextText)
            .order("fecha_hora_reserva", { ascending: true })
            .range(0, 4999),
          9000
        ),
        withTimeout(
          supabase
            .from("clientes")
            .select("id,created_at")
            .eq("restaurante_id", rid)
            .gte("created_at", ranges.startPrevText)
            .lt("created_at", ranges.startNextText)
            .order("created_at", { ascending: true })
            .range(0, 4999),
          9000
        ),
        withTimeout(
          supabase
            .from("resenas")
            .select("id,created_at,responded")
            .eq("restaurante_id", rid)
            .gte("created_at", ranges.startPrevText)
            .lt("created_at", ranges.startNextText)
            .order("created_at", { ascending: true })
            .range(0, 4999),
          9000
        ),
        withTimeout(
          supabase
            .from("pedidos_qr")
            .select("id,mesa,estado,total,created_at")
            .eq("restaurante_id", rid)
            .gte("created_at", ranges.startPrevText)
            .lt("created_at", ranges.startNextText)
            .order("created_at", { ascending: true })
            .range(0, 4999),
          9000
        ),
        withTimeout(
          supabase
            .from("cierres_mesa_qr")
            .select("id,mesa,total_cobrado,metodo_pago,creado_en")
            .eq("restaurante_id", rid)
            .gte("creado_en", ranges.startPrevText)
            .lt("creado_en", ranges.startNextText)
            .order("creado_en", { ascending: true })
            .range(0, 4999),
          9000
        ),
      ]);

      if (restauranteResult.status === "fulfilled") {
        const value = restauranteResult.value as QueryResult;
        const row = value.data as { nombre?: string | null } | null | undefined;
        if (row?.nombre) setRestauranteNombre(row.nombre);
      }

      const errores: string[] = [];

      if (reservasResult.status === "fulfilled") {
        const value = reservasResult.value as QueryResult;
        if (value.error) errores.push(`Reservas: ${value.error.message || "error"}`);
        else setReservas(asRows<ReservaRow>(value.data));
      }

      if (clientesResult.status === "fulfilled") {
        const value = clientesResult.value as QueryResult;
        if (value.error) errores.push(`Clientes: ${value.error.message || "error"}`);
        else setClientes(asRows<ClienteRow>(value.data));
      }

      if (resenasResult.status === "fulfilled") {
        const value = resenasResult.value as QueryResult;
        if (value.error) errores.push(`Reseñas: ${value.error.message || "error"}`);
        else setResenas(asRows<ResenaRow>(value.data));
      }

      if (pedidosResult.status === "fulfilled") {
        const value = pedidosResult.value as QueryResult;
        if (value.error) errores.push(`Pedidos QR: ${value.error.message || "error"}`);
        else setPedidos(asRows<PedidoQR>(value.data));
      }

      if (cierresResult.status === "fulfilled") {
        const value = cierresResult.value as QueryResult;
        if (value.error) errores.push(`Cierres QR: ${value.error.message || "error"}`);
        else setCierres(asRows<CierreMesa>(value.data));
      }

      if (errores.length > 0) setError(errores.slice(0, 2).join(" · "));
    } catch (err) {
      console.error("ERROR ESTADISTICAS", err);
      setError("No se pudieron cargar las métricas. Revisa conexión, permisos o tablas de Supabase.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ranges.startNextText, ranges.startPrevText]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const data = useMemo(() => {
    const reservasActual = reservas.filter((x) => isBetween(x.fecha_hora_reserva, ranges.startCurrent, ranges.startNext));
    const reservasAnterior = reservas.filter((x) => isBetween(x.fecha_hora_reserva, ranges.startPrev, ranges.startCurrent));
    const clientesActual = clientes.filter((x) => isBetween(x.created_at, ranges.startCurrent, ranges.startNext));
    const clientesAnterior = clientes.filter((x) => isBetween(x.created_at, ranges.startPrev, ranges.startCurrent));
    const resenasActual = resenas.filter((x) => isBetween(x.created_at, ranges.startCurrent, ranges.startNext));
    const resenasAnterior = resenas.filter((x) => isBetween(x.created_at, ranges.startPrev, ranges.startCurrent));
    const pedidosActual = pedidos.filter((x) => isBetween(x.created_at, ranges.startCurrent, ranges.startNext));
    const pedidosAnterior = pedidos.filter((x) => isBetween(x.created_at, ranges.startPrev, ranges.startCurrent));
    const cierresActual = cierres.filter((x) => isBetween(x.creado_en, ranges.startCurrent, ranges.startNext));
    const cierresAnterior = cierres.filter((x) => isBetween(x.creado_en, ranges.startPrev, ranges.startCurrent));

    const facturacionQRActual = cierresActual.reduce((acc, c) => acc + toNum(c.total_cobrado), 0);
    const facturacionQRAnterior = cierresAnterior.reduce((acc, c) => acc + toNum(c.total_cobrado), 0);
    const potencialQRActual = pedidosActual.reduce((acc, p) => acc + toNum(p.total), 0);
    const potencialQRAnterior = pedidosAnterior.reduce((acc, p) => acc + toNum(p.total), 0);
    const pedidosCobrados = cierresActual.length;
    const ticketMedioQR = pedidosCobrados > 0 ? facturacionQRActual / pedidosCobrados : 0;
    const conversionCobro = pedidosActual.length > 0 ? (pedidosCobrados / pedidosActual.length) * 100 : 0;
    const resenasPendientes = resenasActual.filter((r) => r.responded === false).length;
    const personasReservadas = reservasActual.reduce((acc, r) => acc + toNum(r.personas), 0);
    const pedidosAbiertos = pedidosActual.filter((p) => {
      const e = cleanEstado(p.estado);
      return !["servido", "servida", "entregado", "entregada", "cancelado", "cancelada", "cerrado", "cerrada"].includes(e);
    });

    return {
      reservasActual,
      reservasAnterior,
      clientesActual,
      clientesAnterior,
      resenasActual,
      resenasAnterior,
      pedidosActual,
      pedidosAnterior,
      cierresActual,
      cierresAnterior,
      facturacionQRActual,
      facturacionQRAnterior,
      potencialQRActual,
      potencialQRAnterior,
      ticketMedioQR,
      conversionCobro,
      resenasPendientes,
      personasReservadas,
      pedidosAbiertos,
    };
  }, [reservas, clientes, resenas, pedidos, cierres, ranges]);

  const metrics: Metric[] = useMemo(() => {
    const dFacturacion = delta(data.facturacionQRActual, data.facturacionQRAnterior);
    const dPedidos = delta(data.pedidosActual.length, data.pedidosAnterior.length);
    const dReservas = delta(data.reservasActual.length, data.reservasAnterior.length);
    const dClientes = delta(data.clientesActual.length, data.clientesAnterior.length);

    return [
      {
        id: "facturacion",
        label: "Facturación digital",
        value: fmtEuro(data.facturacionQRActual),
        previous: `Mes anterior: ${fmtEuro(data.facturacionQRAnterior)}`,
        diff: dFacturacion.diff,
        pct: dFacturacion.pct,
        icon: Wallet,
        tone: "emerald",
        help: "Dinero cobrado desde mesas cerradas del camarero digital.",
      },
      {
        id: "pedidos",
        label: "Pedidos por QR",
        value: fmtInt(data.pedidosActual.length),
        previous: `Mes anterior: ${fmtInt(data.pedidosAnterior.length)}`,
        diff: dPedidos.diff,
        pct: dPedidos.pct,
        icon: ShoppingCart,
        tone: "blue",
        help: "Comandas que han entrado desde la carta QR.",
      },
      {
        id: "reservas",
        label: "Reservas captadas",
        value: fmtInt(data.reservasActual.length),
        previous: `${fmtInt(data.personasReservadas)} personas reservadas este mes`,
        diff: dReservas.diff,
        pct: dReservas.pct,
        icon: CalendarDays,
        tone: "amber",
        help: "Reservas registradas en el panel durante el mes actual.",
      },
      {
        id: "clientes",
        label: "Clientes nuevos",
        value: fmtInt(data.clientesActual.length),
        previous: `Mes anterior: ${fmtInt(data.clientesAnterior.length)}`,
        diff: dClientes.diff,
        pct: dClientes.pct,
        icon: Users,
        tone: "violet",
        help: "Clientes guardados para poder fidelizar y hacer seguimiento.",
      },
    ];
  }, [data]);

  const impactMoney = useMemo(
    () => [
      { name: "Facturación QR", actual: data.facturacionQRActual, anterior: data.facturacionQRAnterior },
      { name: "Valor pedidos QR", actual: data.potencialQRActual, anterior: data.potencialQRAnterior },
    ],
    [data.facturacionQRActual, data.facturacionQRAnterior, data.potencialQRActual, data.potencialQRAnterior]
  );

  const impactActivity = useMemo(
    () => [
      { name: "Pedidos QR", actual: data.pedidosActual.length, anterior: data.pedidosAnterior.length },
      { name: "Mesas cerradas", actual: data.cierresActual.length, anterior: data.cierresAnterior.length },
      { name: "Reservas", actual: data.reservasActual.length, anterior: data.reservasAnterior.length },
      { name: "Clientes", actual: data.clientesActual.length, anterior: data.clientesAnterior.length },
      { name: "Reseñas", actual: data.resenasActual.length, anterior: data.resenasAnterior.length },
    ],
    [data]
  );

  const tendencia30 = useMemo(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29, 0, 0, 0);
    const rows = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = formatDate(d);
      return { key, dia: labelDia(key), pedidos: 0, reservas: 0, facturacion: 0 };
    });

    const map = new Map(rows.map((row) => [row.key, row]));

    pedidos.forEach((pedido) => {
      const row = map.get(dateKey(pedido.created_at));
      if (row) row.pedidos += 1;
    });

    reservas.forEach((reserva) => {
      const row = map.get(dateKey(reserva.fecha_hora_reserva));
      if (row) row.reservas += 1;
    });

    cierres.forEach((cierre) => {
      const row = map.get(dateKey(cierre.creado_en));
      if (row) row.facturacion += toNum(cierre.total_cobrado);
    });

    return rows;
  }, [pedidos, reservas, cierres]);

  const metodosPago = useMemo(() => {
    const map = new Map<string, { name: string; value: number; count: number }>();
    data.cierresActual.forEach((cierre) => {
      const name = cierre.metodo_pago || "Sin método";
      const current = map.get(name) || { name, value: 0, count: 0 };
      current.value += toNum(cierre.total_cobrado);
      current.count += 1;
      map.set(name, current);
    });
    return Array.from(map.values()).sort((a, b) => b.value - a.value);
  }, [data.cierresActual]);

  const insights = useMemo(() => {
    const items: string[] = [];

    if (data.facturacionQRActual > data.facturacionQRAnterior && data.facturacionQRActual > 0) {
      items.push("El camarero digital está generando más facturación que el mes anterior.");
    }

    if (data.pedidosActual.length > 0 && data.cierresActual.length === 0) {
      items.push("Hay pedidos QR, pero faltan cierres de mesa. Cerrar mesas permite enseñar facturación real.");
    }

    if (data.conversionCobro > 0 && data.conversionCobro < 70) {
      items.push("La conversión pedido QR → mesa cobrada puede mejorar. Revisa pedidos abiertos o mesas sin cerrar.");
    }

    if (data.resenasActual.length === 0 && data.reservasActual.length > 0) {
      items.push("Hay reservas, pero faltan reseñas nuevas. Activa solicitud de reseñas después del servicio.");
    }

    if (items.length === 0) {
      items.push("Cuando haya más pedidos, cierres y reservas reales, aquí aparecerán oportunidades claras para el restaurante.");
    }

    return items.slice(0, 3);
  }, [data]);

  const pieColors = ["#2563eb", "#059669", "#7c3aed", "#f59e0b", "#64748b"];

  return (
    <div className={clsx("min-h-screen space-y-6 p-4 md:p-6", pageBg)}>
      <section className={clsx("overflow-hidden rounded-[30px] border p-5 shadow-sm md:p-7", dark ? "border-slate-800 bg-slate-950" : "border-blue-100 bg-white")}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <Link
              href="/dashboard"
              className={clsx("mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black uppercase tracking-widest", dark ? "bg-slate-900 text-slate-200" : "bg-slate-100 text-slate-700")}
            >
              <ArrowLeft size={14} /> Volver al dashboard
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-widest text-blue-700">
              <BarChart3 size={14} /> Informe para restaurante
            </div>
            <h1 className={clsx("mt-4 text-3xl font-black tracking-tight md:text-4xl", dark ? "text-white" : "text-slate-950")}>
              Métricas claras de {restauranteNombre}
            </h1>
            <p className={clsx("mt-2 max-w-3xl text-sm font-semibold leading-6", dark ? "text-slate-400" : "text-slate-600")}>
              Vista pensada para enseñar impacto: dinero generado, pedidos por QR, reservas, clientes y gráficos limpios. Sin saturar al restaurante con datos técnicos.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={cargar}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-800 disabled:opacity-60"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Recargar
            </button>
            <Link
              href="/panel/pedidos-qr"
              className={clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-sm transition hover:-translate-y-0.5", dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900")}
            >
              <ChefHat size={16} /> Cocina
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div className={clsx("rounded-2xl border p-4 text-sm font-bold", dark ? "border-amber-800 bg-amber-950/30 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {error}
        </div>
      )}

      {loading ? (
        <div className={clsx("rounded-3xl border p-6 text-sm font-bold shadow-sm", dark ? "border-slate-800 bg-slate-950 text-slate-400" : "border-slate-200 bg-white text-slate-500")}>
          Cargando métricas...
        </div>
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {metrics.map((metric) => (
              <KpiCard key={metric.id} metric={metric} dark={dark} />
            ))}
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <ChartCard dark={dark} title="Embudo del camarero digital" subtitle="De pedido QR a dinero cobrado" className="xl:col-span-2">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={clsx("rounded-2xl p-5", dark ? "bg-slate-900" : "bg-blue-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-blue-700">1. Pedidos QR</p>
                  <p className={clsx("mt-3 text-4xl font-black", dark ? "text-white" : "text-slate-950")}>{fmtInt(data.pedidosActual.length)}</p>
                  <p className={clsx("mt-2 text-sm font-bold", dark ? "text-slate-400" : "text-slate-600")}>Comandas enviadas desde mesa.</p>
                </div>
                <div className={clsx("rounded-2xl p-5", dark ? "bg-slate-900" : "bg-emerald-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">2. Mesas cobradas</p>
                  <p className={clsx("mt-3 text-4xl font-black", dark ? "text-white" : "text-slate-950")}>{fmtInt(data.cierresActual.length)}</p>
                  <p className={clsx("mt-2 text-sm font-bold", dark ? "text-slate-400" : "text-slate-600")}>{fmtPct(data.conversionCobro).replace("+", "")} de conversión.</p>
                </div>
                <div className={clsx("rounded-2xl p-5", dark ? "bg-slate-900" : "bg-violet-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">3. Facturación</p>
                  <p className={clsx("mt-3 text-4xl font-black", dark ? "text-white" : "text-slate-950")}>{fmtEuro(data.facturacionQRActual)}</p>
                  <p className={clsx("mt-2 text-sm font-bold", dark ? "text-slate-400" : "text-slate-600")}>Ticket medio: {fmtEuro(data.ticketMedioQR)}.</p>
                </div>
              </div>
            </ChartCard>

            <ChartCard dark={dark} title="Avisos de impacto" subtitle="Solo lo que merece atención">
              <div className="space-y-3">
                {insights.map((item, index) => (
                  <div key={item} className={clsx("flex gap-3 rounded-2xl p-3 text-sm font-semibold leading-6", dark ? "bg-slate-900 text-slate-300" : "bg-slate-50 text-slate-700")}>
                    <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-black text-white">{index + 1}</span>
                    <p>{item}</p>
                  </div>
                ))}
              </div>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
            <ChartCard dark={dark} title="Dinero generado por el sistema" subtitle="Mes actual vs mes anterior">
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={impactMoney}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis dataKey="name" stroke={chartText} tick={{ fontSize: 12 }} />
                    <YAxis stroke={chartText} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: unknown) => fmtEuro(toNum(value))} contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Bar dataKey="anterior" name="Mes anterior" radius={[8, 8, 0, 0]} fill="#94a3b8" />
                    <Bar dataKey="actual" name="Mes actual" radius={[8, 8, 0, 0]} fill="#059669" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard dark={dark} title="Actividad clave" subtitle="Pedidos, reservas, clientes y reseñas">
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={impactActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis dataKey="name" stroke={chartText} tick={{ fontSize: 12 }} />
                    <YAxis stroke={chartText} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Bar dataKey="anterior" name="Mes anterior" radius={[8, 8, 0, 0]} fill="#94a3b8" />
                    <Bar dataKey="actual" name="Mes actual" radius={[8, 8, 0, 0]} fill="#2563eb" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard dark={dark} title="Tendencia últimos 30 días" subtitle="Reservas y pedidos por QR">
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={tendencia30}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis dataKey="dia" stroke={chartText} tick={{ fontSize: 11 }} />
                    <YAxis stroke={chartText} tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0" }} />
                    <Legend />
                    <Line type="monotone" dataKey="pedidos" name="Pedidos QR" stroke="#2563eb" strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="reservas" name="Reservas" stroke="#7c3aed" strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard dark={dark} title="Facturación QR últimos 30 días" subtitle="Dinero cobrado desde cierres de mesa">
              <div className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tendencia30}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                    <XAxis dataKey="dia" stroke={chartText} tick={{ fontSize: 11 }} />
                    <YAxis stroke={chartText} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: unknown) => fmtEuro(toNum(value))} contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0" }} />
                    <Area type="monotone" dataKey="facturacion" name="Facturación QR" stroke="#059669" fill="#bbf7d0" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <ChartCard dark={dark} title="Métodos de pago" subtitle="Cómo se cobra lo generado por QR" className="xl:col-span-1">
              {metodosPago.length === 0 ? (
                <EmptyChart dark={dark} text="Todavía no hay cierres con método de pago" />
              ) : (
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip formatter={(value: unknown) => fmtEuro(toNum(value))} contentStyle={{ borderRadius: 14, border: "1px solid #e2e8f0" }} />
                      <Legend />
                      <Pie data={metodosPago} dataKey="value" nameKey="name" innerRadius={70} outerRadius={115} paddingAngle={4}>
                        {metodosPago.map((item, index) => (
                          <Cell key={item.name} fill={pieColors[index % pieColors.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>

            <section className={clsx("rounded-3xl border p-5 shadow-sm xl:col-span-2", dark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-white")}>
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className={clsx("text-xl font-black", dark ? "text-white" : "text-slate-950")}>Resumen para enseñar al restaurante</h2>
                  <p className={clsx("mt-1 text-sm font-semibold", dark ? "text-slate-400" : "text-slate-500")}>
                    Frases claras para demostrar valor sin marear con datos técnicos.
                  </p>
                </div>
                <Link href="/dashboard" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white transition hover:bg-blue-800">
                  Volver al panel <ArrowRight size={16} />
                </Link>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className={clsx("rounded-2xl p-4", dark ? "bg-slate-900" : "bg-emerald-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-700">Dinero</p>
                  <p className={clsx("mt-2 text-sm font-bold leading-6", dark ? "text-slate-300" : "text-slate-700")}>
                    El camarero digital ha movido {fmtEuro(data.potencialQRActual)} en pedidos y ha dejado {fmtEuro(data.facturacionQRActual)} cobrado este mes.
                  </p>
                </div>
                <div className={clsx("rounded-2xl p-4", dark ? "bg-slate-900" : "bg-blue-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-blue-700">Operativa</p>
                  <p className={clsx("mt-2 text-sm font-bold leading-6", dark ? "text-slate-300" : "text-slate-700")}>
                    Han entrado {fmtInt(data.pedidosActual.length)} pedidos por QR y {fmtInt(data.cierresActual.length)} mesas se han cerrado desde el sistema.
                  </p>
                </div>
                <div className={clsx("rounded-2xl p-4", dark ? "bg-slate-900" : "bg-violet-50")}>
                  <p className="text-xs font-black uppercase tracking-widest text-violet-700">Crecimiento</p>
                  <p className={clsx("mt-2 text-sm font-bold leading-6", dark ? "text-slate-300" : "text-slate-700")}>
                    Este mes hay {fmtInt(data.reservasActual.length)} reservas, {fmtInt(data.clientesActual.length)} clientes nuevos y {fmtInt(data.resenasActual.length)} reseñas nuevas.
                  </p>
                </div>
              </div>
            </section>
          </section>
        </>
      )}
    </div>
  );
}
