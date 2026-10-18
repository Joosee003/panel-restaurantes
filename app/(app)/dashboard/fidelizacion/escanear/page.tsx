"use client";

import Link from "next/link";
import { Camera, CheckCircle2, ChevronDown, Loader2, QrCode, Search, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/app/(app)/lib/supabaseClient";
import { getRestauranteUsuario } from "@/app/(app)/lib/getRestauranteUsuario";

type RewardPreview = {
  kind: "reward";
  token: string;
  valid: boolean;
  reason: string | null;
  redemptionId?: string;
  customerName?: string;
  rewardName?: string;
  points?: number;
  expiresAt?: string;
};

type MemberPreview = {
  kind: "member";
  memberCode: string;
  found: boolean;
  customerId?: string;
  customerName?: string;
  phone?: string;
  points?: number;
  visits?: number;
};

type Preview = RewardPreview | MemberPreview;
type DetectorResult = { rawValue?: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectorResult[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

function extractCode(value: string) {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }
  const reward = decoded.match(/ghr_[A-Za-z0-9_-]{30,}/)?.[0];
  if (reward) return { kind: "reward" as const, value: reward };
  const member = decoded.match(/ghm_([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i)?.[1];
  if (member) return { kind: "member" as const, value: member };
  return null;
}

function readableError(error: unknown) {
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (/EXPIRED/i.test(message)) return "Este QR ha caducado. Pide al cliente que genere otro.";
  if (/USED|NOT_PENDING|REVOKED/i.test(message)) return "Este premio ya no se puede canjear. Pide un QR nuevo al cliente.";
  if (/INSUFFICIENT_POINTS/i.test(message)) return "Ya no hay puntos suficientes para este premio. Consulta el saldo con el cliente.";
  if (/REDEMPTION_LEGACY_RECONCILIATION_REQUIRED/i.test(message)) return "Hay un canje anterior pendiente que necesita revisión antes de confirmar este premio.";
  if (/VISIT_USE_RESERVATION_CHECKOUT/i.test(message)) return "Esta visita corresponde a una reserva. Registra el consumo desde la reserva para aplicar sus puntos.";
  return "No hemos podido completar la acción. Vuelve a comprobar el QR o inténtalo de nuevo.";
}

function readableReason(reason: string | null) {
  if (reason === "EXPIRED") return { title: "Este QR ha caducado", help: "Pide al cliente que genere uno nuevo." };
  if (reason === "ALREADY_USED") return { title: "Este QR ya fue utilizado", help: "El premio ya se canjeó. Solicita otro QR si corresponde." };
  if (reason === "REVOKED" || reason === "NOT_PENDING") return { title: "Este canje ya no está disponible", help: "Pide al cliente que genere un QR nuevo." };
  return { title: "No podemos usar este QR aquí", help: "Puede ser de otro restaurante o no reconocerse. Pide el QR correcto." };
}

export default function LoyaltyScannerPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"reward" | "visit" | null>(null);
  const [spend, setSpend] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [rewardSuccess, setRewardSuccess] = useState<{ customerName: string; rewardName: string; points: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visitIdempotencyKey, setVisitIdempotencyKey] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const detectingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOpen(false);
  }, []);

  useEffect(() => {
    void getRestauranteUsuario().then(setRestaurantId);
    return () => stopCamera();
  }, [stopCamera]);

  const inspect = async (raw: string) => {
    if (!restaurantId) return;
    const code = extractCode(raw);
    setConfirmation(null);
    setMessage(null);
    setRewardSuccess(null);
    setError(null);
    setPreview(null);
    if (!code) {
      setVisitIdempotencyKey(null);
      setPreview(null);
      setError("No reconocemos este QR. Pide el QR personal o de premio del cliente.");
      return;
    }
    setVisitIdempotencyKey(code.kind === "member" ? crypto.randomUUID() : null);
    setBusy(true);
    if (code.kind === "reward") {
      const { data, error: rpcError } = await supabase.rpc("rpc_previsualizar_canje_qr", { p_token: code.value, p_restaurante_id: restaurantId });
      if (rpcError) setError(readableError(rpcError));
      else setPreview({ kind: "reward", token: code.value, ...(data as Omit<RewardPreview, "kind" | "token">) });
    } else {
      const { data, error: rpcError } = await supabase.rpc("rpc_identificar_cliente_club", { p_member_code: code.value, p_restaurante_id: restaurantId });
      if (rpcError) setError(readableError(rpcError));
      else setPreview({ kind: "member", memberCode: code.value, ...(data as Omit<MemberPreview, "kind" | "memberCode">) });
    }
    setBusy(false);
  };

  const startCamera = async () => {
    setError(null);
    const DetectorClass = (window as typeof window & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    try {
      // Safari on iPhone normally has no BarcodeDetector. Decode camera frames locally.
      const jsQR = DetectorClass ? null : (await import("jsqr")).default;
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      setManualOpen(false);
      window.setTimeout(() => {
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        void videoRef.current.play();
        const detector = DetectorClass ? new DetectorClass({ formats: ["qr_code"] }) : null;
        const canvas = detector ? null : document.createElement("canvas");
        const context = canvas?.getContext("2d", { willReadFrequently: true });
        intervalRef.current = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth || detectingRef.current) return;
          detectingRef.current = true;
          const detection = detector ? detector.detect(video).then((codes) => codes[0]?.rawValue) : Promise.resolve().then(() => {
            if (!canvas || !context || !jsQR) return undefined;
            canvas.width = Math.min(video.videoWidth, 640);
            canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frame = context.getImageData(0, 0, canvas.width, canvas.height);
            return jsQR(frame.data, frame.width, frame.height)?.data;
          });
          void detection.then((value) => {
            if (value) {
              stopCamera();
              setInput(value);
              void inspect(value);
            }
          }).catch(() => undefined).finally(() => { detectingRef.current = false; });
        }, 450);
      }, 50);
    } catch {
      stopCamera();
      setManualOpen(true);
      setError("No se pudo abrir la cámara. Revisa el permiso o introduce el código manualmente.");
    }
  };

  const confirmReward = async () => {
    if (!restaurantId || preview?.kind !== "reward") return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("rpc_confirmar_canje_qr", { p_token: preview.token, p_restaurante_id: restaurantId });
    if (rpcError) setError(readableError(rpcError));
    else {
      const completed = { customerName: preview.customerName || "Cliente", rewardName: preview.rewardName || "Premio", points: preview.points ?? 0 };
      setConfirmation(null);
      await inspect(preview.token);
      setRewardSuccess(completed);
    }
    setBusy(false);
  };

  const resetScreen = () => {
    stopCamera();
    setInput("");
    setPreview(null);
    setError(null);
    setMessage(null);
    setRewardSuccess(null);
    setConfirmation(null);
    setManualOpen(false);
  };

  const confirmVisit = async () => {
    if (!restaurantId || preview?.kind !== "member" || !visitIdempotencyKey) return;
    const normalizedSpend = spend.trim() ? Number(spend.replace(",", ".")) : null;
    if (normalizedSpend !== null && (!Number.isFinite(normalizedSpend) || normalizedSpend <= 0)) {
      setError("El gasto debe ser un importe positivo o quedar vacío.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("rpc_registrar_visita_cliente_club", {
      p_member_code: preview.memberCode,
      p_restaurante_id: restaurantId,
      p_idempotency_key: visitIdempotencyKey,
      p_gasto: normalizedSpend,
    });
    if (rpcError) setError(readableError(rpcError));
    else {
      setConfirmation(null);
      setSpend("");
      setPreview(null);
      setInput("");
      setVisitIdempotencyKey(null);
      const result = data as { duplicate?: boolean; reservationId?: string } | null;
      setMessage(result?.duplicate ? "Esta visita ya estaba registrada. No se han añadido visitas ni puntos." : result?.reservationId ? "Asistencia de la reserva registrada. El consumo y sus puntos se gestionan desde la reserva." : normalizedSpend ? "Visita y consumo registrados. Los puntos se calcularon con la regla del restaurante." : "Visita registrada sin modificar puntos.");
    }
    setBusy(false);
  };

  const showScanner = !preview && !rewardSuccess && !message;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Fidelización</div><h1 className="mt-1 text-3xl font-black tracking-[-0.05em] text-slate-950 dark:text-white">Escanear QR</h1><p className="mt-1 text-sm font-medium text-slate-500">Identifica al cliente o revisa un premio en segundos.</p></div>
        {showScanner ? <div className="flex flex-wrap gap-3 text-xs font-bold"><Link href="/dashboard/fidelizacion/club" className="text-slate-500 underline-offset-4 hover:underline">QR público del club</Link><Link href="/dashboard/fidelizacion/canjes" className="text-slate-500 underline-offset-4 hover:underline">Historial de canjes</Link></div> : null}
      </header>

      {showScanner ? <section className="mt-5">
        {cameraOpen ? <div className="overflow-hidden rounded-3xl bg-black"><video ref={videoRef} muted playsInline aria-label="Vista de la cámara para escanear QR" className="aspect-[4/3] w-full object-cover" /></div> : null}
        <button type="button" disabled={busy} onClick={() => cameraOpen ? stopCamera() : void startCamera()} className="mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-5 text-base font-black text-white shadow-sm disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-white dark:text-slate-950">{cameraOpen ? <X size={22} /> : <Camera size={22} />} {cameraOpen ? "Cerrar cámara" : "Escanear con cámara"}</button>
        <p className="mt-2 text-center text-xs font-medium text-slate-500">Acerca el QR del cliente o del premio a la cámara. Escanear no registra nada.</p>
        <button type="button" aria-expanded={manualOpen} aria-controls="loyalty-manual-code" onClick={() => setManualOpen((value) => !value)} className="mx-auto mt-4 flex min-h-11 items-center gap-2 text-sm font-bold text-slate-600 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-blue-600 dark:text-slate-300">Introducir código manualmente <ChevronDown size={16} className={manualOpen ? "rotate-180" : ""} /></button>
        {manualOpen ? <div id="loyalty-manual-code" className="mt-2 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_auto] dark:border-slate-800 dark:bg-slate-950"><label className="relative"><span className="sr-only">Código QR</span><QrCode className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void inspect(input); }} placeholder="Pega el contenido del QR" autoComplete="off" className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-base font-semibold outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900" /></label><button type="button" disabled={busy || !input.trim()} onClick={() => void inspect(input)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-50 dark:bg-white dark:text-slate-950"><Search size={17} /> Comprobar</button></div> : null}
      </section> : null}

      {error ? <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-5 text-red-900"><div className="flex items-center gap-2 text-lg font-black"><ShieldAlert size={20} /> No hemos podido continuar</div><p className="mt-1 text-sm font-medium">{error}</p><button type="button" onClick={resetScreen} className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-red-900">Probar otro QR</button></div> : null}
      {message ? <div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-5 text-emerald-900"><div className="flex items-center gap-2 text-lg font-black"><CheckCircle2 size={20} /> Visita registrada</div><p className="mt-1 text-sm font-medium">{message}</p><button type="button" onClick={resetScreen} className="mt-3 min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-emerald-900">Volver a escanear</button></div> : null}
      {rewardSuccess ? <section role="status" className="mt-5 rounded-3xl bg-emerald-50 p-6 text-emerald-950"><CheckCircle2 size={34} /><h2 className="mt-3 text-2xl font-black tracking-tight">Premio canjeado</h2><p className="mt-2 text-lg font-bold">{rewardSuccess.rewardName}</p><p className="mt-1 text-sm">{rewardSuccess.customerName} · − {rewardSuccess.points} puntos</p><p className="mt-2 text-xs font-medium text-emerald-800">El QR ya no se puede volver a utilizar.</p><button type="button" onClick={resetScreen} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-950 px-4 text-sm font-black text-white">Volver a escanear</button></section> : null}
      {busy ? <div role="status" className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Comprobando…</div> : null}

      {!busy && !error && !rewardSuccess && preview?.kind === "reward" ? <RewardResult preview={preview} confirmation={confirmation} setConfirmation={setConfirmation} confirm={confirmReward} onRetry={resetScreen} busy={busy} /> : null}
      {!busy && !error && preview?.kind === "member" ? <MemberResult preview={preview} confirmation={confirmation} setConfirmation={setConfirmation} spend={spend} setSpend={setSpend} confirm={confirmVisit} busy={busy} /> : null}
    </div>
  );
}

