"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Cake,
  CheckCircle2,
  Clock3,
  Copy,
  Crown,
  Edit3,
  Gift,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Send,
  Star,
  Tag,
  UserRound,
  X,
} from "lucide-react";
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
) {
  const nivel = getCustomerLevel(cliente, nivelesConfig);
  const nivelLabel = buildCustomerLevels(nivelesConfig)[nivel].label;
  const cancelaciones = numero(cliente.cancelaciones_totales) || numero(cliente.total_canceladas_reales);
  const noShows = Math.max(numero(cliente.no_show_total), numero(cliente.total_no_shows_reales));
  const diasUltima = diasDesde(cliente.ultima_visita);
  const cumple = diasHastaCumple(cliente.fecha_nacimiento);

  const segmentos: string[] = [];
  segmentos.push(nivelLabel);

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

function badgeSegmento(segmento: string) {
  if (segmento === "Maestro") return "border-amber-300 bg-amber-50 text-amber-800";
  if (segmento === "VIP") return "border-blue-200 bg-blue-50 text-blue-700";
  if (segmento === "Dormido") return "border-amber-200 bg-amber-50 text-amber-700";
  if (segmento === "Cumpleaños próximo") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (segmento === "Sin reseña") return "border-violet-200 bg-violet-50 text-violet-700";
  if (segmento === "Riesgo") return "border-red-200 bg-red-50 text-red-700";
  if (segmento === "Contactable") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
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
  const [guardandoAccion, setGuardandoAccion] = useState<string | null>(null);
  const [nivelesConfig, setNivelesConfig] = useState<CustomerLevelsConfig>(DEFAULT_CUSTOMER_LEVELS);

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

    const [reservasRes, puntosRes, notificacionesRes, nivelesRes] = await Promise.all([
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
    ]);

    setReservas((reservasRes.data || []) as Reserva[]);
    setMovimientos((puntosRes.data || []) as Movimiento[]);
    setNotificaciones((notificacionesRes.data || []) as Notificacion[]);
    setNivelesConfig(normalizeCustomerLevels(nivelesRes.data || DEFAULT_CUSTOMER_LEVELS));
    setCargando(false);
  }, [id, restauranteId]);

  useEffect(() => {
    cargarFicha();
  }, [cargarFicha]);

  const segmentos = useMemo(() => (cliente ? segmentosCliente(cliente, nivelesConfig) : []), [cliente, nivelesConfig]);
  const accion = useMemo(() => (cliente ? accionRecomendada(cliente, nivelesConfig) : null), [cliente, nivelesConfig]);
  const cumple = cliente ? diasHastaCumple(cliente.fecha_nacimiento) : null;

  async function guardarFicha() {
    if (!cliente) return;
    setGuardando(true);

    const limpias = etiquetas.map((t) => t.trim()).filter(Boolean);
    const { error } = await supabase
      .from("clientes")
      .update({ notas_internas: notas || null, etiquetas: limpias })
      .eq("id", cliente.id);

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
    const telefono = telefonoParaWhatsApp(cliente.telefono);
    if (!telefono) {
      copiarMensaje(tipo);
      return;
    }
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeCliente(cliente, tipo))}`, "_blank");
  }

  async function registrarAccion(tipo: TipoMensaje) {
    if (!cliente || !restauranteId) return;
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
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="flex items-center gap-3 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          <p className="font-bold text-slate-600">Cargando ficha...</p>
        </div>
      </main>
    );
  }

  if (error || !cliente) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 text-slate-900">
        <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <p className="font-black text-red-700">{error || "Cliente no encontrado"}</p>
          <Link href="/clientes" className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Volver a clientes</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 md:p-6">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <Link href="/clientes" className="inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Volver a clientes
          </Link>

          <div className="mt-5 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-3xl bg-blue-50 p-4 text-blue-700 ring-1 ring-blue-100"><UserRound className="h-7 w-7" /></div>
                <div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-950">{cliente.nombre || "Cliente sin nombre"}</h1>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    Ficha inteligente de cliente{cliente.ranking_posicion ? ` · Nº ${cliente.ranking_posicion} del ranking` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {segmentos.map((segmento) => (
                  <span key={segmento} className={`rounded-full border px-3 py-1.5 text-xs font-black ${badgeSegmento(segmento)}`}>{segmento}</span>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[420px]">
              <button onClick={() => abrirWhatsApp(accion?.tipo || "cupon")} className="rounded-2xl bg-green-600 px-5 py-3 text-sm font-black text-white hover:bg-green-700">
                <MessageCircle className="mr-2 inline h-4 w-4" /> WhatsApp
              </button>
              <button onClick={() => copiarMensaje(accion?.tipo || "cupon")} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
                <Copy className="mr-2 inline h-4 w-4" /> {copiado ? "Copiado" : "Copiar mensaje"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Kpi icon={Star} label="Visitas" value={getCustomerVisits(cliente)} help="Reservas e historial unificados" />
          <Kpi icon={Crown} label="Puntos" value={getCustomerPoints(cliente)} help="Saldo actual" />
          <Kpi icon={Clock3} label="Última visita" value={diasDesde(cliente.ultima_visita_real || cliente.ultima_visita) === 9999 ? "-" : `${diasDesde(cliente.ultima_visita_real || cliente.ultima_visita)}d`} help={formatFecha(cliente.ultima_visita_real || cliente.ultima_visita)} />
          <Kpi icon={Cake} label="Cumpleaños" value={cumple === null ? "-" : `${cumple}d`} help={formatFecha(cliente.fecha_nacimiento)} />
          <Kpi icon={CheckCircle2} label="Reservas" value={numero(cliente.total_reservas)} help={`${numero(cliente.total_atendidas)} atendidas`} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100"><SparkIcon /></div>
                <div className="flex-1">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-700">Acción recomendada</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950">{accion?.titulo}</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{accion?.ayuda}</p>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700 ring-1 ring-slate-100">
                    {mensajeCliente(cliente, accion?.tipo || "cupon")}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button onClick={() => copiarMensaje(accion?.tipo || "cupon")} className="rounded-xl bg-white px-4 py-2 text-xs font-black text-slate-700 ring-1 ring-slate-200">Copiar</button>
                    <button onClick={() => abrirWhatsApp(accion?.tipo || "cupon")} className="rounded-xl bg-green-600 px-4 py-2 text-xs font-black text-white">WhatsApp</button>
                    <button onClick={() => registrarAccion(accion?.tipo || "cupon")} disabled={guardandoAccion === (accion?.tipo || "cupon")} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                      {guardandoAccion === (accion?.tipo || "cupon") ? <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1 inline h-3.5 w-3.5" />} Guardar acción
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-black text-slate-950">Historial de reservas</h2>
                  <p className="text-sm font-semibold text-slate-500">Últimos movimientos del cliente</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{reservas.length}</span>
              </div>

              <div className="space-y-3">
                {reservas.length === 0 && <p className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-400">Sin reservas registradas.</p>}
                {reservas.map((reserva) => (
                  <article key={reserva.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-black text-slate-950">{formatFechaHora(reserva.fecha_hora_reserva)}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{numero(reserva.personas)} personas {reserva.turno ? `· ${reserva.turno}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-black">
                        <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{reserva.estado || "Sin estado"}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">{reserva.atendida === true ? "Vino" : reserva.atendida === false ? "No show" : "Sin marcar"}</span>
                        <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">Reseña: {reserva.resena_solicitada ? "pedida" : "no"}</span>
                      </div>
                    </div>
                    {reserva.notas && <p className="mt-3 rounded-xl bg-white p-3 text-sm font-semibold text-slate-600 ring-1 ring-slate-100">{reserva.notas}</p>}
                  </article>
                ))}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-black text-slate-950">Puntos</h2>
                <div className="mt-4 space-y-3">
                  {movimientos.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">Sin movimientos de puntos.</p>}
                  {movimientos.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                      <div>
                        <p className="font-black text-slate-950">{m.tipo || "Movimiento"}</p>
                        <p className="text-xs font-bold text-slate-500">{formatFechaHora(m.creado_en)} {m.nota ? `· ${m.nota}` : ""}</p>
                      </div>
                      <p className={`font-black ${numero(m.puntos) >= 0 ? "text-green-700" : "text-red-700"}`}>{numero(m.puntos)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="font-black text-slate-950">Acciones guardadas</h2>
                <div className="mt-4 space-y-3">
                  {notificaciones.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-400">Sin acciones guardadas.</p>}
                  {notificaciones.map((n) => (
                    <div key={n.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                      <p className="font-black text-slate-950">{n.titulo || n.tipo || "Acción"}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500">{formatFechaHora(n.created_at)}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-600">{n.mensaje}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-black text-slate-950">Contacto</h2>
              <div className="mt-4 space-y-3 text-sm font-semibold text-slate-600">
                <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-slate-400" /> {cliente.telefono || "Sin teléfono"}</p>
                <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-slate-400" /> {cliente.email || "Sin email"}</p>
                <p className="flex items-center gap-2"><Gift className="h-4 w-4 text-slate-400" /> Cumpleaños: {formatFecha(cliente.fecha_nacimiento)}</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-950">Etiquetas</h2>
                <Tag className="h-5 w-5 text-slate-400" />
              </div>

              <div className="flex flex-wrap gap-2">
                {etiquetas.map((tag) => (
                  <button key={tag} onClick={() => quitarEtiqueta(tag)} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700 ring-1 ring-blue-100">
                    {tag} <X className="h-3 w-3" />
                  </button>
                ))}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {etiquetasBase.filter((e) => !etiquetas.includes(e)).slice(0, 8).map((tag) => (
                  <button key={tag} onClick={() => añadirEtiqueta(tag)} className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 ring-1 ring-slate-100 hover:bg-slate-100">+ {tag}</button>
                ))}
              </div>

              <div className="mt-3 flex gap-2">
                <input value={nuevaEtiqueta} onChange={(e) => setNuevaEtiqueta(e.target.value)} placeholder="Nueva etiqueta" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none" />
                <button onClick={() => añadirEtiqueta(nuevaEtiqueta)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Añadir</button>
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-950">Notas internas</h2>
                <Edit3 className="h-5 w-5 text-slate-400" />
              </div>
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={7} placeholder="Gustos, preferencias, incidencias, cosas a recordar..." className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-100" />
              <button onClick={guardarFicha} disabled={guardando} className="mt-4 w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50">
                {guardando ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Save className="mr-2 inline h-4 w-4" />} Guardar ficha
              </button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function Kpi({ icon: Icon, label, value, help }: { icon: any; label: string; value: string | number; help: string }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{help}</p>
        </div>
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-700 ring-1 ring-blue-100"><Icon className="h-5 w-5" /></div>
      </div>
    </div>
  );
}

function SparkIcon() {
  return <Star className="h-5 w-5" />;
}
