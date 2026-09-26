"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Copy, Loader2, Mail, MessageCircle, Phone, Save, Send, X } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import { getRestauranteUsuario } from "../../lib/getRestauranteUsuario";
import {
  DEFAULT_CUSTOMER_LEVELS,
  buildCustomerLevels,
  getCustomerLevel,
  getCustomerPoints,
  getCustomerVisits,
  normalizeCustomerLevels,
  type CustomerLevelsConfig,
} from "../../lib/customerLevels";
import { CustomerTimeline } from "../CustomerTimeline";
import { CrmDialog } from "../CrmDialog";
import styles from "../crm.module.css";

type Cliente = {
  id: string;
  restaurante_id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
  visitas_totales: number | null;
  visitas_reales?: number | null;
  visitas_historial?: number | null;
  primera_visita: string | null;
  ultima_visita: string | null;
  ultima_visita_real?: string | null;
  origen_principal: string | null;
  canal_contacto: string | null;
  ya_dejo_resena: boolean | null;
  puntos_totales: number | null;
  puntos_disponibles?: number | null;
  gasto_total?: number | null;
  ranking_posicion?: number | null;
  notas_internas: string | null;
  etiquetas: string[] | null;
  permite_whatsapp: boolean | null;
  permite_email: boolean | null;
  no_show_total: number | null;
  cancelaciones_totales: number | null;
  total_reservas?: number | null;
  total_canceladas_reales?: number | null;
  total_atendidas?: number | null;
  total_no_shows_reales?: number | null;
  proxima_reserva?: string | null;
};

type Reserva = {
  id: string;
  fecha_hora_reserva: string | null;
  personas: number | null;
  estado: string | null;
  turno: string | null;
  origen: string | null;
  notas: string | null;
  atendida: boolean | null;
  resena_solicitada: boolean | null;
};

type Movimiento = {
  id: string;
  tipo: string | null;
  puntos: number | null;
  referencia: string | null;
  nota: string | null;
  creado_en: string | null;
};

type Notificacion = {
  id: string;
  tipo: string | null;
  titulo: string | null;
  mensaje: string | null;
  leida: boolean | null;
  created_at: string | null;
};

type ConsentimientoContacto = {
  review_whatsapp: boolean;
  loyalty_whatsapp: boolean;
};

type TipoMensaje = "resena" | "recuperar" | "cumple" | "vip" | "maestro" | "cupon";

const etiquetasBase = ["Maestro", "VIP", "Habitual", "Frecuente", "Dormido", "Cumpleaños", "Sin reseña", "Riesgo", "Promoción", "Preferente"];

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

function diasDesde(fecha: string | null | undefined) {
  if (!fecha) return 9999;
  const time = new Date(fecha).getTime();
  if (!Number.isFinite(time)) return 9999;
  return Math.floor((Date.now() - time) / 86400000);
}

function formatFecha(fecha: string | null | undefined) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatFechaHora(fecha: string | null | undefined) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function diasHastaCumple(fechaNacimiento: string | null | undefined) {
  if (!fechaNacimiento) return null;
  const fecha = new Date(fechaNacimiento);
  if (!Number.isFinite(fecha.getTime())) return null;

  const hoy = new Date();
  const cumple = new Date(hoy.getFullYear(), fecha.getMonth(), fecha.getDate());
  if (cumple.getTime() < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) cumple.setFullYear(hoy.getFullYear() + 1);
  return Math.ceil((cumple.getTime() - hoy.getTime()) / 86400000);
}

