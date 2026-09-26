"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  Check,
  Copy,
  DoorClosed,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AddReservaModal from "../components/AddReservaModal";
import { useRestaurante } from "../../hooks/useRestaurante";
import { ServiceDetail } from "./ServiceDetail";
import styles from "./service.module.css";

type EstadoReserva = "pendiente" | "confirmada" | "cancelada" | "no-show" | "ha venido";
type VistaReservas = "calendario" | "hoy" | "semana" | "lista" | "bloqueos";
type FiltroEstado = "todas" | "pendiente" | "confirmada" | "cancelada" | "sin_mesa" | "no_show";

type Mesa = {
  id: string;
  nombre: string;
  capacidad: number | null;
  activa: boolean | null;
  bloqueada: boolean | null;
};

type ClienteMini = {
  ya_dejo_resena?: boolean | null;
  no_show_total?: number | null;
  cancelaciones_totales?: number | null;
};

type Reserva = {
  id: string;
  restaurante_id: string;
  nombre_cliente: string;
  telefono: string | null;
  email: string | null;
  personas: number;
  origen: string | null;
  notas: string | null;
  fecha_hora_reserva: string;
  estado: EstadoReserva;
  turno: string | null;
  cliente_id: string | null;
  atendida: boolean | null;
  resena_solicitada: boolean | null;
  mesa_id: string | null;
  consumo_total?: number | null;
  consumo_metodo_pago?: string | null;
  consumo_notas?: string | null;
  puntos_generados?: number | null;
  consumo_registrado_en?: string | null;
  cliente?: ClienteMini | null;
};

type ReservaQueryRow = Omit<Reserva, "cliente"> & {
  cliente: ClienteMini | ClienteMini[] | null;
};

type RegistrarConsumoResult = {
  ok?: boolean;
  error?: string;
};

type MarcarAsistenciaResult = {
  reserva_id: string;
  cliente_id: string | null;
  atendida: boolean;
};

type Bloqueo = {
  id: string;
  restaurante_id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string | null;
  activo: boolean;
};

type FormBloqueo = {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string;
};

type ConsumoModalState = {
  reserva: Reserva;
  gasto: string;
  metodo_pago: string;
  notas: string;
};

const ESTADOS_FINALES = new Set<EstadoReserva>(["cancelada", "no-show"]);
const BLOQUEO_INICIAL = {
  hora_inicio: "12:00",
  hora_fin: "13:00",
  motivo: "Horario bloqueado",
};

