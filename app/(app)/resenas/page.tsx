"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Star,
  ThumbsUp,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import ResponderResenaModal from "../components/ResponderResenaModal";
import { useTheme } from "../components/ThemeProvider";
import { useRestaurante } from "../../hooks/useRestaurante";

type Resena = {
  id: string;
  google_review_id: string | null;
  nombre_cliente: string | null;
  rating: number | null;
  comentario: string | null;
  responded: boolean | null;
  respuesta_texto: string | null;
  fecha_reseña: string | null;
  created_at?: string | null;
};

type Cliente = {
  id: string;
  nombre: string | null;
  telefono: string | null;
  email: string | null;
  visitas_totales: number | null;
  puntos_totales: number | null;
  ultima_visita: string | null;
  ya_dejo_resena: boolean | null;
};

type Reserva = {
  id: string;
  cliente_id: string | null;
  nombre_cliente: string | null;
  telefono: string | null;
  email: string | null;
  personas: number | null;
  fecha_hora_reserva: string | null;
  estado: string | null;
  atendida: boolean | null;
  resena_solicitada: boolean | null;
  consumo_total: number | string | null;
  consumo_registrado_en: string | null;
};

type CandidatoResena = {
  reserva: Reserva;
  cliente: Cliente | null;
  nombre: string;
  telefono: string;
  estado: "pendiente" | "pedida" | "conseguida";
  consumo: number;
};

type Tab = "pedir" | "resenas" | "respondidas";

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function normalizarTelefono(value: string | null | undefined) {
  return String(value || "").replace(/\D/g, "");
}

function telefonoWhatsApp(value: string | null | undefined) {
  const limpio = normalizarTelefono(value);
  if (!limpio) return "";
  if (limpio.startsWith("34")) return limpio;
  if (limpio.length === 9) return `34${limpio}`;
  return limpio;
}

