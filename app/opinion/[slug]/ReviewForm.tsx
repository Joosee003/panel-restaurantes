"use client";

import { ArrowRight, Check, ClipboardCopy, Loader2, Star } from "lucide-react";
import Link from "next/link";
import type { PublicConfig } from "@/lib/opiniones/public-review";
import { quickHighlights, ratingCopy } from "@/lib/opiniones/public-review";

export default function ReviewForm({
  config, rating, hoverRating, comment, name, consent, website, sending, error,
  onRatingChange, onHoverRatingChange, onCommentChange, onNameChange,
  onConsentChange, onWebsiteChange, onHighlightToggle, onSubmit,
}: {
  config: PublicConfig;
  rating: number;
  hoverRating: number;
  comment: string;
  name: string;
  consent: boolean;
  website: string;
  sending: boolean;
  error: string | null;
  onRatingChange: (value: number) => void;
  onHoverRatingChange: (value: number) => void;
  onCommentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onConsentChange: (value: boolean) => void;
  onWebsiteChange: (value: string) => void;
  onHighlightToggle: (value: string) => void;
  onSubmit: () => void;
}) {
  const activeRating = hoverRating || rating;
  const ratingMessage = ratingCopy[activeRating];

  return (
    <div className="animate-[fadeIn_.35s_ease-out]">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#3b241f]/[0.08]">
          <div className="h-full w-2/3 rounded-full" style={{ background: config.color_primary }} />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#3b241f]/45">Paso 1 de 2</span>
      </div>

      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold" style={{ color: config.color_secondary }}>
          ¿Qué tal fue tu experiencia?
        </h1>
        <p className="mt-2 text-sm text-[#3b241f]/55">Toca las estrellas que mejor la representen.</p>
      </div>

      <div className="mt-6 flex justify-center gap-1.5 sm:gap-2" role="radiogroup"
        aria-label="Valoración del 1 al 5" onMouseLeave={() => onHoverRatingChange(0)}>
        {[1, 2, 3, 4, 5].map((value) => {
          const selected = value <= activeRating;
          return (
            <button key={value} type="button" role="radio" aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              onMouseEnter={() => onHoverRatingChange(value)} onFocus={() => onHoverRatingChange(value)}
              onBlur={() => onHoverRatingChange(0)} onClick={() => onRatingChange(value)}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-[#fbfaf7] transition hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-[#1f5fbf]/15 sm:h-14 sm:w-14">
              <Star className="h-7 w-7 sm:h-8 sm:w-8" fill={selected ? "#f4b942" : "transparent"}
                stroke={selected ? "#f4b942" : "#c9c2bb"} strokeWidth={1.8} />
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mt-3 min-h-14 text-center">
        {ratingMessage ? (
          <>
            <p className="text-base font-bold" style={{ color: config.color_primary }}>{ratingMessage.label}</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-5 text-[#3b241f]/60">{ratingMessage.helper}</p>
          </>
        ) : <p className="pt-2 text-sm font-medium text-[#3b241f]/45">Selecciona entre 1 y 5 estrellas.</p>}
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <p className="text-sm font-semibold text-[#3b241f]">Ayúdate con una frase rápida</p>
          <p className="mt-0.5 text-xs text-[#3b241f]/45">Puedes marcar varias y después editar el texto.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickHighlights.map((phrase) => {
              const active = comment.includes(phrase);
              return (
                <button key={phrase} type="button" aria-pressed={active} onClick={() => onHighlightToggle(phrase)}
                  className="rounded-full border px-3 py-2 text-left text-xs font-semibold transition hover:-translate-y-0.5"
                  style={{
                    borderColor: active ? `${config.color_primary}70` : "rgba(59,36,31,.12)",
                    background: active ? `${config.color_primary}10` : "#fbfaf7",
                    color: active ? config.color_primary : "rgba(59,36,31,.72)",
                  }}>
                  {active && <Check className="mr-1 inline h-3.5 w-3.5" />}
                  {phrase.replace(/\.$/, "")}
                </button>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="text-sm font-semibold text-[#3b241f]">Tu comentario <span className="font-normal text-[#3b241f]/45">(opcional)</span></span>
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value.slice(0, 2000))}
            rows={5} placeholder="Cuéntanos qué te gustó o qué podríamos mejorar…"
            className="mt-2 w-full resize-none rounded-2xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 py-3.5 text-sm leading-6 text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/35 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10" />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[#3b241f]/45">
              <ClipboardCopy className="h-3.5 w-3.5" />
              {comment.trim() ? "Lo copiaremos para que puedas pegarlo en Google." : "Puedes enviarla solo con estrellas si lo prefieres."}
            </span>
            <span className="shrink-0 text-[11px] text-[#3b241f]/35">{comment.length}/2000</span>
          </div>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#3b241f]">Tu nombre <span className="font-normal text-[#3b241f]/45">(opcional)</span></span>
          <input type="text" value={name} onChange={(event) => onNameChange(event.target.value.slice(0, 100))}
            autoComplete="name" placeholder="Nombre"
            className="mt-2 min-h-12 w-full rounded-2xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 text-sm text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/35 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10" />
        </label>

        <div className="sr-only" aria-hidden="true"><label>Sitio web
          <input type="text" value={website} tabIndex={-1} autoComplete="off" onChange={(event) => onWebsiteChange(event.target.value)} />
        </label></div>

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
          <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f5fbf]" />
          <span className="text-xs leading-5 text-[#3b241f]/60">
            Acepto que Hispanos Grill y GastroHelp traten esta información para gestionar mi opinión. Consulta el{" "}
            <Link href="/privacidad/opiniones" target="_blank" className="font-semibold underline underline-offset-2"
              style={{ color: config.color_primary }}>aviso de privacidad</Link>.
          </span>
        </label>
      </div>

      {error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}

      <div className="mt-5 rounded-2xl border border-black/5 bg-white px-4 py-3">
        <p className="text-xs font-semibold text-[#3b241f]">Al pulsar el botón:</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold leading-4 text-[#3b241f]/55">
          <span>1. Guardamos tu opinión</span><span>2. Copiamos el texto</span><span>3. Abrimos Google</span>
        </div>
      </div>

      <button type="button" disabled={sending} onClick={onSubmit}
        className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: config.color_primary, boxShadow: `0 18px 36px ${config.color_primary}33` }}>
        {sending ? <><Loader2 className="h-5 w-5 animate-spin" />Guardando tu opinión…</>
          : <>Enviar y continuar en Google<ArrowRight className="h-5 w-5" /></>}
      </button>
    </div>
  );
}
