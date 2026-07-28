"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  Loader2,
  Mail,
  MessageCircleMore,
  Phone,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import type {
  AspectKey,
  ContactType,
  PublicConfig,
} from "@/lib/opiniones/public-review";
import {
  aspectDefinitions,
  buildSuggestedComment,
  closingPhrasesByRating,
  ratingCopy,
} from "@/lib/opiniones/public-review";

export default function ReviewForm({
  config,
  rating,
  comment,
  name,
  aspects,
  consent,
  website,
  requestContact,
  contactType,
  contact,
  sending,
  error,
  onCommentChange,
  onNameChange,
  onAspectToggle,
  onConsentChange,
  onWebsiteChange,
  onRequestContactChange,
  onContactTypeChange,
  onContactChange,
  onBack,
  onSubmit,
}: {
  config: PublicConfig;
  rating: number;
  comment: string;
  name: string;
  aspects: AspectKey[];
  consent: boolean;
  website: string;
  requestContact: boolean;
  contactType: ContactType;
  contact: string;
  sending: boolean;
  error: string | null;
  onCommentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onAspectToggle: (value: AspectKey) => void;
  onConsentChange: (value: boolean) => void;
  onWebsiteChange: (value: string) => void;
  onRequestContactChange: (value: boolean) => void;
  onContactTypeChange: (value: ContactType) => void;
  onContactChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const copy = ratingCopy[rating];
  const showContact =
    config.contact_prompt_enabled && rating <= config.low_rating_threshold;
  const canGenerate = aspects.length > 0;

  function prepareComment(closing?: string) {
    const suggestion = buildSuggestedComment(rating, aspects, closing);
    if (suggestion) onCommentChange(suggestion);
  }

  return (
    <div className="animate-[fadeIn_.35s_ease-out]">
      <div className="mb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[#3b241f]/65 shadow-sm transition hover:-translate-y-0.5"
          aria-label="Volver a la valoración"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#3b241f]/[0.08]">
          <div
            className="h-full w-full rounded-full transition-all"
            style={{ background: config.color_primary }}
          />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#3b241f]/45">
          Paso 2 de 2
        </span>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-1" aria-label={`${rating} estrellas`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Star
              key={value}
              className="h-5 w-5"
              fill={value <= rating ? "#f4b942" : "transparent"}
              stroke={value <= rating ? "#f4b942" : "#d5cec7"}
            />
          ))}
        </div>
        <p className="mt-1 text-sm font-extrabold" style={{ color: config.color_primary }}>
          {copy.label}
        </p>
        <h1
          className="mx-auto mt-4 max-w-md text-balance font-serif text-3xl font-semibold leading-tight"
          style={{ color: config.color_secondary }}
        >
          {copy.detailTitle}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3b241f]/58">
          {copy.detailHelper}
        </p>
      </div>

      <section className="mt-7 rounded-[1.6rem] border border-black/[0.06] bg-[#fbfaf7] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[#3b241f]">
              {rating >= 4 ? "¿Qué te gustó más?" : "¿En qué deberíamos centrarnos?"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#3b241f]/48">
              Selecciona todos los aspectos que quieras.
            </p>
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-extrabold"
            style={{ background: `${config.color_primary}12`, color: config.color_primary }}
          >
            {aspects.length}/6
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {aspectDefinitions.map((aspect) => {
            const active = aspects.includes(aspect.key);
            return (
              <button
                key={aspect.key}
                type="button"
                aria-pressed={active}
                onClick={() => onAspectToggle(aspect.key)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-xs font-bold transition hover:-translate-y-0.5"
                style={{
                  borderColor: active
                    ? `${config.color_primary}70`
                    : "rgba(59,36,31,.10)",
                  background: active ? `${config.color_primary}10` : "white",
                  color: active ? config.color_primary : "rgba(59,36,31,.72)",
                  boxShadow: active
                    ? `0 8px 20px ${config.color_primary}12`
                    : undefined,
                }}
              >
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                {aspect.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mt-4 rounded-[1.6rem] border border-black/[0.06] bg-white p-4 shadow-[0_14px_40px_rgba(59,36,31,0.06)] sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#3b241f]">
              <Sparkles className="h-4 w-4" style={{ color: config.color_primary }} />
              Te ayudamos a escribirlo
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#3b241f]/48">
              Preparamos un texto natural con lo que hayas marcado. Después podrás editarlo.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={!canGenerate}
          onClick={() => prepareComment()}
          className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-extrabold transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35"
          style={{
            borderColor: `${config.color_primary}38`,
            color: config.color_primary,
            background: `${config.color_primary}06`,
          }}
        >
          <MessageCircleMore className="h-4 w-4" />
          Preparar comentario
        </button>

        {aspects.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {closingPhrasesByRating[rating].map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() => prepareComment(phrase)}
                className="rounded-full border border-black/[0.08] bg-[#fbfaf7] px-3 py-2 text-left text-[11px] font-bold text-[#3b241f]/65 transition hover:-translate-y-0.5"
              >
                + {phrase}
              </button>
            ))}
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-sm font-extrabold text-[#3b241f]">
            Tu comentario
            <span className="font-medium text-[#3b241f]/42"> (opcional)</span>
          </span>
          <textarea
            value={comment}
            onChange={(event) => onCommentChange(event.target.value.slice(0, 2000))}
            rows={5}
            placeholder={
              rating >= 4
                ? "Cuéntanos qué fue lo que más te gustó…"
                : "Cuéntanos qué ocurrió y qué podríamos mejorar…"
            }
            className="mt-2 w-full resize-none rounded-2xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 py-3.5 text-sm leading-6 text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/32 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-[#3b241f]/45">
              <ClipboardCopy className="h-3.5 w-3.5" />
              {comment.trim()
                ? "Lo copiaremos para que puedas pegarlo en Google."
                : "También puedes enviar solo las estrellas."}
            </span>
            <span className="shrink-0 text-[11px] text-[#3b241f]/35">
              {comment.length}/2000
            </span>
          </div>
        </label>
      </section>

      {showContact && (
        <section className="mt-4 rounded-[1.6rem] border border-amber-200/70 bg-amber-50/60 p-4 sm:p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={requestContact}
              onChange={(event) => onRequestContactChange(event.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f5fbf]"
            />
            <span>
              <span className="block text-sm font-extrabold text-[#3b241f]">
                Quiero que el restaurante pueda contactarme
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#3b241f]/55">
                Es completamente opcional y sirve para que puedan entender mejor lo ocurrido.
              </span>
            </span>
          </label>

          {requestContact && (
            <div className="mt-4 animate-[fadeIn_.25s_ease-out]">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onContactTypeChange("telefono")}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition"
                  style={{
                    borderColor:
                      contactType === "telefono"
                        ? `${config.color_primary}70`
                        : "rgba(59,36,31,.12)",
                    background:
                      contactType === "telefono"
                        ? `${config.color_primary}10`
                        : "white",
                    color:
                      contactType === "telefono"
                        ? config.color_primary
                        : "rgba(59,36,31,.68)",
                  }}
                >
                  <Phone className="h-4 w-4" /> Teléfono
                </button>
                <button
                  type="button"
                  onClick={() => onContactTypeChange("email")}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold transition"
                  style={{
                    borderColor:
                      contactType === "email"
                        ? `${config.color_primary}70`
                        : "rgba(59,36,31,.12)",
                    background:
                      contactType === "email"
                        ? `${config.color_primary}10`
                        : "white",
                    color:
                      contactType === "email"
                        ? config.color_primary
                        : "rgba(59,36,31,.68)",
                  }}
                >
                  <Mail className="h-4 w-4" /> Correo
                </button>
              </div>
              <input
                type={contactType === "email" ? "email" : "tel"}
                inputMode={contactType === "email" ? "email" : "tel"}
                value={contact}
                onChange={(event) => onContactChange(event.target.value.slice(0, 160))}
                placeholder={
                  contactType === "email"
                    ? "tu@email.com"
                    : "+34 600 000 000"
                }
                autoComplete={contactType === "email" ? "email" : "tel"}
                className="mt-3 min-h-12 w-full rounded-xl border border-[#3b241f]/15 bg-white px-4 text-sm text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/32 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10"
              />
            </div>
          )}
        </section>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-extrabold text-[#3b241f]">
            Tu nombre
            <span className="font-medium text-[#3b241f]/42"> (opcional)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value.slice(0, 100))}
            autoComplete="name"
            placeholder="Nombre"
            className="mt-2 min-h-12 w-full rounded-xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 text-sm text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/32 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10"
          />
        </label>
      </div>

      <div className="sr-only" aria-hidden="true">
        <label>
          Sitio web
          <input
            type="text"
            value={website}
            tabIndex={-1}
            autoComplete="off"
            onChange={(event) => onWebsiteChange(event.target.value)}
          />
        </label>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-black/[0.06] bg-[#fbfaf7] p-4">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsentChange(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f5fbf]"
        />
        <span className="text-xs leading-5 text-[#3b241f]/58">
          Acepto que {config.restaurante_nombre} y GastroHelp traten esta información para gestionar mi opinión. Consulta el{" "}
          <Link
            href="/privacidad/opiniones"
            target="_blank"
            className="font-bold underline underline-offset-2"
            style={{ color: config.color_primary }}
          >
            aviso de privacidad
          </Link>
          .
        </span>
      </label>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={sending}
        onClick={onSubmit}
        className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white shadow-lg transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: config.color_primary,
          boxShadow: `0 18px 40px ${config.color_primary}35`,
        }}
      >
        {sending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Guardando tu opinión…
          </>
        ) : (
          <>
            Enviar y continuar
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>

      <p className="mt-3 text-center text-[11px] leading-5 text-[#3b241f]/42">
        Después abriremos el formulario oficial de Google. Allí podrás revisar todo antes de publicar.
      </p>
    </div>
  );
}
