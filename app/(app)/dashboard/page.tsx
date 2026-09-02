"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  BarChart3,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  CreditCard,
  MessageSquareWarning,
  RefreshCw,
  Sparkles,
  QrCode,
  Users,
  Utensils,
  Wallet,
  Zap,
} from "lucide-react";

import { supabase } from "../lib/supabaseClient";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import {
  defaultRestaurantModules,
  parseRestaurantModules,
  restaurantModuleColumns,
  type RestaurantModules,
} from "../lib/restaurantModules";
import { withTimeout } from "../lib/safeQuery";

const DashboardChart = dynamic(() => import("../components/DashboardChart"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      Cargando gráfica...
    </div>
  ),
});

type Reserva = {
  id: string;
  nombre_cliente: string | null;
  telefono?: string | null;
  personas: number | null;
  estado: string | null;
  fecha_hora_reserva: string | null;
};

type PedidoQR = {
  id: string;
  mesa: string | null;
  estado: string | null;
  total: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

type CierreMesa = {
  id: string;
  mesa: string | null;
  total_cobrado: number | string | null;
  metodo_pago: string | null;
  creado_en: string | null;
};

type Accion = {
  id: string;
  prioridad: "alta" | "media" | "baja" | "ok";
  titulo: string;
  descripcion: string;
  href: string;
  cta: string;
  icono: ComponentType<{ size?: number; className?: string }>;
};

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

function inicioSemanaMadrid() {
  const hoyTxt = getHoyMadrid();
  const hoy = new Date(`${hoyTxt}T12:00:00`);
  const dia = hoy.getDay() || 7;
  hoy.setDate(hoy.getDate() - dia + 1);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(hoy);
}

function euro(valor: number) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(valor || 0);
}

function numero(valor: number | string | null | undefined) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function estadoLimpio(estado?: string | null) {
  return String(estado || "nuevo")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function esPedidoCerrado(estado?: string | null) {
  const e = estadoLimpio(estado);
  return [
    "servido",
    "servida",
    "entregado",
    "entregada",
    "cobrado",
    "cobrada",
    "cerrado",
    "cerrada",
    "cancelado",
    "cancelada",
  ].includes(e);
}

function minutosDesde(fecha?: string | null) {
  if (!fecha) return 0;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000));
}