function segmentosCliente(
  cliente: Cliente,
  nivelesConfig: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
  incluirNivel = true,
) {
  const nivel = getCustomerLevel(cliente, nivelesConfig);
  const nivelLabel = buildCustomerLevels(nivelesConfig)[nivel].label;
  const cancelaciones = numero(cliente.cancelaciones_totales) || numero(cliente.total_canceladas_reales);
  const noShows = Math.max(numero(cliente.no_show_total), numero(cliente.total_no_shows_reales));
  const diasUltima = diasDesde(cliente.ultima_visita);
  const cumple = diasHastaCumple(cliente.fecha_nacimiento);

  const segmentos: string[] = [];
  if (incluirNivel) segmentos.push(nivelLabel);

  if (diasUltima >= 30 && diasUltima !== 9999) segmentos.push("Dormido");
  if (cumple !== null && cumple <= 30) segmentos.push("Cumpleaños próximo");
  if (cliente.ya_dejo_resena === false) segmentos.push("Sin reseña");
  if (cancelaciones + noShows >= 2) segmentos.push("Riesgo");
  if (limpiarTelefono(cliente.telefono) || cliente.email) segmentos.push("Contactable");
  return segmentos;
}

function mensajeCliente(cliente: Cliente, tipo: TipoMensaje) {
  const nombre = cliente.nombre || "";
  const mensajes: Record<TipoMensaje, string> = {
    resena: `Hola ${nombre}, muchas gracias por venir. Si te gustó la experiencia, nos ayudaría muchísimo que nos dejaras una reseña en Google. Gracias de verdad.`,
    recuperar: `Hola ${nombre}, hace tiempo que no te vemos por aquí. Esta semana nos encantaría volver a verte. Si quieres, te reservamos una mesa.`,
    cumple: `Hola ${nombre}, hemos visto que se acerca tu cumpleaños. Si vienes a celebrarlo con nosotros, tendremos un detalle contigo.`,
    vip: `Hola ${nombre}, gracias por repetir con nosotros. Queríamos tener un detalle contigo en tu próxima visita.`,
    maestro: `Hola ${nombre}, formas parte de nuestros clientes más fieles. Queremos agradecértelo con una atención muy especial en tu próxima visita.`,
    cupon: `Hola ${nombre}, tenemos una promoción activa para clientes habituales. Si vienes esta semana, pregunta por tu cupón al llegar.`,
  };
  return mensajes[tipo].replace(/  +/g, " ").trim();
}

function accionRecomendada(
  cliente: Cliente,
  nivelesConfig: CustomerLevelsConfig = DEFAULT_CUSTOMER_LEVELS,
) {
  const segmentos = segmentosCliente(cliente, nivelesConfig);
  if (segmentos.includes("Cumpleaños próximo")) return { tipo: "cumple" as TipoMensaje, titulo: "Enviar detalle de cumpleaños", ayuda: "Buen momento para atraerlo con una reserva." };
  if (segmentos.includes("Dormido")) return { tipo: "recuperar" as TipoMensaje, titulo: "Recuperar cliente dormido", ayuda: `Lleva ${diasDesde(cliente.ultima_visita_real || cliente.ultima_visita)} días sin venir.` };
  if (segmentos.includes("Sin reseña")) return { tipo: "resena" as TipoMensaje, titulo: "Pedir reseña", ayuda: "Cliente ideal para pedir valoración." };
  if (segmentos.includes("Maestro")) return { tipo: "maestro" as TipoMensaje, titulo: "Reconocer cliente Maestro", ayuda: "Está entre los clientes más fieles del restaurante." };
  if (segmentos.includes("VIP")) return { tipo: "vip" as TipoMensaje, titulo: "Cuidar cliente VIP", ayuda: "Conviene tener un detalle para mantenerlo." };
  return { tipo: "cupon" as TipoMensaje, titulo: "Enviar incentivo", ayuda: "Puedes usar una promo sencilla." };
}

