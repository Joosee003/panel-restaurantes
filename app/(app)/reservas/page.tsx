"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  Copy,
  DoorClosed,
  Loader2,
  MessageCircle,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Table2,
  UserX,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import AddReservaModal from "../components/AddReservaModal";
import { useRestaurante } from "../../hooks/useRestaurante";

type EstadoReserva = "pendiente" | "confirmada" | "cancelada";
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

const ESTADOS_FINALES = new Set(["cancelada"]);
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

function estadoLabel(reserva: Reserva) {
  if (reserva.estado === "cancelada") return "Cancelada";
  if (reserva.consumo_registrado_en) return "Consumo registrado";
  if (reserva.atendida === true) return "Atendida";
  if (reserva.atendida === false) return "No-show";
  if (reserva.estado === "confirmada") return "Confirmada";
  return "Pendiente";
}

function estadoClass(reserva: Reserva) {
  if (reserva.estado === "cancelada") return "border-rose-200 bg-rose-50 text-rose-700";
  if (reserva.consumo_registrado_en) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (reserva.atendida === true) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (reserva.atendida === false) return "border-red-200 bg-red-50 text-red-700";
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

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{children}</span>;
}

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className="rounded-xl bg-blue-50 p-2 text-blue-700">{icon}</div>
      </div>
    </div>
  );
}

