"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { useTheme } from "../components/ThemeProvider";
import { useRestaurante } from "../../hooks/useRestaurante";

type Zona = {
  id: string;
  nombre: string;
  orden: number;
  activa: boolean;
};

type Mesa = {
  id: string;
  nombre: string;
  capacidad: number;
  orden: number;
  activa: boolean;
  bloqueada: boolean;
  zona_id: string | null;
};

type ReservaSala = {
  id: string;
  mesa_id: string | null;
  nombre_cliente: string | null;
  telefono: string | null;
  personas: number | null;
  fecha_hora_reserva: string;
  estado: string | null;
  origen: string | null;
  notas: string | null;
  atendida: boolean | null;
  consumo_total: number | null;
  puntos_generados: number | null;
};

type FranjaConfig = {
  inicioMin: number;
  finMin: number;
  label: string;
};

type TurnoConfig = {
  key: "comida" | "cena";
  label: string;
  rangoTexto: string;
  inicioMin: number;
  finMin: number;
  franjas: FranjaConfig[];
};

type MesaConReserva = {
  mesa: Mesa;
  reserva: ReservaSala | null;
  estadoMesa: "libre" | "reservada" | "ocupada" | "atendida" | "bloqueada";
};

function normalizarEstado(estado: string | null | undefined) {
  return (estado ?? "").toString().trim().toLowerCase();
}

function parseFechaLocal(fecha: string) {
  return new Date(fecha.replace(" ", "T"));
}