function RewardResult({ preview, confirmation, setConfirmation, confirm, onRetry, busy }: { preview: RewardPreview; confirmation: "reward" | "visit" | null; setConfirmation: (value: "reward" | "visit" | null) => void; confirm: () => Promise<void>; onRetry: () => void; busy: boolean }) {
  if (!preview.valid) {
    const reason = readableReason(preview.reason);
    return <section className="mt-5 rounded-3xl bg-red-50 p-6 text-red-950"><div className="text-xs font-black uppercase tracking-widest text-red-700">QR de premio</div><h2 className="mt-2 text-2xl font-black tracking-tight">{reason.title}</h2><p className="mt-2 text-sm font-medium">{reason.help}</p><button type="button" onClick={onRetry} className="mt-5 min-h-12 w-full rounded-xl bg-red-900 px-4 text-sm font-black text-white">Escanear otro QR</button></section>;
  }
  return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
    {confirmation !== "reward" ? <>
      <div className="text-xs font-black uppercase tracking-widest text-emerald-700">Premio listo para canjear</div>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{preview.rewardName || "Recompensa"}</h2>
      <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800"><ResultRow label="Cliente" value={preview.customerName || "—"} /><ResultRow label="Coste" value={`${preview.points ?? 0} puntos`} /></div>
      <button type="button" onClick={() => setConfirmation("reward")} className="mt-5 min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Continuar al canje</button>
    </> : <>
      <div className="text-xs font-black uppercase tracking-widest text-slate-500">Última comprobación</div>
      <ResultRow label="Cliente" value={preview.customerName || "—"} prominent />
      <ResultRow label="Premio" value={preview.rewardName || "—"} prominent />
      <div className="border-y border-slate-100 py-4 text-3xl font-black tracking-tight text-slate-950 dark:border-slate-800 dark:text-white">− {preview.points ?? 0} puntos</div>
      <p className="mt-3 text-xs font-medium text-slate-500">Solo al confirmar se descontarán los puntos. Este QR no podrá usarse otra vez.</p>
      <button type="button" disabled={busy} onClick={() => void confirm()} className="mt-5 min-h-14 w-full rounded-xl bg-slate-950 px-4 text-base font-black text-white dark:bg-white dark:text-slate-950">Confirmar canje</button>
      <button type="button" onClick={() => setConfirmation(null)} className="mt-2 min-h-11 w-full text-sm font-bold text-slate-600 dark:text-slate-300">Volver</button>
    </>}
  </section>;
}

