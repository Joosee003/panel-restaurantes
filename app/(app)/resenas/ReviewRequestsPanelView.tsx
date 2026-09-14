"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Clock3, ExternalLink, History, Loader2, MessageCircle, RefreshCw, Search, Settings2, Undo2 } from "lucide-react";
import { googleReviewUrl, reviewStage, type ReviewRequest, type ReviewSettings } from "@/lib/reviews/review-flow";
import { customerReviewStage, googleBusinessUrl, groupReviewCustomers, whatsappConversationUrl, type CustomerFilter, type ReviewCustomer } from "@/lib/reviews/review-customers";

export type ReviewData = { restaurantName: string; settings: ReviewSettings; requests: ReviewRequest[] };
export type ReviewPanelClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  channelConfigured: (restaurantId: string) => Promise<boolean>;
  inspectGoogle?: () => void;
};
const filters: [CustomerFilter, string][] = [["all", "Todos"], ["pending", "Por revisar"], ["confirmed", "Confirmadas"], ["queued", "Sin enviar"], ["stopped", "Sin permiso"]];
function dateText(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
}
function customerDetail(customer: ReviewCustomer, now: number) {
  if (customer.confirmed) return "No se enviarán más peticiones.";
  if (!customer.consent) return "No recibe peticiones de reseña por WhatsApp.";
  if (customer.lastOpenedAt) return "Falta comprobar si publicó la reseña.";
  if (customer.lastCheckedAt) return `Última revisión: ${dateText(customer.lastCheckedAt)}`;
  if (customer.lastSentAt) return `Enviada el ${dateText(customer.lastSentAt)}`;
  if (customer.latest.status === "cancelled") return "La última petición está cancelada.";
  if (["blocked", "prepared", "uncertain"].includes(customer.latest.status)) return "GastroHelp está revisando el envío.";
  if (Date.parse(customer.latest.scheduled_for) > now) return `Programada: ${dateText(customer.latest.scheduled_for)}`;
  return "Pendiente de envío automático.";
}
function badgeTone(tone: string, dark: boolean) {
  if (tone === "green") return dark ? "bg-emerald-950 text-emerald-300" : "bg-emerald-50 text-emerald-700";
  if (tone === "blue") return dark ? "bg-indigo-950 text-indigo-300" : "bg-indigo-50 text-indigo-700";
  if (tone === "amber") return dark ? "bg-amber-950 text-amber-300" : "bg-amber-50 text-amber-800";
  return dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600";
}

