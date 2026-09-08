"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Search, Send, Undo2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { canPrepareReview, googleReviewUrl, reviewMessage, reviewStage, whatsappPhone, type ReviewRequest, type ReviewSettings } from "@/lib/reviews/review-flow";

type ReviewData = { restaurantName: string; settings: ReviewSettings; requests: ReviewRequest[] };
type Filter = "pending" | "opened" | "confirmed" | "all";
type PreparedMessage = { ok: boolean; token: string; name: string; phone: string; restaurantName: string };

function errorText(message: string) {
  const messages: Record<string, string> = {
    REVIEW_ACCESS_DENIED: "No tienes permiso para cambiar las solicitudes de este restaurante.",
    REVIEW_ALREADY_CONFIRMED: "La reseña de este cliente ya está confirmada.",
    REVIEW_ALREADY_SENT: "La petición de esta visita ya está enviada. La próxima podrá hacerse tras otra visita.",
    REVIEW_CONSENT_MISSING: "No consta permiso del cliente para recibir peticiones por WhatsApp.",
    REVIEW_NOT_DUE: "Todavía no ha llegado la hora prevista para pedir la reseña.",
    REVIEW_VISIT_NOT_COMPLETED: "La visita debe constar como realizada y seguir siendo válida.",
    REVIEW_GOOGLE_URL_MISSING: "Guarda un enlace válido de reseñas de Google.",
    REVIEW_DELIVERY_UNCERTAIN: "Comprueba primero si el mensaje llegó a enviarse.",
    REVIEW_SENDING: "El envío automático está en curso. Actualiza dentro de unos segundos.",
    REVIEW_PHONE_MISSING: "Revisa el teléfono del cliente antes de preparar el mensaje.",
    REVIEW_CUSTOMER_CHANGED: "El cliente de esta reserva ha cambiado. La petición anterior queda cancelada.",
    INVALID_REVIEW_SETTINGS: "Revisa el enlace de Google y elige dos o tres horas.",
  };
  return Object.entries(messages).find(([code]) => message.includes(code))?.[1]
    || "No se pudo completar el cambio. Actualiza la página y vuelve a intentarlo.";
}

