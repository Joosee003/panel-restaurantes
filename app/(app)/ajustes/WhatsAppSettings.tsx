"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Loader2, MessageCircle, Pause, RefreshCw, Smartphone, Unplug } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type Channel = {
  id: string; phone: string | null; status: string; enabled: boolean;
  chatbotEnabled: boolean; reviewsEnabled: boolean; generation: number;
};
type Connection = {
  configured: boolean; readOnly: boolean; allowedModules: { chatbot: boolean; reviews: boolean };
  channel: Channel | null; connectionError: boolean;
  pausedContacts: Array<{ phone: string; pausedAt: string | null }>;
};
type Action = "connect" | "activate" | "pause" | "disconnect" | "resume_contact";

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50";
const errors: Record<string, string> = {
  UNAUTHORIZED: "Vuelve a iniciar sesión para gestionar tu WhatsApp.",
  FORBIDDEN: "Tu usuario no puede gestionar esta conexión.",
  READ_ONLY_DEMO: "La cuenta de demostración permite consultar los ajustes, pero no conectar un número.",
  CONNECTION_NOT_PREPARED: "Conexión pendiente de preparar. Contacta con GastroHelp para terminar la configuración.",
  MODULE_NOT_ENABLED: "Elige un servicio que tengas activado para este restaurante.",
  CHANNEL_CHANGED: "La conexión ha cambiado. Actualiza el estado antes de continuar.",
  DISCONNECT_FIRST: "Desconecta el número actual antes de iniciar una nueva conexión.",
  CONNECTION_NOT_READY: "El número todavía no está listo. Actualiza el estado y completa la conexión en tu móvil.",
  CHECK_LINKED_NUMBER: "Comprueba el número que aparece conectado antes de activarlo.",
  CONTACT_NOT_PAUSED: "La atención de este cliente ya ha cambiado. Actualiza el estado para comprobarlo.",
};

function statusLabel(channel: Channel | null) {
  if (!channel) return "Sin conectar";
  if (channel.status === "WORKING") return channel.enabled ? "Activo" : "Conectado · envíos en pausa";
  return ({
    STOPPED: "Desconectado", STARTING: "Preparando conexión", SCAN_QR_CODE: "Pendiente de escanear",
    FAILED: "Conexión interrumpida", NUMBER_MISMATCH: "Número diferente detectado",
    CAPPED: "Envíos limitados por WhatsApp", PASSKEY_REQUIRED: "Verificación adicional pendiente",
    PASSKEY_CONFIRMATION_REQUIRED: "Verificación adicional pendiente", UNAVAILABLE: "Estado pendiente de comprobar",
  } as Record<string, string>)[channel.status] || "Estado pendiente de comprobar";
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("UNAUTHORIZED");
  return { Authorization: `Bearer ${data.session.access_token}` };
}