export default function ReviewRequestsPanelView({ restauranteId, dark, client }: { restauranteId: string; dark: boolean; client: ReviewPanelClient }) {
  const [data, setData] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [filter, setFilter] = useState<CustomerFilter>("all"), [query, setQuery] = useState("");
  const [configured, setConfigured] = useState(false), [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<ReviewRequest | null>(null);
  const [url, setUrl] = useState(""), [delay, setDelay] = useState(3), [automatic, setAutomatic] = useState(true), [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0);
  const card = `rounded-2xl border ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`;
  const muted = dark ? "text-slate-400" : "text-slate-500";
  const field = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${dark ? "border-slate-700 bg-slate-950 text-white" : "border-slate-200 bg-white"}`;
  const button = `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-45 ${dark ? "border-slate-700 hover:bg-slate-800" : "border-slate-200 hover:bg-slate-50"}`;
  const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#1601ad] px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-45";

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
    setData(null); setLoading(true); setError(""); setNotice(""); setSelected(null); setBusy(false); setSaving(false); setQuery(""); setFilter("all");
    void load(true);
    const refresh = window.setInterval(() => { setNow(Date.now()); void load(); }, 30_000);
    return () => { generation.current += 1; window.clearInterval(refresh); };
  }, [load]);
  useEffect(() => {
    let current = true;
    setConfigured(false);
    void client.channelConfigured(restauranteId).then(value => { if (current) setConfigured(value); }).catch(() => { if (current) setConfigured(false); });
    return () => { current = false; };
  }, [restauranteId, client]);
  useEffect(() => {
    if (selected && !dialog.current?.open) dialog.current?.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);

  const customers = useMemo(() => groupReviewCustomers(data?.requests || []), [data]);
  const counts = useMemo(() => {
    const result = { all: customers.length, pending: 0, confirmed: 0, queued: 0, stopped: 0 };
    for (const customer of customers) result[customer.category] += 1;
    return result;
  }, [customers]);
  const visible = useMemo(() => customers.filter(customer => {
    if (filter !== "all" && customer.category !== filter) return false;
    const search = query.trim().toLocaleLowerCase("es");
    if (!search) return true;
    const text = `${customer.latest.nombre} ${customer.latest.telefono || ""}`.toLocaleLowerCase("es");
    const digits = search.replace(/\D/g, "");
    return text.includes(search) || (/^[+\d\s().-]+$/.test(search) && digits.length > 0 && (customer.latest.telefono || "").replace(/\D/g, "").includes(digits));
  }), [customers, filter, query]);
  const sentCount = customers.reduce((total, customer) => total + customer.sentCount, 0);
  const googleUrl = googleBusinessUrl(data?.settings.google_review_url, data?.restaurantName || "");
  const active = data?.settings.review_enabled && data.settings.automation_ready && configured;

  async function record(action: "confirm" | "checked" | "unconfirm") {
    if (!selected || busy) return;
    const current = generation.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const { error: actionError } = await client.rpc("visit_review_action", { p_reserva_id: selected.reserva_id, p_action: action });
      if (current !== generation.current) return;
      if (actionError) throw new Error(actionError.message);
      setSelected(null);
      setNotice(action === "confirm" ? "Reseña confirmada. Este cliente dejará de recibir peticiones."
        : action === "checked" ? "Revisión guardada. La reseña sigue pendiente de confirmar."
        : "Confirmación retirada. Las próximas peticiones dependerán del permiso del cliente.");
      await load();
    } catch { if (current === generation.current) setError("No se pudo guardar la revisión. Vuelve a intentarlo."); }
    finally { if (current === generation.current) setBusy(false); }
  }
  async function save() {
    if (saving) return;
    if (url.trim() && !googleReviewUrl(url)) { setError("Revisa el enlace de reseñas de Google."); return; }
    const current = generation.current;
    setSaving(true); setError(""); setNotice("");
    try {
      const { error: saveError } = await client.rpc("save_visit_review_settings", { p_restaurante_id: restauranteId, p_google_url: googleReviewUrl(url) || "", p_delay: delay, p_automatic: automatic });
      if (current !== generation.current) return;
      if (saveError) throw new Error(saveError.message);
      setNotice("Configuración guardada para las próximas reservas."); await load(true);
    } catch { if (current === generation.current) setError("No se pudo guardar la configuración."); }
    finally { if (current === generation.current) setSaving(false); }
  }
  if (loading) return <div className={`${card} flex min-h-64 items-center justify-center`}><Loader2 className="animate-spin" aria-label="Cargando solicitudes" /></div>;

  return <div className={`space-y-4 ${dark ? "text-slate-100" : "text-slate-900"}`}>
    <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else setSelected(null); }} aria-labelledby="review-confirm-title" aria-describedby="review-confirm-description" className={`m-auto w-[calc(100%_-_2rem)] max-w-md rounded-2xl border p-6 shadow-xl backdrop:bg-slate-950/50 ${dark ? "border-slate-700 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
      <h2 id="review-confirm-title" className="text-xl font-bold">{selected?.confirmed ? "Corregir la confirmación" : "¿Ha dejado su reseña?"}</h2>
      <p id="review-confirm-description" className={`mt-3 text-sm leading-6 ${muted}`}>{selected?.confirmed ? `Vas a retirar la confirmación de ${selected.nombre}. Solo recibirá nuevas peticiones si tiene permiso activo.` : `En la ficha de Google, abre «Reseñas» y busca la de ${selected?.nombre || "este cliente"}. Después guarda aquí el resultado.`}</p>
      {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
      {googleUrl && !selected?.confirmed && <a href={googleUrl} target="_blank" rel="noopener noreferrer" className={`${button} mt-4`} onClick={client.inspectGoogle ? event => { event.preventDefault(); client.inspectGoogle?.(); } : undefined}><ExternalLink size={16} /> Abrir ficha de Google</a>}
      <div className="mt-5 flex flex-wrap gap-2">
        {selected?.confirmed ? <button type="button" className={primary} disabled={busy} onClick={() => void record("unconfirm")}>Retirar confirmación</button> : <>
          <button type="button" className={primary} disabled={busy} onClick={() => void record("confirm")}><CheckCircle2 size={16} /> Sí, ya la ha dejado</button>
          <button type="button" className={button} disabled={busy} onClick={() => void record("checked")}>Todavía no aparece</button>
        </>}
        <button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>Cerrar</button>
      </div>
    </dialog>

    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${active ? dark ? "border-emerald-900 bg-emerald-950/40 text-emerald-200" : "border-emerald-100 bg-emerald-50 text-emerald-900" : dark ? "border-amber-900 bg-amber-950/30 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
      {active ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <Clock3 size={18} className="mt-0.5 shrink-0" />}
      <p><span className="font-semibold">{active ? "Peticiones automáticas activas." : data?.settings.review_enabled === false ? "Peticiones automáticas desactivadas." : "Envío automático pendiente de activación."}</span>{" "}{active ? `Se programan al marcar «Ha venido», ${data?.settings.review_delay_hours || 3} horas después de la reserva.` : "Puedes seguir revisando las reseñas de tus clientes."}</p>
    </div>
    {error && !selected && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}

    <section className={`${card} overflow-hidden`} aria-labelledby="review-customers-title">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 id="review-customers-title" className="text-lg font-bold">Seguimiento por cliente</h2><p className={`mt-1 text-sm ${muted}`}>{counts.all} {counts.all === 1 ? "cliente" : "clientes"} · {sentCount} {sentCount === 1 ? "petición enviada" : "peticiones enviadas"}</p></div>
          <button type="button" className={button} aria-label="Actualizar solicitudes" onClick={() => { setError(""); void load(); }}><RefreshCw size={16} /></button>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Filtrar clientes">
          {filters.map(([key, label]) => <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${filter === key ? dark ? "bg-indigo-950 text-indigo-200" : "bg-indigo-50 text-indigo-800" : dark ? "text-slate-400 hover:bg-slate-800" : "text-slate-500 hover:bg-slate-50"}`}>{label}<span className={`rounded-md px-1.5 py-0.5 text-xs tabular-nums ${filter === key ? dark ? "bg-indigo-900" : "bg-indigo-100" : dark ? "bg-slate-800" : "bg-slate-100"}`}>{counts[key]}</span></button>)}
        </div>
        <label className="relative mt-4 block"><span className="sr-only">Buscar cliente o teléfono</span><Search size={17} className={`absolute left-3 top-3 ${muted}`} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar cliente o teléfono" className={`${field} pl-10`} /></label>
      </div>
      <div className={`divide-y border-t ${dark ? "divide-slate-800 border-slate-800" : "divide-slate-100 border-slate-100"}`}>
        {!visible.length && <div className="p-8 text-center"><Search className={`mx-auto ${muted}`} /><h3 className="mt-3 font-semibold">{customers.length ? "No hay clientes con este filtro" : "Aquí aparecerán tus clientes"}</h3><p className={`mt-2 text-sm ${muted}`}>{customers.length ? "Prueba con otro estado o cambia la búsqueda." : "El seguimiento empieza con las visitas y las peticiones de reseña."}</p>{customers.length > 0 && <button type="button" className={`${button} mt-4`} onClick={() => { setFilter("all"); setQuery(""); }}>Ver todos los clientes</button>}</div>}
        {visible.map(customer => {
          const request = customer.latest;
          const stage = customerReviewStage(customer, now);
          const whatsappUrl = whatsappConversationUrl(request.telefono);
          return <article key={customer.id} aria-label={request.nombre} className="p-4 sm:px-5">
            <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-5">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"}`}>{request.nombre.trim().slice(0, 1).toLocaleUpperCase("es") || "C"}</span>
                <div className="min-w-0"><h3 className="break-words text-sm font-bold">{request.nombre}</h3><p className={`mt-1 break-words text-xs ${muted}`}>{request.telefono || "Sin teléfono"}</p></div>
              </div>
              <div><span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${badgeTone(stage.tone, dark)}`}>{stage.label}</span><p className={`mt-1.5 text-xs leading-5 ${muted}`}>{customerDetail(customer, now)}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={button} title={`Abrir el chat de ${request.nombre} en tu WhatsApp`}><MessageCircle size={16} className={dark ? "text-emerald-400" : "text-emerald-600"} /> WhatsApp</a> : <button type="button" className={button} disabled title="Revisa el teléfono en la ficha del cliente"><MessageCircle size={16} /> Sin teléfono válido</button>}
                {customer.confirmed ? <button type="button" className={button} onClick={() => { setError(""); setSelected(request); }}><Undo2 size={15} /> Corregir</button> : customer.reviewRequest && googleUrl ? <a className={primary} href={googleUrl} target="_blank" rel="noopener noreferrer" onClick={event => { setError(""); setSelected(customer.reviewRequest); if (client.inspectGoogle) { event.preventDefault(); client.inspectGoogle(); } }}><ExternalLink size={15} /> Revisar reseña</a> : customer.reviewRequest ? <button type="button" className={button} disabled title="Añade el enlace de Google en Configuración del servicio">Revisar reseña</button> : null}
              </div>
            </div>
            <details className="group mt-3">
              <summary className={`flex w-fit cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 py-1 text-xs ${muted} [&::-webkit-details-marker]:hidden`}><History size={13} /><span>Historial · {customer.history.length} {customer.history.length === 1 ? "visita" : "visitas"}</span><ChevronDown size={13} className="transition-transform group-open:rotate-180" /><span className="ml-1">Última: {dateText(request.visit_at)}</span></summary>
              <ol className={`mt-3 space-y-3 rounded-xl p-4 ${dark ? "bg-slate-950" : "bg-slate-50"}`}>
                {customer.history.map(visit => <li key={visit.reserva_id} className="grid gap-1 text-xs sm:grid-cols-[10rem_1fr] sm:gap-4"><p className="font-semibold">Visita: {dateText(visit.visit_at)}</p><div className={`space-y-1 leading-5 ${muted}`}>
                  <p>{visit.sent_at ? `Petición enviada: ${dateText(visit.sent_at)}` : visit.status === "cancelled" ? "Petición cancelada." : customer.confirmed ? "Sin envío. Reseña ya confirmada." : !customer.consent ? "Sin envío. No tiene permiso activo." : reviewStage(visit, now).label}</p>
                  {visit.google_opened_at && <p>Enlace abierto: {dateText(visit.google_opened_at)}. La apertura no confirma una reseña.</p>}
                  {visit.checked_at && <p>Revisada en Google: {dateText(visit.checked_at)}</p>}
                </div></li>)}
              </ol>
            </details>
          </article>;
        })}
      </div>
      <div className={`border-t px-4 py-3 text-xs leading-5 sm:px-5 ${dark ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-500"}`}>
        WhatsApp abre el chat en la cuenta que tengas iniciada. Al confirmar una reseña, se detienen las peticiones a ese cliente.
        {(data?.requests.length || 0) >= 250 && <p>Se muestran las últimas 250 visitas registradas.</p>}
      </div>
    </section>

    <details className={`${card} group p-4 sm:p-5`}><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"><Settings2 size={17} /> Configuración del servicio<ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" /></summary><div className="mt-4 grid items-end gap-4 sm:grid-cols-2">
      <label className="block text-sm font-semibold">Cuándo pedirla<select value={delay} onChange={event => setDelay(Number(event.target.value))} className={`${field} mt-2`}><option value={2}>2 horas después de la reserva</option><option value={3}>3 horas después de la reserva</option></select></label>
      <label className="block text-sm font-semibold">Enlace de reseñas de Google<input type="url" value={url} onChange={event => setUrl(event.target.value)} className={`${field} mt-2`} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} className="h-4 w-4 accent-indigo-700" /> Peticiones automáticas activadas</label>
      <button type="button" className={button} disabled={saving} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar configuración"}</button>
    </div></details>
  </div>;
}
