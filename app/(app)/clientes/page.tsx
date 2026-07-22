"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clock3,
  Copy,
  Crown,
  Loader2,
  Mail,
  Medal,
  MessageCircle,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { getRestauranteUsuario } from "../lib/getRestauranteUsuario";
import {
  DEFAULT_CUSTOMER_LEVELS,
  buildCustomerLevels,
  getCustomerLevel,
  getCustomerLevelProgress,
  getCustomerPoints,
  getCustomerVisits,
  getNextCustomerLevelText,
  normalizeCustomerLevels,
  type CustomerLevel,
  type CustomerLevelsConfig,
} from "../lib/customerLevels";

type ClienteResumen = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento?: string | null;
  visitas_totales: number | null;
  visitas_reales?: number | null;
  visitas_historial?: number | null;
  ultima_visita: string | null;
  ultima_visita_real?: string | null;
  primera_visita?: string | null;
  canal_contacto: string | null;
  puntos_totales: number | null;
  puntos_disponibles?: number | null;
  gasto_total?: number | null;
  ranking_posicion?: number | null;
  etiquetas: string[] | null;
  ya_dejo_resena?: boolean | null;
  permite_whatsapp?: boolean | null;
  permite_email?: boolean | null;
  no_show_total?: number | null;
  cancelaciones_totales?: number | null;
  total_reservas: number | null;
  total_canceladas_reales: number | null;
  total_atendidas: number | null;
  total_no_shows_reales?: number | null;
  proxima_reserva: string | null;
  notas_internas?: string | null;
};

type Filtro = "todos" | CustomerLevel | "recuperar" | "resena";
type TipoMensaje = "resena" | "recuperar" | "habitual" | "vip" | "maestro" | "cupon";
type NivelCliente = CustomerLevel;
type NivelesClienteConfig = CustomerLevelsConfig;

const DEFAULT_NIVELES_CONFIG = DEFAULT_CUSTOMER_LEVELS;
const normalizarNivelesConfig = normalizeCustomerLevels;
const construirNiveles = buildCustomerLevels;
const nivelCliente = getCustomerLevel;
const progresoNivel = getCustomerLevelProgress;
const textoSiguienteNivel = getNextCustomerLevelText;

function numero(valor: number | null | undefined) {
  return Number(valor || 0);
}

function limpiarTelefono(telefono: string | null | undefined) {
  return String(telefono || "").replace(/\D/g, "");
}

function telefonoParaWhatsApp(telefono: string | null | undefined) {
  const limpio = limpiarTelefono(telefono);
  if (!limpio) return "";
  if (limpio.startsWith("34")) return limpio;
  if (limpio.length === 9) return `34${limpio}`;
  return limpio;
}

function visitasCliente(cliente: ClienteResumen) {
  return getCustomerVisits(cliente);
}

function diasDesde(fecha: string | null | undefined) {
  if (!fecha) return 9999;
  const time = new Date(fecha).getTime();
  if (!Number.isFinite(time)) return 9999;
  return Math.floor((Date.now() - time) / 86400000);
}

function formatUltimaVisita(fecha: string | null | undefined) {
  const dias = diasDesde(fecha);
  if (dias === 9999) return "Sin visita";
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Ayer";
  return `Hace ${dias} días`;
}

function diasHastaCumple(fechaNacimiento: string | null | undefined) {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (!Number.isFinite(fecha.getTime())) return null;

  const hoy = new Date();
  const cumple = new Date(hoy.getFullYear(), fecha.getMonth(), fecha.getDate());
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
  if (cumple.getTime() < inicioHoy) cumple.setFullYear(hoy.getFullYear() + 1);

  return Math.ceil((cumple.getTime() - hoy.getTime()) / 86400000);
}

function estadosCliente(cliente: ClienteResumen) {
  const estados: string[] = [];
  const diasUltima = diasDesde(cliente.ultima_visita_real || cliente.ultima_visita);
  const cumple = diasHastaCumple(cliente.fecha_nacimiento);
  const cancelaciones = numero(cliente.cancelaciones_totales) || numero(cliente.total_canceladas_reales);
  const noShows = Math.max(numero(cliente.no_show_total), numero(cliente.total_no_shows_reales));

  if (diasUltima >= 30 && diasUltima !== 9999) estados.push("Dormido");
  if (cumple !== null && cumple <= 30) estados.push("Cumpleaños");
  if (cliente.ya_dejo_resena === false) estados.push("Sin reseña");
  if (cancelaciones + noShows >= 2) estados.push("Riesgo");

  return estados;
}

