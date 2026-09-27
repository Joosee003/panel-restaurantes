"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, Loader2, Mail, MessageCircle, Phone, Plus, Search, X } from "lucide-react";
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
import { CrmDialog } from "./CrmDialog";
import styles from "./crm.module.css";

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
  review_whatsapp?: boolean;
  loyalty_whatsapp?: boolean;
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

function puedeEnviarWhatsApp(cliente: ClienteResumen, tipo: TipoMensaje) {
  if (cliente.permite_whatsapp !== true) return false;
  return tipo === "resena"
    ? cliente.review_whatsapp === true
    : cliente.loyalty_whatsapp === true;
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
  const [fidelizacionActiva, setFidelizacionActiva] = useState(false);
  const [nivelesConfig, setNivelesConfig] = useState<NivelesClienteConfig>(DEFAULT_NIVELES_CONFIG);
  const [nivelesForm, setNivelesForm] = useState<NivelesClienteConfig>(DEFAULT_NIVELES_CONFIG);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: "", telefono: "", email: "" });
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const selectedCliente = clientes.find((cliente) => cliente.id === selectedClienteId) || null;

  useEffect(() => {
    if (!modalNuevo && !modalRanking && !modalNiveles) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setModalNuevo(false);
      setModalRanking(false);
      setModalNiveles(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [modalNiveles, modalNuevo, modalRanking]);

  const nivelesActuales = useMemo(() => construirNiveles(nivelesConfig), [nivelesConfig]);

  const filtrosActivos = useMemo<Array<{ key: Filtro; label: string; ayuda: string }>>(() => {
    const basicos: Array<{ key: Filtro; label: string; ayuda: string }> = [
      { key: "todos", label: "Todos", ayuda: "Base completa" },
      { key: "recuperar", label: "Sin visita reciente", ayuda: "+30 días" },
      { key: "resena", label: "Sin reseña", ayuda: "Pendientes" },
    ];
    if (!fidelizacionActiva) return basicos;
    return [
      basicos[0],
      { key: "nuevo", label: "Nuevos", ayuda: nivelesActuales.nuevo.range },
      { key: "frecuente", label: "Frecuentes", ayuda: nivelesActuales.frecuente.range },
      { key: "habitual", label: "Habituales", ayuda: nivelesActuales.habitual.range },
      { key: "vip", label: "VIP", ayuda: nivelesActuales.vip.range },
      { key: "maestro", label: "Maestros", ayuda: nivelesActuales.maestro.range },
      ...basicos.slice(1),
    ];
  }, [fidelizacionActiva, nivelesActuales]);

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

    let clientesCargados: ClienteResumen[] = [];

    if (error) {
      const fallback = await supabase
        .from("clientes")
        .select("*")
        .eq("restaurante_id", restauranteId)
        .order("ultima_visita", { ascending: false });

      if (fallback.error) {
        setError(fallback.error.message || error.message || "No se pudieron cargar los clientes");
        setClientes([]);
        setCargando(false);
        return;
      } else {
        clientesCargados = (fallback.data || []) as ClienteResumen[];
      }
    } else {
      clientesCargados = (data || []) as ClienteResumen[];
    }

    const { data: consentimientos, error: consentimientosError } = await supabase
      .from("cliente_comunicaciones_consentimiento")
      .select("cliente_id,review_whatsapp,loyalty_whatsapp,revoked_at")
      .eq("restaurante_id", restauranteId)
      .is("revoked_at", null);

    if (consentimientosError) {
      setError("No se pudieron comprobar los permisos de contacto.");
    }

    const permisos = new Map(
      (consentimientos || []).map((item) => [
        String(item.cliente_id),
        {
          review_whatsapp: item.review_whatsapp === true,
          loyalty_whatsapp: item.loyalty_whatsapp === true,
        },
      ]),
    );

    setClientes(
      clientesCargados.map((cliente) => ({
        ...cliente,
        review_whatsapp: permisos.get(cliente.id)?.review_whatsapp ?? false,
        loyalty_whatsapp: permisos.get(cliente.id)?.loyalty_whatsapp ?? false,
      })),
    );

    setCargando(false);
  }, [restauranteId]);

  const cargarConfigNiveles = useCallback(async () => {
    if (!restauranteId) return;

    const { data: modulos } = await supabase
      .from("restaurante_modulos")
      .select("fidelizacion")
      .eq("restaurante_id", restauranteId)
      .maybeSingle();

    const activa = modulos?.fidelizacion === true;
    setFidelizacionActiva(activa);
    if (!activa) {
      setNivelesConfig(DEFAULT_NIVELES_CONFIG);
      setNivelesForm(DEFAULT_NIVELES_CONFIG);
      setFiltro((actual) =>
        ["todos", "recuperar", "resena"].includes(actual) ? actual : "todos",
      );
      return;
    }

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
    if (!restauranteId || !fidelizacionActiva) return;

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
    let activo = true;
    queueMicrotask(() => {
      if (!activo) return;
      void cargarClientes();
      void cargarConfigNiveles();
    });

    return () => {
      activo = false;
    };
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
    const sinResena = clientes.filter((c) => estadosCliente(c).includes("Sin reseña")).length;

    return { total, nuevo, frecuente, habitual, vip, maestro, dormidos, sinResena };
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
          (fidelizacionActiva && nivel.toLowerCase().includes(term)) ||
          estados.join(" ").toLowerCase().includes(term) ||
          telefono.includes(term.replace(/\D/g, ""));

        return matchFiltro && matchBusqueda;
      })
      .sort((a, b) => {
        if (!fidelizacionActiva) return visitasCliente(b) - visitasCliente(a);
        const peso: Record<NivelCliente, number> = { maestro: 5, vip: 4, habitual: 3, frecuente: 2, nuevo: 1 };
        const porNivel = peso[nivelCliente(b, nivelesConfig)] - peso[nivelCliente(a, nivelesConfig)];
        if (porNivel !== 0) return porNivel;
        return visitasCliente(b) - visitasCliente(a);
      });
  }, [clientes, filtro, busqueda, fidelizacionActiva, nivelesConfig]);

  const acciones = useMemo(() => {
    if (!fidelizacionActiva) return [];
    return clientes
      .map((cliente) => ({ cliente, accion: accionPrioritaria(cliente, nivelesConfig), estados: estadosCliente(cliente), nivel: nivelCliente(cliente, nivelesConfig) }))
      .filter((item) => item.estados.includes("Dormido") || item.estados.includes("Sin reseña") || item.nivel === "habitual" || item.nivel === "vip" || item.nivel === "maestro")
      .slice(0, 4);
  }, [clientes, fidelizacionActiva, nivelesConfig]);

  async function copiarMensaje(cliente: ClienteResumen, tipo: TipoMensaje) {
    if (!puedeEnviarWhatsApp(cliente, tipo)) {
      alert("No consta permiso para enviar este tipo de mensaje por WhatsApp.");
      return;
    }
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
    if (!puedeEnviarWhatsApp(cliente, tipo)) {
      alert("No consta permiso para enviar este tipo de mensaje por WhatsApp.");
      return;
    }
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
      permite_whatsapp: false,
      permite_email: false,
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
    <div className={styles.page}>
      <header className={styles.heading}>
        <div><h1>Clientes</h1><p>La relación con quienes vuelven.</p></div>
        <div className={styles.headingActions}>
          {fidelizacionActiva ? <button onClick={() => setModalRanking(true)} className={styles.button}>Ranking</button> : null}
          {fidelizacionActiva ? <button onClick={() => { setNivelesForm(nivelesConfig); setModalNiveles(true); }} className={styles.button}>Niveles</button> : null}
          <button onClick={() => setModalNuevo(true)} className={styles.primary}><Plus size={15} /> Añadir cliente</button>
        </div>
      </header>
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={17} aria-hidden="true" /><input aria-label="Buscar cliente, teléfono o email" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente, teléfono o email" /></label>
        <div className={styles.inlineStats}><span><strong>{resumen.total}</strong> clientes</span><span><strong>{totalVisitas}</strong> visitas</span><span><strong>{resumen.dormidos}</strong> sin visita reciente</span></div>
      </div>
      <nav className={styles.segmentBar} aria-label="Segmentos de clientes">
        <div className={styles.segmentGroup} role="group" aria-label="Base y seguimiento">
          <span className={styles.segmentLabel} aria-hidden="true">Ver</span>
          <div className={styles.segmentButtons}>{filtrosActivos.filter((item) => ["todos", "recuperar", "resena"].includes(item.key)).map((item) => <button key={item.key} onClick={() => setFiltro(item.key)} aria-pressed={filtro === item.key} title={item.ayuda} className={styles.filter}>{item.label}<span className="sr-only"> · {item.ayuda}</span></button>)}</div>
        </div>
        {fidelizacionActiva && <div className={styles.segmentGroup} role="group" aria-label="Nivel de relación">
          <span className={styles.segmentLabel} aria-hidden="true">Nivel</span>
          <div className={styles.segmentButtons}>{filtrosActivos.filter((item) => !["todos", "recuperar", "resena"].includes(item.key)).map((item) => <button key={item.key} onClick={() => setFiltro(item.key)} aria-pressed={filtro === item.key} title={item.ayuda} className={styles.filter}>{item.label}<span className="sr-only"> · {item.ayuda}</span></button>)}</div>
        </div>}
      </nav>
      <div className={styles.listHeading}><span>{clientesFiltrados.length} clientes · {filtrosActivos.find((item) => item.key === filtro)?.label}</span><span aria-live="polite">{cargando ? <><Loader2 size={13} className="inline animate-spin" /> Actualizando</> : "Ordenados por relación y visitas"}</span></div>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <table className={styles.table} aria-label="Base de clientes">
        <colgroup><col className={styles.customerColumn} /><col className={styles.relationshipColumn} /><col className={styles.visitColumn} /><col className={styles.numberColumn} />{fidelizacionActiva && <col className={styles.numberColumn} />}<col className={styles.permissionColumn} /><col className={styles.reviewColumn} /><col className={styles.detailColumn} /></colgroup>
        <thead><tr><th scope="col">Cliente</th><th scope="col">Relación</th><th scope="col">Última visita</th><th scope="col">Visitas</th>{fidelizacionActiva && <th scope="col">Puntos</th>}<th scope="col">Permiso</th><th scope="col">Reseña</th><th scope="col"><span className="sr-only">Detalle</span></th></tr></thead>
        <tbody>
          {clientesFiltrados.map((cliente) => {
            const nivel = nivelCliente(cliente, nivelesConfig);
            const estados = estadosCliente(cliente);
            return <tr key={cliente.id} data-selected={cliente.id === selectedClienteId}>
              <td className={styles.customerCell} data-label="Cliente"><Link className={styles.name} href={`/clientes/${cliente.id}`}>{cliente.nombre || "Cliente sin nombre"}</Link><span className={styles.subline}>{cliente.telefono || cliente.email || "Sin datos de contacto"}</span></td>
              <td className={styles.relationshipCell} data-label="Relación"><span className={styles.relationshipName}>{fidelizacionActiva ? nivelesActuales[nivel].label : `${numero(cliente.total_reservas)} reservas`}</span><span className={styles.subline}>{estados.slice(0, 2).join(" · ") || (fidelizacionActiva ? nivelesActuales[nivel].range : `${numero(cliente.total_atendidas)} atendidas`)}</span></td>
              <td className={styles.lastVisitCell} data-label="Última visita"><span title={cliente.ultima_visita_real || cliente.ultima_visita ? new Date((cliente.ultima_visita_real || cliente.ultima_visita)!).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "Sin visita registrada"}>{formatUltimaVisita(cliente.ultima_visita_real || cliente.ultima_visita)}</span>{cliente.proxima_reserva && <span className={styles.nextVisit}>Próxima: {new Date(cliente.proxima_reserva).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</span>}</td>
              <td className={styles.visitsCell} data-label="Visitas">{visitasCliente(cliente)}</td>
              {fidelizacionActiva && <td data-label="Puntos">{getCustomerPoints(cliente)}</td>}
              <td className={styles.permissionCell} data-label="Permiso"><span className={`${styles.status} ${cliente.permite_whatsapp === true && (cliente.review_whatsapp || (fidelizacionActiva && cliente.loyalty_whatsapp)) ? styles.positive : ""}`} data-authorized={cliente.permite_whatsapp === true && (cliente.review_whatsapp || (fidelizacionActiva && cliente.loyalty_whatsapp))}>{cliente.permite_whatsapp === true && cliente.review_whatsapp ? "Reseñas" : cliente.permite_whatsapp === true && fidelizacionActiva && cliente.loyalty_whatsapp ? "Fidelización" : "Sin permiso WA"}</span>{cliente.permite_whatsapp === true && cliente.review_whatsapp && fidelizacionActiva && cliente.loyalty_whatsapp && <span className={styles.subline}>+ Fidelización</span>}</td>
              <td className={styles.reviewCell} data-label="Reseña"><span className={`${styles.reviewStatus} ${cliente.ya_dejo_resena === true ? styles.positive : styles.quiet}`} data-recorded={cliente.ya_dejo_resena === true}>{cliente.ya_dejo_resena === true ? "Registrada" : cliente.ya_dejo_resena === false ? "Sin registrar" : "Sin dato"}</span></td>
              <td className={styles.detailCell}><button className={styles.detailButton} onClick={() => setSelectedClienteId(cliente.id)} aria-label={`Ver contexto de ${cliente.nombre || "cliente"}`} aria-haspopup="dialog" aria-expanded={cliente.id === selectedClienteId}><ChevronRight size={17} /></button></td>
            </tr>;
          })}
        </tbody>
      </table>
      {!cargando && clientesFiltrados.length === 0 && <div className={styles.empty}><strong>No hay clientes en este filtro.</strong>Prueba otro segmento o una búsqueda diferente.</div>}
      {cargando && clientesFiltrados.length === 0 && <div className={styles.empty} role="status"><Loader2 size={19} className="mx-auto mb-3 animate-spin" /> Cargando clientes…</div>}
      <div className={styles.disclosures}>
        {fidelizacionActiva ? <details className={styles.disclosure}><summary>Seguimiento de clientes · {acciones.length} acciones</summary>{acciones.length === 0 && <p className={styles.quiet}>No hay acciones urgentes ahora.</p>}{acciones.map(({ cliente, accion }) => <div key={`${cliente.id}-${accion.titulo}`} className={styles.secondaryRow}><div><Link href={`/clientes/${cliente.id}`} className={styles.name}>{cliente.nombre || "Cliente"}</Link><p>{accion.titulo} · {accion.texto}</p></div><div className={styles.actions}><button onClick={() => copiarMensaje(cliente, accion.tipo)} disabled={!puedeEnviarWhatsApp(cliente, accion.tipo)} className={styles.button}>Copiar</button><button onClick={() => abrirWhatsApp(cliente, accion.tipo)} disabled={!puedeEnviarWhatsApp(cliente, accion.tipo)} className={styles.button}>WhatsApp</button></div></div>)}</details> : null}
        {fidelizacionActiva ? <details className={styles.disclosure}><summary>Criterios de niveles</summary>{(Object.keys(nivelesActuales) as NivelCliente[]).map((nivel) => <div key={nivel} className={styles.levelDescription}><strong>{nivelesActuales[nivel].label}<span className={styles.subline}>{nivelesActuales[nivel].range}</span></strong><p>{nivelesActuales[nivel].description}<span className={styles.subline}>Bonus de nivel preparado: {nivelesActuales[nivel].multiplier}</span></p></div>)}</details> : <details className={styles.disclosure}><summary>Qué incluye tu base de clientes</summary><p className={styles.quiet}>Contactos, reservas y visitas. Los puntos, niveles, premios y cupones aparecen cuando Fidelización está activa.</p></details>}
      </div>
      {selectedCliente && (() => {
        const cliente = selectedCliente;
        const nivel = nivelCliente(cliente, nivelesConfig);
        const accion = accionPrioritaria(cliente, nivelesConfig);
        return <CrmDialog titleId="client-context-title" onClose={() => setSelectedClienteId(null)} rail>
          <header className={styles.dialogHeader}><div><p>Contexto del cliente</p><h2 id="client-context-title">{cliente.nombre || "Cliente sin nombre"}</h2></div><button className={styles.textButton} onClick={() => setSelectedClienteId(null)} aria-label="Cerrar contexto"><X size={18} /></button></header>
          <Link href={`/clientes/${cliente.id}`} className={styles.primary}>Abrir ficha completa <ChevronRight size={14} /></Link>
          <section className={styles.railSection}><h3>Relación</h3><dl className={styles.dataList}><div><dt>Visitas</dt><dd>{visitasCliente(cliente)}</dd></div><div><dt>Última visita</dt><dd>{formatUltimaVisita(cliente.ultima_visita_real || cliente.ultima_visita)}</dd></div><div><dt>Reservas</dt><dd>{numero(cliente.total_reservas)} · {numero(cliente.total_atendidas)} atendidas</dd></div><div><dt>Canceladas</dt><dd>{numero(cliente.total_canceladas_reales)}</dd></div>{cliente.proxima_reserva && <div><dt>Próxima reserva</dt><dd>{new Date(cliente.proxima_reserva).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</dd></div>}{typeof cliente.gasto_total === "number" && <div><dt>Gasto registrado</dt><dd>{cliente.gasto_total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</dd></div>}{fidelizacionActiva && <><div><dt>Nivel</dt><dd>{nivelesActuales[nivel].label}</dd></div><div><dt>Puntos</dt><dd>{getCustomerPoints(cliente)}</dd></div></>}</dl>{fidelizacionActiva && <><div className={styles.progress}><span style={{ width: `${progresoNivel(cliente, nivelesConfig)}%` }} /></div><p className={styles.quiet}>{textoSiguienteNivel(cliente, nivelesConfig)}</p></>}</section>
          <section className={styles.railSection}><h3>Contacto y permisos</h3><p className={styles.contact}><Phone size={14} />{cliente.telefono || "Sin teléfono"}</p><p className={styles.contact}><Mail size={14} />{cliente.email || "Sin email"}</p><dl className={styles.dataList}><div><dt>WhatsApp · reseñas</dt><dd>{puedeEnviarWhatsApp(cliente, "resena") ? "Autorizado" : "Sin permiso"}</dd></div>{fidelizacionActiva && <div><dt>WhatsApp · fidelización</dt><dd>{puedeEnviarWhatsApp(cliente, "cupon") ? "Autorizado" : "Sin permiso"}</dd></div>}<div><dt>Email</dt><dd>{cliente.permite_email === true ? "Autorizado" : "Sin permiso"}</dd></div></dl></section>
          {cliente.notas_internas && <section className={styles.railSection}><h3>Notas internas</h3><p>{cliente.notas_internas}</p></section>}
          {cliente.etiquetas?.length ? <section className={styles.railSection}><h3>Etiquetas</h3><p>{cliente.etiquetas.join(" · ")}</p></section> : null}
          {fidelizacionActiva && <section className={styles.railSection}><h3>{accion.titulo}</h3><p>{accion.texto}</p>{!puedeEnviarWhatsApp(cliente, accion.tipo) && <p className={styles.notice}>No consta permiso para esta finalidad.</p>}<div className={styles.actions}><button onClick={() => copiarMensaje(cliente, accion.tipo)} disabled={!puedeEnviarWhatsApp(cliente, accion.tipo)} className={styles.button}><Copy size={14} />{copiadoId === `${cliente.id}-${accion.tipo}` ? "Copiado" : "Copiar"}</button><button onClick={() => abrirWhatsApp(cliente, accion.tipo)} disabled={!puedeEnviarWhatsApp(cliente, accion.tipo)} className={styles.button}><MessageCircle size={14} />{telefonoParaWhatsApp(cliente.telefono) ? "WhatsApp" : "Mensaje"}</button></div></section>}
        </CrmDialog>;
      })()}
      {modalRanking && fidelizacionActiva && <CrmDialog titleId="client-ranking-title" onClose={() => setModalRanking(false)}>
        <header className={styles.dialogHeader}><div><h2 id="client-ranking-title">Los clientes más fieles</h2><p>Visitas reales, gasto registrado y puntos disponibles.</p></div><button onClick={() => setModalRanking(false)} className={styles.textButton}>Cerrar</button></header>
        <div className={styles.inlineStats}><span><strong>{totalVisitas}</strong> visitas conectadas</span><span><strong>{resumen.vip + resumen.maestro}</strong> alta fidelidad</span></div>
        {rankingClientes.length === 0 ? <div className={styles.empty}>El ranking aparecerá con las primeras visitas.</div> : rankingClientes.map((cliente, index) => <Link key={cliente.id} href={`/clientes/${cliente.id}`} className={styles.rankingRow}><span className={styles.rankingNumber}>{String(index + 1).padStart(2, "0")}</span><span><strong>{cliente.nombre || "Cliente sin nombre"}</strong><span className={styles.subline}>{nivelesActuales[nivelCliente(cliente, nivelesConfig)].label} · {numero(cliente.gasto_total).toLocaleString("es-ES", { style: "currency", currency: "EUR" })} · {getCustomerPoints(cliente)} puntos</span></span><span><strong>{visitasCliente(cliente)}</strong><span className={styles.subline}>visitas</span></span></Link>)}
      </CrmDialog>}
      {modalNiveles && fidelizacionActiva && <CrmDialog titleId="customer-levels-title" onClose={() => setModalNiveles(false)}>
        <header className={styles.dialogHeader}><div><h2 id="customer-levels-title">Niveles de clientes</h2><p>Visitas necesarias para cada nivel.</p></div><button onClick={() => setModalNiveles(false)} className={styles.textButton}>Cerrar</button></header>
        <p className={styles.notice}>Nuevo será siempre desde 0 visitas. Después avanzará por Frecuente, Habitual, VIP y Maestro.</p>
        <div className={`${styles.fields} ${styles.fieldsGrid}`}>
          <label>Frecuente desde<input type="number" min={1} value={nivelesForm.nivel_frecuente_desde} onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_frecuente_desde: Number(e.target.value) }))} className={styles.input} /><span className={styles.quiet}>visitas</span></label>
          <label>Habitual desde<input type="number" min={2} value={nivelesForm.nivel_habitual_desde} onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_habitual_desde: Number(e.target.value) }))} className={styles.input} /><span className={styles.quiet}>visitas</span></label>
          <label>VIP desde<input type="number" min={3} value={nivelesForm.nivel_vip_desde} onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_vip_desde: Number(e.target.value) }))} className={styles.input} /><span className={styles.quiet}>visitas</span></label>
          <label>Maestro desde<input type="number" min={4} value={nivelesForm.nivel_maestro_desde} onChange={(e) => setNivelesForm((a) => ({ ...a, nivel_maestro_desde: Number(e.target.value) }))} className={styles.input} /><span className={styles.quiet}>visitas</span></label>
        </div>
        <dl className={styles.dataList}>{(Object.keys(construirNiveles(nivelesForm)) as NivelCliente[]).map((nivel) => <div key={nivel}><dt>{construirNiveles(nivelesForm)[nivel].label}</dt><dd>{construirNiveles(nivelesForm)[nivel].range}</dd></div>)}</dl>
        <footer className={styles.modalFooter}><button onClick={guardarNiveles} disabled={guardandoNiveles} className={styles.primary}>{guardandoNiveles && <Loader2 size={14} className="animate-spin" />}Guardar niveles</button></footer>
      </CrmDialog>}
      {modalNuevo && <CrmDialog titleId="new-customer-title" onClose={() => setModalNuevo(false)}>
        <header className={styles.dialogHeader}><div><h2 id="new-customer-title">Nuevo cliente</h2><p>{fidelizacionActiva ? "Empieza como cliente nuevo y subirá de nivel según sus visitas." : "Guarda sus datos para asociar reservas y visitas."}</p></div><button onClick={() => setModalNuevo(false)} className={styles.textButton}>Cerrar</button></header>
        <div className={styles.fields}>
          <label>Nombre<input autoFocus value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((a) => ({ ...a, nombre: e.target.value }))} placeholder="Nombre del cliente" className={styles.input} /></label>
          <label>Teléfono<input inputMode="tel" value={nuevoCliente.telefono} onChange={(e) => setNuevoCliente((a) => ({ ...a, telefono: e.target.value }))} placeholder="Teléfono" className={styles.input} /></label>
          <label>Email<input inputMode="email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente((a) => ({ ...a, email: e.target.value }))} placeholder="Email" className={styles.input} /></label>
        </div>
        <p className={styles.notice}>Guardar un teléfono o email no autoriza mensajes comerciales. Las acciones de reseña o fidelización se bloquean hasta que exista un permiso registrado.</p>
        <footer className={styles.modalFooter}><button onClick={crearCliente} className={styles.primary}>Guardar cliente</button></footer>
      </CrmDialog>}
    </div>
  );
}