function dateText(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function ReviewRequestsPanel({ restauranteId, dark }: { restauranteId: string; dark: boolean }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [delay, setDelay] = useState(3);
  const [automatic, setAutomatic] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [channelConfigured, setChannelConfigured] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);
  const card = `rounded-3xl border p-5 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`;
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-900"}`;
  const button = `inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`;
  const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#1601ad] px-3 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-45";

  const load = useCallback(async (settings = false) => {
    const current = generation.current;
    const { data: result, error: loadError } = await supabase.rpc("list_visit_review_requests", { p_restaurante_id: restauranteId });
    if (current !== generation.current) return;
    if (loadError || !result) {
      setError("No se pudo cargar el seguimiento de reseñas. Vuelve a intentarlo.");
    } else {
      const next = result as ReviewData;
      setData(next);
      if (settings) {
        setUrl(next.settings.google_review_url || "");
        setDelay(next.settings.review_delay_hours === 2 ? 2 : 3);
        setAutomatic(next.settings.review_enabled);
      }
    }
    setLoading(false);
  }, [restauranteId]);

  useEffect(() => {
    setData(null);
    setLoading(true);
    setError(null);
    void load(true);
    const refresh = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => { generation.current += 1; window.clearInterval(refresh); };
  }, [load]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session) return;
        const response = await fetch(`/api/reviews/availability?restaurantId=${encodeURIComponent(restauranteId)}`, {
          headers: { Authorization: `Bearer ${session.session.access_token}` }, cache: "no-store",
        });
        if (response.ok) { const result = await response.json(); if (active) setChannelConfigured(result.configured === true); }
      } catch { if (active) setChannelConfigured(false); }
    })();
    return () => { active = false; };
  }, [restauranteId]);

  const stats = useMemo(() => {
    const requests = data?.requests || [];
    return {
      waiting: requests.filter(r => !r.confirmed && !r.sent_at && r.status !== "cancelled").length,
      sent: requests.filter(r => r.sent_at).length,
      opened: requests.filter(r => r.google_opened_at && !r.confirmed).length,
      confirmed: new Set(requests.filter(r => r.confirmed).map(r => r.cliente_id)).size,
    };
  }, [data]);

  const requests = useMemo(() => (data?.requests || []).filter(r => {
    const text = `${r.nombre} ${r.telefono || ""}`.toLocaleLowerCase("es");
    if (query.trim() && !text.includes(query.trim().toLocaleLowerCase("es"))) return false;
    if (filter === "opened") return Boolean(r.google_opened_at) && !r.confirmed;
    if (filter === "confirmed") return r.confirmed;
    if (filter === "pending") return !r.confirmed && r.status !== "cancelled";
    return true;
  }), [data, filter, query]);

  const action = async (request: ReviewRequest, name: string) => {
    const { data: result, error: actionError } = await supabase.rpc("visit_review_action", { p_reserva_id: request.reserva_id, p_action: name });
    if (actionError) throw new Error(actionError.message);
    return result;
  };

  const runAction = async (request: ReviewRequest, name: string) => {
    if (busy) return;
    const confirmation: Record<string, string> = {
      confirm: "¿Has comprobado en Google que este cliente ha publicado su reseña? Se dejarán de pedir nuevas reseñas a este cliente.",
      unconfirm: "¿Quieres retirar la confirmación? Se podrán pedir reseñas en sus próximas visitas.",
      sent: "¿Has comprobado que el mensaje se ha enviado al cliente? Abrir el borrador de WhatsApp no lo envía.",
      not_sent: "¿Has comprobado que el mensaje no se envió? Solo entonces se permitirá preparar otro.",
    };
    if (confirmation[name] && !window.confirm(confirmation[name])) return;
    setBusy(request.reserva_id); setError(null); setNotice(null);
    try {
      await action(request, name);
      setNotice(name === "confirm" ? "Reseña confirmada. Las peticiones pendientes de este cliente quedan canceladas."
        : name === "checked" ? "Revisión guardada. Podrás pedirla de nuevo tras otra visita si sigue sin confirmar."
          : name === "unconfirm" ? "Confirmación retirada para próximas visitas." : "Cambio guardado.");
      await load();
    } catch (e) { setError(errorText(e instanceof Error ? e.message : "")); }
    finally { setBusy(null); }
  };

  const prepare = async (request: ReviewRequest, copy: boolean) => {
    if (busy || !canPrepareReview(request, now)) return;
    // Open synchronously so the browser can allow the new tab. No request is marked sent here.
    const popup = copy ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setBusy(request.reserva_id); setError(null); setNotice(null);
    try {
      const prepared = await action(request, "prepare") as PreparedMessage;
      const phone = whatsappPhone(prepared.phone);
      if (!phone) throw new Error("REVIEW_PHONE_MISSING");
      const link = `${window.location.origin}/r/${prepared.token}`;
      const message = reviewMessage(prepared.name, prepared.restaurantName, link);
      if (copy) {
        await navigator.clipboard.writeText(message);
        setNotice("Mensaje copiado. Marca el envío cuando lo hayas enviado al cliente.");
      } else {
        const target = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        if (popup) popup.location.href = target;
        else { await navigator.clipboard.writeText(message); setNotice("El navegador bloqueó WhatsApp. El mensaje está copiado para enviarlo."); }
      }
      await load();
    } catch (e) { popup?.close(); setError(errorText(e instanceof Error ? e.message : "")); }
    finally { setBusy(null); }
  };

  const save = async () => {
    if (url.trim() && !googleReviewUrl(url)) { setError("Usa el enlace HTTPS de reseñas de Google Maps o g.page del restaurante."); return; }
    setSavingSettings(true); setError(null); setNotice(null);
    const { error: saveError } = await supabase.rpc("save_visit_review_settings", {
      p_restaurante_id: restauranteId, p_google_url: googleReviewUrl(url) || "", p_delay: delay, p_automatic: automatic,
    });
    if (saveError) setError(errorText(saveError.message));
    else { setNotice("Configuración guardada para las próximas visitas."); await load(true); }
    setSavingSettings(false);
  };

  if (loading) return <div className={`${card} flex min-h-64 items-center justify-center`}><Loader2 className="animate-spin" aria-label="Cargando solicitudes" /></div>;

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[ ["Por solicitar",stats.waiting], ["Peticiones enviadas",stats.sent], ["Revisar en Google",stats.opened], ["Clientes con reseña confirmada",stats.confirmed] ].map(([label,value]) =>
        <div key={label} className={card}><p className={`text-sm font-semibold ${muted}`}>{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}
    </div>
    {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
    {notice && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{notice}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className={card}>
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">Solicitudes tras la visita</h2><p className={`mt-1 text-sm ${muted}`}>Una petición por visita. Al confirmar la reseña, dejamos de pedirla a ese cliente.</p></div><button type="button" onClick={() => { setError(null); void load(); }} className={button} aria-label="Actualizar solicitudes"><RefreshCw size={17} /></button></div>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Filtrar solicitudes">
          {([ ["pending","En seguimiento"], ["opened","Revisar en Google"], ["confirmed","Confirmadas"], ["all","Todas"] ] as [Filter,string][]).map(([key,label]) =>
            <button type="button" key={key} aria-pressed={filter===key} onClick={() => setFilter(key)} className={filter===key ? primary : button}>{label}</button>)}
        </div>
        <label className="relative mt-4 block"><span className="sr-only">Buscar cliente o teléfono</span><Search size={17} className={`absolute left-3 top-3 ${muted}`} /><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente o teléfono" className={`${field} pl-10`} /></label>
        <div className="mt-5 space-y-3">
          {!requests.length && <div className={`rounded-2xl border border-dashed p-9 text-center ${dark ? "border-slate-700" : "border-slate-200"}`}><CheckCircle2 className="mx-auto text-indigo-500" /><h3 className="mt-3 font-bold">No hay solicitudes con este filtro</h3><p className={`mt-2 text-sm ${muted}`}>Las visitas realizadas con cliente asociado aparecerán aquí.</p></div>}
          {requests.map(request => {
            const stage = reviewStage(request, now);
            const canPrepare = canPrepareReview(request, now) && Boolean(googleReviewUrl(data?.settings.google_review_url));
            const rowBusy = busy===request.reserva_id;
            const tone = stage.tone === "green" ? "bg-emerald-100 text-emerald-800" : stage.tone === "blue" ? "bg-indigo-100 text-indigo-800" : stage.tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
            return <article key={request.reserva_id} className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200"}`}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{request.nombre}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{stage.label}</span></div>
              <p className={`mt-2 text-sm ${muted}`}>Visita: {dateText(request.visit_at)} · {request.telefono || "Sin teléfono"}</p>
              {!request.sent_at && !request.confirmed && <p className={`mt-1 flex items-center gap-1.5 text-sm ${muted}`}><Clock3 size={14} /> Petición desde {dateText(request.scheduled_for)}</p>}
              {request.sent_at && <p className={`mt-1 text-sm ${muted}`}>Enviada: {dateText(request.sent_at)}</p>}
              {request.google_opened_at && <p className={`mt-1 text-sm ${muted}`}>Enlace de Google abierto: {dateText(request.google_opened_at)}</p>}
              {request.google_opened_at && !request.confirmed && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-900">Comprueba en Google si ha publicado la reseña. Abrir el enlace no confirma que la haya dejado.</p>}
              {request.checked_at && !request.confirmed && <p className={`mt-2 text-sm ${muted}`}>Revisada el {dateText(request.checked_at)}; todavía sin confirmar.</p>}
              {!request.consent && !request.confirmed && <p className="mt-2 text-sm text-amber-700">El teléfono de la reserva no equivale a permiso para pedir reseñas por WhatsApp.</p>}
              {request.last_error === "whatsapp_not_configured" && <p className="mt-2 text-sm text-amber-700">El envío automático está pendiente de configurar WhatsApp. Puedes preparar el mensaje manualmente.</p>}
              <div className="mt-4 flex flex-wrap gap-2">
                {!request.confirmed && !request.sent_at && request.status!=="cancelled" && <>
                  <button type="button" onClick={() => void prepare(request,false)} disabled={!canPrepare || Boolean(busy)} className={primary}>{rowBusy ? <Loader2 size={16} className="animate-spin"/> : <MessageCircle size={16}/>} Abrir WhatsApp</button>
                  <button type="button" onClick={() => void prepare(request,true)} disabled={!canPrepare || Boolean(busy)} className={button}><Copy size={16}/> Copiar mensaje</button>
                </>}
                {!request.confirmed && !request.sent_at && ["prepared","uncertain"].includes(request.status) && <button type="button" onClick={() => void runAction(request,"sent")} disabled={Boolean(busy)} className={button}><Send size={16}/> Confirmar envío</button>}
                {request.status==="uncertain" && !request.confirmed && <button type="button" onClick={() => void runAction(request,"not_sent")} disabled={Boolean(busy)} className={button}>Comprobado: no se envió</button>}
                {googleReviewUrl(data?.settings.google_review_url) && <a href={googleReviewUrl(data?.settings.google_review_url)!} target="_blank" rel="noopener noreferrer" className={button}><ExternalLink size={16}/> Revisar Google</a>}
                {!request.confirmed && <button type="button" onClick={() => void runAction(request,"confirm")} disabled={Boolean(busy)} className={button}><CheckCircle2 size={16}/> Confirmar reseña</button>}
                {request.google_opened_at && !request.confirmed && <button type="button" onClick={() => void runAction(request,"checked")} disabled={Boolean(busy)} className={button}>Aún no aparece</button>}
                {request.confirmed && <button type="button" onClick={() => void runAction(request,"unconfirm")} disabled={Boolean(busy)} className={button}><Undo2 size={16}/> Deshacer confirmación</button>}
              </div>
            </article>;
          })}
        </div>
      </section>
      <aside className={`${card} space-y-5`}>
        <div><h2 className="text-lg font-black">Después de la visita</h2><p className={`mt-2 text-sm ${muted}`}>El tiempo cuenta desde la hora reservada. Solo se pide cuando consta que el cliente ha venido.</p></div>
        <label className="block text-sm font-bold">Cuándo pedirla<select value={delay} onChange={e=>setDelay(Number(e.target.value))} className={`${field} mt-2`}><option value={2}>2 horas desde la reserva</option><option value={3}>3 horas desde la reserva</option></select></label>
        <label className="block text-sm font-bold">Enlace de reseñas de Google<input type="url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://g.page/r/…/review" className={`${field} mt-2`} /></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={automatic} onChange={e=>setAutomatic(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-700"/><span><strong>Pedir automáticamente</strong><span className={`mt-1 block ${muted}`}>En próximas visitas, si la reseña sigue sin confirmar y el cliente permite estos mensajes.</span></span></label>
        {automatic && (!data?.settings.automation_ready || !channelConfigured) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">El canal automático todavía no está activo. Puedes usar el botón manual mientras se completa su configuración.</p>}
        <button type="button" onClick={() => void save()} disabled={savingSettings || !data} className={`${primary} w-full`}>{savingSettings ? <Loader2 size={16} className="animate-spin"/> : <CheckCircle2 size={16}/>} Guardar configuración</button>
        <div className={`border-t pt-4 text-sm ${dark ? "border-slate-700" : "border-slate-200"}`}><p className="font-bold">Seguimiento claro</p><p className={`mt-2 ${muted}`}>Petición enviada → enlace de Google abierto → reseña confirmada por el restaurante.</p><p className={`mt-2 ${muted}`}>Si aún no está confirmada, habrá una nueva petición tras otra visita. El cliente puede dejar de recibirlas desde el enlace.</p></div>
      </aside>
    </div>
  </div>;
}
