"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useTheme } from "../components/ThemeProvider";

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
  personas: number | null;
  fecha_hora_reserva: string;
  estado: string | null;
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

function normalizarEstado(estado: string | null | undefined) {
  return (estado ?? "").toString().trim().toLowerCase();
}

function parseFechaLocal(fecha: string) {
  return new Date(fecha.replace(" ", "T"));
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

function reservaDentroFranja(reserva: ReservaSala, franja: FranjaConfig) {
  const fecha = parseFechaLocal(reserva.fecha_hora_reserva);
  const min = minutosDelDia(fecha);
  return min >= franja.inicioMin && min < franja.finMin;
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

export default function SalaPage() {
  const { dark } = useTheme();
  const isDark = dark;

  const [restauranteId, setRestauranteId] = useState<string | null>(null);
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
  const [guardandoAccion, setGuardandoAccion] = useState(false);

  const panelClass = isDark
    ? "rounded-2xl border border-slate-800 bg-slate-950"
    : "rounded-2xl border border-slate-200 bg-white";

  const panelSoftClass = isDark
    ? "rounded-2xl border border-slate-700 bg-slate-900"
    : "rounded-2xl border border-slate-200 bg-slate-50";

  const titleClass = isDark ? "text-white" : "text-slate-900";
  const textClass = isDark ? "text-slate-100" : "text-slate-900";
  const mutedClass = isDark ? "text-slate-400" : "text-slate-500";

  const buttonBase = isDark
    ? "rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-900"
    : "rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100";

  const buttonActive = isDark
    ? "rounded-xl border border-white bg-white px-4 py-2 text-sm font-medium text-slate-900"
    : "rounded-xl border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white";

  const subButtonActive =
    "rounded-xl border border-blue-600 bg-blue-600 px-3 py-2 text-sm font-medium text-white";

  const cargarSala = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: usuarioRestaurante } = await supabase
      .from("usuarios_restaurantes")
      .select("restaurante_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const rid = usuarioRestaurante?.restaurante_id ?? null;
    setRestauranteId(rid);

    if (!rid) {
      setLoading(false);
      return;
    }

    const { data: restauranteData } = await supabase
      .from("restaurantes")
      .select("*")
      .eq("id", rid)
      .maybeSingle();

    const nuevosTurnos = construirTurnos(restauranteData);

    const { data: zonasData } = await supabase
      .from("sala_zonas")
      .select("id, nombre, orden, activa")
      .eq("restaurante_id", rid)
      .order("orden", { ascending: true });

    const { data: mesasData } = await supabase
      .from("sala_mesas")
      .select("id, nombre, capacidad, orden, activa, bloqueada, zona_id")
      .eq("restaurante_id", rid)
      .order("orden", { ascending: true });

    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const finDia = new Date();
    finDia.setHours(23, 59, 59, 999);

    const { data: reservasData } = await supabase
      .from("reservas")
      .select("id, mesa_id, nombre_cliente, personas, fecha_hora_reserva, estado")
      .eq("restaurante_id", rid)
      .gte("fecha_hora_reserva", toSqlDateTimeLocal(inicioDia))
      .lte("fecha_hora_reserva", toSqlDateTimeLocal(finDia))
      .order("fecha_hora_reserva", { ascending: true });

    const reservasHoy = (reservasData ?? []).filter((r) => {
      const estado = normalizarEstado(r.estado);
      return (
        estado !== "cancelada" &&
        estado !== "cancelado" &&
        estado !== "no ha venido" &&
        estado !== "no_ha_venido" &&
        estado !== "no-show" &&
        estado !== "noshow"
      );
    });

    const turnoInicial = elegirTurnoInicial(nuevosTurnos, reservasHoy, new Date());

    setTurnos(nuevosTurnos);
    setZonas(zonasData ?? []);
    setMesas(mesasData ?? []);
    setReservasDia(reservasHoy);

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
      if (prev >= 0 && prev < turnoUsado.franjas.length) return prev;
      return 0;
    });

    setLoading(false);
  };

  useEffect(() => {
    cargarSala();
  }, []);

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

  const reservasFranja = useMemo(() => {
    if (!franjaVisible) return [];
    return reservasDia.filter((r) => reservaDentroFranja(r, franjaVisible));
  }, [reservasDia, franjaVisible]);

  const reservasVisibles = useMemo(
    () => reservasFranja.filter((r) => !!r.mesa_id),
    [reservasFranja]
  );

  const reservasSinAsignar = useMemo(
    () => reservasFranja.filter((r) => !r.mesa_id),
    [reservasFranja]
  );

  const mesasDisponiblesParaReserva = (reserva: ReservaSala) => {
    const mesasOcupadasEnFranja = reservasVisibles
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
    const mesasOcupadasEnFranja = reservasVisibles
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

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: mesaId })
      .eq("id", reservaId);

    setGuardandoMesaId(null);

    if (error) {
      alert("No se pudo asignar la mesa");
      return;
    }

    setReservaAbierta(null);
    await cargarSala();
  };

  const cambiarMesa = async (reservaId: string, mesaId: string) => {
    setGuardandoAccion(true);

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: mesaId })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo cambiar la mesa");
      return;
    }

    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala();
  };

  const liberarMesa = async (reservaId: string) => {
    setGuardandoAccion(true);

    const { error } = await supabase
      .from("reservas")
      .update({ mesa_id: null })
      .eq("id", reservaId);

    setGuardandoAccion(false);

    if (error) {
      alert("No se pudo liberar la mesa");
      return;
    }

    setReservaDetalle(null);
    setMesaDetalle(null);
    await cargarSala();
  };

  const abrirDetalleMesa = (mesa: Mesa, reserva: ReservaSala) => {
    setMesaDetalle(mesa);
    setReservaDetalle(reserva);
  };

  const totalBloqueadas = mesasVisibles.filter((m) => m.bloqueada).length;
  const totalOcupadas = mesasVisibles.filter((mesa) => {
    const reservaMesa = reservasVisibles.find((r) => r.mesa_id === mesa.id);
    const estado = normalizarEstado(reservaMesa?.estado);
    return (
      !mesa.bloqueada &&
      !!reservaMesa &&
      (estado === "ha venido" ||
        estado === "ha_venido" ||
        estado === "ocupada" ||
        estado === "ocupado" ||
        estado === "completada" ||
        estado === "completado")
    );
  }).length;

  const totalReservadas = mesasVisibles.filter((mesa) => {
    const reservaMesa = reservasVisibles.find((r) => r.mesa_id === mesa.id);
    const estado = normalizarEstado(reservaMesa?.estado);
    return (
      !mesa.bloqueada &&
      !!reservaMesa &&
      !(
        estado === "ha venido" ||
        estado === "ha_venido" ||
        estado === "ocupada" ||
        estado === "ocupado" ||
        estado === "completada" ||
        estado === "completado"
      )
    );
  }).length;

  const totalLibres = mesasVisibles.filter((mesa) => {
    const reservaMesa = reservasVisibles.find((r) => r.mesa_id === mesa.id);
    return !mesa.bloqueada && !reservaMesa;
  }).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className={`text-3xl font-bold ${titleClass}`}>Sala</h1>
        <p className={`mt-1 text-sm ${mutedClass}`}>
          Vista operativa de hoy según la franja configurada del restaurante.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div className={`${panelClass} p-4`}>
          <p className={`text-sm ${mutedClass}`}>Fecha</p>
          <p className={`mt-1 font-semibold ${textClass}`}>
            {formatearFechaCompleta(new Date())}
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <p className={`text-sm ${mutedClass}`}>Franja visible</p>
          <p className={`mt-1 font-semibold ${textClass}`}>
            {turnoVisible && franjaVisible
              ? `${turnoVisible.label} · ${franjaVisible.label}`
              : "Sin franjas configuradas"}
          </p>
          <p className={`mt-1 text-xs ${mutedClass}`}>
            {turnoVisible ? `Turno: ${turnoVisible.rangoTexto}` : ""}
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <p className={`text-sm ${mutedClass}`}>Reservadas / Ocupadas</p>
          <p className={`mt-1 font-semibold ${textClass}`}>
            {totalReservadas} / {totalOcupadas}
          </p>
        </div>

        <div className={`${panelClass} p-4`}>
          <p className={`text-sm ${mutedClass}`}>Libres / Bloqueadas</p>
          <p className={`mt-1 font-semibold ${textClass}`}>
            {totalLibres} / {totalBloqueadas}
          </p>
        </div>
      </div>

      {turnos.length > 0 && (
        <div className={`${panelClass} space-y-4 p-4`}>
          <div className="flex flex-wrap gap-2">
            {turnos.map((turno) => (
              <button
                key={turno.key}
                onClick={() => {
                  setTurnoSeleccionado(turno.key);
                  setFranjaSeleccionada(0);
                  setReservaAbierta(null);
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
                  onClick={() => {
                    setFranjaSeleccionada(index);
                    setReservaAbierta(null);
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

      {!loading && reservasSinAsignar.length > 0 && (
        <div className={`${panelClass} space-y-4 p-6`}>
          <div>
            <h2 className={`text-xl font-semibold ${titleClass}`}>
              Reservas sin asignar
            </h2>
            <p className={`text-sm ${mutedClass}`}>
              Estas reservas pertenecen a la franja visible y todavía no tienen mesa.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {reservasSinAsignar.map((reserva) => {
              const mesasDisponibles = mesasDisponiblesParaReserva(reserva);

              return (
                <div key={reserva.id} className={`${panelSoftClass} p-4`}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className={`font-semibold ${titleClass}`}>
                        {reserva.nombre_cliente || "Sin nombre"}
                      </p>
                      <p className={`mt-1 text-sm ${mutedClass}`}>
                        {formatearHora(reserva.fecha_hora_reserva)} · {reserva.personas ?? 0} personas
                      </p>
                    </div>

                    <button
                      onClick={() =>
                        setReservaAbierta(
                          reservaAbierta === reserva.id ? null : reserva.id
                        )
                      }
                      className={buttonBase}
                    >
                      Asignar mesa
                    </button>
                  </div>

                  {reservaAbierta === reserva.id && (
                    <div className="mt-4 space-y-3">
                      {mesasDisponibles.length === 0 ? (
                        <p className="text-sm text-red-600">No hay mesas libres para esa franja.</p>
                      ) : (
                        <>
                          <p className={`text-sm ${mutedClass}`}>Mesas disponibles:</p>
                          <div className="flex flex-wrap gap-2">
                            {mesasDisponibles.map((mesa) => (
                              <button
                                key={mesa.id}
                                onClick={() => asignarMesa(reserva.id, mesa.id)}
                                disabled={guardandoMesaId === mesa.id}
                                className={`${buttonBase} disabled:opacity-50`}
                              >
                                {guardandoMesaId === mesa.id
                                  ? "Guardando..."
                                  : `${mesa.nombre} · ${mesa.capacidad}p`}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={`${panelClass} p-6`}>
        {loading ? (
          <p className={mutedClass}>Cargando sala...</p>
        ) : !restauranteId ? (
          <p className="text-red-600">No se encontró restaurante asociado.</p>
        ) : zonasActivas.length === 0 ? (
          <p className={mutedClass}>No hay zonas activas creadas todavía.</p>
        ) : (
          <div className="space-y-8">
            {zonasActivas.map((zona) => {
              const mesasZona = mesasVisibles.filter((m) => m.zona_id === zona.id);

              return (
                <div key={zona.id} className="space-y-3">
                  <div>
                    <h2 className={`text-xl font-semibold ${titleClass}`}>{zona.nombre}</h2>
                    <p className={`text-sm ${mutedClass}`}>
                      {mesasZona.length} mesa{mesasZona.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {mesasZona.length === 0 ? (
                    <p className={`text-sm ${mutedClass}`}>
                      No hay mesas activas en esta zona.
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                      {mesasZona.map((mesa) => {
                        const reservaMesa = reservasVisibles.find((r) => r.mesa_id === mesa.id);
                        const estadoReserva = normalizarEstado(reservaMesa?.estado);

                        const estaOcupada =
                          !!reservaMesa &&
                          (estadoReserva === "ha venido" ||
                            estadoReserva === "ha_venido" ||
                            estadoReserva === "ocupada" ||
                            estadoReserva === "ocupado" ||
                            estadoReserva === "completada" ||
                            estadoReserva === "completado");

                        const estaReservada = !!reservaMesa && !estaOcupada;

                        const cardClass = mesa.bloqueada
                          ? isDark
                            ? "border-red-800 bg-red-900/70"
                            : "border-red-400 bg-red-200"
                          : estaOcupada
                          ? isDark
                            ? "border-blue-800 bg-blue-900/70"
                            : "border-blue-400 bg-blue-200"
                          : estaReservada
                          ? isDark
                            ? "border-yellow-700 bg-yellow-900/70"
                            : "border-yellow-400 bg-yellow-200"
                          : isDark
                          ? "border-green-800 bg-green-900/70"
                          : "border-green-400 bg-green-200";

                        const badgeClass = mesa.bloqueada
                          ? isDark
                            ? "border-red-700 bg-black/20 text-red-100"
                            : "border-red-500 bg-white/70 text-red-900"
                          : estaOcupada
                          ? isDark
                            ? "border-blue-700 bg-black/20 text-blue-100"
                            : "border-blue-500 bg-white/70 text-blue-900"
                          : estaReservada
                          ? isDark
                            ? "border-yellow-700 bg-black/20 text-yellow-100"
                            : "border-yellow-500 bg-white/70 text-yellow-900"
                          : isDark
                          ? "border-green-700 bg-black/20 text-green-100"
                          : "border-green-500 bg-white/70 text-green-900";

                        const textoEstado = mesa.bloqueada
                          ? "Bloqueada"
                          : estaOcupada
                          ? "Ocupada"
                          : estaReservada
                          ? "Reservada"
                          : "Libre";

                        return (
                          <button
                            key={mesa.id}
                            type="button"
                            onClick={() => {
                              if (reservaMesa && !mesa.bloqueada) abrirDetalleMesa(mesa, reservaMesa);
                            }}
                            className={[
                              "min-h-[140px] rounded-2xl border p-4 text-left shadow-sm transition",
                              cardClass,
                              reservaMesa && !mesa.bloqueada
                                ? "cursor-pointer hover:scale-[1.01]"
                                : "cursor-default",
                            ].join(" ")}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <h3 className={isDark ? "text-lg font-bold text-white" : "text-lg font-bold text-slate-900"}>
                                {mesa.nombre}
                              </h3>
                              <span
                                className={
                                  isDark
                                    ? "rounded-full border border-white/10 bg-black/20 px-2 py-1 text-xs text-white"
                                    : "rounded-full border border-black/10 bg-white/80 px-2 py-1 text-xs text-slate-800"
                                }
                              >
                                {mesa.capacidad}p
                              </span>
                            </div>

                            <div className="mt-3">
                              <span
                                className={[
                                  "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                                  badgeClass,
                                ].join(" ")}
                              >
                                {textoEstado}
                              </span>
                            </div>

                            {reservaMesa ? (
                              <div className="mt-4 space-y-1 text-sm">
                                <p className={isDark ? "font-semibold text-white" : "font-semibold text-slate-900"}>
                                  {reservaMesa.nombre_cliente || "Sin nombre"}
                                </p>
                                <p className={isDark ? "text-slate-100" : "text-slate-700"}>
                                  {formatearHora(reservaMesa.fecha_hora_reserva)} · {reservaMesa.personas ?? 0} personas
                                </p>
                                {!mesa.bloqueada && (
                                  <p className={isDark ? "pt-1 text-xs text-slate-200" : "pt-1 text-xs text-slate-700"}>
                                    Pulsa para gestionar esta mesa
                                  </p>
                                )}
                              </div>
                            ) : (
                              <div className={isDark ? "mt-4 text-sm text-slate-100" : "mt-4 text-sm text-slate-700"}>
                                {mesa.bloqueada ? "Mesa fuera de uso temporalmente" : "Disponible en esta franja"}
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

      {reservaDetalle && mesaDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className={`${panelClass} w-full max-w-xl p-6 shadow-xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={`text-2xl font-bold ${titleClass}`}>{mesaDetalle.nombre}</h2>
                <p className={`mt-1 text-sm ${mutedClass}`}>
                  {formatearHora(reservaDetalle.fecha_hora_reserva)} · {reservaDetalle.personas ?? 0} personas
                </p>
              </div>

              <button
                onClick={() => {
                  setReservaDetalle(null);
                  setMesaDetalle(null);
                }}
                className={buttonBase}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className={`${panelSoftClass} p-4`}>
                <p className={`text-sm ${mutedClass}`}>Cliente</p>
                <p className={`mt-1 font-semibold ${titleClass}`}>
                  {reservaDetalle.nombre_cliente || "Sin nombre"}
                </p>
              </div>

              <div className={`${panelSoftClass} p-4`}>
                <p className={`text-sm ${mutedClass}`}>Mesa actual</p>
                <p className={`mt-1 font-semibold ${titleClass}`}>
                  {mesaDetalle.nombre} · {mesaDetalle.capacidad}p
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className={`${panelSoftClass} p-4`}>
                <p className={`mb-3 text-sm ${mutedClass}`}>
                  Cambiar a otra mesa disponible
                </p>

                <div className="flex flex-wrap gap-2">
                  {mesasDisponiblesParaCambio(reservaDetalle).length === 0 ? (
                    <p className={`text-sm ${mutedClass}`}>
                      No hay otra mesa disponible para esta franja.
                    </p>
                  ) : (
                    mesasDisponiblesParaCambio(reservaDetalle).map((mesa) => (
                      <button
                        key={mesa.id}
                        onClick={() => cambiarMesa(reservaDetalle.id, mesa.id)}
                        disabled={guardandoAccion}
                        className={`${buttonBase} disabled:opacity-50`}
                      >
                        {guardandoAccion ? "Guardando..." : `${mesa.nombre} · ${mesa.capacidad}p`}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div
                className={
                  isDark
                    ? "rounded-2xl border border-red-900 p-4"
                    : "rounded-2xl border border-red-200 p-4"
                }
              >
                <p className={`mb-3 text-sm ${mutedClass}`}>
                  Quitar asignación de mesa
                </p>

                <button
                  onClick={() => liberarMesa(reservaDetalle.id)}
                  disabled={guardandoAccion}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {guardandoAccion ? "Guardando..." : "Liberar mesa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}