function accionPrioritaria(cliente: ClienteResumen, configInput: NivelesClienteConfig = DEFAULT_NIVELES_CONFIG) {
  const estados = estadosCliente(cliente);
  const nivel = nivelCliente(cliente, configInput);
  const nombre = cliente.nombre || "cliente";

  if (estados.includes("Dormido")) {
    return { tipo: "recuperar" as TipoMensaje, titulo: "Recuperar", texto: `${nombre} lleva ${diasDesde(cliente.ultima_visita_real || cliente.ultima_visita)} días sin venir.` };
  }

  if (estados.includes("Sin reseña")) {
    return { tipo: "resena" as TipoMensaje, titulo: "Pedir reseña", texto: `${nombre} todavía no ha dejado reseña.` };
  }

  if (nivel === "maestro") {
    return { tipo: "maestro" as TipoMensaje, titulo: "Reconocer Maestro", texto: `${nombre} está entre los clientes más fieles. Merece una atención excepcional.` };
  }

  if (nivel === "vip") {
    return { tipo: "vip" as TipoMensaje, titulo: "Cuidar VIP", texto: `${nombre} es cliente VIP. Conviene darle trato especial.` };
  }

  if (nivel === "habitual") {
    return { tipo: "habitual" as TipoMensaje, titulo: "Premiar habitual", texto: `${nombre} ya es habitual. Buen momento para ofrecer una ventaja.` };
  }

  return { tipo: "cupon" as TipoMensaje, titulo: "Hacer volver", texto: `Objetivo: que ${nombre} vuelva y suba de nivel.` };
}

function mensajeCliente(cliente: ClienteResumen, tipo: TipoMensaje) {
  const nombre = cliente.nombre || "";

  const mensajes: Record<TipoMensaje, string> = {
    resena: `Hola ${nombre}, muchas gracias por venir. Si te gustó la experiencia, nos ayudaría muchísimo que nos dejaras una reseña en Google. Gracias de verdad.`,
    recuperar: `Hola ${nombre}, hace tiempo que no te vemos por aquí. Esta semana nos encantaría volver a verte. Si quieres, te reservamos una mesa.`,
    habitual: `Hola ${nombre}, gracias por repetir con nosotros. Tenemos una ventaja especial para clientes habituales en tu próxima visita.`,
    vip: `Hola ${nombre}, gracias por confiar tanto en nosotros. Queríamos tener un detalle especial contigo en tu próxima visita.`,
    maestro: `Hola ${nombre}, formas parte de nuestros clientes más fieles. Queremos agradecértelo con una atención muy especial en tu próxima visita.`,
    cupon: `Hola ${nombre}, tenemos una ventaja activa para clientes. Si vienes esta semana, pregunta por ella al llegar.`,
  };

  return mensajes[tipo].replace(/  +/g, " ").trim();
}