function ReservaCard({
  reserva,
  mesas,
  onEstado,
  onNoShow,
  onRegistrarConsumo,
  onMesa,
  onCopiar,
}: {
  reserva: Reserva;
  mesas: Mesa[];
  onEstado: (reserva: Reserva, estado: EstadoReserva) => void;
  onNoShow: (reserva: Reserva, valor: boolean | null) => void;
  onRegistrarConsumo: (reserva: Reserva) => void;
  onMesa: (reserva: Reserva, mesaId: string | null) => void;
  onCopiar: (texto: string) => void;
}) {
  const riesgo = Number(reserva.cliente?.no_show_total || 0) + Number(reserva.cliente?.cancelaciones_totales || 0);
  const linkConfirmar = buildWhatsAppLink(reserva, "confirmar");
  const linkRecordar = buildWhatsAppLink(reserva, "recordar");
  const linkResena = buildWhatsAppLink(reserva, "resena");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-black text-slate-950">{reserva.nombre_cliente || "Cliente"}</p>
            <Badge className={estadoClass(reserva)}>{estadoLabel(reserva)}</Badge>
            {riesgo > 0 ? <Badge className="border-red-200 bg-red-50 text-red-700">Riesgo cliente</Badge> : null}
            {!reserva.mesa_id ? <Badge className="border-slate-200 bg-slate-50 text-slate-600">Sin mesa</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{horaCorta(reserva.fecha_hora_reserva)}</span>
            <span>{fechaBonita(reserva.fecha_hora_reserva)}</span>
            <span>{reserva.personas} persona{reserva.personas === 1 ? "" : "s"}</span>
            <span>{reserva.telefono || "Sin teléfono"}</span>
            <span>{reserva.origen || "origen no indicado"}</span>
          </div>
          {reserva.notas ? <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{reserva.notas}</p> : null}
          {reserva.consumo_registrado_en ? (
            <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
              <ReceiptText size={16} />
              Consumo registrado · {money(Number(reserva.consumo_total || 0))} · {Number(reserva.puntos_generados || 0)} pts
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:min-w-52">
          <label className="text-[11px] font-black uppercase tracking-wide text-slate-500">Mesa</label>
          <select
            value={reserva.mesa_id || ""}
            onChange={(e) => onMesa(reserva, e.target.value || null)}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Sin mesa</option>
            {mesas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre}{m.capacidad ? ` · ${m.capacidad}p` : ""}{m.bloqueada ? " · bloqueada" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {reserva.estado === "pendiente" ? (
          <button onClick={() => onEstado(reserva, "confirmada")} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700">
            <Check size={16} /> Confirmar
          </button>
        ) : null}
        {reserva.estado !== "cancelada" ? (
          <button onClick={() => onEstado(reserva, "cancelada")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100">
            <X size={16} /> Cancelar
          </button>
        ) : null}
        {reserva.estado === "confirmada" && !reserva.consumo_registrado_en && reserva.atendida !== false ? (
          <button onClick={() => onRegistrarConsumo(reserva)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100">
            <Banknote size={16} /> Registrar consumo
          </button>
        ) : null}
        {reserva.estado === "confirmada" && !reserva.consumo_registrado_en && reserva.atendida !== false ? (
          <button onClick={() => onNoShow(reserva, false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100">
            <UserX size={16} /> No-show
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        {linkConfirmar ? (
          <a href={linkConfirmar} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <MessageCircle size={14} /> WhatsApp confirmar
          </a>
        ) : null}
        {linkRecordar ? (
          <a href={linkRecordar} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <MessageCircle size={14} /> Recordatorio
          </a>
        ) : null}
        {linkResena && reserva.atendida === true && !reserva.resena_solicitada ? (
          <a href={linkResena} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <MessageCircle size={14} /> Pedir reseña
          </a>
        ) : null}
        <button onClick={() => onCopiar(buildWhatsAppText(reserva, "recordar"))} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
          <Copy size={14} /> Copiar mensaje
        </button>
      </div>
    </div>
  );
}

export default function ReservasPage() {
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ?? null;

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [bloqueos, setBloqueos] = useState<Bloqueo[]>([]);
  const [vista, setVista] = useState<VistaReservas>("calendario");
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

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRefreshPausadoRef = useRef(false);

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
      const [reservasRes, mesasRes, bloqueosRes] = await Promise.all([
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
      ]);

      if (reservasRes.error) throw reservasRes.error;
      if (mesasRes.error) throw mesasRes.error;
      if (bloqueosRes.error) throw bloqueosRes.error;

      setReservas(
        ((reservasRes.data || []) as any[]).map((r) => ({
          ...r,
          nombre_cliente: r.nombre_cliente || "Cliente",
          personas: Number(r.personas || 0),
          estado: (r.estado || "pendiente") as EstadoReserva,
          cliente: Array.isArray(r.cliente) ? r.cliente[0] : r.cliente,
        }))
      );
      setMesas(((mesasRes.data || []) as Mesa[]).filter((m) => m.activa !== false));
      setBloqueos((bloqueosRes.data || []) as Bloqueo[]);
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
      if (filtro === "no_show") return r.atendida === false;
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
    const hoyReservas = reservas.filter((r) => fechaISO(new Date(r.fecha_hora_reserva)) === hoy && r.estado !== "cancelada");
    const pendientes = reservas.filter((r) => r.estado === "pendiente");
    const sinMesa = reservas.filter((r) => !r.mesa_id && r.estado !== "cancelada");
    const noShows = reservas.filter((r) => r.atendida === false);
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
    const riesgo = reservas.filter((r) => Number(r.cliente?.no_show_total || 0) + Number(r.cliente?.cancelaciones_totales || 0) > 0 && r.estado !== "cancelada");

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
    const payload: any = estado === "cancelada" ? { estado, atendida: null } : { estado };
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
    const { error } = await supabase.from("reservas").update({ atendida: valor }).eq("id", reserva.id).eq("restaurante_id", restauranteId);
    if (!error) {
      setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, atendida: valor } : r)));
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

    const result = data as any;
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
    const { error } = await supabase.from("reservas").update({ mesa_id: mesaId }).eq("id", reserva.id).eq("restaurante_id", restauranteId);
    if (!error) setReservas((prev) => prev.map((r) => (r.id === reserva.id ? { ...r, mesa_id: mesaId } : r)));
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
    if (!nuevoBloqueo.fecha || !nuevoBloqueo.hora_inicio || !nuevoBloqueo.hora_fin) return;
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
    }
    setSaving(null);
  };

  const toggleBloqueo = async (b: Bloqueo) => {
    if (!restauranteId) return;
    const { error } = await supabase.from("bloqueos_reservas").update({ activo: !b.activo }).eq("id", b.id).eq("restaurante_id", restauranteId);
    if (!error) setBloqueos((prev) => prev.map((x) => (x.id === b.id ? { ...x, activo: !x.activo } : x)));
  };

  const borrarBloqueo = async (b: Bloqueo) => {
    if (!restauranteId) return;
    const { error } = await supabase.from("bloqueos_reservas").delete().eq("id", b.id).eq("restaurante_id", restauranteId);
    if (!error) setBloqueos((prev) => prev.filter((x) => x.id !== b.id));
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
    <div className="space-y-6 bg-slate-50 text-slate-950">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-blue-700">
              <CalendarDays size={14} /> Reservas Pro
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Reservas</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">Controla confirmaciones, mesas, no-shows, bloqueos y recordatorios desde una sola pantalla.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setVista("calendario")} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100">
              <CalendarDays size={16} /> Calendario
            </button>
            <button onClick={() => cargarTodo()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <RefreshCw size={16} /> Refrescar
            </button>
            <button onClick={() => setOpenModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Plus size={16} /> Nueva reserva
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">{error}</div> : null}
      {copiado ? <div className="fixed right-5 top-5 z-50 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow-lg">Mensaje copiado</div> : null}
      {saving ? <div className="fixed bottom-5 right-5 z-50 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-lg">Guardando...</div> : null}
      {(openModal || consumoModal || bloqueoEnEdicion) && !saving ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-black text-amber-800 shadow-lg">
          Autoactualización pausada mientras editas
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Reservas hoy" value={stats.hoy} sub={`${stats.personasHoy} personas`} icon={<ClipboardList size={18} />} />
        <StatCard label="Pendientes" value={stats.pendientes} sub="sin confirmar" icon={<Clock3 size={18} />} />
        <StatCard label="Sin mesa" value={stats.sinMesa} sub="por asignar" icon={<Table2 size={18} />} />
        <StatCard label="No-shows" value={stats.noShows} sub="marcados" icon={<UserX size={18} />} />
        <StatCard label="Bloqueos" value={bloqueos.filter((b) => b.activo).length} sub="activos" icon={<DoorClosed size={18} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
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
                  className={`rounded-xl px-4 py-2 text-sm font-bold transition ${vista === id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100 sm:w-72"
                />
              </div>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroEstado)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-100">
                <option value="todas">Todas</option>
                <option value="pendiente">Pendientes</option>
                <option value="confirmada">Confirmadas</option>
                <option value="sin_mesa">Sin mesa</option>
                <option value="no_show">No-show</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-black text-slate-950">
            <AlertTriangle size={17} className="text-blue-600" /> Acciones recomendadas
          </div>
          <div className="mt-3 space-y-2">
            {acciones.map((a, idx) => (
              <div key={idx} className={`rounded-2xl border p-3 ${a.type === "danger" ? "border-rose-200 bg-rose-50" : a.type === "warn" ? "border-amber-200 bg-amber-50" : a.type === "ok" ? "border-emerald-200 bg-emerald-50" : "border-blue-200 bg-blue-50"}`}>
                <p className="text-sm font-black text-slate-950">{a.title}</p>
                <p className="mt-1 text-xs font-semibold text-slate-600">{a.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {vista === "calendario" ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
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
        <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">Día</label>
            <input type="date" value={diaActivo} onChange={(e) => setDiaActivo(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100" />
            <div className="mt-4 rounded-2xl bg-slate-50 p-3">
              <p className="text-sm font-black text-slate-950">{fechaCompleta(diaActivo)}</p>
              <p className="mt-1 text-xs text-slate-500">{reservasDia.length} reserva{reservasDia.length === 1 ? "" : "s"} visibles</p>
            </div>
            <div className="mt-4 space-y-2">
              {bloqueos.filter((b) => b.fecha === diaActivo && b.activo).map((b) => (
                <div key={b.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-950">Bloqueo {b.hora_inicio.slice(0,5)} - {b.hora_fin.slice(0,5)}</p>
                  <p className="mt-1 text-xs text-slate-500">{b.motivo || "Horario bloqueado"}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {Object.keys(reservasAgrupadasDia).length ? Object.entries(reservasAgrupadasDia).map(([turno, items]) => (
              <section key={turno} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black text-slate-950">{turno}</h2>
                  <Badge className="border-slate-200 bg-slate-50 text-slate-600">{items.length} reserva{items.length === 1 ? "" : "s"}</Badge>
                </div>
                <div className="space-y-3">
                  {items.map((r) => <ReservaCard key={r.id} reserva={r} mesas={mesas} onEstado={cambiarEstado} onNoShow={cambiarNoShow} onRegistrarConsumo={abrirConsumo} onMesa={cambiarMesa} onCopiar={copiar} />)}
                </div>
              </section>
            )) : (
              <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                <p className="text-lg font-black text-slate-950">No hay reservas para este día</p>
                <p className="mt-1 text-sm text-slate-500">Cambia de fecha o añade una nueva reserva.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {vista === "semana" ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
          <div className="grid gap-3 lg:grid-cols-7">
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
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-black text-slate-950">Lista completa</h2>
            <p className="text-sm text-slate-500">{reservasFiltradas.length} reservas visibles con los filtros actuales.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {reservasFiltradas.map((r) => <div key={r.id} className="p-4"><ReservaCard reserva={r} mesas={mesas} onEstado={cambiarEstado} onNoShow={cambiarNoShow} onRegistrarConsumo={abrirConsumo} onMesa={cambiarMesa} onCopiar={copiar} /></div>)}
            {!reservasFiltradas.length ? <div className="p-10 text-center text-sm font-semibold text-slate-500">No hay reservas con estos filtros.</div> : null}
          </div>
        </div>
      ) : null}

      {vista === "bloqueos" ? (
        <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Bloqueos creados</h2>
            <div className="mt-4 space-y-3">
              {bloqueos.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-700">
                  <Banknote size={14} /> Fidelización
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Registrar consumo</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">{consumoModal.reserva.nombre_cliente} · {consumoModal.reserva.personas} persona{consumoModal.reserva.personas === 1 ? "" : "s"}</p>
              </div>
              <button onClick={() => setConsumoModal(null)} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                <X size={18} />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold text-blue-900">
              Al confirmar, la reserva quedará como atendida, se guardará el gasto y se sumarán los puntos en la app del cliente. No se puede duplicar el consumo de la misma reserva.
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-black uppercase tracking-wide text-slate-500">Total gastado</label>
                <div className="mt-1 flex h-12 items-center rounded-2xl border border-slate-200 bg-white px-3 focus-within:ring-2 focus-within:ring-emerald-100">
                  <input
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
                Registrar y sumar puntos
              </button>
            </div>
          </div>
        </div>
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
