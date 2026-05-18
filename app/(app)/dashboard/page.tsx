"use client";

import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  CalendarDays,
  Users,
  MessageSquareWarning,
  Percent,
  Sparkles,
  Bell,
  Moon,
  TrendingUp,
  AlertTriangle,
  Zap,
  Check,
  RefreshCw,
} from "lucide-react";

import { useTheme } from "../components/ThemeProvider";
import { supabase } from "../lib/supabaseClient";
import { calcularOcupacion, detectarDiaFlojoSemana } from "../lib/ocupacion";
import { withTimeout } from "../lib/safeQuery";
import { useAutoRefresh } from "../lib/useAutoRefresh";

/* ===== CHART ===== */
const DashboardChart = dynamic(() => import("../components/DashboardChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Cargando gráfica...
    </div>
  ),
});

function getHoyMadrid() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getHoraMadrid() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function formatearFechaReserva(valor?: string | null) {
  if (!valor) return "";

  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;

  return d.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const { toggle, dark } = useTheme();
  const isDark = dark;

  const loadingRef = useRef(false);
  const realtimeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [restaurante, setRestaurante] = useState<any>(null);
  const [restauranteId, setRestauranteId] = useState<string | null>(null);

  const [loadingInicial, setLoadingInicial] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("Actualizado");

  const [reservasHoy, setReservasHoy] = useState(0);
  const [clientesNuevosHoy, setClientesNuevosHoy] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);

  const [acciones, setAcciones] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [accionesRestaurante, setAccionesRestaurante] = useState<any[]>([]);

  const [huecosDetectados, setHuecosDetectados] = useState(0);
  const [reservasEnRiesgo, setReservasEnRiesgo] = useState(0);

  const [ocupacionValor, setOcupacionValor] = useState("0%");
  const [ocupacionContexto, setOcupacionContexto] = useState("Buen ritmo");
  const [pctComidaState, setPctComidaState] = useState(0);
  const [pctCenaState, setPctCenaState] = useState(0);
  const [diaFlojo, setDiaFlojo] = useState<any>(null);

  useEffect(() => {
    const cargarRestaurante = async () => {
      setLoadingInicial(true);

      try {
        const rid = await withTimeout(getRestauranteUsuario(), 8000);

        if (!rid) {
          setDashboardError("No se ha encontrado restaurante para este usuario.");
          setLoadingInicial(false);
          return;
        }

        setRestauranteId(rid);

const result = await withTimeout(
  supabase
    .from("restaurantes")
    .select("*")
    .eq("id", rid)
    .single(),
  20000
);

if (!result) {
  setDashboardError("No se pudo cargar el restaurante.");
  setLoadingInicial(false);
  return;
}

const { data, error } = result;

if (error) {
  console.error("RESTAURANTE ERROR", error);
  setDashboardError("No se pudo cargar el restaurante.");
  setLoadingInicial(false);
  return;
}

setRestaurante(data);
      } catch (error) {
        console.error("ERROR CARGANDO RESTAURANTE", error);
        setDashboardError("Tiempo de carga agotado cargando el restaurante.");
        setLoadingInicial(false);
      }
    };

    cargarRestaurante();
  }, []);

  const cargarDashboard = useCallback(
    async (modo: "inicial" | "refresh" = "refresh") => {
      if (!restauranteId || loadingRef.current) return;

      loadingRef.current = true;

      if (modo === "inicial") {
        setLoadingInicial(true);
      } else {
        setRefreshing(true);
      }

      setDashboardError(null);

      const hoy = getHoyMadrid();
      const inicioHoyTxt = `${hoy} 00:00:00`;
      const finHoyTxt = `${hoy} 23:59:59`;

      try {
        const [
          reservasHoyResult,
          clientesNuevosResult,
          resenasPendientesResult,
          reservasRiesgoResult,
          accionesRestauranteResult,
          ocupacionResult,
          diaFlojoResult,
        ] = await Promise.allSettled([
          withTimeout(
            supabase
              .from("reservas")
              .select("id", { count: "exact", head: true })
              .eq("restaurante_id", restauranteId)
              .eq("estado", "confirmada")
              .gte("fecha_hora_reserva", inicioHoyTxt)
              .lte("fecha_hora_reserva", finHoyTxt),
            8000
          ),

          withTimeout(
            supabase
              .from("clientes")
              .select("id", { count: "exact", head: true })
              .eq("restaurante_id", restauranteId)
              .gte("created_at", inicioHoyTxt)
              .lte("created_at", finHoyTxt),
            8000
          ),

          withTimeout(
            supabase
              .from("resenas")
              .select("id", { count: "exact", head: true })
              .eq("restaurante_id", restauranteId)
              .eq("responded", false),
            8000
          ),

          withTimeout(
            supabase
              .from("reservas")
              .select("id", { count: "exact", head: true })
              .eq("restaurante_id", restauranteId)
              .eq("estado", "pendiente")
              .gte("fecha_hora_reserva", inicioHoyTxt)
              .lte("fecha_hora_reserva", finHoyTxt),
            8000
          ),

          withTimeout(
            supabase
              .from("acciones_restaurante")
              .select("*")
              .eq("restaurante_id", restauranteId)
              .eq("leida", false)
              .order("created_at", { ascending: false })
              .limit(10),
            8000
          ),

          withTimeout(calcularOcupacion(restauranteId), 10000),

          withTimeout(detectarDiaFlojoSemana(restauranteId), 10000),
        ]);

if (reservasHoyResult.status === "fulfilled" && reservasHoyResult.value) {
  const { count, error } = reservasHoyResult.value;
  if (error) console.error("RESERVAS HOY ERROR", error);
  setReservasHoy(count ?? 0);

        }

if (clientesNuevosResult.status === "fulfilled" && clientesNuevosResult.value) {
  const { count, error } = clientesNuevosResult.value;
  if (error) console.error("CLIENTES NUEVOS ERROR", error);
  setClientesNuevosHoy(count ?? 0);
}

if (
  resenasPendientesResult.status === "fulfilled" &&
  resenasPendientesResult.value
) {
  const { count, error } = resenasPendientesResult.value;
  if (error) console.error("RESEÑAS PENDIENTES ERROR", error);
  setResenasPendientes(count ?? 0);
}

if (reservasRiesgoResult.status === "fulfilled" && reservasRiesgoResult.value) {
  const { count, error } = reservasRiesgoResult.value;
  if (error) console.error("RESERVAS RIESGO ERROR", error);
  setReservasEnRiesgo(count ?? 0);
  setHuecosDetectados(count ?? 0);
}

if (
  accionesRestauranteResult.status === "fulfilled" &&
  accionesRestauranteResult.value
) {
  const { data, error } = accionesRestauranteResult.value;
  if (error) console.error("ACCIONES RESTAURANTE ERROR", error);
  setAccionesRestaurante(data ?? []);

        }

        if (ocupacionResult.status === "fulfilled" && ocupacionResult.value) {
          setPctComidaState(ocupacionResult.value.ocupacionComidaPct ?? 0);
          setPctCenaState(ocupacionResult.value.ocupacionCenaPct ?? 0);
          setOcupacionValor(`${ocupacionResult.value.totalDiaPct ?? 0}%`);
          setOcupacionContexto("Ocupación total del día");
        }

        if (diaFlojoResult.status === "fulfilled") {
          setDiaFlojo(diaFlojoResult.value ?? null);
        }

        setLastUpdated(`Actualizado ${getHoraMadrid()}`);
      } catch (error) {
        console.error("ERROR GENERAL DASHBOARD", error);
        setDashboardError("Alguna carga del dashboard ha tardado demasiado.");
      } finally {
        loadingRef.current = false;
        setLoadingInicial(false);
        setRefreshing(false);
      }
    },
    [restauranteId]
  );

  useEffect(() => {
    if (!restauranteId) return;
    cargarDashboard("inicial");
  }, [restauranteId, cargarDashboard]);

  useAutoRefresh(
    async () => {
      await cargarDashboard("refresh");
    },
    {
      enabled: !!restauranteId,
      intervalMs: 30000,
    }
  );

  const programarRefreshRealtime = useCallback(() => {
    if (realtimeTimerRef.current) {
      clearTimeout(realtimeTimerRef.current);
    }

    realtimeTimerRef.current = setTimeout(() => {
      cargarDashboard("refresh");
    }, 800);
  }, [cargarDashboard]);

  useEffect(() => {
    if (!restauranteId) return;

    const channelReservas = supabase
      .channel(`dashboard-reservas-${restauranteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reservas",
          filter: `restaurante_id=eq.${restauranteId}`,
        },
        () => {
          programarRefreshRealtime();
        }
      )
      .subscribe();

    const channelAcciones = supabase
      .channel(`dashboard-acciones-${restauranteId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "acciones_restaurante",
          filter: `restaurante_id=eq.${restauranteId}`,
        },
        () => {
          programarRefreshRealtime();
        }
      )
      .subscribe();

    return () => {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
      }

      supabase.removeChannel(channelReservas);
      supabase.removeChannel(channelAcciones);
    };
  }, [restauranteId, programarRefreshRealtime]);

  useEffect(() => {
    const nuevasAcciones: any[] = [];
    const nuevasAlertas: any[] = [];

    const accionesRecientes = accionesRestaurante.map((a: any) => {
      const fecha = new Date(a.created_at);
      const tiempo = Number.isNaN(fecha.getTime())
        ? "Ahora"
        : fecha.toLocaleTimeString("es-ES", {
            timeZone: "Europe/Madrid",
            hour: "2-digit",
            minute: "2-digit",
          });

      let texto = a.mensaje || "Movimiento reciente en reservas";

      if (a.tipo === "reprogramacion") {
        const anterior = formatearFechaReserva(a.fecha_anterior);
        const nueva = formatearFechaReserva(a.fecha_nueva);
        texto = `${a.cliente_nombre || "Un cliente"} ha reprogramado su reserva de ${anterior} a ${nueva}`;
      }

      if (a.tipo === "cancelacion") {
        const anterior = formatearFechaReserva(a.fecha_anterior);
        texto = `${a.cliente_nombre || "Un cliente"} ha cancelado su reserva del ${anterior}`;
      }

      return {
        id: a.id,
        texto,
        tiempo,
        persistente: true,
      };
    });

    nuevasAcciones.push(...accionesRecientes);

    if (reservasEnRiesgo > 0) {
      nuevasAcciones.push({
        texto: `Confirmar ${reservasEnRiesgo} reservas pendientes`,
        tiempo: "Hoy",
        persistente: false,
      });
    }

    if (huecosDetectados > 0) {
      nuevasAcciones.push({
        texto: "Promocionar turnos con huecos",
        tiempo: "Hoy",
        persistente: false,
      });
    }

    if (resenasPendientes > 0) {
      nuevasAcciones.push({
        texto: "Responder reseñas pendientes",
        tiempo: "Hoy",
        persistente: false,
      });
    }

    if (diaFlojo) {
      nuevasAcciones.push({
        texto: `Promocionar ${diaFlojo.dia} (${diaFlojo.ocupacion}%)`,
        tiempo: "Esta semana",
        persistente: false,
      });
    }

    if (reservasEnRiesgo >= 3) {
      nuevasAlertas.push({
        texto: "Varias reservas siguen sin confirmar",
      });
    }

    const pctFinal = Math.max(pctComidaState, pctCenaState);

    if (pctFinal >= 90) {
      nuevasAlertas.push({
        texto: "Ocupación muy alta: revisa la capacidad",
      });
    }

    setAcciones(nuevasAcciones.slice(0, 8));
    setAlertas(nuevasAlertas.slice(0, 6));
  }, [
    accionesRestaurante,
    reservasEnRiesgo,
    huecosDetectados,
    resenasPendientes,
    pctComidaState,
    pctCenaState,
    diaFlojo,
  ]);

  const marcarAccionLeida = async (id: string) => {
    const anterior = accionesRestaurante;

    setAccionesRestaurante((prev) => prev.filter((a) => a.id !== id));

    const { error } = await supabase
      .from("acciones_restaurante")
      .update({ leida: true })
      .eq("id", id);

    if (error) {
      console.error("MARCAR ACCION LEIDA ERROR", error);
      setAccionesRestaurante(anterior);
    }
  };

  const stats = [
    {
      id: "reservas",
      title: "Reservas hoy",
      value: reservasHoy,
      context: "Total del día",
      icon: CalendarDays,
      color: "blue",
      href: "/reservas",
    },
    {
      id: "clientes",
      title: "Clientes nuevos",
      value: clientesNuevosHoy,
      context: "Hoy",
      icon: Users,
      color: "green",
      href: "/clientes",
    },
    {
      id: "resenas",
      title: "Reseñas pendientes",
      value: resenasPendientes,
      context: "Impacta en Google",
      icon: MessageSquareWarning,
      color: "red",
      href: "/resenas",
    },
    {
      id: "ocupacion",
      title: "Ocupación",
      value: ocupacionValor,
      context: ocupacionContexto,
      icon: Percent,
      color: "purple",
      href: "/ocupacion",
    },
  ];

  const colorMap: Record<
    string,
    { bg: string; icon: string; line: string; badge: string; badgeText: string }
  > = {
    blue: {
      bg: isDark ? "bg-blue-500/15" : "bg-blue-100",
      icon: isDark ? "text-blue-300" : "text-blue-700",
      line: "from-blue-500 to-cyan-400",
      badge: isDark ? "bg-blue-500/15" : "bg-blue-100",
      badgeText: isDark ? "text-blue-300" : "text-blue-700",
    },
    green: {
      bg: isDark ? "bg-emerald-500/15" : "bg-emerald-100",
      icon: isDark ? "text-emerald-300" : "text-emerald-700",
      line: "from-emerald-500 to-teal-400",
      badge: isDark ? "bg-emerald-500/15" : "bg-emerald-100",
      badgeText: isDark ? "text-emerald-300" : "text-emerald-700",
    },
    red: {
      bg: isDark ? "bg-rose-500/15" : "bg-rose-100",
      icon: isDark ? "text-rose-300" : "text-rose-700",
      line: "from-rose-500 to-pink-400",
      badge: isDark ? "bg-rose-500/15" : "bg-rose-100",
      badgeText: isDark ? "text-rose-300" : "text-rose-700",
    },
    purple: {
      bg: isDark ? "bg-violet-500/15" : "bg-violet-100",
      icon: isDark ? "text-violet-300" : "text-violet-700",
      line: "from-violet-500 to-fuchsia-400",
      badge: isDark ? "bg-violet-500/15" : "bg-violet-100",
      badgeText: isDark ? "text-violet-300" : "text-violet-700",
    },
    amber: {
      bg: isDark ? "bg-amber-500/15" : "bg-amber-100",
      icon: isDark ? "text-amber-300" : "text-amber-700",
      line: "from-amber-500 to-yellow-400",
      badge: isDark ? "bg-amber-500/15" : "bg-amber-100",
      badgeText: isDark ? "text-amber-300" : "text-amber-700",
    },
  };

  const panelCardClass = isDark
    ? "rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 shadow-sm"
    : "rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm";

  const panelCardHover = isDark
    ? "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30"
    : "transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-300/40";

  const panelButtonClass = isDark
    ? "border border-slate-700 bg-slate-900 text-slate-100"
    : "border border-slate-300 bg-white text-slate-900";

  const titleTextClass = isDark ? "text-white" : "text-slate-900";
  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-600";
  const softTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const dotTextClass = isDark ? "text-slate-600" : "text-slate-300";

  const iconRingClass = isDark ? "ring-white/10" : "ring-slate-200";

  const headerAccentClass = isDark ? "text-emerald-400" : "text-emerald-600";

  const accionesIconBoxClass = isDark
    ? "bg-blue-500/15 text-blue-300"
    : "bg-blue-100 text-blue-700";

  const accionesBadgeClass = isDark
    ? "bg-blue-500/15 text-blue-300"
    : "bg-blue-100 text-blue-700";

  const alertasIconBoxClass = isDark
    ? "bg-rose-500/15 text-rose-300"
    : "bg-rose-100 text-rose-700";

  const alertasBadgeClass = isDark
    ? "bg-rose-500/15 text-rose-300"
    : "bg-rose-100 text-rose-700";

  const accionesHoverClass = isDark ? "hover:bg-white/5" : "hover:bg-slate-50";

  const alertaItemClass = isDark
    ? "flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-2.5 py-2 text-rose-200"
    : "flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-rose-700";

  const impactCardClass = isDark
    ? `group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-sm ${panelCardHover}`
    : `group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${panelCardHover}`;

  const chartInnerClass = isDark
    ? "rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-inner shadow-black/30"
    : "rounded-2xl border border-slate-200 bg-white p-3 shadow-inner shadow-slate-100";

  const tickButtonClass = isDark
    ? "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 transition hover:bg-emerald-500/20"
    : "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <div>
          <h1
            className={`text-2xl font-extrabold uppercase tracking-wider ${titleTextClass}`}
          >
            {restaurante ? restaurante.nombre : "Dashboard"}
          </h1>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`inline-flex items-center gap-1 font-medium ${headerAccentClass}`}
            >
              <Zap size={14} />
              Panel en tiempo real
            </span>
            <span className={dotTextClass}>•</span>
            <span className={mutedTextClass}>{lastUpdated}</span>

            {refreshing && (
              <>
                <span className={dotTextClass}>•</span>
                <span className={`inline-flex items-center gap-1 ${mutedTextClass}`}>
                  <RefreshCw size={13} className="animate-spin" />
                  Refrescando
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => cargarDashboard("refresh")}
            disabled={refreshing || loadingInicial}
            className={`h-10 w-10 rounded-xl ${panelButtonClass} shadow-sm transition hover:shadow-md disabled:opacity-50`}
            title="Refrescar"
          >
            <RefreshCw size={16} className="mx-auto" />
          </button>

          <button
            onClick={toggle}
            className={`h-10 w-10 rounded-xl ${panelButtonClass} shadow-sm transition hover:shadow-md`}
            title="Cambiar tema"
          >
            <Moon size={16} className="mx-auto" />
          </button>

          <Link
            href="/estadisticas"
            className={`rounded-xl px-4 py-2 ${panelButtonClass} shadow-sm transition hover:shadow-md`}
          >
            Estadísticas
          </Link>

          <Link
            href="/ajustes"
            className={`rounded-xl px-4 py-2 ${panelButtonClass} shadow-sm transition hover:shadow-md`}
          >
            Ajustes
          </Link>
        </div>
      </div>

      {dashboardError && (
        <div
          className={
            isDark
              ? "rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200"
              : "rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700"
          }
        >
          {dashboardError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-6">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const c = colorMap[stat.color];

            return (
              <Link
                key={stat.id}
                href={stat.href}
                className={`group relative overflow-hidden p-4 ${panelCardClass} ${panelCardHover}`}
              >
                <div className={`mb-3 h-1 w-full rounded-full bg-gradient-to-r ${c.line}`} />

                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${iconRingClass} ${c.bg}`}
                  >
                    <Icon size={22} className={c.icon} />
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`text-xs font-medium uppercase tracking-widest ${softTextClass}`}
                    >
                      {stat.title}
                    </p>
                    <p
                      className={`mt-1 text-3xl font-extrabold leading-none ${titleTextClass}`}
                    >
                      {loadingInicial ? "..." : stat.value}
                    </p>
                    <p className={`mt-2 text-xs ${mutedTextClass}`}>
                      {stat.context}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-5 lg:col-span-2">
          <div className={`${panelCardClass} p-5 ${panelCardHover}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${accionesIconBoxClass}`}
                >
                  <Sparkles size={18} />
                </span>
                <p className={`text-sm font-bold uppercase ${titleTextClass}`}>
                  Acciones
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accionesBadgeClass}`}
              >
                {acciones.length}
              </span>
            </div>

            <ul className="space-y-2.5 text-sm">
              {acciones.length === 0 && (
                <li className={mutedTextClass}>
                  {loadingInicial ? "Cargando acciones..." : "Todo al día"}
                </li>
              )}

              {acciones.map((a, i) => (
                <li
                  key={a.id ?? i}
                  className={`flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 transition ${accionesHoverClass}`}
                >
                  <div className="min-w-0 flex-1">
                    <span className={`font-medium ${titleTextClass}`}>{a.texto}</span>
                    <div className={`mt-1 text-xs ${mutedTextClass}`}>{a.tiempo}</div>
                  </div>

                  {a.persistente ? (
                    <button
                      onClick={() => marcarAccionLeida(a.id)}
                      className={tickButtonClass}
                      title="Marcar como revisado"
                    >
                      <Check size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>

          <div className={`${panelCardClass} p-5 ${panelCardHover}`}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-xl ${alertasIconBoxClass}`}
                >
                  <Bell size={18} />
                </span>
                <p className={`text-sm font-bold uppercase ${titleTextClass}`}>
                  Alertas
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alertasBadgeClass}`}
              >
                {alertas.length}
              </span>
            </div>

            <ul className="space-y-2 text-sm">
              {alertas.length === 0 && (
                <li className={mutedTextClass}>
                  {loadingInicial ? "Cargando alertas..." : "Sin alertas"}
                </li>
              )}

              {alertas.map((a, i) => (
                <li key={i} className={alertaItemClass}>
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  <span className="font-medium">{a.texto}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className={`${panelCardClass} p-5`}>
        <div className="mb-4 flex items-center justify-between">
          <p className={`text-sm font-bold uppercase ${titleTextClass}`}>
            Impacto de hoy
          </p>
          <span className={`text-xs ${softTextClass}`}>Acciones rápidas</span>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            {
              id: "pendientes-hoy",
              title: "Reservas pendientes",
              value: reservasEnRiesgo,
              description: "Hoy",
              href: "/reservas?filtro=pendientes",
              color: "amber",
            },
            {
              id: "dia-flojo",
              title: diaFlojo ? "Día flojo detectado" : "Ocupación estable",
              value: diaFlojo ? `${diaFlojo.ocupacion}%` : "OK",
              description: diaFlojo ? diaFlojo.dia : "Sin días por debajo del 40%",
              href: "/ocupacion",
              color: "red",
            },
          ].map((item) => {
            const c = colorMap[item.color];

            return (
              <Link key={item.id} href={item.href} className={impactCardClass}>
                <div className={`absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${c.line}`} />

                <div className="pl-2">
                  <div className="mb-2 flex items-center gap-2">
                    <AlertTriangle size={16} className={c.icon} />
                    <p
                      className={`text-xs font-medium uppercase tracking-widest ${softTextClass}`}
                    >
                      {item.title}
                    </p>
                  </div>

                  <p className={`text-3xl font-extrabold leading-none ${titleTextClass}`}>
                    {loadingInicial ? "..." : item.value}
                  </p>
                  <p className={`mt-2 text-xs ${mutedTextClass}`}>{item.description}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className={`${panelCardClass} p-5`}>
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp size={16} className={softTextClass} />
          <p className={`text-sm font-bold uppercase ${titleTextClass}`}>
            Reservas de la semana
          </p>
        </div>

        <p className={`mb-4 text-xs ${mutedTextClass}`}>
          Evolución de reservas por día
        </p>

        <div className={chartInnerClass}>
          <div className="h-[260px] min-h-[260px] w-full">
            {restauranteId && <DashboardChart restauranteId={restauranteId} />}
          </div>
        </div>
      </div>
    </div>
  );
}