function formatDateInput(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateFromInput(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatearHora(fecha: string) {
  const d = parseFechaLocal(fecha);
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatearFechaCompleta(fecha: Date) {
  return fecha.toLocaleDateString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toSqlDateTimeLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${h}:${min}:${s}`;
}

function minutosDelDia(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatearMinutos(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function parseHoraMinutos(valor: string) {
  const limpio = valor.trim();
  const match = limpio.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const horas = Number(match[1]);
  const minutos = Number(match[2]);

  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;

  return horas * 60 + minutos;
}

function parseRangoHorario(rango: string | null | undefined) {
  if (!rango || typeof rango !== "string") return null;

  const limpio = rango.replace(/\s+/g, "");
  const partes = limpio.split("-");
  if (partes.length !== 2) return null;

  const inicioMin = parseHoraMinutos(partes[0]);
  const finMin = parseHoraMinutos(partes[1]);

  if (inicioMin === null || finMin === null || finMin <= inicioMin) return null;

  return {
    inicioMin,
    finMin,
    rangoTexto: `${partes[0]} - ${partes[1]}`,
  };
}

function leerRangoTurno(restaurante: any, turno: "comida" | "cena") {
  if (!restaurante) return null;

  if (
    restaurante.horarios &&
    typeof restaurante.horarios === "object" &&
    typeof restaurante.horarios[turno] === "string"
  ) {
    return restaurante.horarios[turno];
  }

  const claves =
    turno === "comida"
      ? [
          "horario_comida",
          "horarioComida",
          "comida",
          "franja_comida",
          "franjaComida",
          "servicio_comida",
          "servicioComida",
        ]
      : [
          "horario_cena",
          "horarioCena",
          "cena",
          "franja_cena",
          "franjaCena",
          "servicio_cena",
          "servicioCena",
        ];

  for (const clave of claves) {
    if (typeof restaurante?.[clave] === "string" && restaurante[clave].trim()) {
      return restaurante[clave];
    }
  }

  return null;
}

function construirFranjas(inicioMin: number, finMin: number) {
  const franjas: FranjaConfig[] = [];
  let actual = inicioMin;

  while (actual < finMin) {
    const siguiente = Math.min(actual + 60, finMin);
    franjas.push({
      inicioMin: actual,
      finMin: siguiente,
      label: `${formatearMinutos(actual)} - ${formatearMinutos(siguiente)}`,
    });
    actual = siguiente;
  }

  return franjas;
}

function construirTurnos(restaurante: any): TurnoConfig[] {
  const salida: TurnoConfig[] = [];

  const rangoComida = parseRangoHorario(leerRangoTurno(restaurante, "comida"));
  const rangoCena = parseRangoHorario(leerRangoTurno(restaurante, "cena"));

  if (rangoComida) {
    salida.push({
      key: "comida",
      label: "Comida",
      rangoTexto: rangoComida.rangoTexto,
      inicioMin: rangoComida.inicioMin,
      finMin: rangoComida.finMin,
      franjas: construirFranjas(rangoComida.inicioMin, rangoComida.finMin),
    });
  }

  if (rangoCena) {
    salida.push({
      key: "cena",
      label: "Cena",
      rangoTexto: rangoCena.rangoTexto,
      inicioMin: rangoCena.inicioMin,
      finMin: rangoCena.finMin,
      franjas: construirFranjas(rangoCena.inicioMin, rangoCena.finMin),
    });
  }

  return salida.sort((a, b) => a.inicioMin - b.inicioMin);
}

function reservaDentroTurno(reserva: ReservaSala, turno: TurnoConfig) {
  const fecha = parseFechaLocal(reserva.fecha_hora_reserva);
  const min = minutosDelDia(fecha);
  return min >= turno.inicioMin && min < turno.finMin;
}

const DURACION_RESERVA_MINUTOS = 90;

function reservaInicioMinutos(reserva: ReservaSala) {
  const fecha = parseFechaLocal(reserva.fecha_hora_reserva);
  return minutosDelDia(fecha);
}

function reservaDentroFranja(reserva: ReservaSala, franja: FranjaConfig) {
  const inicio = reservaInicioMinutos(reserva);
  const fin = inicio + DURACION_RESERVA_MINUTOS;

  return inicio < franja.finMin && fin > franja.inicioMin;
}

function indiceFranjaReserva(turno: TurnoConfig | null | undefined, reserva: ReservaSala) {
  if (!turno) return 0;

  const inicio = reservaInicioMinutos(reserva);
  const index = turno.franjas.findIndex(
    (franja) => inicio >= franja.inicioMin && inicio < franja.finMin
  );

  return index >= 0 ? index : 0;
}

function indicePrimeraFranjaConReservas(turno: TurnoConfig | null | undefined, reservas: ReservaSala[]) {
  if (!turno || turno.franjas.length === 0) return 0;

  const reservasTurno = reservas
    .filter((reserva) => reservaDentroTurno(reserva, turno))
    .sort((a, b) => parseFechaLocal(a.fecha_hora_reserva).getTime() - parseFechaLocal(b.fecha_hora_reserva).getTime());

  if (reservasTurno.length === 0) return 0;

  return indiceFranjaReserva(turno, reservasTurno[0]);
}

function elegirTurnoInicial(
  turnos: TurnoConfig[],
  reservasHoy: ReservaSala[],
  ahora: Date
) {
  if (turnos.length === 0) return null;

  const minAhora = minutosDelDia(ahora);

  const turnoActual = turnos.find(
    (t) => minAhora >= t.inicioMin && minAhora < t.finMin
  );
  if (turnoActual) return turnoActual;

  const siguienteTurnoConReservas = turnos.find((t) => {
    if (t.inicioMin < minAhora) return false;
    return reservasHoy.some((r) => reservaDentroTurno(r, t));
  });
  if (siguienteTurnoConReservas) return siguienteTurnoConReservas;

  const siguienteTurno = turnos.find((t) => t.inicioMin >= minAhora);
  if (siguienteTurno) return siguienteTurno;

  return turnos[0];
}

function estadoEsCancelado(estado: string | null | undefined) {
  const e = normalizarEstado(estado);
  return ["cancelada", "cancelado", "anulada", "anulado"].includes(e);
}

function estadoEsNoShow(estado: string | null | undefined) {
  const e = normalizarEstado(estado);
  return ["no ha venido", "no_ha_venido", "no-show", "noshow", "no show"].includes(e);
}

function estadoEsOcupado(estado: string | null | undefined) {
  const e = normalizarEstado(estado);
  return ["ha venido", "ha_venido", "llegado", "llegada", "ocupada", "ocupado"].includes(e);
}

function estadoEsAtendido(reserva: ReservaSala | null | undefined) {
  if (!reserva) return false;
  const e = normalizarEstado(reserva.estado);
  return Boolean(
    reserva.atendida ||
      reserva.consumo_total !== null ||
      ["completada", "completado", "atendida", "atendido"].includes(e)
  );
}

function estadoMesaDe(mesa: Mesa, reserva: ReservaSala | null): MesaConReserva["estadoMesa"] {
  if (mesa.bloqueada) return "bloqueada";
  if (!reserva) return "libre";
  if (estadoEsAtendido(reserva)) return "atendida";
  if (estadoEsOcupado(reserva.estado)) return "ocupada";
  return "reservada";
}

function estadoReservaLabel(reserva: ReservaSala | null) {
  if (!reserva) return "Sin reserva";
  if (estadoEsAtendido(reserva)) return "Atendida";
  if (estadoEsOcupado(reserva.estado)) return "Cliente en mesa";
  if (estadoEsNoShow(reserva.estado)) return "No-show";
  if (estadoEsCancelado(reserva.estado)) return "Cancelada";
  const e = normalizarEstado(reserva.estado);
  if (e === "pendiente") return "Pendiente";
  if (e === "confirmada" || e === "confirmado") return "Confirmada";
  return reserva.estado || "Confirmada";
}

export default function SalaPage() {
  const { dark } = useTheme();
  const isDark = dark;

  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ?? null;

  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => new Date());
  const fechaKey = formatDateInput(fechaSeleccionada);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [reservasDia, setReservasDia] = useState<ReservaSala[]>([]);
  const [turnos, setTurnos] = useState<TurnoConfig[]>([]);
  const [turnoSeleccionado, setTurnoSeleccionado] = useState<"comida" | "cena" | null>(null);
  const [franjaSeleccionada, setFranjaSeleccionada] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reservaAbierta, setReservaAbierta] = useState<string | null>(null);
  const [guardandoMesaId, setGuardandoMesaId] = useState<string | null>(null);
  const [reservaDetalle, setReservaDetalle] = useState<ReservaSala | null>(null);
  const [mesaDetalle, setMesaDetalle] = useState<Mesa | null>(null);
  const [mesaLibreDetalle, setMesaLibreDetalle] = useState<Mesa | null>(null);
  const [guardandoAccion, setGuardandoAccion] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const panelClass = isDark
    ? "rounded-3xl border border-slate-800 bg-slate-950 shadow-sm"
    : "rounded-3xl border border-slate-200 bg-white shadow-sm";

  const panelSoftClass = isDark
    ? "rounded-2xl border border-slate-800 bg-slate-900"
    : "rounded-2xl border border-slate-200 bg-slate-50";

  const titleClass = isDark ? "text-white" : "text-slate-950";
  const textClass = isDark ? "text-slate-100" : "text-slate-900";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";

  const buttonBase = isDark
    ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100";

  const buttonActive = isDark
    ? "rounded-xl border border-white bg-white px-4 py-2 text-sm font-black text-slate-900"
    : "rounded-xl border border-slate-950 bg-slate-950 px-4 py-2 text-sm font-black text-white";

  const subButtonActive =
    "rounded-xl border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-black text-white shadow-sm";

  const cargarSala = async (silent = false) => {
    if (!silent) setLoading(true);

    const rid = restauranteId;

    if (!rid) {
      setZonas([]);
      setMesas([]);
      setReservasDia([]);
      setTurnos([]);
      setTurnoSeleccionado(null);
      setFranjaSeleccionada(0);
      setLoading(false);
      return;
    }

    const restauranteData = restauranteActual;
    const nuevosTurnos = construirTurnos(restauranteData);

    const { data: zonasData, error: zonasError } = await supabase
      .from("sala_zonas")
      .select("id, nombre, orden, activa")
      .eq("restaurante_id", rid)
      .order("orden", { ascending: true });

    const { data: mesasData, error: mesasError } = await supabase
      .from("sala_mesas")
      .select("id, nombre, capacidad, orden, activa, bloqueada, zona_id")
      .eq("restaurante_id", rid)
      .order("orden", { ascending: true });

    const inicioDia = dateFromInput(fechaKey);
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = dateFromInput(fechaKey);
    finDia.setHours(23, 59, 59, 999);

    const { data: reservasData, error: reservasError } = await supabase
      .from("reservas")
      .select(
        "id, mesa_id, nombre_cliente, telefono, personas, fecha_hora_reserva, estado, origen, notas, atendida, consumo_total, puntos_generados"
      )
      .eq("restaurante_id", rid)
      .gte("fecha_hora_reserva", toSqlDateTimeLocal(inicioDia))
      .lte("fecha_hora_reserva", toSqlDateTimeLocal(finDia))
      .order("fecha_hora_reserva", { ascending: true });

    if (zonasError || mesasError || reservasError) {
      setMensaje("No se pudo cargar la sala completa. Revisa permisos o conexión.");
    }

    const reservasValidas = ((reservasData ?? []) as ReservaSala[]).filter((r) => {
      return !estadoEsCancelado(r.estado) && !estadoEsNoShow(r.estado);
    });

    const turnoInicial = elegirTurnoInicial(nuevosTurnos, reservasValidas, new Date());

    setTurnos(nuevosTurnos);
    setZonas((zonasData ?? []) as Zona[]);
    setMesas((mesasData ?? []) as Mesa[]);
    setReservasDia(reservasValidas);

    setTurnoSeleccionado((prev) => {
      if (prev && nuevosTurnos.some((t) => t.key === prev)) return prev;
      return turnoInicial?.key ?? null;
    });

    setFranjaSeleccionada((prev) => {
      const turnoUsado =
        nuevosTurnos.find((t) => t.key === (turnoSeleccionado ?? turnoInicial?.key)) ??
        turnoInicial ??
        nuevosTurnos[0];

      if (!turnoUsado) return 0;

      if (silent && prev >= 0 && prev < turnoUsado.franjas.length) return prev;

      return indicePrimeraFranjaConReservas(turnoUsado, reservasValidas);
    });

    setLoading(false);
  };

  useEffect(() => {
    if (loadingRestaurante) {
      setLoading(true);
      return;
    }

    cargarSala();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restauranteId, loadingRestaurante, fechaKey]);

  const zonasActivas = useMemo(() => {
    return [...zonas]
      .filter((z) => z.activa)
      .sort((a, b) => a.orden - b.orden);
  }, [zonas]);

  const zonaActivaIds = useMemo(() => {
    return new Set(zonasActivas.map((z) => z.id));
  }, [zonasActivas]);

  const mesasVisibles = useMemo(() => {
    return [...mesas]
      .filter((m) => m.activa && !!m.zona_id && zonaActivaIds.has(m.zona_id))
      .sort((a, b) => a.orden - b.orden);
  }, [mesas, zonaActivaIds]);

  const turnoVisible = useMemo(() => {
    return turnos.find((t) => t.key === turnoSeleccionado) ?? turnos[0] ?? null;
  }, [turnos, turnoSeleccionado]);

  const franjaVisible = useMemo(() => {
    if (!turnoVisible) return null;
    return turnoVisible.franjas[franjaSeleccionada] ?? turnoVisible.franjas[0] ?? null;
  }, [turnoVisible, franjaSeleccionada]);

  const reservasTurno = useMemo(() => {
    if (!turnoVisible) return [];
    return reservasDia.filter((r) => reservaDentroTurno(r, turnoVisible));
  }, [reservasDia, turnoVisible]);

  const reservasFranja = useMemo(() => {
    if (!franjaVisible) return [];
    return reservasDia.filter((r) => reservaDentroFranja(r, franjaVisible));
  }, [reservasDia, franjaVisible]);

  const reservasAsignadasFranja = useMemo(
    () => reservasFranja.filter((r) => !!r.mesa_id),
    [reservasFranja]
  );

  const reservasSinAsignarFranja = useMemo(
    () => reservasFranja.filter((r) => !r.mesa_id),
    [reservasFranja]
  );

  const reservasSinAsignarTurno = useMemo(
    () => reservasTurno.filter((r) => !r.mesa_id),
    [reservasTurno]
  );

  const reservasAsignadasTurno = useMemo(
    () => reservasTurno.filter((r) => !!r.mesa_id),
    [reservasTurno]
  );

  const nombreMesaAsignada = (mesaId: string | null | undefined) => {
    if (!mesaId) return "Sin mesa";
    return mesas.find((mesa) => mesa.id === mesaId)?.nombre ?? "Mesa asignada";
  };

  const irAFRanjaReserva = (reserva: ReservaSala) => {
    const index = indiceFranjaReserva(turnoVisible, reserva);
    setFranjaSeleccionada(index);
    setReservaAbierta(null);
    setMesaLibreDetalle(null);
    setMesaDetalle(null);
    setReservaDetalle(null);
  };

  const mesasConEstado = useMemo<MesaConReserva[]>(() => {
    return mesasVisibles.map((mesa) => {
      const reserva = reservasAsignadasFranja.find((r) => r.mesa_id === mesa.id) ?? null;
      return {
        mesa,
        reserva,
        estadoMesa: estadoMesaDe(mesa, reserva),
      };
    });
  }, [mesasVisibles, reservasAsignadasFranja]);

  const mesasDisponiblesParaReserva = (reserva: ReservaSala) => {
    const mesasOcupadasEnFranja = reservasAsignadasFranja
      .filter((r) => r.mesa_id)
      .map((r) => r.mesa_id);

    return mesasVisibles.filter((mesa) => {
      const capacidadNecesaria = reserva.personas ?? 1;

      return (
        !mesa.bloqueada &&
        mesa.capacidad >= capacidadNecesaria &&
        !mesasOcupadasEnFranja.includes(mesa.id)
      );
    });
  };

  const mesasDisponiblesParaCambio = (reserva: ReservaSala) => {
    const mesasOcupadasEnFranja = reservasAsignadasFranja
      .filter((r) => r.mesa_id && r.id !== reserva.id)
      .map((r) => r.mesa_id);

    return mesasVisibles.filter((mesa) => {
      const capacidadNecesaria = reserva.personas ?? 1;

      return (
        mesa.id !== reserva.mesa_id &&
        !mesa.bloqueada &&
        mesa.capacidad >= capacidadNecesaria &&
        !mesasOcupadasEnFranja.includes(mesa.id)
      );
    });
  };

  const asignarMesa = async (reservaId: string, mesaId: string) => {
    setGuardandoMesaId(mesaId);
    setMensaje(null);

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: mesaId })
      .eq("id", reservaId);

    setGuardandoMesaId(null);

    if (error) {
      alert("No se pudo asignar la mesa");
      return;
    }

    setMensaje("Mesa asignada correctamente.");
    setReservaAbierta(null);
    setMesaLibreDetalle(null);
    await cargarSala(true);
  };

  const cambiarMesa = async (reservaId: string, mesaId: string) => {
    setGuardandoAccion(true);
    setMensaje(null);

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: mesaId })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo cambiar la mesa");
      return;
    }

    setMensaje("Mesa cambiada correctamente.");
    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala(true);
  };

  const liberarMesa = async (reservaId: string) => {
    setGuardandoAccion(true);
    setMensaje(null);

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: null })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo liberar la mesa");
      return;
    }

    setMensaje("Mesa liberada. La reserva queda pendiente de asignar.");
    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala(true);
  };

  const marcarLlegada = async (reservaId: string) => {
    setGuardandoAccion(true);
    setMensaje(null);

    const { error } = await supabase
      .from("reservas")
      .update({ estado: "ha venido" })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo marcar la llegada");
      return;
    }

    setMensaje("Cliente marcado como llegado.");
    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala(true);
  };

  const marcarNoShow = async (reservaId: string) => {
    const confirmar = window.confirm("¿Seguro que quieres marcar esta reserva como no-show?");
    if (!confirmar) return;

    setGuardandoAccion(true);
    setMensaje(null);

    const { error } = await supabase
      .from("reservas")
      .update({ estado: "no-show", mesa_id: null })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo marcar como no-show");
      return;
    }

    setMensaje("Reserva marcada como no-show.");
    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala(true);
  };

  const cambiarBloqueoMesa = async (mesa: Mesa, bloqueada: boolean) => {
    setGuardandoAccion(true);
    setMensaje(null);

    const { error } = await supabase
      .from("sala_mesas")
      .update({ bloqueada })
      .eq("id", mesa.id);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo actualizar la mesa");
      return;
    }

    setMensaje(bloqueada ? "Mesa bloqueada temporalmente." : "Mesa desbloqueada.");
    setMesaLibreDetalle(null);
    setMesaDetalle(null);
    setReservaDetalle(null);
    await cargarSala(true);
  };

  const abrirDetalleMesa = (mesa: Mesa, reserva: ReservaSala) => {
    setMesaLibreDetalle(null);
    setMesaDetalle(mesa);
    setReservaDetalle(reserva);
  };

  const abrirMesaLibre = (mesa: Mesa) => {
    setReservaDetalle(null);
    setMesaDetalle(null);
    setMesaLibreDetalle(mesa);
  };

  const totalBloqueadas = mesasConEstado.filter((m) => m.estadoMesa === "bloqueada").length;
  const totalOcupadas = mesasConEstado.filter((m) => m.estadoMesa === "ocupada").length;
  const totalAtendidas = mesasConEstado.filter((m) => m.estadoMesa === "atendida").length;
  const totalReservadas = mesasConEstado.filter((m) => m.estadoMesa === "reservada").length;
  const totalLibres = mesasConEstado.filter((m) => m.estadoMesa === "libre").length;

  const ocupacionPorcentaje = mesasVisibles.length
    ? Math.round(((totalReservadas + totalOcupadas + totalAtendidas) / mesasVisibles.length) * 100)
    : 0;

  const kpis = [
    { label: "Libres", value: totalLibres, sub: "mesas disponibles" },
    { label: "Reservadas", value: totalReservadas, sub: "con reserva asignada" },
    { label: "Ocupadas", value: totalOcupadas, sub: "cliente en mesa" },
    { label: "Sin mesa", value: reservasSinAsignarFranja.length, sub: "en esta franja" },
  ];

  const estadoMesaClasses = (estado: MesaConReserva["estadoMesa"]) => {
    if (estado === "bloqueada") {
      return isDark
        ? "border-red-800 bg-red-950/60 text-red-50"
        : "border-red-300 bg-red-50 text-red-950";
    }
    if (estado === "atendida") {
      return isDark
        ? "border-violet-800 bg-violet-950/60 text-violet-50"
        : "border-violet-300 bg-violet-50 text-violet-950";
    }
    if (estado === "ocupada") {
      return isDark
        ? "border-blue-800 bg-blue-950/60 text-blue-50"
        : "border-blue-300 bg-blue-50 text-blue-950";
    }
    if (estado === "reservada") {
      return isDark
        ? "border-amber-700 bg-amber-950/60 text-amber-50"
        : "border-amber-300 bg-amber-50 text-amber-950";
    }
    return isDark
      ? "border-emerald-800 bg-emerald-950/60 text-emerald-50"
      : "border-emerald-300 bg-emerald-50 text-emerald-950";
  };

  const badgeEstadoMesaClasses = (estado: MesaConReserva["estadoMesa"]) => {
    if (estado === "bloqueada") return "border-red-300 bg-red-100 text-red-800";
    if (estado === "atendida") return "border-violet-300 bg-violet-100 text-violet-800";
    if (estado === "ocupada") return "border-blue-300 bg-blue-100 text-blue-800";
    if (estado === "reservada") return "border-amber-300 bg-amber-100 text-amber-800";
    return "border-emerald-300 bg-emerald-100 text-emerald-800";
  };

  const labelEstadoMesa = (estado: MesaConReserva["estadoMesa"]) => {
    if (estado === "bloqueada") return "Bloqueada";
    if (estado === "atendida") return "Atendida";
    if (estado === "ocupada") return "Ocupada";
    if (estado === "reservada") return "Reservada";
    return "Libre";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            Sala Pro
          </p>
          <h1 className={`text-3xl font-black tracking-tight ${titleClass}`}>Sala</h1>
          <p className={`mt-1 text-sm ${mutedClass}`}>
            Controla mesas, reservas sin asignar y llegadas por turno.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFechaSeleccionada(addDays(fechaSeleccionada, -1))}
            className={buttonBase}
          >
            Día anterior
          </button>
          <input
            type="date"
            value={fechaKey}
            onChange={(event) => setFechaSeleccionada(dateFromInput(event.target.value))}
            className={
              isDark
                ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
                : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            }
          />
          <button
            type="button"
            onClick={() => setFechaSeleccionada(new Date())}
            className={buttonBase}
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setFechaSeleccionada(addDays(fechaSeleccionada, 1))}
            className={buttonBase}
          >
            Día siguiente
          </button>
          <button
            type="button"
            onClick={() => cargarSala()}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
          >
            Actualizar
          </button>
        </div>
      </div>

      {mensaje && (
        <div
          className={
            isDark
              ? "rounded-2xl border border-blue-900 bg-blue-950/50 px-4 py-3 text-sm font-semibold text-blue-100"
              : "rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900"
          }
        >
          {mensaje}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <div className={`${panelClass} p-4 xl:col-span-1`}>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Fecha</p>
          <p className={`mt-2 font-black ${textClass}`}>{formatearFechaCompleta(fechaSeleccionada)}</p>
        </div>

        <div className={`${panelClass} p-4 xl:col-span-1`}>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Franja</p>
          <p className={`mt-2 font-black ${textClass}`}>
            {turnoVisible && franjaVisible
              ? `${turnoVisible.label} · ${franjaVisible.label}`
              : "Sin franjas"}
          </p>
          <p className={`mt-1 text-xs ${mutedClass}`}>{turnoVisible ? turnoVisible.rangoTexto : ""}</p>
        </div>

        <div className={`${panelClass} p-4 xl:col-span-1`}>
          <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Ocupación</p>
          <p className={`mt-2 text-2xl font-black ${textClass}`}>{ocupacionPorcentaje}%</p>
          <p className={`text-xs ${mutedClass}`}>{totalReservadas + totalOcupadas + totalAtendidas} de {mesasVisibles.length} mesas</p>
        </div>

        <div className={`${panelClass} p-4 xl:col-span-2`}>
          <div className="grid grid-cols-4 gap-2">
            {kpis.map((kpi) => (
              <div key={kpi.label} className={isDark ? "rounded-2xl bg-slate-900 p-3" : "rounded-2xl bg-slate-50 p-3"}>
                <p className={`text-xs font-black uppercase ${mutedClass}`}>{kpi.label}</p>
                <p className={`mt-1 text-2xl font-black ${textClass}`}>{kpi.value}</p>
                <p className={`text-[11px] ${mutedClass}`}>{kpi.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {turnos.length > 0 && (
        <div className={`${panelClass} space-y-4 p-4`}>
          <div className="flex flex-wrap gap-2">
            {turnos.map((turno) => (
              <button
                key={turno.key}
                type="button"
                onClick={() => {
                  setTurnoSeleccionado(turno.key);
                  setFranjaSeleccionada(indicePrimeraFranjaConReservas(turno, reservasDia));
                  setReservaAbierta(null);
                  setMesaLibreDetalle(null);
                  setMesaDetalle(null);
                  setReservaDetalle(null);
                }}
                className={turnoVisible?.key === turno.key ? buttonActive : buttonBase}
              >
                {turno.label} · {turno.rangoTexto}
              </button>
            ))}
          </div>

          {turnoVisible && turnoVisible.franjas.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {turnoVisible.franjas.map((franja, index) => (
                <button
                  key={franja.label}
                  type="button"
                  onClick={() => {
                    setFranjaSeleccionada(index);
                    setReservaAbierta(null);
                    setMesaLibreDetalle(null);
                    setMesaDetalle(null);
                    setReservaDetalle(null);
                  }}
                  className={franjaVisible?.label === franja.label ? subButtonActive : buttonBase}
                >
                  {franja.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={`${panelClass} p-5`}>
          {loading ? (
            <p className={mutedClass}>Cargando sala...</p>
          ) : !restauranteId ? (
            <div className="space-y-2">
              <p className="font-bold text-red-600">No se encontró restaurante activo.</p>
              <p className={`text-sm ${mutedClass}`}>
                Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.
              </p>
            </div>
          ) : turnos.length === 0 ? (
            <div className="space-y-3">
              <p className={`font-bold ${titleClass}`}>No hay franjas de sala configuradas.</p>
              <p className={`text-sm ${mutedClass}`}>
                Configura horario de comida/cena para ver la sala por turnos.
              </p>
              <Link href="/ajustes" className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                Ir a ajustes
              </Link>
            </div>
          ) : zonasActivas.length === 0 ? (
            <div className="space-y-3">
              <p className={`font-bold ${titleClass}`}>No hay zonas activas creadas todavía.</p>
              <p className={`text-sm ${mutedClass}`}>
                Crea zonas y mesas para poder asignar reservas desde sala.
              </p>
              <Link href="/ajustes" className="inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700">
                Configurar sala
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {zonasActivas.map((zona) => {
                const mesasZona = mesasConEstado.filter((item) => item.mesa.zona_id === zona.id);

                return (
                  <div key={zona.id} className="space-y-3">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <h2 className={`text-xl font-black ${titleClass}`}>{zona.nombre}</h2>
                        <p className={`text-sm ${mutedClass}`}>
                          {mesasZona.length} mesa{mesasZona.length === 1 ? "" : "s"} en esta zona
                        </p>
                      </div>
                    </div>

                    {mesasZona.length === 0 ? (
                      <p className={`text-sm ${mutedClass}`}>No hay mesas activas en esta zona.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {mesasZona.map(({ mesa, reserva, estadoMesa }) => {
                          return (
                            <button
                              key={mesa.id}
                              type="button"
                              onClick={() => {
                                if (reserva && !mesa.bloqueada) abrirDetalleMesa(mesa, reserva);
                                else abrirMesaLibre(mesa);
                              }}
                              className={[
                                "min-h-[162px] rounded-3xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
                                estadoMesaClasses(estadoMesa),
                              ].join(" ")}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <h3 className="text-2xl font-black">{mesa.nombre}</h3>
                                  <p className="mt-1 text-sm opacity-80">{mesa.capacidad} personas</p>
                                </div>
                                <span className={["rounded-full border px-2.5 py-1 text-xs font-black", badgeEstadoMesaClasses(estadoMesa)].join(" ")}>
                                  {labelEstadoMesa(estadoMesa)}
                                </span>
                              </div>

                              {reserva ? (
                                <div className="mt-5 space-y-1">
                                  <p className="text-base font-black">{reserva.nombre_cliente || "Sin nombre"}</p>
                                  <p className="text-sm opacity-80">
                                    {formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0} personas
                                  </p>
                                  <p className="text-xs font-semibold opacity-70">
                                    {estadoReservaLabel(reserva)} · pulsa para gestionar
                                  </p>
                                </div>
                              ) : (
                                <div className="mt-5 space-y-1">
                                  <p className="text-sm font-semibold">
                                    {mesa.bloqueada ? "Fuera de uso temporalmente" : "Disponible para asignar"}
                                  </p>
                                  <p className="text-xs opacity-70">
                                    Pulsa para bloquear o asignar una reserva.
                                  </p>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className={`${panelClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-lg font-black ${titleClass}`}>Reservas sin mesa</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>Franja actual</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-800">
                {reservasSinAsignarFranja.length}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {reservasSinAsignarFranja.length === 0 ? (
                <div className={panelSoftClass + " p-4"}>
                  <p className={`text-sm font-semibold ${textClass}`}>Todo asignado en esta franja.</p>
                  <p className={`mt-1 text-xs ${mutedClass}`}>Las reservas con mesa pueden estar en otra franja del turno.</p>
                </div>
              ) : (
                reservasSinAsignarFranja.map((reserva) => {
                  const mesasDisponibles = mesasDisponiblesParaReserva(reserva);
                  return (
                    <div key={reserva.id} className={`${panelSoftClass} p-4`}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`font-black ${titleClass}`}>{reserva.nombre_cliente || "Sin nombre"}</p>
                          <p className={`mt-1 text-sm ${mutedClass}`}>
                            {formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0} personas
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReservaAbierta(reservaAbierta === reserva.id ? null : reserva.id)}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
                        >
                          Asignar
                        </button>
                      </div>

                      {reservaAbierta === reserva.id && (
                        <div className="mt-4 space-y-2">
                          {mesasDisponibles.length === 0 ? (
                            <p className="text-sm font-semibold text-red-600">No hay mesas libres con capacidad suficiente.</p>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              {mesasDisponibles.map((mesa) => (
                                <button
                                  key={mesa.id}
                                  type="button"
                                  onClick={() => asignarMesa(reserva.id, mesa.id)}
                                  disabled={guardandoMesaId === mesa.id}
                                  className={`${buttonBase} disabled:opacity-50`}
                                >
                                  {guardandoMesaId === mesa.id ? "..." : `${mesa.nombre} · ${mesa.capacidad}p`}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className={`${panelClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-lg font-black ${titleClass}`}>Turno completo</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>Reservas pendientes de mesa en comida/cena</p>
              </div>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-sm font-black text-white">
                {reservasSinAsignarTurno.length}
              </span>
            </div>

            <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
              {reservasSinAsignarTurno.length === 0 ? (
                <p className={`text-sm ${mutedClass}`}>No hay reservas sin mesa en este turno.</p>
              ) : (
                reservasSinAsignarTurno.map((reserva) => (
                  <div key={reserva.id} className={`${panelSoftClass} p-3`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-black ${titleClass}`}>{reserva.nombre_cliente || "Sin nombre"}</p>
                        <p className={`text-xs ${mutedClass}`}>
                          {formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0} personas
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-800">Sin mesa</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={`${panelClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className={`text-lg font-black ${titleClass}`}>Reservas con mesa</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>Turno completo, aunque no estén en la franja actual</p>
              </div>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-black text-blue-800">
                {reservasAsignadasTurno.length}
              </span>
            </div>

            <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
              {reservasAsignadasTurno.length === 0 ? (
                <p className={`text-sm ${mutedClass}`}>Todavía no hay reservas con mesa asignada en este turno.</p>
              ) : (
                reservasAsignadasTurno.map((reserva) => (
                  <button
                    key={reserva.id}
                    type="button"
                    onClick={() => irAFRanjaReserva(reserva)}
                    className={`${panelSoftClass} block w-full p-3 text-left transition hover:scale-[1.01]`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className={`text-sm font-black ${titleClass}`}>{reserva.nombre_cliente || "Sin nombre"}</p>
                        <p className={`text-xs ${mutedClass}`}>
                          {formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0} personas · {nombreMesaAsignada(reserva.mesa_id)}
                        </p>
                      </div>
                      <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-black text-white">Ver</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className={`${panelClass} p-5`}>
            <h2 className={`text-lg font-black ${titleClass}`}>Leyenda</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black">
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">Libre</span>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">Reservada</span>
              <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-2 text-blue-800">Ocupada</span>
              <span className="rounded-full border border-violet-300 bg-violet-50 px-3 py-2 text-violet-800">Atendida</span>
              <span className="rounded-full border border-red-300 bg-red-50 px-3 py-2 text-red-800">Bloqueada</span>
            </div>
          </div>
        </aside>
      </div>

      {reservaDetalle && mesaDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className={`${panelClass} w-full max-w-2xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800">
                  {estadoReservaLabel(reservaDetalle)}
                </p>
                <h2 className={`text-3xl font-black ${titleClass}`}>{mesaDetalle.nombre}</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>
                  {formatearHora(reservaDetalle.fecha_hora_reserva)} · {reservaDetalle.personas ?? 0} personas
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setReservaDetalle(null);
                  setMesaDetalle(null);
                }}
                className={buttonBase}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className={`${panelSoftClass} p-4`}>
                <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Cliente</p>
                <p className={`mt-2 text-lg font-black ${titleClass}`}>{reservaDetalle.nombre_cliente || "Sin nombre"}</p>
                <p className={`mt-1 text-sm ${mutedClass}`}>{reservaDetalle.telefono || "Sin teléfono"}</p>
              </div>

              <div className={`${panelSoftClass} p-4`}>
                <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Mesa actual</p>
                <p className={`mt-2 text-lg font-black ${titleClass}`}>{mesaDetalle.nombre} · {mesaDetalle.capacidad}p</p>
                <p className={`mt-1 text-sm ${mutedClass}`}>{reservaDetalle.origen || "Origen no indicado"}</p>
              </div>
            </div>

            {reservaDetalle.notas && (
              <div className={`${panelSoftClass} mt-4 p-4`}>
                <p className={`text-xs font-black uppercase tracking-[0.16em] ${mutedClass}`}>Notas</p>
                <p className={`mt-2 text-sm ${textClass}`}>{reservaDetalle.notas}</p>
              </div>
            )}

            {reservaDetalle.consumo_total !== null && (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-700">Consumo registrado</p>
                <p className="mt-2 text-lg font-black">
                  {Number(reservaDetalle.consumo_total).toFixed(2).replace(".", ",")} € · {reservaDetalle.puntos_generados ?? 0} puntos
                </p>
              </div>
            )}

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <button
                type="button"
                onClick={() => marcarLlegada(reservaDetalle.id)}
                disabled={guardandoAccion || estadoEsAtendido(reservaDetalle)}
                className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Cliente ha llegado
              </button>
              <button
                type="button"
                onClick={() => liberarMesa(reservaDetalle.id)}
                disabled={guardandoAccion}
                className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Liberar mesa
              </button>
              <button
                type="button"
                onClick={() => marcarNoShow(reservaDetalle.id)}
                disabled={guardandoAccion || estadoEsAtendido(reservaDetalle)}
                className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
              >
                No-show
              </button>
            </div>

            <div className={`${panelSoftClass} mt-4 p-4`}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className={`font-black ${titleClass}`}>Consumo y puntos</p>
                  <p className={`mt-1 text-sm ${mutedClass}`}>
                    El consumo se registra desde reservas para sumar puntos sin duplicarlos.
                  </p>
                </div>
                <Link
                  href="/reservas"
                  className="rounded-xl bg-violet-600 px-4 py-2 text-center text-sm font-black text-white hover:bg-violet-700"
                >
                  Registrar consumo
                </Link>
              </div>
            </div>

            <div className={`${panelSoftClass} mt-4 p-4`}>
              <p className={`mb-3 text-sm font-black ${textClass}`}>Cambiar a otra mesa disponible</p>
              <div className="flex flex-wrap gap-2">
                {mesasDisponiblesParaCambio(reservaDetalle).length === 0 ? (
                  <p className={`text-sm ${mutedClass}`}>No hay otra mesa disponible para esta franja.</p>
                ) : (
                  mesasDisponiblesParaCambio(reservaDetalle).map((mesa) => (
                    <button
                      key={mesa.id}
                      type="button"
                      onClick={() => cambiarMesa(reservaDetalle.id, mesa.id)}
                      disabled={guardandoAccion}
                      className={`${buttonBase} disabled:opacity-50`}
                    >
                      {mesa.nombre} · {mesa.capacidad}p
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {mesaLibreDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className={`${panelClass} w-full max-w-xl p-6 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">
                  {mesaLibreDetalle.bloqueada ? "Bloqueada" : "Mesa libre"}
                </p>
                <h2 className={`text-3xl font-black ${titleClass}`}>{mesaLibreDetalle.nombre}</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>{mesaLibreDetalle.capacidad} personas</p>
              </div>
              <button type="button" onClick={() => setMesaLibreDetalle(null)} className={buttonBase}>
                Cerrar
              </button>
            </div>

            <div className={`${panelSoftClass} mt-6 p-4`}>
              <p className={`font-black ${titleClass}`}>Asignar reserva pendiente</p>
              <p className={`mt-1 text-sm ${mutedClass}`}>Reservas sin mesa en esta franja que caben en esta mesa.</p>

              <div className="mt-4 space-y-2">
                {reservasSinAsignarFranja.filter((r) => (r.personas ?? 1) <= mesaLibreDetalle.capacidad).length === 0 ? (
                  <p className={`text-sm ${mutedClass}`}>No hay reservas compatibles para esta mesa.</p>
                ) : (
                  reservasSinAsignarFranja
                    .filter((r) => (r.personas ?? 1) <= mesaLibreDetalle.capacidad)
                    .map((reserva) => (
                      <button
                        key={reserva.id}
                        type="button"
                        onClick={() => asignarMesa(reserva.id, mesaLibreDetalle.id)}
                        disabled={guardandoMesaId === mesaLibreDetalle.id || mesaLibreDetalle.bloqueada}
                        className={`${buttonBase} flex w-full items-center justify-between disabled:opacity-50`}
                      >
                        <span>{reserva.nombre_cliente || "Sin nombre"}</span>
                        <span>{formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0}p</span>
                      </button>
                    ))
                )}
              </div>
            </div>

            <div className={mesaLibreDetalle.bloqueada ? `${panelSoftClass} mt-4 p-4` : "mt-4 rounded-2xl border border-red-200 p-4"}>
              <p className={`mb-3 text-sm font-black ${textClass}`}>Estado de la mesa</p>
              {mesaLibreDetalle.bloqueada ? (
                <button
                  type="button"
                  onClick={() => cambiarBloqueoMesa(mesaLibreDetalle, false)}
                  disabled={guardandoAccion}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Desbloquear mesa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => cambiarBloqueoMesa(mesaLibreDetalle, true)}
                  disabled={guardandoAccion}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Bloquear temporalmente
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
