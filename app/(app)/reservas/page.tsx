"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "../lib/supabaseClient";
import AddReservaModal from "../components/AddReservaModal";
import { withTimeout } from "../lib/safeQuery";
import { useAutoRefresh } from "../lib/useAutoRefresh";

import { useQueryClient } from "@tanstack/react-query";
import { useRestaurante } from "../../hooks/useRestaurante";
import { queryKeys } from "../../query/queryKeys";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventContentArg } from "@fullcalendar/core";

type EventClassNamesArg = any;

type Estado = "confirmada" | "pendiente" | "cancelada";

type Reserva = {
  id: string;
  cliente: string;
  cliente_id: string | null;
  fecha: string;
  hora: string;
  personas: number;
  email: string | null;
  estado: Estado;
  telefono: string | null;
  restaurante_id: string;
  fecha_hora_reserva: string;
  atendida: boolean | null;
  resena_solicitada: boolean;
  ya_dejo_resena: boolean;
};

type Filtro = "todas" | "hoy" | "pendientes";
type Vista = "calendario" | "tabla";

function getHoraMadrid() {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function EstadoBadge({ estado }: { estado: Estado }) {
  if (estado === "confirmada") {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-300" />
        Confirmada
      </span>
    );
  }

  if (estado === "pendiente") {
    return (
      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-amber-500/20 bg-amber-500/10 text-amber-800 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-300" />
        Pendiente
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-100">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-300" />
      Cancelada
    </span>
  );
}

function AtendidaBadge({ atendida }: { atendida: boolean | null }) {
  if (atendida === true) {
    return (
      <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-300" />
        Ha venido
      </span>
    );
  }

  if (atendida === false) {
    return (
      <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-700 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-100">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600 dark:bg-rose-300" />
        No ha venido
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border border-slate-500/15 bg-slate-500/10 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-300" />
      Sin marcar
    </span>
  );
}

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [restauranteId, setRestauranteId] = useState<string | null>(null);

  const loadingRef = useRef(false);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [loadingReservas, setLoadingReservas] = useState(true);
  const [refreshingReservas, setRefreshingReservas] = useState(false);
  const [errorReservas, setErrorReservas] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("Actualizado");

  const [vista, setVista] = useState<Vista>("calendario");

  const [showDetalle, setShowDetalle] = useState(false);
  const [reservaSeleccionada, setReservaSeleccionada] =
    useState<Reserva | null>(null);

  const [puntosActivo, setPuntosActivo] = useState(false);
  const [puntosPorEuro, setPuntosPorEuro] = useState<number>(1);

  const [showGastoModal, setShowGastoModal] = useState(false);
  const [reservaParaGasto, setReservaParaGasto] = useState<Reserva | null>(
    null
  );
  const [gastoInput, setGastoInput] = useState<string>("");

  const [isDark, setIsDark] = useState(false);

  const queryClient = useQueryClient();
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();

    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });

    return () => obs.disconnect();
  }, []);

  const calendarStyle = useMemo(() => {
    const vars: Record<string, string> = isDark
      ? {
          "--fc-border-color": "rgba(255,255,255,0.10)",
          "--fc-page-bg-color": "transparent",
          "--fc-neutral-bg-color": "rgba(255,255,255,0.04)",
          "--fc-today-bg-color": "rgba(59,130,246,0.10)",
          "--fc-list-event-hover-bg-color": "rgba(255,255,255,0.06)",
          "--fc-button-text-color": "rgba(248,250,252,1)",
          "--fc-button-bg-color": "rgba(255,255,255,0.08)",
          "--fc-button-border-color": "rgba(255,255,255,0.14)",
          "--fc-button-hover-bg-color": "rgba(255,255,255,0.12)",
          "--fc-button-hover-border-color": "rgba(255,255,255,0.18)",
          "--fc-button-active-bg-color": "rgba(255,255,255,0.18)",
          "--fc-button-active-border-color": "rgba(255,255,255,0.22)",
          "--fc-button-active-text-color": "rgba(255,255,255,1)",
          "--fc-event-text-color": "rgba(248,250,252,1)",
          "--fc-more-link-text-color": "rgba(226,232,240,1)",
        }
      : {
          "--fc-border-color": "rgba(2,6,23,0.12)",
          "--fc-page-bg-color": "transparent",
          "--fc-neutral-bg-color": "rgba(2,6,23,0.03)",
          "--fc-today-bg-color": "rgba(59,130,246,0.08)",
          "--fc-list-event-hover-bg-color": "rgba(2,6,23,0.04)",
          "--fc-button-text-color": "rgba(15,23,42,1)",
          "--fc-button-bg-color": "rgba(255,255,255,0.95)",
          "--fc-button-border-color": "rgba(2,6,23,0.12)",
          "--fc-button-hover-bg-color": "rgba(2,6,23,0.04)",
          "--fc-button-hover-border-color": "rgba(2,6,23,0.14)",
          "--fc-button-active-bg-color": "rgba(2,6,23,0.08)",
          "--fc-button-active-border-color": "rgba(2,6,23,0.16)",
          "--fc-button-active-text-color": "rgba(15,23,42,1)",
          "--fc-event-text-color": "rgba(15,23,42,1)",
          "--fc-more-link-text-color": "rgba(15,23,42,0.85)",
        };

    return vars as unknown as CSSProperties;
  }, [isDark]);

  useEffect(() => {
    if (loadingRestaurante) return;

    const id = (restauranteActual as any)?.id ?? null;

    setRestauranteId(id);

    if (!id) {
      setReservas([]);
      setLoadingReservas(false);
    }
  }, [restauranteActual, loadingRestaurante]);

  const cargarConfigPuntos = useCallback(async (rid: string) => {
    try {
const result = await withTimeout(
  supabase
    .from("fidelizacion_config")
    .select("puntos_por_euro")
    .eq("restaurante_id", rid)
    .maybeSingle(),
  20000
);

if (!result) {
  setPuntosActivo(false);
  setPuntosPorEuro(1);
  return;
}

const { data, error } = result;

      if (error) {
        setPuntosActivo(false);
        setPuntosPorEuro(1);
        return;
      }

      const ratio = Number(data?.puntos_por_euro ?? 0);
      setPuntosPorEuro(ratio > 0 ? ratio : 1);
      setPuntosActivo(ratio > 0);
    } catch (error) {
      console.error("ERROR CONFIG PUNTOS", error);
      setPuntosActivo(false);
      setPuntosPorEuro(1);
    }
  }, []);

  const cargarReservas = useCallback(
    async (modo: "inicial" | "refresh" = "refresh") => {
      if (!restauranteId || loadingRef.current) return;

      loadingRef.current = true;

      if (modo === "inicial") {
        setLoadingReservas(true);
      } else {
        setRefreshingReservas(true);
      }

      setErrorReservas(null);

      try {
        const ahora = new Date();

        const desde = new Date(ahora);
        desde.setDate(desde.getDate() - 90);

        const hasta = new Date(ahora);
        hasta.setDate(hasta.getDate() + 180);

const result = await withTimeout(
  supabase
    .from("reservas")
    .select(
      `
        id,
        nombre_cliente,
        cliente_id,
        telefono,
        email,
        restaurante_id,
        fecha_hora_reserva,
        personas,
        estado,
        atendida,
        resena_solicitada,
        clientes:cliente_id (
          ya_dejo_resena
        )
      `
    )
    .eq("restaurante_id", restauranteId)
    .gte("fecha_hora_reserva", desde.toISOString())
    .lte("fecha_hora_reserva", hasta.toISOString())
    .order("fecha_hora_reserva", { ascending: true })
    .limit(300),
  20000
);

if (!result) {
  setErrorReservas("La carga de reservas ha tardado demasiado.");
  return;
}

const { data, error } = result;

if (error) {
  console.warn("RESERVAS ERROR", error);
  setErrorReservas("No se pudieron cargar las reservas.");
  return;
}

const hoyKey = new Date().toDateString();

const formateadas: Reserva[] = (data || []).map((r: any) => {
  const fechaDate = new Date(r.fecha_hora_reserva);

  return {
    id: r.id,
    cliente: r.nombre_cliente ?? "Cliente",
    cliente_id: r.cliente_id ?? null,
    telefono: r.telefono ?? null,
    email: r.email ?? null,
    restaurante_id: r.restaurante_id,
    fecha_hora_reserva: r.fecha_hora_reserva,
    fecha:
      fechaDate.toDateString() === hoyKey
        ? "Hoy"
        : fechaDate.toLocaleDateString("es-ES"),
    hora: fechaDate.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    personas: Number(r.personas ?? 0),
    estado: (r.estado || "pendiente") as Estado,
    atendida: r.atendida,
    resena_solicitada: Boolean(r.resena_solicitada),
    ya_dejo_resena: r.clientes?.ya_dejo_resena ?? false,
  };
});

        setReservas(formateadas);
        setLastUpdated(`Actualizado ${getHoraMadrid()}`);
      } catch (error) {
        console.error("ERROR GENERAL CARGANDO RESERVAS", error);
        setErrorReservas("La carga de reservas ha tardado demasiado.");
      } finally {
        loadingRef.current = false;
        setLoadingReservas(false);
        setRefreshingReservas(false);
      }
    },
    [restauranteId]
  );

  useEffect(() => {
    if (!restauranteId) return;

    cargarReservas("inicial");
    cargarConfigPuntos(restauranteId);
  }, [restauranteId, cargarReservas, cargarConfigPuntos]);

  useAutoRefresh(
    async () => {
      await cargarReservas("refresh");
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
      queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
      cargarReservas("refresh");
    }, 800);
  }, [cargarReservas, queryClient]);

  useEffect(() => {
    if (!restauranteId) return;

    const channelReservas = supabase
      .channel(`reservas-page-${restauranteId}`)
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

    return () => {
      if (realtimeTimerRef.current) {
        clearTimeout(realtimeTimerRef.current);
      }

      supabase.removeChannel(channelReservas);
    };
  }, [restauranteId, programarRefreshRealtime]);

  const actualizarEstado = async (id: string, nuevoEstado: Estado) => {
    if (!restauranteId) return;

    const reservaActual =
      reservas.find((r) => r.id === id) ||
      (reservaSeleccionada?.id === id ? reservaSeleccionada : null);

    const payload =
      nuevoEstado === "cancelada"
        ? { estado: nuevoEstado, atendida: null }
        : { estado: nuevoEstado };

    const { error } = await supabase
      .from("reservas")
      .update(payload)
      .eq("id", id)
      .eq("restaurante_id", restauranteId);

    if (error) return;

    setReservas((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              estado: nuevoEstado,
              atendida: nuevoEstado === "cancelada" ? null : r.atendida,
            }
          : r
      )
    );

    if (reservaSeleccionada?.id === id) {
      setReservaSeleccionada((prev) =>
        prev
          ? {
              ...prev,
              estado: nuevoEstado,
              atendida: nuevoEstado === "cancelada" ? null : prev.atendida,
            }
          : prev
      );
    }

    if (
      reservaActual?.cliente_id &&
      (nuevoEstado === "cancelada" || nuevoEstado === "confirmada")
    ) {
      const fechaReserva = reservaActual.fecha_hora_reserva
        ? new Date(reservaActual.fecha_hora_reserva).toLocaleString("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : null;

      const titulo =
        nuevoEstado === "cancelada"
          ? "Reserva cancelada"
          : "Reserva confirmada";

      const mensaje =
        nuevoEstado === "cancelada"
          ? fechaReserva
            ? `El restaurante ha cancelado tu reserva del ${fechaReserva}.`
            : "El restaurante ha cancelado tu reserva."
          : fechaReserva
          ? `El restaurante ha confirmado tu reserva del ${fechaReserva}.`
          : "El restaurante ha confirmado tu reserva.";

      await supabase.from("cliente_notificaciones").insert({
        restaurante_id: restauranteId,
        cliente_id: reservaActual.cliente_id,
        tipo: "reserva",
        titulo,
        mensaje,
        url: null,
        leida: false,
      });
    }

    try {
      await fetch("https://n8n.gastrohelp.es/webhook/reserva-estado-cambiado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reserva_id: id,
          estado: nuevoEstado,
          restaurante_id: restauranteId,
        }),
      });
    } catch {}

    programarRefreshRealtime();
  };

  const marcarHaVenido = async (
    reserva: Reserva,
    valor: boolean,
    gastoEur?: number | null
  ) => {
    if (!restauranteId) return;
    if (procesando === reserva.id || reserva.atendida !== null) return;

    setProcesando(reserva.id);

    const { data, error } = await supabase
      .from("reservas")
      .update({ atendida: valor })
      .eq("id", reserva.id)
      .eq("restaurante_id", restauranteId)
      .select("id");

    if (error) {
      setProcesando(null);
      return;
    }

    if (!data || data.length === 0) {
      setProcesando(null);
      return;
    }

    if (valor === false) {
      setReservas((prev) =>
        prev.map((r) => (r.id === reserva.id ? { ...r, atendida: false } : r))
      );

      if (reservaSeleccionada?.id === reserva.id) {
        setReservaSeleccionada((prev) =>
          prev ? { ...prev, atendida: false } : prev
        );
      }

      if (reserva.cliente_id) {
        await supabase.from("cliente_notificaciones").insert({
          restaurante_id: reserva.restaurante_id,
          cliente_id: reserva.cliente_id,
          tipo: "reserva",
          titulo: "Reserva marcada como no asistida",
          mensaje: "El restaurante ha marcado que no asististe a esta reserva.",
          url: null,
          leida: false,
        });
      }

      setProcesando(null);
      programarRefreshRealtime();
      return;
    }

    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("restaurante_id", reserva.restaurante_id)
      .eq("telefono", reserva.telefono)
      .maybeSingle();

    let clienteIdFinal = clienteExistente?.id;

    if (!clienteIdFinal) {
      const { data: nuevoCliente, error: errNuevo } = await supabase
        .from("clientes")
        .insert({
          restaurante_id: reserva.restaurante_id,
          nombre: reserva.cliente,
          telefono: reserva.telefono,
          visitas_totales: 0,
        })
        .select("id")
        .single();

      if (errNuevo || !nuevoCliente) {
        setProcesando(null);
        return;
      }

      clienteIdFinal = nuevoCliente.id;
    }

    const gastoValido =
      typeof gastoEur === "number" &&
      Number.isFinite(gastoEur) &&
      gastoEur > 0;

    if (gastoValido) {
      await supabase.rpc("rpc_registrar_gasto", {
        p_cliente_id: clienteIdFinal,
        p_restaurante_id: reserva.restaurante_id,
        p_gasto: gastoEur,
      });
    }

    const fechaEvento = new Date(reserva.fecha_hora_reserva);

    await supabase.from("clientes_historial").upsert(
      {
        cliente_id: clienteIdFinal,
        restaurante_id: reserva.restaurante_id,
        reserva_id: reserva.id,
        tipo: "visita",
        personas: reserva.personas,
        created_at: fechaEvento.toISOString(),
        gasto_eur: gastoValido ? gastoEur : null,
      },
      { onConflict: "reserva_id" }
    );

    const puntosCalculados =
      gastoValido && puntosActivo
        ? Math.floor(Number(gastoEur) * Number(puntosPorEuro))
        : 0;

    await supabase.from("cliente_notificaciones").insert({
      restaurante_id: reserva.restaurante_id,
      cliente_id: clienteIdFinal,
      tipo: gastoValido && puntosActivo ? "puntos" : "info",
      titulo:
        gastoValido && puntosActivo ? "Puntos añadidos" : "Visita registrada",
      mensaje:
        gastoValido && puntosActivo
          ? `El restaurante ha registrado tu visita con un gasto de ${gastoEur}€. Se han añadido ${puntosCalculados} puntos a tu cuenta.`
          : "El restaurante ha registrado tu visita en el historial.",
      url: null,
      leida: false,
    });

    setReservas((prev) =>
      prev.map((r) => (r.id === reserva.id ? { ...r, atendida: true } : r))
    );

    if (reservaSeleccionada?.id === reserva.id) {
      setReservaSeleccionada((prev) =>
        prev ? { ...prev, atendida: true } : prev
      );
    }

    fetch("https://n8n.gastrohelp.es/webhook/resena-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reserva_id: reserva.id,
        restaurante_id: reserva.restaurante_id,
        cliente_id: clienteIdFinal,
        email: reserva.email,
        nombre: reserva.cliente,
        telefono: reserva.telefono,
        resena_solicitada: reserva.resena_solicitada,
        ya_dejo_resena: reserva.ya_dejo_resena,
        gasto_eur: gastoValido ? gastoEur : null,
        puntos_activo: puntosActivo,
        puntos_por_euro: puntosPorEuro,
      }),
    });

    setProcesando(null);
    programarRefreshRealtime();
  };

  const clickHaVenido = (r: Reserva) => {
    if (!puntosActivo) {
      marcarHaVenido(r, true);
      return;
    }

    setReservaParaGasto(r);
    setGastoInput("");
    setShowGastoModal(true);
  };

  const confirmarGastoYMarcar = async () => {
    if (!reservaParaGasto) return;

    const raw = (gastoInput || "").trim().replace(",", ".");
    const n = raw === "" ? null : Number(raw);
    const gasto = n !== null && Number.isFinite(n) && n >= 0 ? n : null;

    setShowGastoModal(false);
    await marcarHaVenido(reservaParaGasto, true, gasto);

    setReservaParaGasto(null);
    setGastoInput("");
  };

  const reservasFiltradas = useMemo(() => {
    return reservas
      .filter((r) => {
        if (filtro === "hoy") return r.fecha === "Hoy";
        if (filtro === "pendientes") return r.estado === "pendiente";
        return true;
      })
      .filter((r) =>
        r.cliente.toLowerCase().includes(busqueda.toLowerCase().trim())
      );
  }, [reservas, filtro, busqueda]);

  const eventos = useMemo(() => {
    return reservasFiltradas.map((r) => {
      const start = new Date(r.fecha_hora_reserva);
      const end = new Date(start.getTime() + 90 * 60 * 1000);

      return {
        id: r.id,
        title: `${r.cliente} · ${r.personas}p`,
        start,
        end,
        extendedProps: { estado: r.estado, atendida: r.atendida },
      };
    });
  }, [reservasFiltradas]);

  const abrirDetalleReserva = (id: string) => {
    const r = reservas.find((x) => x.id === id) || null;
    setReservaSeleccionada(r);
    setShowDetalle(!!r);
  };

  const eventClassNames = (arg: EventClassNamesArg) => {
    const estado = (arg.event.extendedProps as any)?.estado as
      | Estado
      | undefined;
    const atendida = (arg.event.extendedProps as any)?.atendida as
      | boolean
      | null
      | undefined;

    const base = [
      "!border",
      "!rounded-lg",
      "!px-0",
      "!py-0",
      "shadow-sm",
      "hover:shadow-md",
      "transition-shadow",
      "!opacity-100",
      "cursor-pointer",
      "select-none",
      "overflow-hidden",
      "!text-slate-900",
      "dark:!text-white",
    ];

    if (estado === "cancelada") {
      return [
        ...base,
        "!border-rose-200",
        "dark:!border-rose-400/30",
        "!bg-rose-50",
        "dark:!bg-rose-400/10",
      ];
    }

    if (estado === "pendiente") {
      return [
        ...base,
        "!border-amber-200",
        "dark:!border-amber-400/30",
        "!bg-amber-50",
        "dark:!bg-amber-400/10",
      ];
    }

    if (atendida === true) {
      return [
        ...base,
        "!border-emerald-200",
        "dark:!border-emerald-400/30",
        "!bg-emerald-50",
        "dark:!bg-emerald-400/10",
      ];
    }

    return [
      ...base,
      "!border-sky-200",
      "dark:!border-sky-400/30",
      "!bg-sky-50",
      "dark:!bg-sky-400/10",
    ];
  };

  const eventContent = (arg: EventContentArg) => {
    const estado = (arg.event.extendedProps as any)?.estado as
      | Estado
      | undefined;
    const atendida = (arg.event.extendedProps as any)?.atendida as
      | boolean
      | null
      | undefined;

    const dotClass =
      estado === "cancelada"
        ? "bg-rose-500 dark:bg-rose-300"
        : estado === "pendiente"
        ? "bg-amber-500 dark:bg-amber-300"
        : atendida === true
        ? "bg-emerald-500 dark:bg-emerald-300"
        : "bg-sky-500 dark:bg-sky-300";

    const txt = isDark ? "#f8fafc" : "#0f172a";

    return (
      <div className="px-2 py-1.5 min-w-0" style={{ color: txt }}>
        <div className="flex items-center gap-2 min-w-0" style={{ color: txt }}>
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          {arg.timeText ? (
            <span
              className="shrink-0 text-[11px] font-semibold"
              style={{ color: txt }}
            >
              {arg.timeText}
            </span>
          ) : null}
          <span
            className="truncate text-[11px] font-medium"
            style={{ color: txt }}
          >
            {arg.event.title}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
            Reservas
          </h1>

          <div className="hidden sm:flex items-center rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setVista("calendario")}
              className={[
                "px-3 py-1 text-xs rounded-full transition",
                vista === "calendario"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
              ].join(" ")}
            >
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setVista("tabla")}
              className={[
                "px-3 py-1 text-xs rounded-full transition",
                vista === "tabla"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
              ].join(" ")}
            >
              Tabla
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <div className="sm:hidden flex items-center rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setVista("calendario")}
              className={[
                "px-3 py-1 text-xs rounded-full transition",
                vista === "calendario"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
              ].join(" ")}
            >
              Calendario
            </button>
            <button
              type="button"
              onClick={() => setVista("tabla")}
              className={[
                "px-3 py-1 text-xs rounded-full transition",
                vista === "tabla"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
              ].join(" ")}
            >
              Tabla
            </button>
          </div>

          <button
            type="button"
            onClick={() => cargarReservas("refresh")}
            disabled={!restauranteId || refreshingReservas || loadingReservas}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            Refrescar
          </button>

          <button
            type="button"
            disabled={!restauranteId}
            onClick={() => setOpenModal(true)}
            className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm shadow-sm hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-slate-900"
          >
            Añadir reserva
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex items-center gap-2">
            <span className="text-xs text-slate-600 dark:text-slate-300">
              Filtro
            </span>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:ring-white/10"
            >
              <option value="todas">Todas</option>
              <option value="hoy">Hoy</option>
              <option value="pendientes">Pendientes</option>
            </select>
          </div>

          <div className="relative">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente..."
              className="h-9 w-full sm:w-80 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-white/10"
            />
          </div>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-300">
          {reservasFiltradas.length} reserva
          {reservasFiltradas.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
        <span>{lastUpdated}</span>
        {refreshingReservas && <span>Refrescando reservas...</span>}
      </div>

      {errorReservas && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
          {errorReservas}
        </div>
      )}

      {loadingReservas && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
          Cargando reservas...
        </div>
      )}

      {vista === "calendario" && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200/70 bg-white/70 backdrop-blur dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                Calendario
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-300">
                Click en un evento para ver acciones
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4" style={calendarStyle}>
            <FullCalendar
              key={isDark ? "dark" : "light"}
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale="es"
              firstDay={1}
              height="auto"
              nowIndicator={true}
              dayMaxEvents={4}
              moreLinkClick="day"
              moreLinkText="más"
              eventDisplay="block"
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{
                today: "Hoy",
                month: "Mes",
                week: "Semana",
                day: "Día",
              }}
              titleFormat={{ year: "numeric", month: "long" }}
              dayHeaderFormat={{ weekday: "short" }}
              events={eventos as any}
              slotMinTime="08:00:00"
              slotMaxTime="24:00:00"
              allDaySlot={false}
              eventTextColor={isDark ? "#f8fafc" : "#0f172a"}
              eventClick={(info) => abrirDetalleReserva(info.event.id)}
              eventDidMount={(info) => {
                const color = isDark ? "#f8fafc" : "#0f172a";

                (info.el as HTMLElement).style.setProperty(
                  "color",
                  color,
                  "important"
                );

                info.el
                  .querySelectorAll<HTMLElement>(
                    ".fc-event-main, .fc-event-main-frame, .fc-event-time, .fc-event-title, .fc-event-title-container"
                  )
                  .forEach((el) =>
                    el.style.setProperty("color", color, "important")
                  );
              }}
              eventClassNames={eventClassNames}
              eventContent={eventContent}
            />
          </div>
        </div>
      )}

      {vista === "tabla" && (
        <div className="card overflow-hidden">
          <div
            className="overflow-x-auto reservas-table"
            style={{
              ["--tbl-text" as any]: isDark
                ? "rgba(248,250,252,1)"
                : "rgba(15,23,42,1)",
              ["--tbl-head" as any]: isDark
                ? "rgba(226,232,240,1)"
                : "rgba(51,65,85,1)",
              ["--tbl-border" as any]: isDark
                ? "rgba(255,255,255,0.10)"
                : "rgba(2,6,23,0.12)",
            }}
          >
            <style jsx>{`
              .reservas-table table {
                border-collapse: collapse !important;
              }

              .reservas-table table,
              .reservas-table tbody,
              .reservas-table td {
                color: var(--tbl-text) !important;
              }

              .reservas-table thead th {
                color: var(--tbl-head) !important;
              }

              .reservas-table tbody td {
                border-bottom: 1px solid var(--tbl-border) !important;
              }

              .reservas-table tbody tr:last-child td {
                border-bottom: 0 !important;
              }
            `}</style>

            <table className="w-full text-sm">
              <thead className="border-b border-slate-200/70 bg-white/70 backdrop-blur sticky top-0 z-10 dark:border-white/10 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-6 py-3 text-left font-semibold">Hora</th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Personas
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">Estado</th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Acciones
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">
                    Ha venido
                  </th>
                </tr>
              </thead>

              <tbody>
                {reservasFiltradas.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-white/5"
                  >
                    <td className="px-6 py-4 font-medium">{r.cliente}</td>
                    <td className="px-6 py-4">{r.fecha}</td>
                    <td className="px-6 py-4">{r.hora}</td>
                    <td className="px-6 py-4">{r.personas}</td>

                    <td className="px-6 py-4">
                      <EstadoBadge estado={r.estado} />
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {r.estado === "pendiente" && (
                          <button
                            onClick={() =>
                              actualizarEstado(r.id, "confirmada")
                            }
                            className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white shadow-sm hover:shadow-md transition-shadow"
                          >
                            Confirmar
                          </button>
                        )}

                        {r.estado !== "cancelada" && (
                          <button
                            onClick={() =>
                              actualizarEstado(r.id, "cancelada")
                            }
                            className="text-xs px-3 py-1.5 rounded-lg bg-rose-600 text-white shadow-sm hover:shadow-md transition-shadow"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      {r.atendida === null && r.estado === "confirmada" && (
                        <div className="flex gap-2">
                          <button
                            disabled={procesando === r.id}
                            onClick={() => clickHaVenido(r)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-emerald-500/30 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/15"
                            title={
                              puntosActivo
                                ? "Ha venido (pedirá gasto)"
                                : "Ha venido"
                            }
                          >
                            ✓
                          </button>

                          <button
                            disabled={procesando === r.id}
                            onClick={() => marcarHaVenido(r, false)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-rose-500/30 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-100 dark:hover:bg-rose-400/15"
                            title="No ha venido"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {r.atendida !== null && (
                        <AtendidaBadge atendida={r.atendida} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loadingReservas && reservasFiltradas.length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-300">
                No hay reservas con los filtros actuales.
              </div>
            )}
          </div>
        </div>
      )}

      <AddReservaModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        restauranteId={restauranteId}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.reservas.all });
          cargarReservas("refresh");
        }}
      />

      {showDetalle && reservaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div
            className="w-full max-w-lg rounded-2xl p-5 shadow-xl border"
            style={{
              backgroundColor: isDark ? "#020617" : "#ffffff",
              borderColor: isDark
                ? "rgba(255,255,255,0.10)"
                : "rgba(2,6,23,0.12)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="text-sm font-semibold truncate"
                  style={{ color: isDark ? "#f8fafc" : "#0f172a" }}
                >
                  {reservaSeleccionada.cliente}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span
                    className="text-xs"
                    style={{
                      color: isDark
                        ? "rgba(226,232,240,0.85)"
                        : "rgba(71,85,105,1)",
                    }}
                  >
                    {new Date(
                      reservaSeleccionada.fecha_hora_reserva
                    ).toLocaleString("es-ES")}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: isDark
                        ? "rgba(148,163,184,1)"
                        : "rgba(148,163,184,1)",
                    }}
                  >
                    •
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: isDark
                        ? "rgba(226,232,240,0.85)"
                        : "rgba(71,85,105,1)",
                    }}
                  >
                    {reservaSeleccionada.personas} persona
                    {reservaSeleccionada.personas === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <EstadoBadge estado={reservaSeleccionada.estado} />
                  <AtendidaBadge atendida={reservaSeleccionada.atendida} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowDetalle(false);
                  setReservaSeleccionada(null);
                }}
                className="rounded-lg px-3 py-1 text-xs border"
                style={{
                  borderColor: isDark
                    ? "rgba(255,255,255,0.12)"
                    : "rgba(2,6,23,0.12)",
                  color: isDark
                    ? "rgba(226,232,240,1)"
                    : "rgba(51,65,85,1)",
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(255,255,255,1)",
                }}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,1)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(2,6,23,0.12)",
                }}
              >
                <div
                  className="text-xs"
                  style={{
                    color: isDark
                      ? "rgba(226,232,240,0.75)"
                      : "rgba(100,116,139,1)",
                  }}
                >
                  Teléfono
                </div>
                <div
                  className="mt-1 text-sm font-medium break-words"
                  style={{ color: isDark ? "#f8fafc" : "#0f172a" }}
                >
                  {reservaSeleccionada.telefono || "-"}
                </div>
              </div>

              <div
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,1)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(2,6,23,0.12)",
                }}
              >
                <div
                  className="text-xs"
                  style={{
                    color: isDark
                      ? "rgba(226,232,240,0.75)"
                      : "rgba(100,116,139,1)",
                  }}
                >
                  Email
                </div>
                <div
                  className="mt-1 text-sm font-medium break-words"
                  style={{ color: isDark ? "#f8fafc" : "#0f172a" }}
                >
                  {reservaSeleccionada.email || "-"}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <div
                className="rounded-xl border p-3"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,1)",
                  borderColor: isDark
                    ? "rgba(255,255,255,0.10)"
                    : "rgba(2,6,23,0.12)",
                }}
              >
                <div
                  className="text-xs"
                  style={{
                    color: isDark
                      ? "rgba(226,232,240,0.75)"
                      : "rgba(100,116,139,1)",
                  }}
                >
                  Acciones
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {reservaSeleccionada.estado === "pendiente" && (
                    <button
                      onClick={async () => {
                        await actualizarEstado(
                          reservaSeleccionada.id,
                          "confirmada"
                        );
                      }}
                      className="text-xs px-3 py-2 rounded-lg bg-emerald-600 text-white shadow-sm hover:shadow-md transition-shadow"
                    >
                      Confirmar
                    </button>
                  )}

                  {reservaSeleccionada.estado !== "cancelada" && (
                    <button
                      onClick={async () => {
                        await actualizarEstado(
                          reservaSeleccionada.id,
                          "cancelada"
                        );
                      }}
                      className="text-xs px-3 py-2 rounded-lg bg-rose-600 text-white shadow-sm hover:shadow-md transition-shadow"
                    >
                      Cancelar
                    </button>
                  )}

                  {reservaSeleccionada.atendida === null &&
                    reservaSeleccionada.estado === "confirmada" && (
                      <>
                        <button
                          disabled={procesando === reservaSeleccionada.id}
                          onClick={() => clickHaVenido(reservaSeleccionada)}
                          className="text-xs px-3 py-2 rounded-lg border border-emerald-500/30 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50"
                          style={{
                            backgroundColor: isDark
                              ? "rgba(16,185,129,0.12)"
                              : undefined,
                            color: isDark
                              ? "rgba(167,243,208,1)"
                              : undefined,
                            borderColor: isDark
                              ? "rgba(16,185,129,0.25)"
                              : undefined,
                          }}
                          title={
                            puntosActivo
                              ? "Ha venido (pedirá gasto)"
                              : "Ha venido"
                          }
                        >
                          ✓ Ha venido
                        </button>

                        <button
                          disabled={procesando === reservaSeleccionada.id}
                          onClick={async () => {
                            await marcarHaVenido(reservaSeleccionada, false);
                          }}
                          className="text-xs px-3 py-2 rounded-lg border border-rose-500/30 text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-50"
                          style={{
                            backgroundColor: isDark
                              ? "rgba(244,63,94,0.10)"
                              : undefined,
                            color: isDark
                              ? "rgba(254,205,211,1)"
                              : undefined,
                            borderColor: isDark
                              ? "rgba(244,63,94,0.22)"
                              : undefined,
                          }}
                        >
                          ✕ No ha venido
                        </button>
                      </>
                    )}
                </div>
              </div>

              <div
                className="text-xs"
                style={{
                  color: isDark
                    ? "rgba(226,232,240,0.75)"
                    : "rgba(100,116,139,1)",
                }}
              >
                Esto mantiene la lógica actual de reservas, puntos y webhooks.
              </div>
            </div>
          </div>
        </div>
      )}

      {showGastoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  Registrar gasto
                </div>
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                  Solo suma puntos si introduces gasto (€).
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowGastoModal(false);
                  setReservaParaGasto(null);
                  setGastoInput("");
                }}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Gasto (€)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={gastoInput}
                onChange={(e) => setGastoInput(e.target.value)}
                placeholder="Ej: 35,50"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-white/10"
              />
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-300">
                Relación actual: {puntosPorEuro} puntos por €.
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGastoModal(false);
                  setReservaParaGasto(null);
                  setGastoInput("");
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarGastoYMarcar}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-sm hover:shadow-md transition-shadow dark:bg-white dark:text-slate-900"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}