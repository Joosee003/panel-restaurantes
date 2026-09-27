"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  Clock3,
  MessageSquareWarning,
  RefreshCw,
  Users,
  Utensils,
  Wallet,
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
import { isOrderClosed, dashboardOrderFilter } from "@/lib/orders/order-state";
import ServiceClock from "../components/product/ServiceClock";
import ServiceArrivals from "./ServiceArrivals";
import styles from "./service-board.module.css";

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
                .or(dashboardOrderFilter(inicioHoy, finHoy))
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
    () => pedidosHoy.filter((p) => !isOrderClosed(p.estado)),
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
      tono: "blue",
    }, {
      titulo: "Mesas abiertas",
      valor: mesasAbiertas.length,
      detalle: `${pedidosAbiertos.length} pedidos activos ahora`,
      icono: Utensils,
      href: "/panel/pedidos-qr",
      tono: "blue",
    }] : []),
    ...(modules.clientes ? [{
      titulo: "Clientes semana",
      valor: clientesSemana,
      detalle: "Nuevos clientes registrados",
      icono: Users,
      href: "/clientes",
      tono: "blue",
    }] : []),
    ...(modules.resenas ? [{
      titulo: "Reseñas pendientes",
      valor: resenasPendientes,
      detalle: "Reseñas sin responder",
      icono: MessageSquareWarning,
      href: "/resenas",
      tono: "blue",
    }] : []),
  ];

  return (
    <div className={styles.page}>
      <header className={styles.masthead}>
        <div className={styles.identity}>
          <ServiceClock large />
          <div><span className={styles.kicker}>{restauranteNombre}</span><h1>Hoy, en tu restaurante.</h1><p>{refreshing ? "Actualizando el servicio…" : lastUpdated}</p></div>
        </div>
        <div className={styles.actions}>
          <button onClick={() => cargarDashboard("refresh")} disabled={loading || refreshing} aria-label="Actualizar servicio"><RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /><span>Actualizar</span></button>
          {modules.reservas ? <Link href="/reservas" className={styles.primary}><CalendarDays size={15} /> Reservas</Link> : null}
          {modules.camarero_digital ? <Link href="/panel/pedidos-qr"><ChefHat size={15} /> Cocina</Link> : modules.menu_digital ? <Link href="/panel/menu-dia">Menú</Link> : null}
        </div>
      </header>

      {error ? <div role="alert" className={styles.alert}>{error}</div> : null}
      {panelVacio ? <div className={styles.onboarding}><p>Sin actividad registrada hoy. Prepara el servicio desde tus módulos.</p>{modules.menu_digital ? <Link href="/panel/carta-productos">Revisar carta</Link> : null}{modules.reservas ? <Link href="/sala">Preparar sala</Link> : null}{modules.camarero_digital ? <Link href="/panel/qr-mesas">Ver QR de mesas</Link> : null}</div> : null}

      <div className={styles.attention} aria-label="Asuntos que requieren atención">
        <span className={styles.attentionLabel}><Clock3 size={14} /> En este momento</span>
        <div className={styles.attentionItems}>
          {loading ? <span className={styles.muted}>Cargando el servicio…</span> : acciones.map((action) => <Link href={action.href} key={action.id} data-priority={action.prioridad} title={action.descripcion}>{action.prioridad === "alta" ? <AlertTriangle size={13} /> : null}{action.titulo}<ArrowRight size={13} /></Link>)}
        </div>
      </div>

      {modules.camarero_digital && modules.reservas ? <nav className={styles.mobileServiceLinks} aria-label="Secciones del servicio"><a href="#service-arrivals-title">Llegadas ↓</a><a href="#service-tables-title">Mesas y pedidos ↓</a></nav> : null}
      <div className={`${styles.service} ${!modules.camarero_digital || !modules.reservas ? styles.serviceSolo : ""}`}>
        {modules.reservas ? <ServiceArrivals reservations={reservasHoy} loading={loading} /> : null}
        {modules.camarero_digital ? <section className={styles.kitchen} aria-labelledby="service-tables-title">
          <div className={styles.sectionHeading}>
            <div><span className={styles.kicker}>Sala y cocina · pedidos QR</span><h2 id="service-tables-title">Servicio por mesa</h2></div>
            <Link href="/panel/pedidos-qr">Abrir cocina <ArrowRight size={14} /></Link>
          </div>
          <div className={styles.kitchenCounts}><span><b>{pedidosAbiertos.length}</b> pedidos abiertos</span><span><b>{pedidosLentos.length}</b> a revisar</span><span className={styles.danger}><b className={styles.danger}>{pedidosUrgentes.length}</b> urgentes</span></div>
          <p className={styles.kitchenRule}>Más antiguos primero · urgente desde 20 min abierto</p>
          <div className={styles.orderHeader} aria-hidden="true"><span>Mesa / fase</span><span>Importe</span><span>Tiempo</span><span /></div>
          {loading ? <div role="status" className={styles.loadingRows}>{[0, 1, 2, 3].map((index) => <div key={index} />)}<span className="sr-only">Cargando mesas</span></div> : mesasAbiertas.length ? <ol className={styles.tableList}>
            {mesasAbiertas.map((table) => <li key={table.mesa} className={styles.tableRow} data-urgency={table.maxMinutos >= 20 ? "urgent" : table.maxMinutos >= 12 ? "review" : "normal"}>
              <div className={styles.tableContext}>
                <strong className={styles.tableNumber}>{table.mesa}</strong>
                <small>{[...new Set(table.pedidos.map((order) => estadoLimpio(order.estado)))].join(" · ")}</small>
              </div>
              <span className={styles.orderAmount}>{euro(table.total)}</span>
              <time className={styles.elapsed} title="Tiempo desde la creación del primer pedido abierto">{table.maxMinutos} <small>min</small></time>
              <Link className={styles.orderAction} href="/panel/pedidos-qr" aria-label={`${table.maxMinutos >= 12 ? "Revisar pedido" : "Ver cuenta y pedidos"} · ${table.mesa}`}><ArrowRight size={16} /></Link>
              <details className={styles.orderDetails}>
                <summary>{table.pedidos.length} pedido{table.pedidos.length === 1 ? "" : "s"}<span>Ver detalle</span></summary>
                <ul>{table.pedidos.map(order => <li key={order.id}><span title={order.id}>#{order.id.slice(-6)}</span><span>{estadoLimpio(order.estado)}</span><span>{euro(numero(order.total))}</span><time>{minutosDesde(order.created_at)} min</time></li>)}</ul>
              </details>
            </li>)}
          </ol> : <div className={styles.empty}><h3>Cocina al día.</h3><p>No hay comandas abiertas ahora.</p><Link href="/panel/pedidos-qr">Ver pedidos y cierres <ArrowRight size={13} /></Link></div>}
        </section> : null}
      </div>

      <div className={styles.summary} aria-label="Resumen de actividad">
        {kpis.map((kpi) => <Link key={kpi.titulo} href={kpi.href} title={kpi.detalle}><strong>{loading ? "…" : kpi.valor}</strong><span>{kpi.titulo}</span></Link>)}
      </div>
      <div className={styles.bottom}>
        <details className={styles.trend}>
          <summary>Reservas de la semana <span>Consultar evolución</span></summary>
          <div className={styles.chart}>{restauranteId ? <DashboardChart restauranteId={restauranteId} /> : null}</div>
          {modules.metricas ? <Link href="/estadisticas" className={styles.muted}>Ver métricas <ArrowRight size={13} className="inline" /></Link> : null}
        </details>
        <section className={styles.activity}>
          <h2>Actividad del día</h2>
          {actividad.length ? <ol>{actividad.map((item) => <li key={item.id}><strong>{item.titulo}</strong><span>{item.tipo} · {item.detalle}</span></li>)}</ol> : <p className={styles.muted}>Sin actividad registrada.</p>}
        </section>
      </div>
    </div>
  );
}
