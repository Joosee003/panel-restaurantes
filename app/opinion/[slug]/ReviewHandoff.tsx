"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { CopyState, PublicConfig } from "@/lib/opiniones/public-review";

export default function ReviewHandoff({
  config,
  rating,
  comment,
  copyState,
  hasOpenedGoogle,
  onCopy,
  onOpenGoogle,
  onRestart,
}: {
  config: PublicConfig;
  rating: number;
  comment: string;
  copyState: CopyState;
  countdown: number | null;
  hasOpenedGoogle: boolean;
  onCopy: () => Promise<boolean> | boolean;
  onOpenGoogle: () => Promise<void> | void;
  onRestart: () => void;
}) {
  const hasComment = Boolean(comment.trim());
  const needsCopy = hasComment && copyState !== "copied";
  const threshold = Math.max(1, Math.min(5, config.low_rating_threshold ?? 3));
  const canOfferGoogle = rating > threshold;
  const [showGoogleNotice, setShowGoogleNotice] = useState(false);

  useEffect(() => {
    if (!canOfferGoogle || hasOpenedGoogle) return;
    setShowGoogleNotice(true);
  }, [canOfferGoogle, hasOpenedGoogle]);

  async function continueToGoogle() {
    if (needsCopy) await onCopy();
    setShowGoogleNotice(false);
    await onOpenGoogle();
  }

  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ background: `${config.color_primary}12` }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_18px_42px_rgba(21,89,182,.28)]" style={{ background: config.color_primary }}>
          <Check className="h-8 w-8" strokeWidth={2.7} />
        </div>
      </div>

      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.18em]" style={{ color: config.color_primary }}>Enviada correctamente</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: config.color_secondary }}>Gracias por ayudarnos a mejorar</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3b241f]/60 sm:text-base">
        Tu opinión ya ha llegado al equipo de {config.restaurante_nombre}. {canOfferGoogle ? "Ahora puedes compartirla también en Google Maps." : "No necesitas hacer nada más."}
      </p>

      <div className="mt-5 flex justify-center gap-1" aria-label={`${rating} estrellas`}>
        {[1, 2, 3, 4, 5].map((value) => <Star key={value} className="h-6 w-6" fill={value <= rating ? "#f4b942" : "transparent"} stroke={value <= rating ? "#f4b942" : "#d9d3cc"} />)}
      </div>
      <p className="mt-1 text-sm font-extrabold" style={{ color: config.color_primary }}>{rating} {rating === 1 ? "estrella" : "estrellas"}</p>

      <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700"><CheckCircle2 className="h-5 w-5" /></div>
          <p className="mt-3 text-sm font-extrabold text-slate-900">Opinión recibida</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">El restaurante ya puede revisarla desde su panel privado.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700"><ShieldCheck className="h-5 w-5" /></div>
          <p className="mt-3 text-sm font-extrabold text-slate-900">Proceso completado</p>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{canOfferGoogle ? "Google Maps está preparado." : "Puedes cerrar esta página cuando quieras."}</p>
        </div>
      </div>

      {hasComment && (
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white text-left shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-slate-400">Tu comentario</p>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-blue-700">GUARDADO</span>
          </div>
          <p className="max-h-36 overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-700">“{comment.trim()}”</p>
        </div>
      )}

      {canOfferGoogle && (
        <button type="button" onClick={() => setShowGoogleNotice(true)} className="mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-blue-800">
          Abrir Google Maps <ExternalLink className="h-4.5 w-4.5" />
        </button>
      )}

      <button type="button" onClick={onRestart} className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 underline-offset-4 hover:underline">
        <RotateCcw className="h-3.5 w-3.5" /> Crear una opinión nueva
      </button>

      {showGoogleNotice && canOfferGoogle && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="google-notice-title">
          <section className="relative w-full max-w-md rounded-[2rem] bg-white p-6 text-left shadow-2xl sm:p-8">
            <button type="button" onClick={() => setShowGoogleNotice(false)} className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500" aria-label="Cerrar aviso"><X className="h-5 w-5" /></button>

            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              {copyState === "copied" ? <ClipboardCheck className="h-7 w-7" /> : <ClipboardCopy className="h-7 w-7" />}
            </div>
            <p className="mt-5 text-[10px] font-black uppercase tracking-[.18em] text-blue-700">Un último paso</p>
            <h2 id="google-notice-title" className="mt-2 text-2xl font-black leading-tight text-slate-950">
              {hasComment ? "Tu reseña está copiada en tu móvil" : "Déjanos también tu valoración en Google Maps"}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              {hasComment
                ? "Al abrirse Google Maps, mantén pulsado en el cuadro de texto, pega el mensaje y publícalo. Nos ayuda muchísimo. Gracias de antemano."
                : "Pulsa el botón, deja tu valoración en Google Maps y publícala. Nos ayuda muchísimo. Gracias de antemano."}
            </p>

            {hasComment && (
              <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-black text-blue-900">Tu mensaje está listo para pegar</p>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-blue-900/70">“{comment.trim()}”</p>
              </div>
            )}

            <button type="button" onClick={() => void continueToGoogle()} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-base font-black text-white shadow-lg hover:bg-blue-800">
              {needsCopy ? <ClipboardCopy className="h-5 w-5" /> : <ExternalLink className="h-5 w-5" />}
              {needsCopy ? "Copiar y abrir Google Maps" : "Entendido, abrir Google Maps"}
            </button>
            <p className="mt-3 text-center text-[11px] font-semibold text-slate-400">Google Maps no se abrirá hasta que pulses el botón.</p>
          </section>
        </div>
      )}
    </div>
  );
}