export default function ClienteFichaPage() {
  const { id } = useParams<{ id: string }>();
  const [restauranteId, setRestauranteId] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notas, setNotas] = useState("");
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const [guardandoAccion, setGuardandoAccion] = useState<string | null>(null);
  const [fidelizacionActiva, setFidelizacionActiva] = useState(false);
  const [nivelesConfig, setNivelesConfig] = useState<CustomerLevelsConfig>(DEFAULT_CUSTOMER_LEVELS);
  const [consentimiento, setConsentimiento] = useState<ConsentimientoContacto>({
    review_whatsapp: false,
    loyalty_whatsapp: false,
  });

  useEffect(() => {
    const cargarRestaurante = async () => {
      const rid = await getRestauranteUsuario();
      if (rid) setRestauranteId(rid);
    };
    cargarRestaurante();
  }, []);

  const cargarFicha = useCallback(async () => {
    if (!id || !restauranteId) return;
    setCargando(true);
    setError(null);

    const { data: clienteData, error: clienteError } = await supabase
      .from("vw_clientes_resumen")
      .select("*")
      .eq("id", id)
      .eq("restaurante_id", restauranteId)
      .maybeSingle();

    let clienteFinal = clienteData as Cliente | null;

    if (clienteError || !clienteFinal) {
      const fallback = await supabase
        .from("clientes")
        .select("*")
        .eq("id", id)
        .eq("restaurante_id", restauranteId)
        .maybeSingle();
      clienteFinal = (fallback.data || null) as Cliente | null;
      if (fallback.error || !clienteFinal) {
        setError("No se pudo cargar este cliente");
        setCargando(false);
        return;
      }
    }

    setCliente(clienteFinal);
    setNotas(clienteFinal.notas_internas || "");
    setEtiquetas(clienteFinal.etiquetas || []);

    const telefono = limpiarTelefono(clienteFinal.telefono);
    const telefonoSin34 = telefono.startsWith("34") && telefono.length > 9 ? telefono.slice(2) : telefono;
    const filtrosReserva = [`cliente_id.eq.${id}`];
    if (telefonoSin34) filtrosReserva.push(`telefono.ilike.%${telefonoSin34}%`);
    if (clienteFinal.email) filtrosReserva.push(`email.eq.${clienteFinal.email}`);

    const [reservasRes, puntosRes, notificacionesRes, nivelesRes, consentimientoRes, modulosRes] = await Promise.all([
      supabase
        .from("reservas")
        .select("id, fecha_hora_reserva, personas, estado, turno, origen, notas, atendida, resena_solicitada")
        .eq("restaurante_id", restauranteId)
        .or(filtrosReserva.join(","))
        .order("fecha_hora_reserva", { ascending: false })
        .limit(20),
      supabase
        .from("puntos_movimientos")
        .select("id, tipo, puntos, referencia, nota, creado_en")
        .eq("restaurante_id", restauranteId)
        .eq("cliente_id", id)
        .order("creado_en", { ascending: false })
        .limit(20),
      supabase
        .from("cliente_notificaciones")
        .select("id, tipo, titulo, mensaje, leida, created_at")
        .eq("restaurante_id", restauranteId)
        .eq("cliente_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("fidelizacion_config")
        .select("nivel_frecuente_desde,nivel_habitual_desde,nivel_vip_desde,nivel_maestro_desde")
        .eq("restaurante_id", restauranteId)
        .maybeSingle(),
      supabase
        .from("cliente_comunicaciones_consentimiento")
        .select("review_whatsapp,loyalty_whatsapp,revoked_at")
        .eq("restaurante_id", restauranteId)
        .eq("cliente_id", id)
        .is("revoked_at", null)
        .maybeSingle(),
      supabase
        .from("restaurante_modulos")
        .select("fidelizacion")
        .eq("restaurante_id", restauranteId)
        .maybeSingle(),
    ]);

    const fidelizacionDisponible = modulosRes.data?.fidelizacion === true;
    setFidelizacionActiva(fidelizacionDisponible);
    setReservas((reservasRes.data || []) as Reserva[]);
    setMovimientos(fidelizacionDisponible ? ((puntosRes.data || []) as Movimiento[]) : []);
    setNotificaciones((notificacionesRes.data || []) as Notificacion[]);
    setNivelesConfig(
      fidelizacionDisponible
        ? normalizeCustomerLevels(nivelesRes.data || DEFAULT_CUSTOMER_LEVELS)
        : DEFAULT_CUSTOMER_LEVELS,
    );
    setConsentimiento({
      review_whatsapp: consentimientoRes.data?.review_whatsapp === true,
      loyalty_whatsapp: consentimientoRes.data?.loyalty_whatsapp === true,
    });
    setCargando(false);
  }, [id, restauranteId]);

  useEffect(() => {
    let activo = true;
    queueMicrotask(() => {
      if (activo) void cargarFicha();
    });

    return () => {
      activo = false;
    };
  }, [cargarFicha]);

  const segmentos = useMemo(
    () => (cliente ? segmentosCliente(cliente, nivelesConfig, fidelizacionActiva) : []),
    [cliente, fidelizacionActiva, nivelesConfig],
  );
  const accion = useMemo(
    () => (cliente && fidelizacionActiva ? accionRecomendada(cliente, nivelesConfig) : null),
    [cliente, fidelizacionActiva, nivelesConfig],
  );
  const cumple = cliente ? diasHastaCumple(cliente.fecha_nacimiento) : null;

  async function guardarFicha() {
    if (!cliente || !restauranteId || cliente.restaurante_id !== restauranteId) return;
    setGuardando(true);

    const limpias = etiquetas.map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase
      .from("clientes")
      .update({ notas_internas: notas || null, etiquetas: limpias })
      .eq("id", cliente.id)
      .eq("restaurante_id", restauranteId);

    if (error) alert(error.message || "No se pudo guardar");
    else setCliente({ ...cliente, notas_internas: notas || null, etiquetas: limpias });

    setGuardando(false);
  }

  function añadirEtiqueta(etiqueta: string) {
    const limpia = etiqueta.trim();
    if (!limpia) return;
    setEtiquetas((actual) => (actual.includes(limpia) ? actual : [...actual, limpia]));
    setNuevaEtiqueta("");
  }

  function quitarEtiqueta(etiqueta: string) {
    setEtiquetas((actual) => actual.filter((t) => t !== etiqueta));
  }

  async function copiarMensaje(tipo: TipoMensaje) {
    if (!cliente) return;
    if (!tienePermisoWhatsApp(tipo)) {
      alert("No consta permiso para enviar este tipo de mensaje por WhatsApp.");
      return;
    }
    const mensaje = mensajeCliente(cliente, tipo);
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(tipo);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      window.prompt("Copia el mensaje:", mensaje);
    }
  }

  function abrirWhatsApp(tipo: TipoMensaje) {
    if (!cliente) return;
    if (!tienePermisoWhatsApp(tipo)) {
      alert("No consta permiso para enviar este tipo de mensaje por WhatsApp.");
      return;
    }
    const telefono = telefonoParaWhatsApp(cliente.telefono);
    if (!telefono) {
      copiarMensaje(tipo);
      return;
    }
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeCliente(cliente, tipo))}`, "_blank");
  }

  function tienePermisoWhatsApp(tipo: TipoMensaje) {
    if (cliente?.permite_whatsapp !== true) return false;
    return tipo === "resena"
      ? consentimiento.review_whatsapp
      : fidelizacionActiva && consentimiento.loyalty_whatsapp;
  }

  async function registrarAccion(tipo: TipoMensaje) {
    if (!cliente || !restauranteId) return;
    if (tipo !== "resena" && !fidelizacionActiva) return;
    setGuardandoAccion(tipo);

    const titulos: Record<TipoMensaje, string> = {
      resena: "Recordatorio de reseña",
      recuperar: "Recuperación de cliente",
      cumple: "Detalle de cumpleaños",
      vip: "Detalle cliente VIP",
      maestro: "Reconocimiento cliente Maestro",
      cupon: "Cupón / promoción",
    };

    const { error } = await supabase.from("cliente_notificaciones").insert({
      restaurante_id: restauranteId,
      cliente_id: cliente.id,
      tipo,
      titulo: titulos[tipo],
      mensaje: mensajeCliente(cliente, tipo),
      url: `/clientes/${cliente.id}`,
      leida: false,
    });

    if (error) alert(error.message || "No se pudo guardar la acción");
    await cargarFicha();
    setGuardandoAccion(null);
  }

  if (cargando) {
    return <div className={styles.page}><div className={styles.empty} role="status"><Loader2 className="mx-auto mb-3 animate-spin" size={20} /> Cargando ficha…</div></div>;
  }
  if (error || !cliente) {
    return <div className={styles.page}><div className={styles.empty}><strong role="alert">{error || "Cliente no encontrado"}</strong><Link href="/clientes" className={styles.button}>Volver a clientes</Link></div></div>;
  }

  const contextContent = <>
    <section className={styles.railSection}>
      <h2>Contacto</h2>
      <p className={styles.contact}><Phone size={14} />{cliente.telefono || "Sin teléfono"}</p>
      <p className={styles.contact}><Mail size={14} />{cliente.email || "Sin email"}</p>
      <dl className={styles.dataList}><div><dt>Cumpleaños</dt><dd>{formatFecha(cliente.fecha_nacimiento)}{cumple !== null && <span className={styles.subline}>En {cumple} días</span>}</dd></div><div><dt>Primera visita</dt><dd>{formatFecha(cliente.primera_visita)}</dd></div>{cliente.origen_principal && <div><dt>Origen</dt><dd>{cliente.origen_principal}</dd></div>}{cliente.canal_contacto && <div><dt>Canal</dt><dd>{cliente.canal_contacto}</dd></div>}</dl>
    </section>
    <section className={styles.railSection}>
      <h2>Permisos y reseña</h2>
      <dl className={styles.dataList}><div><dt>WhatsApp · reseñas</dt><dd className={tienePermisoWhatsApp("resena") ? styles.positive : styles.quiet}>{tienePermisoWhatsApp("resena") ? "Autorizado" : "Sin permiso"}</dd></div>{fidelizacionActiva && <div><dt>WhatsApp · fidelización</dt><dd className={tienePermisoWhatsApp("cupon") ? styles.positive : styles.quiet}>{tienePermisoWhatsApp("cupon") ? "Autorizado" : "Sin permiso"}</dd></div>}<div><dt>Email</dt><dd>{cliente.permite_email === true ? "Autorizado" : "Sin permiso"}</dd></div><div><dt>Reseña registrada</dt><dd>{cliente.ya_dejo_resena === true ? "Sí" : cliente.ya_dejo_resena === false ? "No" : "Sin dato"}</dd></div></dl>
    </section>
    <section className={styles.railSection}>
      <h2>Etiquetas</h2>
      <div className={styles.tagList}>{etiquetas.length === 0 && <span className={styles.quiet}>Sin etiquetas</span>}{etiquetas.map((tag) => <button key={tag} onClick={() => quitarEtiqueta(tag)} className={styles.tag} aria-label={`Quitar etiqueta ${tag}`}>{tag}<X size={12} /></button>)}</div>
      <div>{etiquetasBase.filter((tag) => fidelizacionActiva || !["Maestro", "VIP", "Habitual", "Frecuente", "Promoción", "Preferente"].includes(tag)).filter((tag) => !etiquetas.includes(tag)).slice(0, 8).map((tag) => <button key={tag} onClick={() => añadirEtiqueta(tag)} className={styles.tagAdd}>+ {tag}</button>)}</div>
      <div className={styles.tagInput}><input aria-label="Nueva etiqueta" value={nuevaEtiqueta} onChange={(e) => setNuevaEtiqueta(e.target.value)} placeholder="Nueva etiqueta" className={styles.input} /><button onClick={() => añadirEtiqueta(nuevaEtiqueta)} className={styles.button}>Añadir</button></div>
    </section>
    <section className={styles.railSection}>
      <h2>Notas internas</h2>
      <textarea aria-label="Notas internas" value={notas} onChange={(e) => setNotas(e.target.value)} rows={6} placeholder="Gustos, preferencias, incidencias, cosas a recordar..." className={styles.input} />
      <button onClick={guardarFicha} disabled={guardando} className={`${styles.primary} ${styles.save}`}>{guardando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar ficha</button>
    </section>
    {fidelizacionActiva && accion ? <section className={styles.railSection}>
      <h2>Seguimiento · {accion.titulo}</h2><p>{accion.ayuda}</p>
      <p className={styles.actionMessage}>{mensajeCliente(cliente, accion.tipo || "cupon")}</p>
      {!tienePermisoWhatsApp(accion.tipo || "cupon") && <p className={styles.notice}>WhatsApp bloqueado: no consta permiso para esta finalidad.</p>}
      <div className={styles.actions}>
        <button onClick={() => copiarMensaje(accion.tipo || "cupon")} disabled={!tienePermisoWhatsApp(accion.tipo || "cupon")} className={styles.button}>{copiado ? "Copiado" : "Copiar"}</button>
        <button onClick={() => abrirWhatsApp(accion.tipo || "cupon")} disabled={!tienePermisoWhatsApp(accion.tipo || "cupon")} className={styles.button}>WhatsApp</button>
        <button onClick={() => registrarAccion(accion.tipo || "cupon")} disabled={guardandoAccion === (accion.tipo || "cupon")} className={styles.button}>{guardandoAccion === (accion.tipo || "cupon") ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Guardar acción</button>
      </div>
    </section> : null}
  </>;

  return <div className={styles.page}>
    <Link href="/clientes" className={styles.backLink}><ArrowLeft size={14} /> Clientes</Link>
    <header className={styles.detailHeading}>
      <div><h1>{cliente.nombre || "Cliente sin nombre"}</h1><div className={styles.segments}>{segmentos.map((segmento) => <span key={segmento}>{segmento}</span>)}{fidelizacionActiva && cliente.ranking_posicion ? <span>Nº {cliente.ranking_posicion} del ranking</span> : null}</div></div>
      <div className={styles.actions}>
        <button className={`${styles.button} ${styles.mobileRailToggle}`} onClick={() => setContextOpen(true)}>Contacto y notas <ChevronRight size={14} /></button>
        {fidelizacionActiva && accion ? <><button onClick={() => abrirWhatsApp(accion.tipo || "cupon")} disabled={!tienePermisoWhatsApp(accion.tipo || "cupon")} className={styles.button}><MessageCircle size={14} /> WhatsApp</button><button onClick={() => copiarMensaje(accion.tipo || "cupon")} disabled={!tienePermisoWhatsApp(accion.tipo || "cupon")} className={styles.button}><Copy size={14} />{copiado ? "Copiado" : "Copiar mensaje"}</button></> : null}
      </div>
    </header>
    <div className={styles.detailMeta}>
      <span><strong>{getCustomerVisits(cliente)}</strong> visitas</span>
      {fidelizacionActiva && <span><strong>{getCustomerPoints(cliente)}</strong> puntos disponibles</span>}
      <span><strong>{numero(cliente.total_reservas)}</strong> reservas · {numero(cliente.total_atendidas)} atendidas</span>
      <span>Última visita <strong>{formatFecha(cliente.ultima_visita_real || cliente.ultima_visita)}</strong></span>
      {cliente.proxima_reserva && <span>Próxima <strong>{formatFechaHora(cliente.proxima_reserva)}</strong></span>}
      {typeof cliente.gasto_total === "number" && <span>Gasto registrado <strong>{cliente.gasto_total.toLocaleString("es-ES", { style: "currency", currency: "EUR" })}</strong></span>}
    </div>
    <div className={styles.detailLayout}>
      <CustomerTimeline reservas={reservas} movimientos={movimientos} notificaciones={notificaciones} fidelizacionActiva={fidelizacionActiva} />
      <aside className={styles.detailRail} aria-label="Contexto del cliente">{contextContent}</aside>
    </div>
    {contextOpen && <CrmDialog titleId="customer-context-title" onClose={() => setContextOpen(false)} rail><header className={styles.dialogHeader}><h2 id="customer-context-title">Contacto y notas</h2><button className={styles.textButton} onClick={() => setContextOpen(false)} aria-label="Cerrar contacto y notas"><X size={18} /></button></header>{contextContent}</CrmDialog>}
  </div>;
}