function MemberResult({ preview, confirmation, setConfirmation, spend, setSpend, confirm, busy }: { preview: MemberPreview; confirmation: "reward" | "visit" | null; setConfirmation: (value: "reward" | "visit" | null) => void; spend: string; setSpend: (value: string) => void; confirm: () => Promise<void>; busy: boolean }) {
  if (!preview.found) return <div className="mt-5 rounded-3xl bg-red-50 p-6 text-sm font-bold text-red-900">No encontramos a este cliente en el club de este restaurante. Pide su QR personal correcto.</div>;
  return <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950"><div className="text-xs font-black uppercase tracking-widest text-blue-600">Cliente identificado</div><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">{preview.customerName || "Cliente"}</h2><div className="mt-3 flex gap-5 border-y border-slate-100 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300"><span><strong className="text-lg font-black text-slate-950 dark:text-white">{preview.visits ?? 0}</strong> visitas</span><span><strong className="text-lg font-black text-slate-950 dark:text-white">{preview.points ?? 0}</strong> puntos</span></div>{confirmation !== "visit" ? <><p className="mt-3 text-xs font-medium text-slate-500">Identificar al cliente no registra una visita.</p><button type="button" onClick={() => setConfirmation("visit")} className="mt-4 min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Registrar visita</button></> : <div className="mt-4"><h3 className="text-lg font-black text-slate-950 dark:text-white">¿Registrar esta visita?</h3><p className="mt-1 text-xs font-medium text-slate-500">El escaneo no ha registrado nada. Añade consumo solo si corresponde.</p><label className="mt-4 block"><span className="text-xs font-bold text-slate-600 dark:text-slate-300">Consumo opcional (€)</span><input value={spend} onChange={(event) => setSpend(event.target.value)} inputMode="decimal" placeholder="Dejar vacío si no procede" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-900" /></label><button type="button" disabled={busy} onClick={() => void confirm()} className="mt-4 min-h-12 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white dark:bg-white dark:text-slate-950">Confirmar visita</button><button type="button" onClick={() => setConfirmation(null)} className="mt-2 min-h-11 w-full text-sm font-bold text-slate-600 dark:text-slate-300">Cancelar</button></div>}</section>;
}

function ResultRow({ label, value, prominent = false }: { label: string; value: string; prominent?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-4 py-3 ${prominent ? "flex-col gap-1" : ""}`}><span className="text-xs font-semibold text-slate-500">{label}</span><strong className={`${prominent ? "text-xl" : "text-base"} font-black text-slate-950 dark:text-white`}>{value}</strong></div>;
}