function formatHora(fecha?: string | null) {
  if (!fecha) return "--:--";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatReserva(fecha?: string | null) {
  if (!fecha) return "Sin hora";
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return fecha;
  return d.toLocaleTimeString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const loadingRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [restauranteNombre, setRestauranteNombre] = useState("Dashboard");
  const [modules, setModules] = useState<RestaurantModules>(defaultRestaurantModules);
  const [modulesReady, setModulesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState("Sin actualizar");

  const [reservasHoy, setReservasHoy] = useState<Reserva[]>([]);
  const [clientesSemana, setClientesSemana] = useState(0);
  const [resenasPendientes, setResenasPendientes] = useState(0);
  const [pedidosHoy, setPedidosHoy] = useState<PedidoQR[]>([]);
  const [cierresHoy, setCierresHoy] = useState<CierreMesa[]>([]);

  useEffect(() => {
    const cargarRestaurante = async () => {
      setLoading(true);
      setError(null);

      try {
        const rid = await withTimeout(getRestauranteUsuario(), 8000);

        if (!rid) {
          setError("No se ha encontrado restaurante para este usuario.");
          setLoading(false);
          return;
        }

        setRestauranteId(rid);

        const [result, modulesResult] = await Promise.all([
          withTimeout(
            supabase.from("restaurantes").select("nombre").eq("id", rid).single(),
            8000,
          ),
          withTimeout(
            supabase
              .from("restaurante_modulos")
              .select(restaurantModuleColumns)
              .eq("restaurante_id", rid)
              .maybeSingle(),
            8000,
          ),
        ]);

        if (result?.data?.nombre) {
          setRestauranteNombre(result.data.nombre);
        }

        if (modulesResult.error) throw modulesResult.error;
        setModules(parseRestaurantModules(modulesResult.data));
        setModulesReady(true);
      } catch (err) {
        console.error("ERROR CARGANDO RESTAURANTE", err);
        setError("No se pudo cargar el restaurante.");
        setLoading(false);
      }
    };

    cargarRestaurante();
  }, []);

  const cargarDashboard = useCallback(
    async (modo: "inicial" | "refresh" = "refresh") => {
      if (!restauranteId || !modulesReady || loadingRef.current) return;

      loadingRef.current = true;
      if (modo === "inicial") setLoading(true);
      else setRefreshing(true);

      setError(null);

      const hoy = getHoyMadrid();
      const semana = inicioSemanaMadrid();
      const inicioHoy = `${hoy} 00:00:00`;
      const finHoy = `${hoy} 23:59:59`;
      const inicioSemana = `${semana} 00:00:00`;

      try {
        const [
          reservasResult,
          clientesResult,
          resenasResult,
          pedidosResult,
          cierresResult,
        ] = await Promise.allSettled([
            modules.reservas ? withTimeout(
              supabase
                .from("reservas")
                .select("id,nombre_cliente,telefono,personas,estado,fecha_hora_reserva")
                .eq("restaurante_id", restauranteId)
                .gte("fecha_hora_reserva", inicioHoy)
                .lte("fecha_hora_reserva", finHoy)
                .order("fecha_hora_reserva", { ascending: true }),
              9000
            ) : Promise.resolve({ data: [], error: null }),

            modules.clientes ? withTimeout(
              supabase
                .from("clientes")
                .select("id", { count: "exact", head: true })
                .eq("restaurante_id", restauranteId)
                .gte("created_at", inicioSemana),
              9000
            ) : Promise.resolve({ count: 0, error: null }),

            modules.resenas ? withTimeout(
              supabase
                .from("resenas")
                .select("id", { count: "exact", head: true })
                .eq("restaurante_id", restauranteId)
                .eq("responded", false),
              9000
            ) : Promise.resolve({ count: 0, error: null }),

            modules.camarero_digital ? withTimeout(
              supabase
                .from("pedidos_qr")
                .select("id,mesa,estado,total,created_at,updated_at")
                .eq("restaurante_id", restauranteId)
                .gte("created_at", inicioHoy)
                .lte("created_at", finHoy)
                .order("created_at", { ascending: false }),
              9000
            ) : Promise.resolve({ data: [], error: null }),

            modules.camarero_digital ? withTimeout(
              supabase
                .from("cierres_mesa_qr")
                .select("id,mesa,total_cobrado,metodo_pago,creado_en")
                .eq("restaurante_id", restauranteId)
                .gte("creado_en", inicioHoy)
                .lte("creado_en", finHoy)
                .order("creado_en", { ascending: false }),
              9000
            ) : Promise.resolve({ data: [], error: null }),
          ]);

        if (reservasResult.status === "fulfilled") {
          const { data, error } = reservasResult.value || {};
          if (error) console.error("RESERVAS DASHBOARD ERROR", error);
          setReservasHoy((data ?? []) as Reserva[]);
        }

        if (clientesResult.status === "fulfilled") {
          const { count, error } = clientesResult.value || {};
          if (error) console.error("CLIENTES DASHBOARD ERROR", error);
          setClientesSemana(count ?? 0);
        }

        if (resenasResult.status === "fulfilled") {
          const { count, error } = resenasResult.value || {};
          if (error) console.error("RESENAS DASHBOARD ERROR", error);
          setResenasPendientes(count ?? 0);
        }

        if (pedidosResult.status === "fulfilled") {
          const { data, error } = pedidosResult.value || {};
          if (error) console.error("PEDIDOS QR DASHBOARD ERROR", error);
          setPedidosHoy((data ?? []) as PedidoQR[]);
        }

        if (cierresResult.status === "fulfilled") {
          const { data, error } = cierresResult.value || {};
          if (error) console.error("CIERRES QR DASHBOARD ERROR", error);
          setCierresHoy((data ?? []) as CierreMesa[]);
        }

        setLastUpdated(`Actualizado ${getHoraMadrid()}`);
      } catch (err) {
        console.error("ERROR CARGANDO DASHBOARD", err);
        setError("Alguna parte del dashboard ha tardado demasiado en cargar.");
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [modules, modulesReady, restauranteId]
  );

  useEffect(() => {
    if (!restauranteId || !modulesReady) return;
    cargarDashboard("inicial");
  }, [restauranteId, modulesReady, cargarDashboard]);

  const programarRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => cargarDashboard("refresh"), 700);
  }, [cargarDashboard]);

  useEffect(() => {
    if (!restauranteId || !modulesReady) return;

    const interval = setInterval(() => cargarDashboard("refresh"), 30000);

    let channel = supabase.channel(`dashboard-inteligente-${restauranteId}`);

    if (modules.reservas) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reservas", filter: `restaurante_id=eq.${restauranteId}` },
        programarRefresh,
      );
    }

    if (modules.camarero_digital) {
      channel = channel
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "pedidos_qr", filter: `restaurante_id=eq.${restauranteId}` },
          programarRefresh,
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cierres_mesa_qr", filter: `restaurante_id=eq.${restauranteId}` },
          programarRefresh,
        );
    }

    if (modules.resenas) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "resenas", filter: `restaurante_id=eq.${restauranteId}` },
        programarRefresh,
      );
    }

    channel.subscribe();

    return () => {
      clearInterval(interval);
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [restauranteId, modulesReady, cargarDashboard, modules.camarero_digital, modules.resenas, modules.reservas, programarRefresh]);

  const pedidosAbiertos = useMemo(
    () => pedidosHoy.filter((p) => !esPedidoCerrado(p.estado)),
    [pedidosHoy]
  );

  const pedidosLentos = useMemo(
    () => pedidosAbiertos.filter((p) => minutosDesde(p.created_at) >= 12),
    [pedidosAbiertos]
  );

  const pedidosUrgentes = useMemo(
    () => pedidosAbiertos.filter((p) => minutosDesde(p.created_at) >= 20),
    [pedidosAbiertos]
  );

  const mesasAbiertas = useMemo(() => {
    const mapa = new Map<string, { mesa: string; pedidos: PedidoQR[]; total: number; maxMinutos: number }>();

    pedidosAbiertos.forEach((pedido) => {
      const mesa = pedido.mesa || "Sin mesa";
      const actual = mapa.get(mesa) || { mesa, pedidos: [], total: 0, maxMinutos: 0 };
      actual.pedidos.push(pedido);
      actual.total += numero(pedido.total);
      actual.maxMinutos = Math.max(actual.maxMinutos, minutosDesde(pedido.created_at));
      mapa.set(mesa, actual);
    });

    return Array.from(mapa.values()).sort((a, b) => b.maxMinutos - a.maxMinutos);
  }, [pedidosAbiertos]);

  const reservasPendientes = useMemo(
    () => reservasHoy.filter((r) => estadoLimpio(r.estado) === "pendiente"),
    [reservasHoy]
  );

  const reservasConfirmadas = useMemo(
    () => reservasHoy.filter((r) => estadoLimpio(r.estado) === "confirmada"),
    [reservasHoy]
  );

  const ventasQR = useMemo(
    () => cierresHoy.reduce((acc, cierre) => acc + numero(cierre.total_cobrado), 0),
    [cierresHoy]
  );

  const ticketMedioQR = useMemo(
    () => (cierresHoy.length > 0 ? ventasQR / cierresHoy.length : 0),
    [cierresHoy, ventasQR]
  );

  const acciones = useMemo<Accion[]>(() => {
    const lista: Accion[] = [];

    if (modules.camarero_digital && pedidosUrgentes.length > 0) {
      lista.push({
        id: "pedidos-urgentes",
        prioridad: "alta",
        titulo: `${pedidosUrgentes.length} pedido${pedidosUrgentes.length === 1 ? "" : "s"} urgente${pedidosUrgentes.length === 1 ? "" : "s"}`,
        descripcion: "Hay comandas que llevan más de 20 minutos abiertas.",
        href: "/panel/pedidos-qr",
        cta: "Abrir cocina",
        icono: AlertTriangle,
      });
    } else if (modules.camarero_digital && pedidosLentos.length > 0) {
      lista.push({
        id: "pedidos-lentos",
        prioridad: "media",
        titulo: `${pedidosLentos.length} pedido${pedidosLentos.length === 1 ? "" : "s"} para revisar`,
        descripcion: "Algunas comandas llevan más de 12 minutos abiertas.",
        href: "/panel/pedidos-qr",
        cta: "Revisar cocina",
        icono: Clock3,
      });
    }

    if (modules.camarero_digital && mesasAbiertas.length > 0) {
      lista.push({
        id: "mesas-abiertas",
        prioridad: "media",
        titulo: `${mesasAbiertas.length} mesa${mesasAbiertas.length === 1 ? "" : "s"} abierta${mesasAbiertas.length === 1 ? "" : "s"}`,
        descripcion: "Hay cuentas pendientes de cerrar o cobrar.",
        href: "/panel/pedidos-qr",
        cta: "Ver mesas",
        icono: Utensils,
      });
    }

    if (modules.reservas && reservasPendientes.length > 0) {
      lista.push({
        id: "reservas-pendientes",
        prioridad: "media",
        titulo: `${reservasPendientes.length} reserva${reservasPendientes.length === 1 ? "" : "s"} pendiente${reservasPendientes.length === 1 ? "" : "s"}`,
        descripcion: "Conviene confirmarlas antes del servicio.",
        href: "/reservas",
        cta: "Ver reservas",
        icono: CalendarDays,
      });
    }

    if (modules.resenas && resenasPendientes > 0) {
      lista.push({
        id: "resenas-pendientes",
        prioridad: "baja",
        titulo: `${resenasPendientes} reseña${resenasPendientes === 1 ? "" : "s"} sin responder`,
        descripcion: "Responder ayuda a cuidar la imagen en Google.",
        href: "/resenas",
        cta: "Responder",
        icono: MessageSquareWarning,
      });
    }

    if (lista.length === 0) {
      lista.push({
        id: "todo-ok",
        prioridad: "ok",
        titulo: "Todo bajo control",
        descripcion: "No hay urgencias ahora mismo. Revisa métricas y prepara el siguiente servicio.",
        href: modules.reservas ? "/reservas" : modules.clientes ? "/clientes" : "/dashboard",
        cta: modules.reservas ? "Ver reservas" : modules.clientes ? "Ver clientes" : "Seguir en el panel",
        icono: CheckCircle2,
      });
    }

    return lista.slice(0, 5);
  }, [modules, pedidosUrgentes, pedidosLentos, mesasAbiertas, reservasPendientes, resenasPendientes]);

  const actividad = useMemo(() => {
    const reservas = reservasHoy.slice(0, 4).map((r) => ({
      id: `reserva-${r.id}`,
      titulo: r.nombre_cliente || "Reserva",
      detalle: `${formatReserva(r.fecha_hora_reserva)} · ${r.personas || 0} pers.`,
      tipo: "Reserva",
    }));

    const pedidos = (modules.camarero_digital ? pedidosHoy : []).slice(0, 4).map((p) => ({
      id: `pedido-${p.id}`,
      titulo: `Mesa ${p.mesa || "-"}`,
      detalle: `${formatHora(p.created_at)} · ${euro(numero(p.total))}`,
      tipo: "Pedido QR",
    }));

    return [...pedidos, ...reservas].slice(0, 6);
  }, [modules.camarero_digital, reservasHoy, pedidosHoy]);

  const panelVacio =
    !loading &&
    reservasHoy.length === 0 &&
    (!modules.camarero_digital || (pedidosHoy.length === 0 && cierresHoy.length === 0)) &&
    clientesSemana === 0;

  const kpis = [
    ...(modules.reservas ? [{
      titulo: "Reservas hoy",
      valor: reservasHoy.length,
      detalle: `${reservasConfirmadas.length} confirmadas · ${reservasPendientes.length} pendientes`,
      icono: CalendarDays,
      href: "/reservas",
      tono: "blue",
    }] : []),
    ...(modules.camarero_digital ? [{
      titulo: "Ventas QR cobradas",
      valor: euro(ventasQR),
      detalle: cierresHoy.length > 0 ? `${cierresHoy.length} cierres · ticket ${euro(ticketMedioQR)}` : "Sin cierres todavía",
      icono: Wallet,
      href: "/panel/pedidos-qr",
      tono: "emerald",
    }, {
      titulo: "Mesas abiertas",
      valor: mesasAbiertas.length,
      detalle: `${pedidosAbiertos.length} pedidos activos ahora`,
      icono: Utensils,
      href: "/panel/pedidos-qr",
      tono: "indigo",
    }] : []),
    ...(modules.clientes ? [{
      titulo: "Clientes semana",
      valor: clientesSemana,
      detalle: "Nuevos clientes registrados",
      icono: Users,
      href: "/clientes",
      tono: "violet",
    }] : []),
    ...(modules.resenas ? [{
      titulo: "Reseñas pendientes",
      valor: resenasPendientes,
      detalle: "Reseñas sin responder",
      icono: MessageSquareWarning,
      href: "/resenas",
      tono: "violet",
    }] : []),
  ];

  return (
    <div className="min-h-screen space-y-6 bg-slate-50 text-slate-950">
      <section className="overflow-hidden rounded-[28px] border border-blue-100 bg-white shadow-sm">
        <div className="relative p-6 sm:p-8">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-blue-100 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-cyan-100 blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-blue-700">
                <Zap size={14} /> Panel inteligente
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                {restauranteNombre}
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-medium text-slate-600">
                {modules.camarero_digital
                  ? "Resumen de hoy, cocina, mesas, reservas y acciones importantes para el restaurante."
                  : "Resumen de hoy con reservas, clientes, reseñas y acciones importantes para el restaurante."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">{lastUpdated}</span>
                {refreshing && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 text-blue-700">
                    <RefreshCw size={13} className="animate-spin" /> Refrescando
                  </span>
                )}
                {modules.camarero_digital && pedidosUrgentes.length > 0 && (
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">
                    {pedidosUrgentes.length} urgente{pedidosUrgentes.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-end">
              <button
                onClick={() => cargarDashboard("refresh")}
                disabled={loading || refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Actualizar
              </button>
              {modules.camarero_digital ? (
                <Link
                  href="/panel/pedidos-qr"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-800 hover:shadow-md"
                >
                  <ChefHat size={16} /> Cocina
                </Link>
              ) : null}
              {modules.reservas ? (
                <Link
                  href="/reservas"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CalendarDays size={16} /> Reservas
                </Link>
              ) : null}
              {modules.menu_digital ? (
                <Link
                  href="/panel/menu-dia"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <Utensils size={16} /> Menú
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {error}
        </div>
      )}

      {panelVacio && (
        <section className="rounded-[28px] border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Sparkles size={22} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-blue-700">Restaurante recién instalado</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">Siguiente paso: hacer una prueba real</h2>
                <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                  {modules.camarero_digital
                    ? "Este panel todavía no tiene actividad. Prueba una mesa y un pedido para comprobar cocina, cuenta y cierre."
                    : "Este panel todavía no tiene actividad. Crea una reserva de prueba, asígnale mesa y comprueba la llegada y el consumo."}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
              {modules.menu_digital ? (
                <Link href="/panel/carta-productos" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-blue-50">
                  Carta
                </Link>
              ) : null}
              {modules.camarero_digital ? (
                <>
                  <Link href="/panel/qr-mesas" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-800">
                    <QrCode size={16} /> QR mesas
                  </Link>
                  <Link href="/panel/pedidos-qr" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-blue-50">
                    Cocina
                  </Link>
                </>
              ) : modules.reservas ? (
                <>
                  <Link href="/reservas" className="rounded-2xl bg-blue-700 px-4 py-3 text-center text-sm font-black text-white transition hover:bg-blue-800">
                    Reservas
                  </Link>
                  <Link href="/sala" className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-black text-slate-900 transition hover:bg-blue-50">
                    Sala
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </section>
      )}

      {modules.metricas ? <div className="flex justify-end">
        <Link
          href="/estadisticas"
          className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-blue-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-blue-100"
        >
          <BarChart3 size={14} /> Ver métricas avanzadas
        </Link>
      </div> : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icono;
          const tonos: Record<string, string> = {
            blue: "bg-blue-50 text-blue-700 border-blue-100",
            emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
            indigo: "bg-indigo-50 text-indigo-700 border-indigo-100",
            violet: "bg-violet-50 text-violet-700 border-violet-100",
          };

          return (
            <Link
              href={kpi.href}
              key={kpi.titulo}
              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tonos[kpi.tono]}`}>
                  <Icon size={22} />
                </div>
                <ArrowRight size={17} className="mt-1 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-700" />
              </div>
              <p className="mt-5 text-xs font-black uppercase tracking-widest text-slate-500">{kpi.titulo}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{loading ? "..." : kpi.valor}</p>
              <p className="mt-2 text-sm font-semibold text-slate-500">{kpi.detalle}</p>
            </Link>
          );
        })}
      </section>

      <section className={`grid grid-cols-1 gap-5 ${modules.camarero_digital ? "xl:grid-cols-3" : ""}`}>
        <div className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${modules.camarero_digital ? "xl:col-span-2" : ""}`}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Qué hacer ahora</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Acciones recomendadas</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              {acciones.length} acción{acciones.length === 1 ? "" : "es"}
            </span>
          </div>

          <div className="space-y-3">
            {acciones.map((accion) => {
              const Icon = accion.icono;
              const prioridadClass =
                accion.prioridad === "alta"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : accion.prioridad === "media"
                    ? "border-blue-200 bg-blue-50 text-blue-800"
                    : accion.prioridad === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-slate-200 bg-slate-50 text-slate-800";

              return (
                <Link
                  href={accion.href}
                  key={accion.id}
                  className={`group flex flex-col gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:flex-row sm:items-center sm:justify-between ${prioridadClass}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                      <Icon size={20} />
                    </span>
                    <div>
                      <p className="font-black">{accion.titulo}</p>
                      <p className="mt-1 text-sm font-semibold opacity-80">{accion.descripcion}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-black shadow-sm transition group-hover:translate-x-1">
                    {accion.cta} <ArrowRight size={15} />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {modules.camarero_digital ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Cocina</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">Estado en vivo</h2>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <ChefHat size={22} />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-2xl font-black text-slate-950">{pedidosAbiertos.length}</p>
              <p className="text-xs font-bold text-slate-500">Activos</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
              <p className="text-2xl font-black text-amber-700">{pedidosLentos.length}</p>
              <p className="text-xs font-bold text-amber-700">Revisar</p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3">
              <p className="text-2xl font-black text-rose-700">{pedidosUrgentes.length}</p>
              <p className="text-xs font-bold text-rose-700">Urgentes</p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pedidosAbiertos.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm font-bold text-slate-500">
                No hay comandas abiertas ahora.
              </div>
            )}

            {pedidosAbiertos.slice(0, 4).map((pedido) => {
              const mins = minutosDesde(pedido.created_at);
              return (
                <Link
                  href="/panel/pedidos-qr"
                  key={pedido.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:bg-blue-50"
                >
                  <div>
                    <p className="font-black text-slate-950">Mesa {pedido.mesa || "-"}</p>
                    <p className="text-xs font-bold text-slate-500">{estadoLimpio(pedido.estado)} · {euro(numero(pedido.total))}</p>
                  </div>
                  <span className={mins >= 20 ? "rounded-full bg-rose-100 px-2.5 py-1 text-xs font-black text-rose-700" : mins >= 12 ? "rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-700" : "rounded-full bg-slate-200 px-2.5 py-1 text-xs font-black text-slate-700"}>
                    {mins} min
                  </span>
                </Link>
              );
            })}
          </div>
        </div> : null}
      </section>

      <section className={`grid grid-cols-1 gap-5 ${modules.camarero_digital ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        {modules.camarero_digital ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Mesas</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Abiertas ahora</h2>
            </div>
            <CreditCard size={21} className="text-blue-700" />
          </div>

          <div className="space-y-3">
            {mesasAbiertas.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm font-bold text-slate-500">
                Sin mesas abiertas.
              </p>
            )}

            {mesasAbiertas.slice(0, 5).map((mesa) => (
              <Link
                href="/panel/pedidos-qr"
                key={mesa.mesa}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:bg-blue-50"
              >
                <div>
                  <p className="font-black text-slate-950">Mesa {mesa.mesa}</p>
                  <p className="text-xs font-bold text-slate-500">{mesa.pedidos.length} pedido{mesa.pedidos.length === 1 ? "" : "s"} · {mesa.maxMinutos} min</p>
                </div>
                <p className="font-black text-slate-950">{euro(mesa.total)}</p>
              </Link>
            ))}
          </div>
        </div> : null}

        {modules.reservas ? <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Reservas</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Servicio de hoy</h2>
            </div>
            <CalendarDays size={21} className="text-blue-700" />
          </div>

          <div className="space-y-3">
            {reservasHoy.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm font-bold text-slate-500">
                No hay reservas hoy.
              </p>
            )}

            {reservasHoy.slice(0, 5).map((reserva) => (
              <Link
                href="/reservas"
                key={reserva.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:bg-blue-50"
              >
                <div>
                  <p className="font-black text-slate-950">{reserva.nombre_cliente || "Cliente"}</p>
                  <p className="text-xs font-bold text-slate-500">{reserva.personas || 0} pers. · {estadoLimpio(reserva.estado)}</p>
                </div>
                <p className="font-black text-slate-950">{formatReserva(reserva.fecha_hora_reserva)}</p>
              </Link>
            ))}
          </div>
        </div> : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-slate-500">Actividad</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Últimos movimientos</h2>
            </div>
            <Bell size={21} className="text-blue-700" />
          </div>

          <div className="space-y-3">
            {actividad.length === 0 && (
              <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-center text-sm font-bold text-slate-500">
                Sin actividad reciente hoy.
              </p>
            )}

            {actividad.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-black text-slate-950">{item.titulo}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-500">
                    {item.tipo}
                  </span>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">{item.detalle}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-slate-500">Tendencia</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Reservas de la semana</h2>
          </div>
          {modules.metricas ? (
            <Link href="/estadisticas" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-900 transition hover:bg-slate-50">
              Ver estadísticas <ArrowRight size={15} />
            </Link>
          ) : null}
        </div>

        <div className="h-[280px] min-h-[280px] rounded-2xl border border-slate-100 bg-slate-50 p-3">
          {restauranteId && <DashboardChart restauranteId={restauranteId} />}
        </div>
      </section>
    </div>
  );
}
