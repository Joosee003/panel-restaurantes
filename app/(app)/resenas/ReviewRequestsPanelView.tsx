"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Search, Undo2 } from "lucide-react";
import { googleReviewUrl, reviewStage, type ReviewRequest, type ReviewSettings } from "@/lib/reviews/review-flow";

export type ReviewData = { restaurantName: string; settings: ReviewSettings; requests: ReviewRequest[] };
type Filter = "sent" | "pending" | "confirmed" | "all";
export type ReviewPanelClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  channelConfigured: (restaurantId: string) => Promise<boolean>;
  inspectGoogle?: () => void;
};
function dateText(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function ReviewRequestsPanelView({ restauranteId, dark, client }: { restauranteId: string; dark: boolean; client: ReviewPanelClient }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [filter, setFilter] = useState<Filter>("sent"), [query, setQuery] = useState("");
  const [configured, setConfigured] = useState(false), [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ReviewRequest | null>(null);
  const [url, setUrl] = useState(""), [delay, setDelay] = useState(3), [automatic, setAutomatic] = useState(true), [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0);
  const card = `rounded-3xl border p-5 ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`;
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white"}`;
  const button = `inline-flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45 ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`;
  const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#1601ad] px-4 py-3 text-sm font-bold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-45";

  const load = useCallback(async (settings = false) => {
    const current = generation.current;
    try {
      const { data: result, error: loadError } = await client.rpc("list_visit_review_requests", { p_restaurante_id: restauranteId });
      if (current !== generation.current) return;
      if (loadError || !result) throw new Error("LOAD_FAILED");
      const next = result as ReviewData;
      setData(next);
      if (settings) { setUrl(next.settings.google_review_url || ""); setDelay(next.settings.review_delay_hours === 2 ? 2 : 3); setAutomatic(next.settings.review_enabled); }
    } catch { if (current === generation.current) setError("No se pudo cargar el seguimiento de reseñas. Vuelve a intentarlo."); }
    finally { if (current === generation.current) setLoading(false); }
  }, [restauranteId, client]);
  useEffect(() => {
    setData(null); setLoading(true); setError(""); void load(true);
    const refresh = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => { generation.current += 1; window.clearInterval(refresh); };
  }, [load]);
  useEffect(() => {
    let current = true;
    void client.channelConfigured(restauranteId).then(value => { if (current) setConfigured(value); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [restauranteId, client]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);

  const stats = useMemo(() => {
    const rows = data?.requests || [];
    return { sent: rows.filter(r => r.sent_at).length, pending: rows.filter(r => r.sent_at && !r.confirmed).length,
      confirmed: new Set(rows.filter(r => r.confirmed).map(r => r.cliente_id)).size,
      scheduled: rows.filter(r => !r.sent_at && !r.confirmed && ["scheduled", "ready"].includes(r.status)).length };
  }, [data]);
  const requests = useMemo(() => (data?.requests || []).filter(r => {
    if (query.trim() && !`${r.nombre} ${r.telefono || ""}`.toLocaleLowerCase("es").includes(query.trim().toLocaleLowerCase("es"))) return false;
    if (filter === "sent") return Boolean(r.sent_at);
    if (filter === "pending") return Boolean(r.sent_at) && !r.confirmed;
    if (filter === "confirmed") return r.confirmed;
    return true;
  }), [data, filter, query]);
  const googleUrl = googleReviewUrl(data?.settings.google_review_url);
  const active = data?.settings.review_enabled && data.settings.automation_ready && configured;

  async function record(action: "confirm" | "checked" | "unconfirm") {
    if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: actionError } = await client.rpc("visit_review_action", { p_reserva_id: selected.reserva_id, p_action: action });
      if (actionError) throw new Error(actionError.message);
      setSelected(null);
      setNotice(action === "confirm" ? "Reseña confirmada. Este cliente dejará de recibir peticiones."
        : action === "checked" ? "Revisión guardada. Se volverá a pedir automáticamente tras otra visita si sigue sin confirmar."
        : "Confirmación retirada. Se podrá volver a pedir tras otra visita.");
      await load();
    } catch { setError("No se pudo guardar la revisión. Vuelve a intentarlo."); }
    finally { setBusy(false); }
  }
  async function save() {
    if (url.trim() && !googleReviewUrl(url)) { setError("Revisa el enlace de reseñas de Google."); return; }
    setSaving(true); setError("");
    try {
      const { error: saveError } = await client.rpc("save_visit_review_settings", { p_restaurante_id: restauranteId, p_google_url: googleReviewUrl(url) || "", p_delay: delay, p_automatic: automatic });
      if (saveError) throw new Error(saveError.message);
      setNotice("Configuración guardada para las próximas reservas."); await load(true);
    } catch { setError("No se pudo guardar la configuración."); }
    finally { setSaving(false); }
  }
  if (loading) return <div className={`${card} flex min-h-64 items-center justify-center`}><Loader2 className="animate-spin" aria-label="Cargando solicitudes" /></div>;

  return <div className="space-y-5">
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setSelected(null); }} aria-labelledby="review-confirm-title" aria-describedby="review-confirm-description" className={`m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border p-6 shadow-xl backdrop:bg-slate-950/50 ${dark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
      <h2 id="review-confirm-title" className="text-xl font-bold">{selected?.confirmed ? "Corregir la confirmación" : "¿Ha dejado su reseña?"}</h2>
      <p id="review-confirm-description" className={`mt-3 text-sm leading-6 ${muted}`}>{selected?.confirmed ? `Si retiras la confirmación de ${selected.nombre}, se podrán enviar peticiones tras sus próximas visitas.` : `Comprueba en Google la reseña de ${selected?.nombre || "este cliente"} y guarda el resultado.`}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {googleUrl && !selected?.confirmed && <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={`${button} mt-4`} onClick={client.inspectGoogle ? event => { event.preventDefault(); client.inspectGoogle?.(); } : undefined}><ExternalLink size={16} /> Abrir Google</a>}
      <div className="mt-5 flex flex-wrap gap-2">
        {selected?.confirmed ? <button type="button" className={primary} disabled={busy} onClick={() => void record("unconfirm")}>Retirar confirmación</button> : <>
          <button type="button" className={primary} disabled={busy} onClick={() => void record("confirm")}><CheckCircle2 size={16} /> Sí, ya la ha dejado</button>
          <button type="button" className={button} disabled={busy} onClick={() => void record("checked")}>Todavía no aparece</button>
        </>}
        <button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>Cerrar</button>
      </div>
    </dialog>
    <div className={`rounded-2xl border px-5 py-4 text-sm ${active ? dark ? "border-indigo-800 bg-indigo-950 text-indigo-100" : "border-indigo-100 bg-indigo-50 text-indigo-950" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      <p className="font-bold">{active ? "Peticiones automáticas por WhatsApp" : "Envío automático pendiente de activación por GastroHelp"}</p>
      <p className="mt-1">{active ? `Se envían ${data?.settings.review_delay_hours || 3} horas después de la reserva, con permiso del cliente. Aquí solo tienes que comprobar si ha dejado la reseña.` : "Cuando el servicio esté activo, las peticiones saldrán desde las reservas sin tener que enviarlas desde el panel."}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">{[["Peticiones enviadas", stats.sent], ["Pendientes de revisar", stats.pending], ["Clientes con reseña confirmada", stats.confirmed]].map(([label, value]) => <div key={label} className={card}><p className={`text-sm font-semibold ${muted}`}>{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</div>
    {error && !selected && <p role="alert" className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    <section className={card}>
      <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">Clientes a los que se ha pedido una reseña</h2><p className={`mt-1 text-sm ${muted}`}>Al confirmar una reseña, se dejan de enviar peticiones a ese cliente.</p></div><button type="button" className={button} aria-label="Actualizar solicitudes" onClick={() => { setError(""); void load(); }}><RefreshCw size={17} /></button></div>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Filtrar solicitudes">{([["sent", "Peticiones enviadas"], ["pending", "Pendientes de revisar"], ["confirmed", "Confirmadas"], ["all", "Todas"]] as [Filter, string][]).map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={filter === key ? primary : button}>{label}</button>)}</div>
      <label className="relative mt-4 block"><span className="sr-only">Buscar cliente o teléfono</span><Search size={17} className={`absolute left-3 top-3 ${muted}`} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente o teléfono" className={`${field} pl-10`} /></label>
      {stats.scheduled > 0 && <p className={`mt-3 text-sm ${muted}`}>{stats.scheduled} {stats.scheduled === 1 ? "petición programada" : "peticiones programadas"} para próximas horas.</p>}
      <div className="mt-5 space-y-3">
        {!requests.length && <div className={`rounded-2xl border border-dashed p-8 text-center ${dark ? "border-slate-700" : "border-slate-200"}`}><CheckCircle2 className="mx-auto text-indigo-500" /><h3 className="mt-3 font-bold">{filter === "sent" ? "Todavía no se han enviado peticiones" : "No hay clientes con este filtro"}</h3><p className={`mt-2 text-sm ${muted}`}>El seguimiento se actualiza cuando se envía una petición o guardas una revisión.</p></div>}
        {requests.map(request => {
          const stage = reviewStage(request, now);
          const tone = stage.tone === "green" ? "bg-emerald-100 text-emerald-800" : stage.tone === "blue" ? "bg-indigo-100 text-indigo-800" : stage.tone === "amber" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700";
          return <article key={request.reserva_id} className={`rounded-2xl border p-4 sm:p-5 ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold">{request.nombre}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{stage.label}</span></div><p className={`mt-2 text-sm ${muted}`}>Reserva: {dateText(request.visit_at)} · {request.telefono || "Sin teléfono"}</p><p className={`mt-1 text-sm ${muted}`}>{request.sent_at ? `Petición enviada: ${dateText(request.sent_at)}` : request.status === "cancelled" ? "Esta petición está cancelada." : `Envío previsto: ${dateText(request.scheduled_for)}`}</p></div>
              {request.confirmed ? <button type="button" className={button} onClick={() => setSelected(request)}><Undo2 size={16} /> Corregir confirmación</button> : request.sent_at && googleUrl ? <a className={primary} href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={event => { setError(""); setSelected(request); if (client.inspectGoogle) { event.preventDefault(); client.inspectGoogle(); } }}><ExternalLink size={16} /> Revisar en Google</a> : null}
            </div>
            {request.google_opened_at && !request.confirmed && <p className={`mt-3 text-sm ${muted}`}>Abrió el enlace de Google el {dateText(request.google_opened_at)}. Falta comprobar si publicó la reseña.</p>}
            {request.checked_at && !request.confirmed && <p className={`mt-2 text-sm ${muted}`}>Revisada el {dateText(request.checked_at)}. Se volverá a pedir tras otra visita si sigue sin confirmar.</p>}
            {request.last_error && !request.sent_at && !request.confirmed && request.status !== "cancelled" && <p className="mt-2 text-sm text-amber-700">{!request.consent ? "Sin permiso para peticiones por WhatsApp." : "El envío está pendiente de revisión por GastroHelp."}</p>}
          </article>;
        })}
      </div>
    </section>
    <details className={card}><summary className="cursor-pointer text-sm font-bold">Configuración del servicio</summary><div className="mt-4 grid items-end gap-4 sm:grid-cols-2">
      <label className="block text-sm font-bold">Cuándo pedirla<select value={delay} onChange={event => setDelay(Number(event.target.value))} className={`${field} mt-2`}><option value={2}>2 horas después de la reserva</option><option value={3}>3 horas después de la reserva</option></select></label>
      <label className="block text-sm font-bold">Enlace de reseñas de Google<input type="url" value={url} onChange={event => setUrl(event.target.value)} className={`${field} mt-2`} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} className="h-4 w-4 accent-indigo-700" /> Peticiones automáticas activadas</label>
      <button type="button" className={button} disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar configuración"}</button>
    </div></details>
  </div>;
}