function fechaISO(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function horaCorta(dateLike: string) {
  const d = new Date(dateLike);
  return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function fechaBonita(dateLike: string) {
  const d = new Date(dateLike);
  return d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
}

function fechaCompleta(dateLike: string) {
  const d = new Date(dateLike);
  return d.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long" });
}

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function startOfMonthGrid(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const day = first.getDay() || 7;
  first.setDate(first.getDate() - day + 1);
  first.setHours(0, 0, 0, 0);
  return first;
}

function monthTitle(date: Date) {
  return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
}

function normalizarTelefono(valor: string | null | undefined) {
  const raw = String(valor ?? "").replace(/\D/g, "");
  if (raw.startsWith("34") && raw.length === 11) return raw.slice(2);
  return raw;
}

function money(n: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(n || 0));
}

function mensajeErrorMesa(message: string | undefined) {
  const value = message || "";
  if (value.includes("TABLE_TIME_CONFLICT")) return "Esa mesa ya está ocupada en ese horario.";
  if (value.includes("TABLE_CAPACITY_EXCEEDED")) return "La mesa no tiene plazas suficientes.";
  if (value.includes("TABLE_NOT_AVAILABLE")) return "La mesa está bloqueada o desactivada.";
  if (value.includes("DEMO_READ_ONLY")) return "La demostración es de solo lectura.";
  return "No se pudo actualizar la mesa.";
}

function mensajeErrorAsistencia(message: string) {
  if (message.includes("RESERVA_AUN_NO_INICIADA")) return "Podrás marcar la asistencia a partir de la hora reservada.";
  if (message.includes("RESERVA_CANCELADA")) return "Esta reserva está cancelada. No se puede marcar como realizada.";
  if (message.includes("RESERVA_NO_SHOW")) return "Esta reserva ya está marcada como no asistida.";
  if (message.includes("ASISTENCIA_CLIENTE_INVALIDO")) return "Revisa los datos del cliente antes de marcar la asistencia.";
  if (message.includes("ASISTENCIA_ACCESS_DENIED")) return "No tienes permiso para marcar la asistencia en este restaurante.";
  if (message.includes("RESERVA_NO_ENCONTRADA")) return "La reserva ya no está disponible. Actualiza la lista.";
  return "No se pudo guardar la asistencia. Vuelve a intentarlo.";
}

function estadoLabel(reserva: Reserva) {
  if (reserva.estado === "cancelada") return "Cancelada";
  if (reserva.consumo_registrado_en) return "Consumo registrado";
  if (reserva.estado === "no-show" || reserva.atendida === false) return "No-show";
  if (reserva.estado === "ha venido" || reserva.atendida === true) return "Ha venido";
  if (reserva.estado === "confirmada") return "Confirmada";
  return "Pendiente";
}

function estadoClass(reserva: Reserva) {
  if (reserva.estado === "cancelada") return "border-rose-200 bg-rose-50 text-rose-700";
  if (reserva.consumo_registrado_en) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (reserva.estado === "no-show" || reserva.atendida === false) return "border-red-200 bg-red-50 text-red-700";
  if (reserva.estado === "ha venido" || reserva.atendida === true) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (reserva.estado === "confirmada") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function nombreMesa(reserva: Reserva, mesas: Mesa[]) {
  if (!reserva.mesa_id) return "Sin mesa";
  return mesas.find((m) => m.id === reserva.mesa_id)?.nombre || "Mesa asignada";
}

function cumpleBusqueda(reserva: Reserva, q: string) {
  const text = `${reserva.nombre_cliente} ${reserva.telefono || ""} ${reserva.email || ""} ${reserva.notas || ""}`.toLowerCase();
  return text.includes(q.toLowerCase().trim());
}

function buildWhatsAppLink(reserva: Reserva, tipo: "confirmar" | "recordar" | "resena") {
  const tel = normalizarTelefono(reserva.telefono);
  if (!tel) return null;
  const fecha = new Date(reserva.fecha_hora_reserva).toLocaleString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const nombre = reserva.nombre_cliente || "";
  const msg =
    tipo === "confirmar"
      ? `Hola ${nombre}, te confirmamos tu reserva para ${fecha}. Gracias.`
      : tipo === "recordar"
      ? `Hola ${nombre}, te recordamos tu reserva para ${fecha}. Te esperamos.`
      : `Hola ${nombre}, gracias por venir. Si te ha gustado la experiencia, nos ayudaría mucho una reseña.`;
  return `https://wa.me/34${tel}?text=${encodeURIComponent(msg)}`;
}

function buildWhatsAppText(reserva: Reserva, tipo: "confirmar" | "recordar" | "resena") {
  const fecha = new Date(reserva.fecha_hora_reserva).toLocaleString("es-ES", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const nombre = reserva.nombre_cliente || "";
  if (tipo === "confirmar") return `Hola ${nombre}, te confirmamos tu reserva para ${fecha}. Gracias.`;
  if (tipo === "recordar") return `Hola ${nombre}, te recordamos tu reserva para ${fecha}. Te esperamos.`;
  return `Hola ${nombre}, gracias por venir. Si te ha gustado la experiencia, nos ayudaría mucho una reseña.`;
}

function ReservaControls({
  reserva,
  mesas,
  saving,
  fidelizacionActiva,
  onEstado,
  onHaVenido,
  onNoShow,
  onRegistrarConsumo,
  onMesa,
  onCopiar,
}: {
  reserva: Reserva;
  mesas: Mesa[];
  saving: boolean;
  fidelizacionActiva: boolean;
  onEstado: (reserva: Reserva, estado: EstadoReserva) => void;
  onHaVenido: (reserva: Reserva) => void;
  onNoShow: (reserva: Reserva, valor: boolean | null) => void;
  onRegistrarConsumo: (reserva: Reserva) => void;
  onMesa: (reserva: Reserva, mesaId: string | null) => void;
  onCopiar: (texto: string) => void;
}) {
  const linkConfirmar = buildWhatsAppLink(reserva, "confirmar");
  const linkRecordar = buildWhatsAppLink(reserva, "recordar");

  return (
    <div className="gh-reservation-controls">
      <label className="block text-[11px] font-black uppercase tracking-wide text-slate-500">
        Mesa
        <select
          value={reserva.mesa_id || ""}
          disabled={saving}
          onChange={(e) => onMesa(reserva, e.target.value || null)}
          className="mt-2 h-11 w-full border bg-white px-3 text-sm font-bold text-slate-900 outline-none"
        >
          <option value="">Sin mesa</option>
          {mesas.map((m) => (
            <option key={m.id} value={m.id} disabled={m.bloqueada === true || Number(m.capacidad || 0) < reserva.personas}>
              {m.nombre}{m.capacidad ? ` · ${m.capacidad}p` : ""}{m.bloqueada ? " · bloqueada" : ""}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {reserva.estado === "pendiente" ? <button disabled={saving} onClick={() => onEstado(reserva, "confirmada")} className="gh-turno-primary inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-bold disabled:opacity-60"><Check size={16} /> Confirmar</button> : null}
        {(reserva.estado === "pendiente" || reserva.estado === "confirmada") && reserva.atendida !== true && reserva.atendida !== false && !reserva.consumo_registrado_en ? <button disabled={saving} onClick={() => onHaVenido(reserva)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"><UserCheck size={16} /> Ha venido</button> : null}
        {!ESTADOS_FINALES.has(reserva.estado) ? <button disabled={saving} onClick={() => onEstado(reserva, "cancelada")} className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-60"><X size={16} /> Cancelar</button> : null}
        {(reserva.estado === "confirmada" || reserva.estado === "ha venido" || reserva.atendida === true) && reserva.atendida !== false && !reserva.consumo_registrado_en ? <button disabled={saving} onClick={() => onRegistrarConsumo(reserva)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 disabled:opacity-60"><Banknote size={16} /> Consumo{fidelizacionActiva ? " y puntos" : ""}</button> : null}
        {reserva.estado === "confirmada" && !reserva.consumo_registrado_en && reserva.atendida !== false ? <button disabled={saving} onClick={() => onNoShow(reserva, false)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 disabled:opacity-60"><UserX size={16} /> No-show</button> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
        {linkConfirmar ? <a href={linkConfirmar} target="_blank" rel="noreferrer" className="gh-turno-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"><MessageCircle size={14} /> Confirmar por WhatsApp</a> : null}
        {linkRecordar ? <a href={linkRecordar} target="_blank" rel="noreferrer" className="gh-turno-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"><MessageCircle size={14} /> Recordatorio</a> : null}
        <button onClick={() => onCopiar(buildWhatsAppText(reserva, "recordar"))} className="gh-turno-secondary inline-flex items-center gap-2 px-3 py-2 text-xs font-bold"><Copy size={14} /> Copiar mensaje</button>
      </div>
    </div>
  );
}

function ReservaCard({
  reserva,
  mesas,
  saving,
  onEstado,
  onHaVenido,
  onNoShow,
  onRegistrarConsumo,
  fidelizacionActiva,
  onMesa,
  onCopiar,
  showDate = false,
}: {
  reserva: Reserva;
  mesas: Mesa[];
  saving: boolean;
  onEstado: (reserva: Reserva, estado: EstadoReserva) => void;
  onHaVenido: (reserva: Reserva) => void;
  onNoShow: (reserva: Reserva, valor: boolean | null) => void;
  onRegistrarConsumo: (reserva: Reserva) => void;
  fidelizacionActiva: boolean;
  onMesa: (reserva: Reserva, mesaId: string | null) => void;
  onCopiar: (texto: string) => void;
  showDate?: boolean;
}) {
  const riesgo = Number(reserva.cliente?.no_show_total || 0) + Number(reserva.cliente?.cancelaciones_totales || 0);
  const contexto = [
    showDate ? fechaBonita(reserva.fecha_hora_reserva) : null,
    reserva.notas,
    reserva.consumo_registrado_en ? `Consumo ${money(Number(reserva.consumo_total || 0))}${fidelizacionActiva ? ` · ${Number(reserva.puntos_generados || 0)} pts` : ""}` : null,
  ].filter(Boolean).join(" · ");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <article className={styles.row}>
      <button type="button" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen} aria-label={`Gestionar reserva de ${reserva.nombre_cliente || "cliente"}, ${horaCorta(reserva.fecha_hora_reserva)}, ${reserva.personas} personas, ${nombreMesa(reserva, mesas)}, ${estadoLabel(reserva)}`} className={styles.rowMain}>
        <time className={styles.time}>{horaCorta(reserva.fecha_hora_reserva)}</time>
        <span className={styles.customer}>{reserva.nombre_cliente || "Cliente"}{contexto ? <small>{contexto}</small> : null}</span>
        <span className={styles.party}>{reserva.personas}</span>
        <span className={styles.rowContext}>
          <span className={styles.tableName}>{reserva.mesa_id && !/^mesa\b/i.test(nombreMesa(reserva, mesas)) ? <span className={styles.mobileLabel}>Mesa </span> : null}{nombreMesa(reserva, mesas)}</span>
          <span className={`${styles.rowState} ${estadoClass(reserva)}`}>{estadoLabel(reserva)}</span>
        </span>
        <span className={styles.rowAction}><span>Gestionar</span><ArrowUpRight size={15} /></span>
      </button>
      {riesgo > 0 ? <div className={styles.rowSupplement}>
        {riesgo > 0 ? <span>{Number(reserva.cliente?.no_show_total || 0)} no-shows · {Number(reserva.cliente?.cancelaciones_totales || 0)} cancelaciones anteriores</span> : null}
      </div> : null}

      {mobileOpen ? (
        <ServiceDetail label={`Gestionar reserva de ${reserva.nombre_cliente || "cliente"}`} onClose={() => setMobileOpen(false)}>
          <div className={styles.detailHeading}>
            <div><span className={`${styles.rowState} ${estadoClass(reserva)}`}>{estadoLabel(reserva)}</span><h2>{reserva.nombre_cliente || "Cliente"}</h2><p>{fechaCompleta(reserva.fecha_hora_reserva)} · {horaCorta(reserva.fecha_hora_reserva)} · {reserva.personas} personas</p></div>
            <button type="button" onClick={() => setMobileOpen(false)} className={styles.detailClose} aria-label="Cerrar detalle"><X size={17} /></button>
          </div>
          <dl className={styles.detailFacts}>
            <div><dt>Teléfono</dt><dd>{reserva.telefono || "Sin teléfono"}</dd></div>
            <div><dt>Origen</dt><dd>{reserva.origen === "panel_nativo" ? "Panel" : reserva.origen || "No indicado"}</dd></div>
            {reserva.email ? <div><dt>Email</dt><dd>{reserva.email}</dd></div> : null}
            <div><dt>Reseña</dt><dd>{reserva.cliente?.ya_dejo_resena ? "Ya dejó reseña" : reserva.resena_solicitada ? "Solicitud registrada" : "Sin reseña registrada"}</dd></div>
            {riesgo > 0 ? <div><dt>Historial del cliente</dt><dd>{Number(reserva.cliente?.no_show_total || 0)} no-shows · {Number(reserva.cliente?.cancelaciones_totales || 0)} cancelaciones</dd></div> : null}
          </dl>
          {reserva.notas ? <div className={styles.detailNote}><h3>Notas de la reserva</h3><p>{reserva.notas}</p></div> : null}
          {reserva.consumo_registrado_en ? <div className={styles.detailNote}><h3>Consumo registrado</h3><p>{money(Number(reserva.consumo_total || 0))}{fidelizacionActiva ? ` · ${Number(reserva.puntos_generados || 0)} puntos` : ""}</p></div> : null}
          <ReservaControls reserva={reserva} mesas={mesas} saving={saving} fidelizacionActiva={fidelizacionActiva} onEstado={onEstado} onHaVenido={onHaVenido} onNoShow={onNoShow} onRegistrarConsumo={(target) => { setMobileOpen(false); onRegistrarConsumo(target); }} onMesa={onMesa} onCopiar={onCopiar} />
        </ServiceDetail>
      ) : null}
    </article>
  );
}

export default function ReservasPage() {
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = restauranteActual?.id ?? null;

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [vista, setVista] = useState<VistaReservas>("hoy");
  const [filtro, setFiltro] = useState<FiltroEstado>("todas");
  const [busqueda, setBusqueda] = useState("");
  const [diaActivo, setDiaActivo] = useState(fechaISO(new Date()));
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nuevoBloqueo, setNuevoBloqueo] = useState<FormBloqueo>({
    fecha: fechaISO(new Date()),
    ...BLOQUEO_INICIAL,
  });
  const [consumoModal, setConsumoModal] = useState<ConsumoModalState | null>(null);
  const [fidelizacionActiva, setFidelizacionActiva] = useState(false);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRefreshPausadoRef = useRef(false);
  const asistenciaEnCursoRef = useRef(false);

  const bloqueoEnEdicion = useMemo(() => {
    return (
      nuevoBloqueo.fecha !== fechaISO(new Date()) ||
      nuevoBloqueo.hora_inicio !== BLOQUEO_INICIAL.hora_inicio ||
      nuevoBloqueo.hora_fin !== BLOQUEO_INICIAL.hora_fin ||
      nuevoBloqueo.motivo !== BLOQUEO_INICIAL.motivo
    );
  }, [nuevoBloqueo]);

  useEffect(() => {
    autoRefreshPausadoRef.current = openModal || Boolean(consumoModal) || bloqueoEnEdicion || Boolean(saving);
  }, [openModal, consumoModal, bloqueoEnEdicion, saving]);

  const cargarTodo = useCallback(async (options?: { silent?: boolean }) => {
    if (!restauranteId) return;
    const silent = options?.silent === true;
    if (!silent) setLoading(true);
    setError(null);

    const desde = addDays(new Date(), -30);
    const hasta = addDays(new Date(), 120);

    try {
      const [reservasRes, mesasRes, bloqueosRes, modulosRes] = await Promise.all([
        supabase
          .from("reservas")
          .select(
            `id, restaurante_id, nombre_cliente, telefono, email, personas, origen, notas, fecha_hora_reserva, estado, turno, cliente_id, atendida, resena_solicitada, mesa_id, consumo_total, consumo_metodo_pago, consumo_notas, puntos_generados, consumo_registrado_en,
             cliente:cliente_id (ya_dejo_resena, no_show_total, cancelaciones_totales)`
          )
          .eq("restaurante_id", restauranteId)
          .gte("fecha_hora_reserva", desde.toISOString())
          .lte("fecha_hora_reserva", hasta.toISOString())
          .order("fecha_hora_reserva", { ascending: true }),
        supabase
          .from("sala_mesas")
          .select("id, nombre, capacidad, activa, bloqueada")
          .eq("restaurante_id", restauranteId)
          .order("orden", { ascending: true }),
        supabase
          .from("bloqueos_reservas")
          .select("id, restaurante_id, fecha, hora_inicio, hora_fin, motivo, activo")
          .eq("restaurante_id", restauranteId)
          .order("fecha", { ascending: true })
          .order("hora_inicio", { ascending: true }),
        supabase
          .from("restaurante_modulos")
          .select("fidelizacion")
          .eq("restaurante_id", restauranteId)
          .maybeSingle(),
      ]);

      if (reservasRes.error) throw reservasRes.error;
      if (mesasRes.error) throw mesasRes.error;
      if (bloqueosRes.error) throw bloqueosRes.error;

      setReservas(
        ((reservasRes.data || []) as unknown as ReservaQueryRow[]).map((r) => ({
          ...r,
          nombre_cliente: r.nombre_cliente || "Cliente",
          personas: Number(r.personas || 0),
          estado: (r.estado || "pendiente") as EstadoReserva,
          cliente: Array.isArray(r.cliente) ? r.cliente[0] : r.cliente,
        }))
      );
      setMesas(((mesasRes.data || []) as Mesa[]).filter((m) => m.activa !== false));
      setBloqueos((bloqueosRes.data || []) as Bloqueo[]);
      setFidelizacionActiva(modulosRes.data?.fidelizacion === true);
    } catch (err) {
      console.error("ERROR RESERVAS PRO", err);
      setError("No se pudieron cargar las reservas.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [restauranteId]);

  useEffect(() => {
    if (loadingRestaurante) return;
    if (!restauranteId) {
      setLoading(false);
      return;
    }
    cargarTodo();
  }, [restauranteId, loadingRestaurante, cargarTodo]);

  const pedirRefrescoSeguro = useCallback(() => {
    if (autoRefreshPausadoRef.current) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      if (!autoRefreshPausadoRef.current) void cargarTodo({ silent: true });
    }, 800);
  }, [cargarTodo]);

  useEffect(() => {
    if (!restauranteId) return;

    const channelReservas = supabase
      .channel(`reservas-pro-${restauranteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas", filter: `restaurante_id=eq.${restauranteId}` }, pedirRefrescoSeguro)
      .on("postgres_changes", { event: "*", schema: "public", table: "bloqueos_reservas", filter: `restaurante_id=eq.${restauranteId}` }, pedirRefrescoSeguro)
      .subscribe();

    const interval = setInterval(() => {
      if (!autoRefreshPausadoRef.current) void cargarTodo({ silent: true });
    }, 45000);

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      clearInterval(interval);
      supabase.removeChannel(channelReservas);
    };
  }, [restauranteId, cargarTodo, pedirRefrescoSeguro]);

  const reservasFiltradas = useMemo(() => {
    return reservas.filter((r) => {
      if (!cumpleBusqueda(r, busqueda)) return false;
      if (filtro === "pendiente") return r.estado === "pendiente";
      if (filtro === "confirmada") return r.estado === "confirmada" && r.atendida !== true && r.atendida !== false;
      if (filtro === "cancelada") return r.estado === "cancelada";
      if (filtro === "sin_mesa") return !r.mesa_id && !ESTADOS_FINALES.has(r.estado);
      if (filtro === "no_show") return r.estado === "no-show" || r.atendida === false;
      return true;
    });
  }, [reservas, busqueda, filtro]);

  const reservasDia = useMemo(() => reservasFiltradas.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === diaActivo), [reservasFiltradas, diaActivo]);
  const semanaInicio = useMemo(() => startOfWeek(new Date(diaActivo)), [diaActivo]);
  const diasSemana = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(semanaInicio, i)), [semanaInicio]);
  const mesActivo = useMemo(() => {
    const [year, month] = diaActivo.split("-").map(Number);
    return new Date(year, month - 1, 1);
  }, [diaActivo]);
  const diasCalendario = useMemo(() => {
    const inicio = startOfMonthGrid(mesActivo);
    return Array.from({ length: 42 }, (_, i) => addDays(inicio, i));
  }, [mesActivo]);


  const stats = useMemo(() => {
    const hoy = fechaISO(new Date());
    const hoyReservas = reservas.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === hoy && !ESTADOS_FINALES.has(r.estado));
    const pendientes = reservas.filter((r) => r.estado === "pendiente");
    const sinMesa = reservas.filter((r) => !r.mesa_id && !ESTADOS_FINALES.has(r.estado));
    const noShows = reservas.filter((r) => r.estado === "no-show" || r.atendida === false);
    return {
      hoy: hoyReservas.length,
      personasHoy: hoyReservas.reduce((a, r) => a + Number(r.personas || 0), 0),
      pendientes: pendientes.length,
      sinMesa: sinMesa.length,
      noShows: noShows.length,
    };
  }, [reservas]);

  const acciones = useMemo(() => {
    const items: { title: string; text: string; type: "danger" | "warn" | "info" | "ok" }[] = [];
    const pendientes = reservas.filter((r) => r.estado === "pendiente");
    const sinMesa = reservas.filter((r) => !r.mesa_id && r.estado === "confirmada" && r.atendida === null);
    const hoy = fechaISO(new Date());
    const hoyPendientes = pendientes.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === hoy);
    const riesgo = reservas.filter((r) => Number(r.cliente?.no_show_total || 0) + Number(r.cliente?.cancelaciones_totales || 0) > 0 && !ESTADOS_FINALES.has(r.estado));

    if (hoyPendientes.length) items.push({ type: "danger", title: "Reservas de hoy sin confirmar", text: `${hoyPendientes.length} reserva${hoyPendientes.length === 1 ? "" : "s"} necesitan confirmación.` });
    if (pendientes.length) items.push({ type: "warn", title: "Pendientes acumuladas", text: `${pendientes.length} reserva${pendientes.length === 1 ? "" : "s"} siguen pendientes.` });
    if (sinMesa.length) items.push({ type: "info", title: "Reservas sin mesa", text: `${sinMesa.length} reserva${sinMesa.length === 1 ? "" : "s"} confirmadas no tienen mesa asignada.` });
    if (riesgo.length) items.push({ type: "warn", title: "Clientes con riesgo", text: `${riesgo.length} reserva${riesgo.length === 1 ? "" : "s"} tienen historial de cancelación o no-show.` });
    if (!items.length) items.push({ type: "ok", title: "Todo controlado", text: "No hay reservas urgentes ahora mismo." });
    return items;
  }, [reservas]);

  const cambiarEstado = async (reserva: Reserva, estado: EstadoReserva) => {
    if (!restauranteId) return;
    setSaving(reserva.id);
    const payload: Pick<Reserva, "estado"> & { atendida?: boolean | null; mesa_id?: null } =
      estado === "cancelada" ? { estado, atendida: null, mesa_id: null } : { estado };
    const { error } = await supabase.from("reservas").update(payload).eq("id", reserva.id).eq("restaurante_id", restauranteId);
    if (!error) {
      setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, ...payload } : r)));
      if (reserva.cliente_id) {
        await supabase.from("cliente_notificaciones").insert({
          restaurante_id: restauranteId,
          cliente_id: reserva.cliente_id,
          tipo: "reserva",
          titulo: estado === "confirmada" ? "Reserva confirmada" : estado === "cancelada" ? "Reserva cancelada" : "Reserva actualizada",
          mensaje: estado === "confirmada" ? "El restaurante ha confirmado tu reserva." : estado === "cancelada" ? "El restaurante ha cancelado tu reserva." : "El restaurante ha actualizado tu reserva.",
          url: null,
          leida: false,
        });
      }
    }
    setSaving(null);
    void cargarTodo({ silent: true });
  };

  const cambiarNoShow = async (reserva: Reserva, valor: boolean | null) => {
    if (!restauranteId) return;
    if (reserva.consumo_registrado_en) return;
    setSaving(reserva.id);
    const payload = valor === false
      ? { atendida: false, estado: "no-show", mesa_id: null }
      : { atendida: valor };
    const { error } = await supabase.from("reservas").update(payload).eq("id", reserva.id).eq("restaurante_id", restauranteId);
    if (!error) {
      setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, ...payload } as Reserva : r)));
      if (reserva.cliente_id) {
        await supabase.from("cliente_notificaciones").insert({
          restaurante_id: restauranteId,
          cliente_id: reserva.cliente_id,
          tipo: "reserva",
          titulo: valor === false ? "No asistencia registrada" : "Reserva actualizada",
          mensaje: valor === false ? "El restaurante ha marcado la reserva como no asistida." : "El restaurante ha actualizado tu reserva.",
          url: null,
          leida: false,
        });
      }
    }
    setSaving(null);
    void cargarTodo({ silent: true });
  };

  const marcarHaVenido = async (reserva: Reserva) => {
    if (!restauranteId || reserva.restaurante_id !== restauranteId || saving || asistenciaEnCursoRef.current) return;
    if (ESTADOS_FINALES.has(reserva.estado) || reserva.atendida !== null || reserva.consumo_registrado_en) return;

    asistenciaEnCursoRef.current = true;
    setSaving(reserva.id);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("marcar_asistencia_reserva", {
        p_reserva_id: reserva.id,
        p_asistio: true,
      });
      if (rpcError) throw rpcError;

      const result = data as MarcarAsistenciaResult | null;
      if (result?.reserva_id !== reserva.id || result.atendida !== true) {
        throw new Error("ASISTENCIA_NO_GUARDADA");
      }

      setReservas((prev) => prev.map((r) => r.id === reserva.id ? {
        ...r,
        atendida: true,
        cliente_id: result.cliente_id,
      } : r));
      await cargarTodo({ silent: true });
    } catch (cause) {
      const message = typeof cause === "object" && cause !== null && "message" in cause
        ? String(cause.message)
        : "";
      setError(mensajeErrorAsistencia(message));
    } finally {
      asistenciaEnCursoRef.current = false;
      setSaving(null);
    }
  };

  const abrirConsumo = (reserva: Reserva) => {
    if (reserva.estado === "cancelada" || reserva.consumo_registrado_en) return;
    setConsumoModal({ reserva, gasto: "", metodo_pago: "tarjeta", notas: "" });
  };

  const registrarConsumo = async () => {
    if (!restauranteId || !consumoModal) return;
    const gasto = Number(consumoModal.gasto.replace(",", "."));
    if (!Number.isFinite(gasto) || gasto <= 0) {
      setError("Introduce un importe válido para registrar el consumo.");
      return;
    }

    setSaving(consumoModal.reserva.id);
    setError(null);

    const { data, error } = await supabase.rpc("registrar_consumo_reserva", {
      p_reserva_id: consumoModal.reserva.id,
      p_restaurante_id: restauranteId,
      p_gasto: gasto,
      p_metodo_pago: consumoModal.metodo_pago,
      p_notas: consumoModal.notas || null,
    });

    if (error) {
      console.error("ERROR REGISTRAR CONSUMO", error);
      setError(error.message || "No se pudo registrar el consumo.");
      setSaving(null);
      return;
    }

    const result = data as RegistrarConsumoResult | null;
    if (result?.ok === false) {
      setError(result?.error === "CONSUMO_YA_REGISTRADO" ? "Esta reserva ya tiene consumo registrado." : "No se pudo registrar el consumo.");
      setSaving(null);
      setConsumoModal(null);
      void cargarTodo({ silent: true });
      return;
    }

    setConsumoModal(null);
    setSaving(null);
    await cargarTodo({ silent: true });
  };

  const cambiarMesa = async (reserva: Reserva, mesaId: string | null) => {
    if (!restauranteId) return;
    setSaving(reserva.id);
    setError(null);
    const { error } = await supabase.rpc("gestionar_mesa_reserva", {
      p_reserva_id: reserva.id,
      p_mesa_id: mesaId,
    });
    if (!error) {
      setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, mesa_id: mesaId } : r)));
    } else {
      setError(mensajeErrorMesa(error.message));
      await cargarTodo({ silent: true });
    }
    setSaving(null);
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {}
  };

  const crearBloqueo = async () => {
    if (!restauranteId) return;
    if (!nuevoBloqueo.fecha || !nuevoBloqueo.hora_inicio || !nuevoBloqueo.hora_fin) {
      setError("Completa la fecha y las dos horas del bloqueo.");
      return;
    }
    if (nuevoBloqueo.hora_fin <= nuevoBloqueo.hora_inicio) {
      setError("La hora de fin debe ser posterior a la hora de inicio.");
      return;
    }
    setError(null);
    setSaving("bloqueo");
    const { error } = await supabase.from("bloqueos_reservas").insert({
      restaurante_id: restauranteId,
      fecha: nuevoBloqueo.fecha,
      hora_inicio: nuevoBloqueo.hora_inicio,
      hora_fin: nuevoBloqueo.hora_fin,
      motivo: nuevoBloqueo.motivo || "Horario bloqueado",
      activo: true,
    });
    if (!error) {
      setNuevoBloqueo({ fecha: fechaISO(new Date()), ...BLOQUEO_INICIAL });
      await cargarTodo({ silent: true });
    } else {
      setError("No se pudo guardar el bloqueo. Revisa los datos y vuelve a intentarlo.");
    }
    setSaving(null);
  };

  const toggleBloqueo = async (b: Bloqueo) => {
    if (!restauranteId) return;
    const { error } = await supabase.from("bloqueos_reservas").update({ activo: !b.activo }).eq("id", b.id).eq("restaurante_id", restauranteId);
    if (!error) setBloqueos((prev) => prev.map((x) => (x.id === b.id ? { ...x, activo: !x.activo } : x)));
    else setError("No se pudo cambiar el estado del bloqueo.");
  };

  const borrarBloqueo = async (b: Bloqueo) => {
    if (!restauranteId) return;
    const { error } = await supabase.from("bloqueos_reservas").delete().eq("id", b.id).eq("restaurante_id", restauranteId);
    if (!error) setBloqueos((prev) => prev.filter((x) => x.id !== b.id));
    else setError("No se pudo borrar el bloqueo.");
  };

  const reservasAgrupadasDia = useMemo(() => {
    const groups: Record<string, Reserva[]> = {};
    for (const r of reservasDia) {
      const key = r.turno || (Number(horaCorta(r.fecha_hora_reserva).slice(0, 2)) < 17 ? "Comida" : "Cena");
      groups[key] ||= [];
      groups[key].push(r);
    }
    return groups;
  }, [reservasDia]);

  if (loadingRestaurante || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="animate-spin" size={18} /> Cargando reservas...
        </div>
      </div>
    );
  }

  return (
    <div className={`gh-product-scope gh-reservations ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.heading}><h1>Reservas</h1><p>La agenda del servicio</p></div>
        <div className={styles.headerActions}>
          <button onClick={() => cargarTodo()} aria-label="Refrescar reservas" className="gh-turno-secondary inline-flex items-center gap-2 px-3 py-2 text-sm font-medium"><RefreshCw size={15} /><span className={styles.refreshLabel}>Refrescar</span></button>
          <button onClick={() => setOpenModal(true)} className="gh-turno-primary inline-flex items-center gap-2 px-3 py-2 text-sm font-medium"><Plus size={16} /> Nueva reserva</button>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
      {copiado ? <div role="status" aria-live="polite" className="fixed right-5 top-5 z-50 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg">Mensaje copiado</div> : null}
      {saving ? <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-50 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg">Guardando...</div> : null}
      {(openModal || consumoModal || bloqueoEnEdicion) && !saving ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 shadow-lg">
          Autoactualización pausada mientras editas
        </div>
      ) : null}

      <div className={styles.controlbar}>
            <nav className={styles.tabs} aria-label="Vistas de reservas">
              {([
                ["calendario", "Calendario"],
                ["hoy", "Vista día"],
                ["semana", "Semana"],
                ["lista", "Lista"],
                ["bloqueos", "Bloqueos"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setVista(id)}
                  aria-current={vista === id ? "page" : undefined}
                  className={`${styles.tab} ${vista === id ? styles.tabActive : ""}`}
                >
                  {label}
                </button>
              ))}
            </nav>

            <div className={styles.filters}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente..."
                  aria-label="Buscar reservas por cliente, teléfono, email o notas"
                  className="h-9 pl-9 pr-2 text-sm outline-none"
                />
              </div>
              <select aria-label="Filtrar reservas por estado" value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEstado)} className="h-9 px-2 text-sm outline-none">
                <option value="todas">Todas</option>
                <option value="pendiente">Pendientes</option>
                <option value="confirmada">Confirmadas</option>
                <option value="sin_mesa">Sin mesa</option>
                <option value="no_show">No-show</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>
      </div>
      <div className={styles.brief} aria-label="Resumen de reservas cargadas">
        <span><strong>{stats.hoy}</strong> hoy · {stats.personasHoy} personas</span>
        <button onClick={() => setFiltro("pendiente")}><strong>{stats.pendientes}</strong> pendientes</button>
        <button onClick={() => setFiltro("sin_mesa")}><strong>{stats.sinMesa}</strong> sin mesa</button>
        <button onClick={() => setFiltro("no_show")}><strong>{stats.noShows}</strong> no-shows</button>
        <button onClick={() => setVista("bloqueos")}><strong>{bloqueos.filter((b) => b.activo).length}</strong> bloqueos activos</button>
        <details><summary>Contexto del periodo cargado</summary><div className={styles.notices}>
          {acciones.map((a, idx) => <p key={idx}><strong>{a.title === "Clientes con riesgo" ? "Historial de cancelaciones o no-show" : a.title}.</strong> {a.text}</p>)}
        </div></details>
      </div>

      {vista === "calendario" ? (
        <div className="gh-legacy-surface p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black capitalize text-slate-950">{monthTitle(mesActivo)}</h2>
              <p className="text-sm text-slate-500">Pulsa un día para abrir sus reservas.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDiaActivo(fechaISO(addMonths(mesActivo, -1)))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Mes anterior
              </button>
              <button
                onClick={() => setDiaActivo(fechaISO(new Date()))}
                className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"
              >
                Hoy
              </button>
              <button
                onClick={() => setDiaActivo(fechaISO(addMonths(mesActivo, 1)))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Mes siguiente
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 text-center text-xs font-black uppercase tracking-wide text-slate-400">
            {["L", "M", "X", "J", "V", "S", "D"].map((dia) => (
              <div key={dia} className="py-2">{dia}</div>
            ))}
          </div>

          <div className="gh-reservation-calendar grid grid-cols-1 gap-3 sm:grid-cols-7">
            {diasCalendario.map((dia) => {
              const key = fechaISO(dia);
              const reservasDelDia = reservasFiltradas.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === key);
              const bloqueosDelDia = bloqueos.filter((b) => b.fecha === key && b.activo);
              const enMesActual = dia.getMonth() === mesActivo.getMonth();
              const esHoy = key === fechaISO(new Date());
              const pendientesDia = reservasDelDia.filter((r) => r.estado === "pendiente").length;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setDiaActivo(key);
                    setVista("hoy");
                  }}
                  className={`min-h-36 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${
                    esHoy
                      ? "border-blue-300 bg-blue-50"
                      : enMesActual
                      ? "border-slate-200 bg-white"
                      : "border-slate-100 bg-slate-50 text-slate-400"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-black ${enMesActual ? "text-slate-950" : "text-slate-400"}`}>
                      {dia.getDate()}
                    </span>
                    {reservasDelDia.length ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-black text-white">
                        {reservasDelDia.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 space-y-1.5">
                    {bloqueosDelDia.slice(0, 1).map((b) => (
                      <div key={b.id} className="truncate rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">
                        Bloqueo {b.hora_inicio.slice(0, 5)}
                      </div>
                    ))}
                    {reservasDelDia.slice(0, 3).map((r) => (
                      <div key={r.id} className="truncate rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-bold text-slate-700">
                        {horaCorta(r.fecha_hora_reserva)} · {r.nombre_cliente}
                      </div>
                    ))}
                    {pendientesDia ? (
                      <div className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-black text-amber-700">
                        {pendientesDia} pendiente{pendientesDia === 1 ? "" : "s"}
                      </div>
                    ) : null}
                    {reservasDelDia.length > 3 ? (
                      <p className="text-[11px] font-bold text-slate-500">+{reservasDelDia.length - 3} más</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {vista === "hoy" ? (
        <div>
          <div className={styles.daybar}>
            <h2>{fechaCompleta(diaActivo)}</h2>
            <input
              aria-label="Día de la agenda"
              type="date"
              value={diaActivo}
              onInput={(event) => setDiaActivo(event.currentTarget.value)}
              onChange={(event) => setDiaActivo(event.currentTarget.value)}
            />
            <span>{reservasDia.length} reserva{reservasDia.length === 1 ? "" : "s"} visibles</span>
          </div>
            <div>
              {bloqueos.filter((b) => b.fecha === diaActivo && b.activo).map((b) => (
                <div key={b.id} className={styles.block}>
                  <strong>Bloqueo {b.hora_inicio.slice(0,5)}–{b.hora_fin.slice(0,5)}</strong>
                  <span>{b.motivo || "Horario bloqueado"}</span>
                </div>
              ))}
            </div>

          <div className={styles.agenda}>
            {Object.keys(reservasAgrupadasDia).length ? Object.entries(reservasAgrupadasDia).map(([turno, items]) => (
              <section key={turno}>
                <div className={styles.serviceHeader}>
                  <h2>{turno}</h2>
                  <span>{items.length} reserva{items.length === 1 ? "" : "s"}</span>
                </div>
                <div className={styles.columns} aria-hidden="true"><span>Hora</span><span>Cliente</span><span>Pers.</span><span>Mesa</span><span>Estado</span><span className="text-right">Acción</span></div>
                <div>
                  {items.map((r) => <ReservaCard key={r.id} reserva={r} mesas={mesas} saving={Boolean(saving)} fidelizacionActiva={fidelizacionActiva} onEstado={cambiarEstado} onHaVenido={marcarHaVenido} onNoShow={cambiarNoShow} onRegistrarConsumo={abrirConsumo} onMesa={cambiarMesa} onCopiar={copiar} />)}
                </div>
              </section>
            )) : (
              <div className={styles.empty}>
                <strong>No hay reservas para este día</strong>
                <p>Cambia de fecha o añade una nueva reserva.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {vista === "semana" ? (
        <div className="gh-legacy-surface p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Semana</h2>
              <p className="text-sm text-slate-500">Vista rápida para organizar mesas y turnos.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDiaActivo(fechaISO(addDays(semanaInicio, -7)))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">Semana anterior</button>
              <button onClick={() => setDiaActivo(fechaISO(addDays(semanaInicio, 7)))} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700">Semana siguiente</button>
            </div>
          </div>
          <div className="gh-reservation-week grid gap-3 lg:grid-cols-7">
            {diasSemana.map((dia) => {
              const key = fechaISO(dia);
              const items = reservasFiltradas.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === key);
              const bloqueosDia = bloqueos.filter((b) => b.fecha === key && b.activo);
              return (
                <div key={key} className="min-h-44 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <button onClick={() => { setDiaActivo(key); setVista("hoy"); }} className="w-full text-left">
                    <p className="text-sm font-black text-slate-950">{fechaBonita(key)}</p>
                    <p className="text-xs text-slate-500">{items.length} reservas</p>
                  </button>
                  <div className="mt-3 space-y-2">
                    {bloqueosDia.map((b) => <div key={b.id} className="rounded-xl bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700">Bloqueo {b.hora_inicio.slice(0,5)}</div>)}
                    {items.slice(0, 5).map((r) => (
                      <div key={r.id} className="rounded-xl bg-white p-2 shadow-sm">
                        <p className="truncate text-xs font-black text-slate-950">{horaCorta(r.fecha_hora_reserva)} · {r.nombre_cliente}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{r.personas}p · {nombreMesa(r, mesas)}</p>
                      </div>
                    ))}
                    {items.length > 5 ? <p className="text-xs font-bold text-slate-500">+{items.length - 5} más</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {vista === "lista" ? (
        <div className="gh-turno-list">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-black text-slate-950">Lista completa</h2>
            <p className="text-sm text-slate-500">{reservasFiltradas.length} reservas visibles con los filtros actuales.</p>
          </div>
          <div className="divide-y divide-slate-100">
            <div className={styles.columns} aria-hidden="true"><span>Hora</span><span>Cliente</span><span>Pers.</span><span>Mesa</span><span>Estado</span><span className="text-right">Acción</span></div>
            {reservasFiltradas.map((r) => <ReservaCard key={r.id} reserva={r} mesas={mesas} saving={Boolean(saving)} fidelizacionActiva={fidelizacionActiva} onEstado={cambiarEstado} onHaVenido={marcarHaVenido} onNoShow={cambiarNoShow} onRegistrarConsumo={abrirConsumo} onMesa={cambiarMesa} onCopiar={copiar} showDate />)}
            {!reservasFiltradas.length ? <div className="p-10 text-center text-sm font-semibold text-slate-500">No hay reservas con estos filtros.</div> : null}
          </div>
        </div>
      ) : null}

      {vista === "bloqueos" ? (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="gh-legacy-surface p-4">
            <h2 className="text-lg font-black text-slate-950">Bloquear horario</h2>
            <p className="mt-1 text-sm text-slate-500">Útil para eventos privados, descansos, cocina cerrada o aforo completo.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Fecha</label>
                <input type="date" value={nuevoBloqueo.fecha} onChange={(e) => setNuevoBloqueo((p) => ({ ...p, fecha: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Inicio</label>
                  <input type="time" value={nuevoBloqueo.hora_inicio} onChange={(e) => setNuevoBloqueo((p) => ({ ...p, hora_inicio: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
                <div>
                  <label className="text-xs font-black uppercase tracking-wide text-slate-500">Fin</label>
                  <input type="time" value={nuevoBloqueo.hora_fin} onChange={(e) => setNuevoBloqueo((p) => ({ ...p, hora_fin: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Motivo</label>
                <input value={nuevoBloqueo.motivo} onChange={(e) => setNuevoBloqueo((p) => ({ ...p, motivo: e.target.value }))} className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
              </div>
              <button onClick={crearBloqueo} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
                <DoorClosed size={16} /> Guardar bloqueo
              </button>
            </div>
          </div>

          <div className="gh-legacy-surface p-4">
            <h2 className="text-lg font-black text-slate-950">Bloqueos creados</h2>
            <div className="mt-4 space-y-3">
              {bloqueos.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 border-b border-slate-200 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">{fechaBonita(b.fecha)} · {b.hora_inicio.slice(0,5)} - {b.hora_fin.slice(0,5)}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{b.motivo || "Horario bloqueado"}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => toggleBloqueo(b)} className={`rounded-xl px-3 py-2 text-xs font-black ${b.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{b.activo ? "Activo" : "Oculto"}</button>
                    <button onClick={() => borrarBloqueo(b)} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Borrar</button>
                  </div>
                </div>
              ))}
              {!bloqueos.length ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm font-semibold text-slate-500">No hay bloqueos todavía.</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {consumoModal ? (
        <ServiceDetail label="Registrar consumo" onClose={() => setConsumoModal(null)}>
          <div className={styles.consumption}>
            <div className={styles.detailHeading}>
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                  <Banknote size={14} /> {fidelizacionActiva ? "Fidelización" : "Visita"}
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Registrar consumo</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{consumoModal.reserva.nombre_cliente} · {consumoModal.reserva.personas} persona{consumoModal.reserva.personas === 1 ? "" : "s"}</p>
              </div>
              <button aria-label="Cerrar registro de consumo" onClick={() => setConsumoModal(null)} className={styles.detailClose}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
              {fidelizacionActiva
                ? "Al confirmar, la reserva quedará como atendida, se guardará el gasto y se sumarán los puntos en la app del cliente. No se puede duplicar el consumo de la misma reserva."
                : "Al confirmar, la reserva quedará como atendida y se guardará el gasto y la visita. No se puede duplicar el consumo de la misma reserva."}
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Total gastado</label>
                <div className="mt-1 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-100">
                  <input
                    aria-label="Total gastado"
                    value={consumoModal.gasto}
                    onChange={(e) => setConsumoModal((p) => (p ? { ...p, gasto: e.target.value } : p))}
                    placeholder="38,50"
                    inputMode="decimal"
                    className="w-full bg-transparent text-lg font-black text-slate-950 outline-none"
                    autoFocus
                  />
                  <span className="text-sm font-black text-slate-400">€</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Método de pago</label>
                <select
                  aria-label="Método de pago"
                  value={consumoModal.metodo_pago}
                  onChange={(e) => setConsumoModal((p) => (p ? { ...p, metodo_pago: e.target.value } : p))}
                  className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="tarjeta">Tarjeta</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="bizum">Bizum</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-black uppercase tracking-wide text-slate-500">Notas internas opcionales</label>
              <textarea
                aria-label="Notas internas opcionales"
                value={consumoModal.notas}
                onChange={(e) => setConsumoModal((p) => (p ? { ...p, notas: e.target.value } : p))}
                placeholder="Ej: vino incluido, descuento aplicado..."
                className="mt-1 min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button onClick={() => setConsumoModal(null)} className="inline-flex flex-1 items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button onClick={registrarConsumo} disabled={saving === consumoModal.reserva.id} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
                {saving === consumoModal.reserva.id ? <Loader2 className="animate-spin" size={16} /> : <Banknote size={16} />}
                {fidelizacionActiva ? "Registrar y sumar puntos" : "Registrar consumo"}
              </button>
            </div>
          </div>
        </ServiceDetail>
      ) : null}

      <AddReservaModal
        open={openModal}
        onClose={() => setOpenModal(false)}
        restauranteId={restauranteId}
        onCreated={() => {
          setOpenModal(false);
          cargarTodo();
        }}
      />
    </div>
  );
}
