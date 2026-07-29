"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  RotateCcw,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useEffect } from "react";
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

  useEffect(() => {
    if (!canOfferGoogle || hasOpenedGoogle) return;
    const timeout = window.setTimeout(() => {
      void onOpenGoogle();
    }, 1500);
    return () => window.clearTimeout(timeout);
  }, [canOfferGoogle, hasOpenedGoogle, onOpenGoogle]);

  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full" style={{ background: `${config.color_primary}12` }}>
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-[0_18px_42px_rgba(21,89,182,.28)]" style={{ background: config.color_primary }}>
          <Check className="h-8 w-8" strokeWidth={2.7} />
        </div>
      </div>

      <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[.18em]" style={{ color: config.color_primary }}>
        Enviada correctamente
      </p>
      <h1 className="mt-2 font-serif text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: config.color_secondary }}>
        Gracias por ayudarnos a mejorar
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3b241f]/60 sm:text-base">
        Tu opinión ya ha llegado al equipo de {config.restaurante_nombre}. {canOfferGoogle ? "Ahora te llevamos a su ficha de Google Maps." : "No necesitas hacer nada más."}
      </p>

      <div className="mt-5 flex justify-center gap-1" aria-label={`${rating} estrellas`}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Star
            key={value}
            className="h-6 w-6"
            fill={value <= rating ? "#f4b942" : "transparent"}
            stroke={value <= rating ? "#f4b942" : "#d9d3cc"}
          />
        ))}
      </div>
      <p className="mt-1 text-sm font-extrabold" style={{ color: config.color_primary }}>
        {rating} {rating === 1 ? "estrella" : "estrellas"}
      </p>

      <div className="mt-7 grid gap-3 text-left sm:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.06] bg-[#fbfaf7] p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${config.color_primary}14`, color: config.color_primary }}>
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#3b241f]">Opinión recibida</p>
          <p className="mt-1 text-[11px] leading-5 text-[#3b241f]/52">El restaurante ya puede revisarla desde su panel privado.</p>
        </div>
        <div className="rounded-2xl border border-black/[0.06] bg-[#fbfaf7] p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: `${config.color_primary}14`, color: config.color_primary }}>
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-extrabold text-[#3b241f]">Proceso completado</p>
          <p className="mt-1 text-[11px] leading-5 text-[#3b241f]/52">{canOfferGoogle ? "Abriendo la ficha de Google Maps…" : "Puedes cerrar esta página cuando quieras."}</p>
        </div>
      </div>

      {hasComment && (
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-white text-left shadow-[0_12px_34px_rgba(59,36,31,.06)]">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[.15em] text-[#3b241f]/45">Tu comentario</p>
            <span className="rounded-full px-2.5 py-1 text-[10px] font-extrabold" style={{ background: `${config.color_primary}10`, color: config.color_primary }}>
              GUARDADO
            </span>
          </div>
          <p className="max-h-36 overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-[#3b241f]/72">“{comment.trim()}”</p>
        </div>
      )}

      {canOfferGoogle && (
        <div className="mt-6 rounded-[1.5rem] border border-blue-100 bg-[#f7fbff] p-4 text-left">
          <p className="text-sm font-extrabold text-[#3b241f]">Abriendo Google Maps…</p>
          <p className="mt-1 text-xs leading-5 text-[#3b241f]/55">
            Te llevamos directamente a la ficha del restaurante.
          </p>

          <button
            type="button"
            onClick={onOpenGoogle}
            className="mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white px-5 text-sm font-extrabold transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ color: config.color_primary, borderColor: `${config.color_primary}35` }}
          >
            {hasOpenedGoogle ? "Volver a abrir Google Maps" : needsCopy ? "Copiar comentario y abrir Maps" : "Abrir Google Maps ahora"}
            <ExternalLink className="h-4.5 w-4.5" />
          </button>

          {hasComment && (
            <button
              type="button"
              onClick={onCopy}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-xs font-extrabold text-[#3b241f]/60 transition hover:bg-white"
            >
              {copyState === "copied" ? <ClipboardCheck className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />}
              {copyState === "copied" ? "Comentario copiado" : "Copiar comentario"}
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="mt-6 inline-flex items-center gap-1.5 text-xs font-bold text-[#3b241f]/42 underline-offset-4 hover:underline"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Crear una opinión nueva
      </button>
    </div>
  );
}