function formatFecha(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  const date = new Date(String(value).replace(" ", "T"));
  if (!Number.isFinite(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEuro(value: number | string | null | undefined) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number.isFinite(n) ? n : 0);
}

function clampRating(value: number | null | undefined) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function mensajeResena(candidato: CandidatoResena) {
  const nombre = candidato.nombre?.split(" ")?.[0] || "";
  return `Hola${nombre ? ` ${nombre}` : ""}, muchas gracias por venir 😊\n\nNos ayudaría muchísimo que nos dejaras una reseña en Google. Solo te llevará 20 segundos y para nosotros significa mucho.\n\nTe dejamos el enlace aquí:\n[ENLACE DE RESEÑA GOOGLE]\n\n¡Gracias de verdad!`;
}

function getTheme(dark: boolean) {
  return {
    page: clsx("min-h-screen space-y-6 px-4 py-6 sm:px-6 lg:px-8", dark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-950"),
    card: clsx("rounded-3xl border p-5 shadow-sm", dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"),
    soft: clsx("rounded-2xl border p-4", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"),
    input: clsx("w-full rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition", dark ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-slate-400" : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-slate-400"),
    primary: clsx("inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition active:scale-[0.98]", dark ? "bg-white text-slate-950 hover:bg-slate-200" : "bg-slate-950 text-white hover:bg-slate-800"),
    blue: "inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 active:scale-[0.98]",
    green: "inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 active:scale-[0.98]",
    secondary: clsx("inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition active:scale-[0.98]", dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"),
    muted: dark ? "text-slate-400" : "text-slate-500",
    text: dark ? "text-slate-300" : "text-slate-600",
    title: dark ? "text-white" : "text-slate-950",
    badge: clsx("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ring-1", dark ? "bg-slate-800 text-slate-200 ring-slate-700" : "bg-slate-100 text-slate-700 ring-slate-200"),
  };
}

function KpiCard({ icon, label, value, helper, dark }: { icon: React.ReactNode; label: string; value: string; helper: string; dark: boolean }) {
  const t = getTheme(dark);
  return (
    <div className={t.card}>
      <div className="flex items-start justify-between gap-3">
        <div className={clsx("rounded-2xl p-3", dark ? "bg-slate-800 text-slate-200" : "bg-blue-50 text-blue-700")}>{icon}</div>
      </div>
      <p className={clsx("mt-4 text-xs font-black uppercase tracking-[0.16em]", t.muted)}>{label}</p>
      <p className={clsx("mt-1 text-3xl font-black tracking-tight", t.title)}>{value}</p>
      <p className={clsx("mt-1 text-sm font-semibold", t.muted)}>{helper}</p>
    </div>
  );
}

function estadoReviewBadge(resena: Resena) {
  const rating = clampRating(resena.rating);
  if (rating > 0 && rating <= 3) return { label: "Revisar", className: "bg-rose-100 text-rose-800 ring-rose-200" };
  if (resena.responded) return { label: "Respondida", className: "bg-emerald-100 text-emerald-800 ring-emerald-200" };
  return { label: "Sin responder", className: "bg-amber-100 text-amber-800 ring-amber-200" };
}

export default function ResenasPage() {
  const { dark } = useTheme();
  const t = getTheme(dark);
  const { data: restauranteActual, isLoading: loadingRestaurante } = useRestaurante();
  const restauranteId = (restauranteActual as any)?.id ? String((restauranteActual as any).id) : null;
  const restauranteNombre = (restauranteActual as any)?.nombre ? String((restauranteActual as any).nombre) : "tu restaurante";
  const db = supabase as any;

  const [resenas, setResenas] = useState<Resena[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("pedir");
  const [copiadoId, setCopiadoId] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [resenaSeleccionada, setResenaSeleccionada] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargarDatos = async () => {
    setErrorMsg(null);
    setLoading(true);

    if (loadingRestaurante) return;

    if (!restauranteId) {
      setErrorMsg('No se encontró restaurante activo. Entra desde Admin y pulsa “Usar en panel” sobre el restaurante correcto.');
      setLoading(false);
      return;
    }

    const [resenasRes, clientesRes, reservasRes] = await Promise.all([
      db
        .from("resenas")
        .select("id,google_review_id,nombre_cliente,rating,comentario,responded,respuesta_texto,fecha_reseña,created_at")
        .eq("restaurante_id", restauranteId)
        .order("fecha_reseña", { ascending: false, nullsFirst: false }),
      db
        .from("clientes")
        .select("id,nombre,telefono,email,visitas_totales,puntos_totales,ultima_visita,ya_dejo_resena")
        .eq("restaurante_id", restauranteId)
        .order("ultima_visita", { ascending: false, nullsFirst: false })
        .limit(200),
      db
        .from("reservas")
        .select("id,cliente_id,nombre_cliente,telefono,email,personas,fecha_hora_reserva,estado,atendida,resena_solicitada,consumo_total,consumo_registrado_en")
        .eq("restaurante_id", restauranteId)
        .eq("atendida", true)
        .order("fecha_hora_reserva", { ascending: false })
        .limit(100),
    ]);

    if (resenasRes.error) setErrorMsg(resenasRes.error.message);
    if (clientesRes.error) setErrorMsg(clientesRes.error.message);
    if (reservasRes.error) setErrorMsg(reservasRes.error.message);

    setResenas((resenasRes.data as Resena[]) ?? []);
    setClientes((clientesRes.data as Cliente[]) ?? []);
    setReservas((reservasRes.data as Reserva[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    cargarDatos();
  }, [restauranteId, loadingRestaurante]);

  const clientesById = useMemo(() => {
    const map = new Map<string, Cliente>();
    clientes.forEach((c) => map.set(c.id, c));
    return map;
  }, [clientes]);

  const clientesByTelefono = useMemo(() => {
    const map = new Map<string, Cliente>();
    clientes.forEach((c) => {
      const tel = normalizarTelefono(c.telefono);
      if (tel) map.set(tel, c);
    });
    return map;
  }, [clientes]);

  const candidatos = useMemo<CandidatoResena[]>(() => {
    return reservas
      .filter((r) => String(r.estado || "").toLowerCase() !== "cancelada")
      .map((reserva) => {
        const clientePorId = reserva.cliente_id ? clientesById.get(reserva.cliente_id) ?? null : null;
        const clientePorTelefono = clientesByTelefono.get(normalizarTelefono(reserva.telefono)) ?? null;
        const cliente = clientePorId ?? clientePorTelefono;
        const nombre = cliente?.nombre || reserva.nombre_cliente || "Cliente";
        const telefono = cliente?.telefono || reserva.telefono || "";
        const conseguida = cliente?.ya_dejo_resena === true;
        const pedida = reserva.resena_solicitada === true;
        const estado: CandidatoResena["estado"] = conseguida ? "conseguida" : pedida ? "pedida" : "pendiente";
        return {
          reserva,
          cliente,
          nombre,
          telefono,
          estado,
          consumo: Number(reserva.consumo_total || 0),
        };
      });
  }, [reservas, clientesById, clientesByTelefono]);

  const candidatosFiltrados = useMemo(() => {
    const texto = query.trim().toLowerCase();
    return candidatos.filter((c) => {
      if (tab !== "pedir") return true;
      if (texto) {
        const base = `${c.nombre} ${c.telefono} ${c.cliente?.email || c.reserva.email || ""}`.toLowerCase();
        if (!base.includes(texto)) return false;
      }
      return c.estado !== "conseguida";
    });
  }, [candidatos, query, tab]);

  const resenasFiltradas = useMemo(() => {
    const texto = query.trim().toLowerCase();
    return resenas.filter((r) => {
      if (tab === "respondidas" && r.responded !== true) return false;
      if (texto) {
        const base = `${r.nombre_cliente || ""} ${r.comentario || ""} ${r.respuesta_texto || ""}`.toLowerCase();
        if (!base.includes(texto)) return false;
      }
      return true;
    });
  }, [resenas, query, tab]);

  const stats = useMemo(() => {
    const total = resenas.length;
    const ratingValues = resenas.map((r) => Number(r.rating || 0)).filter((n) => n > 0);
    const media = ratingValues.length ? ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length : 0;
    const sinResponder = resenas.filter((r) => r.responded !== true).length;
    const pendientesPedir = candidatos.filter((c) => c.estado === "pendiente").length;
    const pedidas = candidatos.filter((c) => c.estado === "pedida").length;
    return { total, media, sinResponder, pendientesPedir, pedidas };
  }, [resenas, candidatos]);

  const copiarMensaje = async (candidato: CandidatoResena) => {
    const texto = mensajeResena(candidato);
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoId(candidato.reserva.id);
      window.setTimeout(() => setCopiadoId(null), 1600);
    } catch {
      window.alert("No se pudo copiar el mensaje.");
    }
  };

  const abrirWhatsApp = (candidato: CandidatoResena) => {
    const telefono = telefonoWhatsApp(candidato.telefono);
    if (!telefono) {
      window.alert("Este cliente no tiene teléfono válido.");
      return;
    }
    window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensajeResena(candidato))}`, "_blank", "noopener,noreferrer");
  };

  const marcarPedida = async (candidato: CandidatoResena) => {
    setSavingId(candidato.reserva.id);
    const { error } = await db.from("reservas").update({ resena_solicitada: true }).eq("id", candidato.reserva.id);
    if (error) window.alert(error.message);
    await cargarDatos();
    setSavingId(null);
  };

  const marcarConseguida = async (candidato: CandidatoResena) => {
    setSavingId(candidato.reserva.id);

    const updates: Array<Promise<any>> = [db.from("reservas").update({ resena_solicitada: true }).eq("id", candidato.reserva.id)];

    if (candidato.cliente?.id) {
      updates.push(db.from("clientes").update({ ya_dejo_resena: true }).eq("id", candidato.cliente.id));
    }

    const results = await Promise.all(updates);
    const firstError = results.find((r) => r?.error)?.error;
    if (firstError) window.alert(firstError.message);

    await cargarDatos();
    setSavingId(null);
  };

  const tabs: Array<{ key: Tab; label: string; helper: string }> = [
    { key: "pedir", label: "Pedir reseñas", helper: `${stats.pendientesPedir} pendientes` },
    { key: "resenas", label: "Reseñas guardadas", helper: `${stats.total} total` },
    { key: "respondidas", label: "Respondidas", helper: `${Math.max(stats.total - stats.sinResponder, 0)} listas` },
  ];

  return (
    <div className={t.page}>
      <div className={clsx("rounded-[2rem] border p-5 shadow-sm sm:p-6", dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white")}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-blue-700 ring-1 ring-blue-100">
              <Star className="h-4 w-4" /> Reseñas y reputación
            </div>
            <h1 className={clsx("mt-4 text-3xl font-black tracking-tight", t.title)}>Consigue más reseñas sin olvidarte de nadie</h1>
            <p className={clsx("mt-2 max-w-3xl text-sm font-semibold", t.text)}>
              Sistema interno para pedir reseñas después de una visita, controlar a quién se le pidió y marcar cuáles ya se consiguieron.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button onClick={cargarDatos} className={t.secondary}>
              <RefreshCw className="h-4 w-4" /> Actualizar
            </button>
            <button
              onClick={() => setTab("pedir")}
              className={t.primary}
            >
              <Send className="h-4 w-4" /> Pedir reseña
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard dark={dark} icon={<Star className="h-5 w-5" />} label="Nota media" value={stats.media ? stats.media.toFixed(1) : "—"} helper="Reseñas guardadas" />
        <KpiCard dark={dark} icon={<ThumbsUp className="h-5 w-5" />} label="Total reseñas" value={String(stats.total)} helper="En Supabase" />
        <KpiCard dark={dark} icon={<MessageCircle className="h-5 w-5" />} label="Sin responder" value={String(stats.sinResponder)} helper="Revisar respuesta" />
        <KpiCard dark={dark} icon={<Users className="h-5 w-5" />} label="Pedir reseña" value={String(stats.pendientesPedir)} helper={`${stats.pedidas} ya pedidas`} />
      </div>

      {errorMsg && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{errorMsg}</div>}

      <div className={t.card}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={clsx(
                  "rounded-2xl border px-4 py-3 text-left text-sm transition",
                  tab === item.key
                    ? "border-blue-600 bg-blue-600 text-white shadow-sm"
                    : dark
                      ? "border-slate-800 bg-slate-950 text-slate-300 hover:bg-slate-800"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                )}
              >
                <div className="font-black">{item.label}</div>
                <div className={clsx("text-xs font-bold", tab === item.key ? "text-blue-100" : t.muted)}>{item.helper}</div>
              </button>
            ))}
          </div>

          <div className="relative w-full xl:max-w-sm">
            <Search className={clsx("pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2", t.muted)} />
            <input
              className={clsx(t.input, "pl-11")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar cliente o reseña..."
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className={clsx(t.card, "flex min-h-[260px] items-center justify-center")}>
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : tab === "pedir" ? (
        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className={t.card}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className={clsx("text-xl font-black", t.title)}>Clientes a los que pedir reseña</h2>
                <p className={clsx("mt-1 text-sm font-semibold", t.muted)}>
                  Salen de reservas atendidas. Es manual: tú confirmas cuándo se pidió o cuándo se consiguió.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {candidatosFiltrados.length === 0 ? (
                <div className={clsx(t.soft, "py-12 text-center")}>
                  <Sparkles className="mx-auto h-7 w-7 text-blue-600" />
                  <p className={clsx("mt-3 text-lg font-black", t.title)}>No hay clientes pendientes con estos filtros</p>
                  <p className={clsx("mt-1 text-sm font-semibold", t.muted)}>Cuando registres consumo en reservas, aparecerán aquí.</p>
                </div>
              ) : (
                candidatosFiltrados.map((candidato) => {
                  const telefono = telefonoWhatsApp(candidato.telefono);
                  const saving = savingId === candidato.reserva.id;
                  return (
                    <div key={candidato.reserva.id} className={clsx("rounded-3xl border p-4", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className={clsx("text-lg font-black", t.title)}>{candidato.nombre}</h3>
                            {candidato.estado === "pendiente" && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200">Pendiente de pedir</span>}
                            {candidato.estado === "pedida" && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800 ring-1 ring-blue-200">Reseña pedida</span>}
                          </div>
                          <div className={clsx("mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold", t.muted)}>
                            <span>{formatFecha(candidato.reserva.fecha_hora_reserva)}</span>
                            <span>{candidato.reserva.personas || 0} personas</span>
                            <span>{formatEuro(candidato.consumo)}</span>
                            <span>{telefono ? `WhatsApp ${telefono}` : "Sin teléfono"}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <button onClick={() => copiarMensaje(candidato)} className={t.secondary}>
                            <Copy className="h-4 w-4" /> {copiadoId === candidato.reserva.id ? "Copiado" : "Copiar"}
                          </button>
                          <button onClick={() => abrirWhatsApp(candidato)} className={t.green}>
                            <MessageCircle className="h-4 w-4" /> WhatsApp
                          </button>
                          {candidato.estado === "pendiente" && (
                            <button onClick={() => marcarPedida(candidato)} disabled={saving} className={t.blue}>
                              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Marcar pedida
                            </button>
                          )}
                          <button onClick={() => marcarConseguida(candidato)} disabled={saving || !candidato.cliente?.id} className={clsx(t.secondary, !candidato.cliente?.id && "opacity-50") }>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Conseguida
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <aside className={t.card}>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700"><Sparkles className="h-5 w-5" /></div>
              <div>
                <h3 className={clsx("font-black", t.title)}>Cómo usarlo</h3>
                <p className={clsx("text-sm font-semibold", t.muted)}>Flujo simple para el restaurante</p>
              </div>
            </div>

            <div className="mt-5 space-y-3 text-sm font-semibold">
              <div className={t.soft}>1. Registras consumo en Reservas.</div>
              <div className={t.soft}>2. El cliente aparece aquí para pedir reseña.</div>
              <div className={t.soft}>3. Copias el mensaje o abres WhatsApp.</div>
              <div className={t.soft}>4. Marcas “pedida” o “conseguida”.</div>
            </div>

            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
              Sin Google conectado, el sistema no puede confirmar automáticamente si la reseña existe. Esta parte funciona como CRM interno de reseñas.
            </div>
          </aside>
        </div>
      ) : (
        <div className={t.card}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className={clsx("text-xl font-black", t.title)}>{tab === "respondidas" ? "Reseñas respondidas" : "Bandeja de reseñas"}</h2>
              <p className={clsx("mt-1 text-sm font-semibold", t.muted)}>
                Reseñas guardadas en Supabase. Más adelante se conectará Google para traerlas automáticamente.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {resenasFiltradas.length === 0 ? (
              <div className={clsx(t.soft, "py-12 text-center")}>
                <Star className="mx-auto h-7 w-7 text-blue-600" />
                <p className={clsx("mt-3 text-lg font-black", t.title)}>No hay reseñas con estos filtros</p>
              </div>
            ) : (
              resenasFiltradas.map((resena) => {
                const badge = estadoReviewBadge(resena);
                return (
                  <div key={resena.id} className={clsx("rounded-3xl border p-4", dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-white")}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className={clsx("font-black", t.title)}>{resena.nombre_cliente || "Cliente"}</h3>
                          <span className={clsx("rounded-full px-3 py-1 text-xs font-black ring-1", badge.className)}>{badge.label}</span>
                          <span className={clsx("text-sm font-black", dark ? "text-amber-300" : "text-amber-500")}>{"★".repeat(clampRating(resena.rating))}</span>
                        </div>
                        <p className={clsx("mt-2 line-clamp-3 text-sm font-semibold leading-relaxed", t.text)}>{resena.comentario || "Sin texto"}</p>
                        <p className={clsx("mt-2 text-xs font-bold", t.muted)}>{formatFecha(resena.fecha_reseña || resena.created_at)}</p>
                        {resena.respuesta_texto && (
                          <div className={clsx("mt-3 rounded-2xl border p-3 text-sm font-semibold", dark ? "border-slate-800 bg-slate-900 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700")}>
                            <span className="font-black">Respuesta: </span>{resena.respuesta_texto}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {!resena.responded && (
                          <button
                            onClick={() => {
                              setResenaSeleccionada(resena.id);
                              setOpenModal(true);
                            }}
                            className={t.primary}
                          >
                            Responder
                          </button>
                        )}
                        {resena.google_review_id && (
                          <span className={t.badge}><ExternalLink className="h-3.5 w-3.5" /> Google</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {resenaSeleccionada && (
        <ResponderResenaModal
          open={openModal}
          resenaId={resenaSeleccionada}
          onClose={() => setOpenModal(false)}
          onSaved={cargarDatos}
        />
      )}
    </div>
  );
}