export default function WhatsAppSettings({ restaurantId }: { restaurantId: string }) {
  const [data, setData] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [qrVersion, setQrVersion] = useState(0);
  const [preferences, setPreferences] = useState<{ chatbot: boolean; reviews: boolean } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const refresh = useCallback(async (quiet = false) => {
    if (busyRef.current) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/whatsapp/channel?restaurantId=${encodeURIComponent(restaurantId)}`, {
        headers: await authHeaders(), cache: "no-store", signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "CHANNEL_UNAVAILABLE");
      if (!controller.signal.aborted) { setData(result); setError(null); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errors[cause instanceof Error ? cause.message : ""] || "No se ha podido comprobar la conexión. Prueba a actualizar el estado.");
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [restaurantId]);

  useEffect(() => {
    void refresh();
    return () => { requestRef.current?.abort(); };
  }, [refresh]);

  const channel = data?.channel ?? null;
  const scanning = channel?.status === "SCAN_QR_CODE";
  const connecting = scanning || channel?.status === "STARTING";
  const generation = channel?.generation;
  const qrAllowed = Boolean(scanning && data?.configured && !data.readOnly && !channel?.enabled);

  useEffect(() => {
    if (!connecting || busy) return;
    const timer = window.setInterval(() => { void refresh(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [connecting, busy, refresh]);

  useEffect(() => {
    if (!qrAllowed || generation == null) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    async function loadQr() {
      setQrError(false);
      setQr(null);
      try {
        const response = await fetch(`/api/whatsapp/channel/qr?restaurantId=${encodeURIComponent(restaurantId)}&generation=${generation}`, {
          headers: await authHeaders(), cache: "no-store", signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.includes("image/png")) throw new Error("QR_UNAVAILABLE");
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setQr(objectUrl);
      } catch { if (!controller.signal.aborted) setQrError(true); }
    }
    void loadQr();
    const timer = window.setInterval(() => setQrVersion((value) => value + 1), 25_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [qrAllowed, generation, restaurantId, qrVersion]);

  const hasSavedServices = Boolean(channel?.chatbotEnabled || channel?.reviewsEnabled);
  const selectedChatbot = data?.allowedModules.chatbot === true && (preferences?.chatbot ?? (hasSavedServices ? channel?.chatbotEnabled === true : true));
  const selectedReviews = data?.allowedModules.reviews === true && (preferences?.reviews ?? (hasSavedServices ? channel?.reviewsEnabled === true : true));

  async function act(action: Action, contactPhone?: string) {
    if (busyRef.current) return;
    if (action === "disconnect" && !window.confirm("¿Desconectar este WhatsApp? Los mensajes automáticos quedarán en pausa. Después podrás conectar el número que quieras usar.")) return;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    setNotice(null);
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const response = await fetch("/api/whatsapp/channel", {
        method: "POST", headers: { ...await authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantId, action, generation: channel?.generation, contactPhone,
          chatbotEnabled: selectedChatbot, reviewsEnabled: selectedReviews,
        }), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "CHANNEL_UNAVAILABLE");
      if (controller.signal.aborted) return;
      setData(result);
      if (action === "activate") {
        setPreferences(null);
        setNotice("Activado. Este restaurante utilizará el número conectado para los servicios seleccionados.");
      } else if (action === "pause") setNotice("Los mensajes automáticos están en pausa. Puedes seguir usando WhatsApp en el móvil.");
      else if (action === "disconnect") { setPreferences(null); setNotice("WhatsApp desconectado. Los mensajes automáticos están en pausa."); }
      else if (action === "resume_contact") setNotice("La atención automática se reanudará cuando este cliente vuelva a escribir.");
    } catch (cause) {
      if (!controller.signal.aborted) setError(errors[cause instanceof Error ? cause.message : ""] || "No se ha podido completar la operación. Actualiza el estado para comprobar cómo ha quedado.");
    } finally {
      busyRef.current = false;
      if (!controller.signal.aborted) { setBusy(null); setLoading(false); }
    }
  }

  const canManage = Boolean(data?.configured && !data.readOnly);
  const linked = channel?.status === "WORKING" && Boolean(channel.phone);
  const canConnect = canManage && !channel?.enabled && (!channel || ["STOPPED", "FAILED", "UNAVAILABLE"].includes(channel.status));

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="whatsapp-settings-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><MessageCircle className="h-5 w-5" /></div>
          <div>
            <h2 id="whatsapp-settings-title" className="text-xl font-black text-slate-950">WhatsApp del restaurante</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">Conecta tu número para atender a tus clientes y enviar las peticiones de reseña desde tu propio WhatsApp.</p>
          </div>
        </div>
        <button className={buttonClass} disabled={loading || Boolean(busy)} onClick={() => void refresh()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Actualizar estado
        </button>
      </div>

      {error ? <p role="alert" className="mt-5 rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">{error}</p> : null}
      {notice ? <p role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p> : null}
      {loading && !data ? <p className="mt-6 text-sm text-slate-500">Comprobando la conexión…</p> : null}
      {data && !data.configured ? <div className="mt-6 rounded-2xl bg-amber-50 p-5"><p className="font-bold text-amber-950">Conexión pendiente de preparar</p><p className="mt-1 text-sm text-amber-900">GastroHelp debe terminar la configuración antes de que puedas conectar tu número.</p></div> : null}
      {data?.readOnly ? <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Esta cuenta es de demostración. Puedes consultar el estado, pero no conectar ni cambiar un número.</p> : null}

      {data ? <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-bold text-slate-600">Número conectado</p><p className="mt-1 text-xl font-black text-slate-950">{channel?.phone || "Sin número vinculado"}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${linked && channel?.enabled ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{statusLabel(channel)}</span>
        </div>
        {data.connectionError ? <p role="status" className="mt-4 text-sm text-amber-800">No se ha podido comprobar WhatsApp ahora. El estado mostrado es el último conocido; actualízalo antes de continuar.</p> : null}
        {channel?.status === "NUMBER_MISMATCH" ? <p role="alert" className="mt-4 text-sm text-rose-800">El móvil conectado utiliza un número diferente al guardado. Hemos detenido los envíos. Pulsa «Desconectar» y vuelve a conectar el número correcto.</p> : null}
        {channel?.status.startsWith("PASSKEY_") ? <p className="mt-4 text-sm text-amber-800">WhatsApp pide una verificación adicional en el móvil. Contacta con GastroHelp para completar la conexión.</p> : null}
        {channel?.status === "CAPPED" ? <p className="mt-4 text-sm text-amber-800">WhatsApp está limitando los envíos de esta cuenta. Contacta con GastroHelp para revisar la conexión.</p> : null}

        {qrAllowed ? <div className="mt-6 grid gap-5 sm:grid-cols-[240px_1fr]">
          <div className="flex min-h-60 items-center justify-center rounded-2xl border border-slate-200 bg-white p-3">
            {qr && !qrError ? <Image unoptimized src={qr} width={216} height={216} alt="Código QR para conectar el WhatsApp de este restaurante" /> : qrError ? <p className="p-3 text-center text-sm text-slate-600">El código ha caducado o todavía no está disponible. Actualízalo para continuar.</p> : <Loader2 aria-label="Cargando código QR" className="h-7 w-7 animate-spin text-blue-600" />}
          </div>
          <div><h3 className="font-bold text-slate-950">Conecta desde tu móvil</h3><ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600"><li>Abre WhatsApp en el teléfono del restaurante.</li><li>Entra en «Dispositivos vinculados» y pulsa «Vincular un dispositivo».</li><li>Escanea este código y comprueba que aparece tu número.</li></ol><p className="mt-3 text-sm text-slate-600">Cuando esté conectado podrás activar los servicios que quieras utilizar.</p><button className={`${buttonClass} mt-4`} disabled={Boolean(busy)} onClick={() => setQrVersion((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Actualizar QR</button></div>
        </div> : null}

        {linked && canManage ? <div className="mt-6 border-t border-slate-100 pt-5">
          <h3 className="font-bold text-slate-950">Servicios con este número</h3>
          <div className="mt-3 space-y-3">
            {data.allowedModules.chatbot ? <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={selectedChatbot} disabled={Boolean(busy)} onChange={(event) => setPreferences({ chatbot: event.target.checked, reviews: selectedReviews })} /><span><strong>Atención por WhatsApp</strong><span className="mt-0.5 block text-slate-500">Responde consultas y gestiona las reservas de este restaurante.</span></span></label> : null}
            {data.allowedModules.reviews ? <label className="flex items-start gap-3 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-blue-600" checked={selectedReviews} disabled={Boolean(busy)} onChange={(event) => setPreferences({ chatbot: selectedChatbot, reviews: event.target.checked })} /><span><strong>Peticiones de reseña</strong><span className="mt-0.5 block text-slate-500">Envía el mensaje después de la visita según los ajustes de reseñas.</span></span></label> : null}
          </div>
          <button className={`${primaryClass} mt-5`} disabled={Boolean(busy) || (!selectedChatbot && !selectedReviews) || data.connectionError} onClick={() => void act("activate")}>
            {busy === "activate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {channel?.enabled ? "Guardar servicios" : "Activar con este número"}
          </button>
        </div> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          {canConnect && (data.allowedModules.chatbot || data.allowedModules.reviews) ? <button className={primaryClass} disabled={Boolean(busy)} onClick={() => void act("connect")}>{busy === "connect" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} Conectar WhatsApp</button> : null}
          {channel?.enabled && !data.readOnly ? <button className={buttonClass} disabled={Boolean(busy)} onClick={() => void act("pause")}><Pause className="h-4 w-4" /> Pausar mensajes automáticos</button> : null}
          {channel && !data.readOnly && (channel.phone || channel.status !== "STOPPED") ? <button className={buttonClass} disabled={Boolean(busy)} onClick={() => void act("disconnect")}><Unplug className="h-4 w-4" /> Desconectar</button> : null}
          {connecting ? <span role="status" className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Esperando la conexión del móvil…</span> : null}
        </div>
        {!data.allowedModules.chatbot && !data.allowedModules.reviews ? <p className="mt-4 text-sm text-slate-600">Para conectar un número necesitas tener activado el servicio de atención por WhatsApp o el de reseñas.</p> : null}
      </div> : null}
      {data?.allowedModules.chatbot && data.pausedContacts?.length > 0 ? <div className="mt-6 rounded-2xl border border-slate-200 p-5">
        <h3 className="font-bold text-slate-950">Conversaciones atendidas por el equipo</h3>
        <p className="mt-1 text-sm text-slate-600">La atención automática se pausa cuando respondes desde el móvil. Puedes reanudarla para cada cliente cuando termines.</p>
        {!channel?.enabled || !channel.chatbotEnabled ? <p className="mt-2 text-sm text-slate-500">Activa la atención por WhatsApp para reanudar estas conversaciones.</p> : null}
        <ul className="mt-4 divide-y divide-slate-100">
          {data.pausedContacts.map((contact) => <li key={contact.phone} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="text-sm font-bold text-slate-700">{contact.phone}</span>
            <button className={buttonClass} disabled={Boolean(busy) || data.readOnly || !channel?.enabled || !channel.chatbotEnabled || !linked} onClick={() => void act("resume_contact", contact.phone)}>Reanudar atención automática</button>
          </li>)}
        </ul>
        {data.pausedContacts.length === 50 ? <p className="mt-3 text-sm text-slate-500">Se muestran las 50 conversaciones pausadas más recientes.</p> : null}
      </div> : null}
    </section>
  );
}