function badgeNivel(nivel: NivelCliente) {
  if (nivel === "maestro") return "border-amber-300 bg-amber-50 text-amber-800";
  if (nivel === "vip") return "border-purple-200 bg-purple-50 text-purple-700";
  if (nivel === "habitual") return "border-blue-200 bg-blue-50 text-blue-700";
  if (nivel === "frecuente") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function badgeEstado(estado: string) {
  if (estado === "Dormido") return "border-amber-200 bg-amber-50 text-amber-700";
  if (estado === "Sin reseña") return "border-violet-200 bg-violet-50 text-violet-700";
  if (estado === "Riesgo") return "border-red-200 bg-red-50 text-red-700";
  return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
}

export default function ClientesPage() {
  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteResumen[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalRanking, setModalRanking] = useState(false);
  const [modalNiveles, setModalNiveles] = useState(false);
  const [guardandoNiveles, setGuardandoNiveles] = useState(false);
  const [nivelesConfig, setNivelesConfig] = useState<NivelesClienteConfig>(DEFAULT_NIVELES_CONFIG);
  const [nivelesForm, setNivelesForm] = useState<NivelesClienteConfig>(DEFAULT_NIVELES_CONFIG);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", telefono: "", email: "" });

  const nivelesActuales = useMemo(() => construirNiveles(nivelesConfig), [nivelesConfig]);

  const filtrosActivos = useMemo<Array<{ key: Filtro; label: string; ayuda: string }>>(() => [
    { key: "todos", label: "Todos", ayuda: "Base completa" },
    { key: "nuevo", label: "Nuevos", ayuda: nivelesActuales.nuevo.range },
    { key: "frecuente", label: "Frecuentes", ayuda: nivelesActuales.frecuente.range },
    { key: "habitual", label: "Habituales", ayuda: nivelesActuales.habitual.range },
    { key: "vip", label: "VIP", ayuda: nivelesActuales.vip.range },
    { key: "maestro", label: "Maestros", ayuda: nivelesActuales.maestro.range },
    { key: "recuperar", label: "Dormidos", ayuda: "+30 días" },
    { key: "resena", label: "Sin reseña", ayuda: "Pedir valoración" },
  ], [nivelesActuales]);

  useEffect(() => {
    const cargarRestaurante = async () => {
      const id = await getRestauranteUsuario();
      if (id) setRestauranteId(id);
    };
    cargarRestaurante();
  }, []);

  const cargarClientes = useCallback(async () => {
    if (!restauranteId) return;
    setCargando(true);
    setError(null);

    const { data, error } = await supabase
      .from("vw_clientes_resumen")
      .select("*")
      .eq("restaurante_id", restauranteId)
      .order("ultima_visita", { ascending: false });

    if (error) {
      const fallback = await supabase
        .from("clientes")
        .select("*")
        .eq("restaurante_id", restauranteId)
        .order("ultima_visita", { ascending: false });

      if (fallback.error) {
        setError(fallback.error.message || error.message || "No se pudieron cargar los clientes");
        setClientes([]);
      } else {
        setClientes((fallback.data || []) as ClienteResumen[]);
      }
    } else {
      setClientes((data || []) as ClienteResumen[]);
    }

    setCargando(false);
  }, [restauranteId]);

  const cargarConfigNiveles = useCallback(async () => {
    if (!restauranteId) return;

    const { data } = await supabase
      .from("fidelizacion_config")
      .select("nivel_frecuente_desde,nivel_habitual_desde,nivel_vip_desde,nivel_maestro_desde")
      .eq("restaurante_id", restauranteId)
      .maybeSingle();

    const config = normalizarNivelesConfig(data || DEFAULT_NIVELES_CONFIG);
    setNivelesConfig(config);
    setNivelesForm(config);
  }, [restauranteId]);

  async function guardarNiveles() {
    if (!restauranteId) return;

    const config = normalizarNivelesConfig(nivelesForm);
    if (
      config.nivel_frecuente_desde >= config.nivel_habitual_desde
      || config.nivel_habitual_desde >= config.nivel_vip_desde
      || config.nivel_vip_desde >= config.nivel_maestro_desde
    ) {
      alert("Los niveles tienen que ir en orden: Frecuente < Habitual < VIP < Maestro.");
      return;
    }

    setGuardandoNiveles(true);

    const actual = await supabase
      .from("fidelizacion_config")
      .select("puntos_por_euro")
      .eq("restaurante_id", restauranteId)
      .maybeSingle();

    const { error } = await supabase
      .from("fidelizacion_config")
      .upsert(
        {
          restaurante_id: restauranteId,
          puntos_por_euro: Number(actual.data?.puntos_por_euro ?? 1),
          nivel_frecuente_desde: config.nivel_frecuente_desde,
          nivel_habitual_desde: config.nivel_habitual_desde,
          nivel_vip_desde: config.nivel_vip_desde,
          nivel_maestro_desde: config.nivel_maestro_desde,
        },
        { onConflict: "restaurante_id" }
      );

    setGuardandoNiveles(false);

    if (error) {
      alert(error.message || "No se pudieron guardar los niveles");
      return;
    }

    setNivelesConfig(config);
    setNivelesForm(config);
    setModalNiveles(false);
  }

  useEffect(() => {
    cargarClientes();
    cargarConfigNiveles();
  }, [cargarClientes, cargarConfigNiveles]);

  useEffect(() => {
    if (!restauranteId) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void cargarClientes(), 250);
    };

    const channel = supabase
      .channel(`clientes-ranking-${restauranteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes", filter: `restaurante_id=eq.${restauranteId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "reservas", filter: `restaurante_id=eq.${restauranteId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "clientes_historial", filter: `restaurante_id=eq.${restauranteId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "puntos_saldos", filter: `restaurante_id=eq.${restauranteId}` }, refresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [cargarClientes, restauranteId]);

  const resumen = useMemo(() => {
    const total = clientes.length;
    const nuevo = clientes.filter((c) => nivelCliente(c, nivelesConfig) === "nuevo").length;
    const frecuente = clientes.filter((c) => nivelCliente(c, nivelesConfig) === "frecuente").length;
    const habitual = clientes.filter((c) => nivelCliente(c, nivelesConfig) === "habitual").length;
    const vip = clientes.filter((c) => nivelCliente(c, nivelesConfig) === "vip").length;
    const maestro = clientes.filter((c) => nivelCliente(c, nivelesConfig) === "maestro").length;
    const dormidos = clientes.filter((c) => estadosCliente(c).includes("Dormido")).length;

    return { total, nuevo, frecuente, habitual, vip, maestro, dormidos };
  }, [clientes, nivelesConfig]);

  const rankingClientes = useMemo(() => {
    return [...clientes]
      .sort((a, b) => {
        const visits = visitasCliente(b) - visitasCliente(a);
        if (visits !== 0) return visits;
        const spend = numero(b.gasto_total) - numero(a.gasto_total);
        if (spend !== 0) return spend;
        return getCustomerPoints(b) - getCustomerPoints(a);
      })
      .slice(0, 5);
  }, [clientes]);

  const totalVisitas = useMemo(
    () => clientes.reduce((total, cliente) => total + visitasCliente(cliente), 0),
    [clientes],
  );

  const clientesFiltrados = useMemo(() => {
    const term = busqueda.trim().toLowerCase();

    return clientes
      .filter((cliente) => {
        const nivel = nivelCliente(cliente, nivelesConfig);
        const estados = estadosCliente(cliente);
        const telefono = limpiarTelefono(cliente.telefono);

        const matchFiltro =
          filtro === "todos" ||
          filtro === nivel ||
          (filtro === "recuperar" && estados.includes("Dormido")) ||
          (filtro === "resena" && estados.includes("Sin reseña"));

        const matchBusqueda =
          !term ||
          String(cliente.nombre || "").toLowerCase().includes(term) ||
          String(cliente.telefono || "").toLowerCase().includes(term) ||
          String(cliente.email || "").toLowerCase().includes(term) ||
          nivel.toLowerCase().includes(term) ||
          estados.join(" ").toLowerCase().includes(term) ||
          telefono.includes(term.replace(/\D/g, ""));

        return matchFiltro && matchBusqueda;
      })
      .sort((a, b) => {
        const peso: Record<NivelCliente, number> = { maestro: 5, vip: 4, habitual: 3, frecuente: 2, nuevo: 1 };
        const porNivel = peso[nivelCliente(b, nivelesConfig)] - peso[nivelCliente(a, nivelesConfig)];
        if (porNivel !== 0) return porNivel;
        return visitasCliente(b) - visitasCliente(a);
      });
  }, [clientes, filtro, busqueda, nivelesConfig]);

  const acciones = useMemo(() => {
    return clientes
      .map((cliente) => ({ cliente, accion: accionPrioritaria(cliente, nivelesConfig), estados: estadosCliente(cliente), nivel: nivelCliente(cliente, nivelesConfig) }))
      .filter((item) => item.estados.includes("Dormido") || item.estados.includes("Sin reseña") || item.nivel === "habitual" || item.nivel === "vip" || item.nivel === "maestro")
      .slice(0, 4);
  }, [clientes, nivelesConfig]);

  async function copiarMensaje(cliente: ClienteResumen, tipo: TipoMensaje) {
    const mensaje = mensajeCliente(cliente, tipo);
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiadoId(`${cliente.id}-${tipo}`);
      setTimeout(() => setCopiadoId(null), 1600);
    } catch {
      window.prompt("Copia el mensaje:", mensaje);
    }
  }

  function abrirWhatsApp(cliente: ClienteResumen, tipo: TipoMensaje) {
    const telefono = telefonoParaWhatsApp(cliente.telefono);
    if (!telefono) {
      copiarMensaje(cliente, tipo);
      return;
    }

    const mensaje = encodeURIComponent(mensajeCliente(cliente, tipo));
    window.open(`https://wa.me/${telefono}?text=${mensaje}`, "_blank");
  }

  async function crearCliente() {
    if (!restauranteId || !nuevoCliente.nombre.trim()) return;

    const { error } = await supabase.from("clientes").insert({
      restaurante_id: restauranteId,
      nombre: nuevoCliente.nombre.trim(),
      telefono: nuevoCliente.telefono.trim() || null,
      email: nuevoCliente.email.trim() || null,
      visitas_totales: 0,
      puntos_totales: 0,
      permite_whatsapp: Boolean(nuevoCliente.telefono.trim()),
      permite_email: Boolean(nuevoCliente.email.trim()),
    });

    if (error) {
      alert(error.message || "No se pudo crear el cliente");
      return;
    }

    setNuevoCliente({ nombre: "", telefono: "", email: "" });
    setModalNuevo(false);
    cargarClientes();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-blue-700 ring-1 ring-blue-100">
                <Users className="h-4 w-4" /> Clientes y niveles
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-tight !text-slate-950">Clientes</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
                Una vista unificada de reservas, visitas, gasto y puntos. Del primer contacto hasta Maestro.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente, teléfono o email"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-bold text-slate-900 outline-none ring-blue-100 transition focus:border-blue-300 focus:ring-4"
                />
              </div>
              <button
                onClick={() => setModalRanking(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-black text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                <Trophy className="h-4 w-4" /> Ranking clientes
              </button>
              <button
                onClick={() => {
                  setNivelesForm(nivelesConfig);
                  setModalNiveles(true);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-xs font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
              >
                <SlidersHorizontal className="h-4 w-4" /> Niveles
              </button>
              <button
                onClick={() => setModalNuevo(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" /> Añadir cliente
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
          <KpiCard icon={Users} label="Clientes" value={resumen.total} help="Base total" />
          <KpiCard icon={Star} label="Nuevos" value={resumen.nuevo} help={nivelesActuales.nuevo.range} />
          <KpiCard icon={MessageCircle} label="Frecuentes" value={resumen.frecuente} help={nivelesActuales.frecuente.range} />
          <KpiCard icon={Sparkles} label="Habituales" value={resumen.habitual} help={nivelesActuales.habitual.range} />
          <KpiCard icon={Crown} label="VIP" value={resumen.vip} help={nivelesActuales.vip.range} />
          <KpiCard icon={Trophy} label="Maestros" value={resumen.maestro} help={nivelesActuales.maestro.range} />
          <KpiCard icon={Clock3} label="Dormidos" value={resumen.dormidos} help="+30 días" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {filtrosActivos.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setFiltro(item.key)}
                    className={`shrink-0 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                      filtro === item.key
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {item.label}
                    <span className={`block text-[11px] font-bold ${filtro === item.key ? "text-white/70" : "text-slate-400"}`}>{item.ayuda}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="font-black !text-slate-950">Base de clientes</h2>
                  <p className="text-sm font-semibold text-slate-500">{clientesFiltrados.length} resultados</p>
                </div>
                {cargando && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
              </div>

              {error && <div className="m-5 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700 ring-1 ring-red-100">{error}</div>}

              <div className="divide-y divide-slate-100">
                {!cargando && clientesFiltrados.length === 0 && (
                  <div className="p-10 text-center text-sm font-bold text-slate-400">No hay clientes en este filtro.</div>
                )}

                {clientesFiltrados.map((cliente) => {
                  const nivel = nivelCliente(cliente, nivelesConfig);
                  const config = nivelesActuales[nivel];
                  const estados = estadosCliente(cliente);
                  const accion = accionPrioritaria(cliente, nivelesConfig);
                  const telefonoWhatsApp = telefonoParaWhatsApp(cliente.telefono);
                  const progreso = progresoNivel(cliente, nivelesConfig);

                  return (
                    <article key={cliente.id} className="p-5 transition hover:bg-slate-50/70">
                      <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-3">
                            <Link href={`/clientes/${cliente.id}`} className="text-lg font-black text-slate-950 hover:text-blue-700">
                              {cliente.nombre || "Cliente sin nombre"}
                            </Link>
                            <span className={`rounded-full border px-3 py-1 text-xs font-black ${badgeNivel(nivel)}`}>{config.label}</span>
                            {estados.slice(0, 2).map((estado) => (
                              <span key={estado} className={`rounded-full border px-2.5 py-1 text-xs font-black ${badgeEstado(estado)}`}>
                                {estado}
                              </span>
                            ))}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
                            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {cliente.telefono || "Sin teléfono"}</span>
                            <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {cliente.email || "Sin email"}</span>
                            <span>{visitasCliente(cliente)} visitas</span>
                            <span>{getCustomerPoints(cliente)} puntos</span>
                            <span>Última: {formatUltimaVisita(cliente.ultima_visita_real || cliente.ultima_visita)}</span>
                          </div>

                          <div className="mt-4 max-w-3xl rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                            <div className="flex items-center justify-between gap-3 text-xs font-black uppercase tracking-[0.12em] text-slate-400">
                              <span>{textoSiguienteNivel(cliente, nivelesConfig)}</span>
                              <span>{config.range}</span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                              <div className="h-full rounded-full bg-blue-600" style={{ width: `${progreso}%` }} />
                            </div>
                            <p className="mt-3 text-sm font-bold text-slate-700">
                              {accion.titulo}: <span className="font-semibold text-slate-500">{accion.texto}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 xl:justify-end">
                          <button onClick={() => copiarMensaje(cliente, accion.tipo)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                            <Copy className="mr-1 inline h-3.5 w-3.5" /> {copiadoId === `${cliente.id}-${accion.tipo}` ? "Copiado" : "Copiar"}
                          </button>
                          <button onClick={() => abrirWhatsApp(cliente, accion.tipo)} className="rounded-xl bg-green-600 px-3 py-2 text-xs font-black text-white hover:bg-green-700">
                            <MessageCircle className="mr-1 inline h-3.5 w-3.5" /> {telefonoWhatsApp ? "WhatsApp" : "Mensaje"}
                          </button>
                          <Link href={`/clientes/${cliente.id}`} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white hover:bg-slate-800">
                            Ficha
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100"><Crown className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-black !text-slate-950">Niveles</h2>
                  <p className="text-sm font-semibold text-slate-500">Base para puntos, cupones y ventajas</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {(Object.keys(nivelesActuales) as NivelCliente[]).map((nivel) => {
                  const config = nivelesActuales[nivel];
                  return (
                    <div key={nivel} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`rounded-full border px-3 py-1 text-xs font-black ${badgeNivel(nivel)}`}>{config.label}</span>
                        <span className="text-xs font-black text-slate-400">{config.range}</span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-slate-600">{config.description}</p>
                      <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-blue-700">Bonus de nivel preparado: {config.multiplier}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100"><Sparkles className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-black !text-slate-950">Mover ahora</h2>
                  <p className="text-sm font-semibold text-slate-500">Acciones simples, sin guardar ruido</p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {acciones.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">No hay acciones urgentes ahora.</p>}
                {acciones.map(({ cliente, accion }) => (
                  <div key={`${cliente.id}-${accion.titulo}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{cliente.nombre || "Cliente"}</p>
                        <p className="mt-1 text-sm font-bold text-slate-500">{accion.titulo}</p>
                      </div>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${badgeNivel(nivelCliente(cliente, nivelesConfig))}`}>
                        {nivelesActuales[nivelCliente(cliente, nivelesConfig)].label}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-slate-600">{accion.texto}</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => copiarMensaje(cliente, accion.tipo)} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">Copiar</button>
                      <button onClick={() => abrirWhatsApp(cliente, accion.tipo)} className="rounded-xl bg-green-600 px-3 py-2 text-xs font-black text-white">WhatsApp</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>

      {modalRanking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] bg-slate-950 text-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-slate-950/95 p-5 backdrop-blur sm:p-6">
              <div>
                <div className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">
                  <Trophy className="h-4 w-4" /> Ranking clientes
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight !text-white">Los clientes más fieles</h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">Visitas reales, gasto registrado y puntos disponibles.</p>
              </div>
              <button onClick={() => setModalRanking(false)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15">Cerrar</button>
            </div>

            <div className="p-5 sm:p-6">
              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Visitas conectadas</p>
                  <p className="mt-2 text-3xl font-black">{totalVisitas}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">Alta fidelidad</p>
                  <p className="mt-2 text-3xl font-black">{resumen.vip + resumen.maestro}</p>
                </div>
              </div>

              {rankingClientes.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-sm font-bold text-slate-400">El ranking aparecerá con las primeras visitas.</div>
              ) : (
                <div className="space-y-2.5">
                  {rankingClientes.map((cliente, index) => {
                    const level = nivelCliente(cliente, nivelesConfig);
                    const levelDefinition = nivelesActuales[level];
                    return (
                      <Link key={cliente.id} href={`/clientes/${cliente.id}`} className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3 transition hover:bg-white/10 sm:p-4">
                        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl font-black ${index === 0 ? "bg-amber-300 text-amber-950" : index === 1 ? "bg-slate-200 text-slate-800" : index === 2 ? "bg-orange-300 text-orange-950" : "bg-white/10 text-slate-300"}`}>
                          {index < 3 ? <Medal className="h-5 w-5" /> : index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-black">{cliente.nombre || "Cliente sin nombre"}</p>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-300">{levelDefinition.label}</span>
                          </div>
                          <p className="mt-1 truncate text-xs font-bold text-slate-400">{numero(cliente.gasto_total).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · {getCustomerPoints(cliente)} puntos</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-black">{visitasCliente(cliente)}</p>
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">visitas</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalNiveles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black !text-slate-950">Configurar niveles de clientes</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Cada restaurante decide desde cuántas visitas un cliente sube de nivel.</p>
              </div>
              <button onClick={() => setModalNiveles(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">Cerrar</button>
            </div>

            <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-bold text-blue-800 ring-1 ring-blue-100">
              Nuevo será siempre desde 0 visitas. Después avanzará por Frecuente, Habitual, VIP y Maestro.
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-400">Frecuente desde</span>
                <input
                  type="number"
                  min={1}
                  value={nivelesForm.nivel_frecuente_desde}
                  onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_frecuente_desde: Number(e.target.value) }))}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
                <span className="mt-2 block text-xs font-bold text-slate-500">visitas</span>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-400">Habitual desde</span>
                <input
                  type="number"
                  min={2}
                  value={nivelesForm.nivel_habitual_desde}
                  onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_habitual_desde: Number(e.target.value) }))}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
                <span className="mt-2 block text-xs font-bold text-slate-500">visitas</span>
              </label>

              <label className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-400">VIP desde</span>
                <input
                  type="number"
                  min={3}
                  value={nivelesForm.nivel_vip_desde}
                  onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_vip_desde: Number(e.target.value) }))}
                  className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                />
                <span className="mt-2 block text-xs font-bold text-slate-500">visitas</span>
              </label>

              <label className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <span className="block text-xs font-black uppercase tracking-[0.12em] text-amber-700">Maestro desde</span>
                <input
                  type="number"
                  min={4}
                  value={nivelesForm.nivel_maestro_desde}
                  onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_maestro_desde: Number(e.target.value) }))}
                  className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-lg font-black outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                />
                <span className="mt-2 block text-xs font-bold text-amber-700">visitas</span>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">Vista previa</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(construirNiveles(nivelesForm)) as NivelCliente[]).map((nivel) => {
                  const config = construirNiveles(nivelesForm)[nivel];
                  return (
                    <span key={nivel} className={`rounded-full border px-3 py-1 text-xs font-black ${badgeNivel(nivel)}`}>
                      {config.label}: {config.range}
                    </span>
                  );
                })}
              </div>
            </div>

            <button
              onClick={guardarNiveles}
              disabled={guardandoNiveles}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {guardandoNiveles && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar niveles
            </button>
          </div>
        </div>
      )}

      {modalNuevo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black !text-slate-950">Nuevo cliente</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Empieza como cliente nuevo. Subirá de nivel según sus visitas.</p>
              </div>
              <button onClick={() => setModalNuevo(false)} className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-600">Cerrar</button>
            </div>

            <div className="mt-5 space-y-3">
              <input value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((a) => ({ ...a, nombre: e.target.value }))} placeholder="Nombre" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
              <input value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente((a) => ({ ...a, telefono: e.target.value }))} placeholder="Teléfono" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
              <input value={nuevoCliente.email} onChange={(e) => setNuevoCliente((a) => ({ ...a, email: e.target.value }))} placeholder="Email" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
            </div>

            <button onClick={crearCliente} className="mt-5 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700">
              Guardar cliente
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function KpiCard({ icon: Icon, label, value, help }: { icon: any; label: string; value: number; help: string }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{help}</p>
        </div>
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
