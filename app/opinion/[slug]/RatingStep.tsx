"use client";

import { ArrowRight, ShieldCheck, Sparkles, Star } from "lucide-react";
import type { PublicConfig } from "@/lib/opiniones/public-review";
import { ratingCopy } from "@/lib/opiniones/public-review";

export default function RatingStep({
  config,
  rating,
  hoverRating,
  onRatingChange,
  onHoverRatingChange,
  onContinue,
}: {
  config: PublicConfig;
  rating: number;
  hoverRating: number;
  onRatingChange: (value: number) => void;
  onHoverRatingChange: (value: number) => void;
  onContinue: () => void;
}) {
  const activeRating = hoverRating || rating;
  const copy = ratingCopy[activeRating];

  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/80 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#3b241f]/55 shadow-sm">
        <Sparkles className="h-3.5 w-3.5" style={{ color: config.color_primary }} />
        Solo tardarás unos segundos
      </div>

      <h1
        className="mx-auto mt-5 max-w-md text-balance font-serif text-3xl font-semibold leading-tight sm:text-[2.65rem]"
        style={{ color: config.color_secondary }}
      >
        {config.headline}
      </h1>
      <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#3b241f]/60 sm:text-base">
        Toca las estrellas que mejor representen tu visita.
      </p>

      <div
        className="mt-8 flex justify-center gap-1 sm:gap-2"
        role="radiogroup"
        aria-label="Valoración del 1 al 5"
        onMouseLeave={() => onHoverRatingChange(0)}
      >
        {[1, 2, 3, 4, 5].map((value) => {
          const selected = value <= activeRating;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
              onMouseEnter={() => onHoverRatingChange(value)}
              onFocus={() => onHoverRatingChange(value)}
              onBlur={() => onHoverRatingChange(0)}
              onClick={() => onRatingChange(value)}
              className="group flex h-14 w-14 items-center justify-center rounded-2xl border border-black/[0.06] bg-white shadow-[0_10px_28px_rgba(59,36,31,0.08)] transition duration-200 hover:-translate-y-1.5 hover:shadow-[0_16px_34px_rgba(59,36,31,0.13)] focus:outline-none focus:ring-4 sm:h-16 sm:w-16"
              style={{
                borderColor: selected ? `${config.color_primary}40` : undefined,
                background: selected ? `${config.color_primary}08` : undefined,
              }}
            >
              <Star
                className="h-9 w-9 transition duration-200 group-active:scale-90 sm:h-10 sm:w-10"
                fill={selected ? "#f4b942" : "transparent"}
                stroke={selected ? "#f4b942" : "#b9b1aa"}
                strokeWidth={1.7}
              />
            </button>
          );
        })}
      </div>

      <div aria-live="polite" className="mx-auto mt-5 min-h-[5.25rem] max-w-md">
        {copy ? (
          <div className="animate-[fadeIn_.2s_ease-out] rounded-2xl px-4 py-3">
            <p className="text-lg font-extrabold" style={{ color: config.color_primary }}>
              {copy.label}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#3b241f]/60">{copy.helper}</p>
          </div>
        ) : (
          <p className="pt-4 text-sm font-medium text-[#3b241f]/40">
            Selecciona entre 1 y 5 estrellas.
          </p>
        )}
      </div>

      <button
        type="button"
        disabled={!rating}
        onClick={onContinue}
        className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white shadow-lg transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-35"
        style={{
          background: config.color_primary,
          boxShadow: rating ? `0 18px 40px ${config.color_primary}35` : undefined,
        }}
      >
        Continuar
        <ArrowRight className="h-5 w-5" />
      </button>

      <div className="mt-5 flex items-center justify-center gap-2 text-xs font-medium text-[#3b241f]/45">
        <ShieldCheck className="h-4 w-4" style={{ color: config.color_primary }} />
        Tu opinión llega directamente al restaurante
      </div>
    </div>
  );
}
