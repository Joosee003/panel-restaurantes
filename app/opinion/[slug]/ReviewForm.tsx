"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  Loader2,
  MessageCircleMore,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import Link from "next/link";
import type { AspectKey, ContactType, PublicConfig } from "@/lib/opiniones/public-review";
import {
  aspectDefinitions,
  buildSuggestedComment,
  closingPhrasesByRating,
  ratingCopy,
} from "@/lib/opiniones/public-review";

type CustomConfig = PublicConfig & {
  aspect_labels?: Partial<Record<AspectKey, string>>;
  seo_keywords?: string[];
};

const positiveOpeners = [
  "La experiencia fue muy buena.",
  "Salimos muy contentos.",
  "Disfrutamos mucho de la visita.",
  "La experiencia nos dejó muy buenas sensaciones.",
  "Fue una visita que merece la pena.",
  "Nos llevamos una impresión muy positiva.",
];

const neutralOpeners = [
  "En general la experiencia estuvo bien.",
  "La visita fue correcta, aunque hay algunos detalles mejorables.",
  "La experiencia fue buena en líneas generales.",
  "En conjunto estuvimos a gusto, con algún punto por pulir.",
];

const negativeOpeners = [
  "La experiencia podría haber sido bastante mejor.",
  "Esperábamos una visita diferente.",
  "Hay varios detalles importantes que deberían revisarse.",
  "La experiencia no terminó de convencernos.",
];

export default function ReviewForm({
  config,
  rating,
  comment,
  name,
  aspects,
  consent,
  website,
  sending,
  error,
  onCommentChange,
  onNameChange,
  onAspectToggle,
  onConsentChange,
  onWebsiteChange,
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
  const customConfig = config as CustomConfig;
  const labels = customConfig.aspect_labels ?? {};
  const seoKeywords = (customConfig.seo_keywords ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
  const canGenerate = aspects.length > 0;

  function prepareComment(closing?: string) {
    const body = buildSuggestedComment(rating, aspects, closing);
    if (!body) return;

    const openers = rating >= 4 ? positiveOpeners : rating === 3 ? neutralOpeners : negativeOpeners;
    const seed = Math.abs(
      aspects.reduce(
        (total, aspect, index) =>
          total +
          [...aspect].reduce((sum, character) => sum + character.charCodeAt(0), 0) *
            (index + 1),
        rating * 97 + Math.floor(Date.now() / 1000),
      ),
    );
    const opener = openers[seed % openers.length];
    const suggestion = `${opener} ${body}`.replace(/\s{2,}/g, " ").trim();
    onCommentChange(suggestion.slice(0, 2000));
  }

  function toggleKeyword(keyword: string) {
    const active = comment.toLowerCase().includes(keyword.toLowerCase());
    if (active) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const cleaned = comment
        .replace(new RegExp(`\\s*(?:Destacaría|Sobre)?\\s*${escaped}[^.!?]*[.!?]?`, "i"), " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      onCommentChange(cleaned);
      return;
    }

    const current = comment.trim();
    const sentence = rating >= 4
      ? `Destacaría ${keyword}.`
      : `Sobre ${keyword}, creo que hay margen de mejora.`;
    const next = current
      ? `${current}${/[.!?]$/.test(current) ? "" : "."} ${sentence}`
      : sentence;
    onCommentChange(next.slice(0, 2000));
  }

  return (
    <div className="animate-[fadeIn_.35s_ease-out]">
      <div className="mb-5 flex items-center gap-3">
        <button type="button" onClick={onBack} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/[0.07] bg-white text-[#3b241f]/65 shadow-sm" aria-label="Volver a la valoración">
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#3b241f]/[0.08]"><div className="h-full w-full rounded-full" style={{ background: config.color_primary }} /></div>
        <span className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#3b241f]/45">Paso 2 de 2</span>
      </div>

      <div className="text-center">
        <div className="flex items-center justify-center gap-1" aria-label={`${rating} estrellas`}>
          {[1, 2, 3, 4, 5].map((value) => <Star key={value} className="h-5 w-5" fill={value <= rating ? "#f4b942" : "transparent"} stroke={value <= rating ? "#f4b942" : "#d5cec7"} />)}
        </div>
        <p className="mt-1 text-sm font-extrabold" style={{ color: config.color_primary }}>{copy.label}</p>
        <h1 className="mx-auto mt-4 max-w-md text-balance font-serif text-3xl font-semibold leading-tight" style={{ color: config.color_secondary }}>{copy.detailTitle}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3b241f]/58">{copy.detailHelper}</p>
      </div>

      <section className="mt-7 rounded-[1.6rem] border border-blue-100 bg-[#f7faff] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-[#10233d]">{rating >= 4 ? "¿Qué te gustó más?" : "¿En qué deberíamos centrarnos?"}</h2>
            <p className="mt-1 text-xs leading-5 text-[#42526b]">Selecciona todos los aspectos que quieras.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-extrabold shadow-sm" style={{ color: config.color_primary }}>{aspects.length}/6</span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {aspectDefinitions.map((aspect) => {
            const active = aspects.includes(aspect.key);
            return (
              <button key={aspect.key} type="button" aria-pressed={active} onClick={() => onAspectToggle(aspect.key)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-center text-xs font-bold transition hover:-translate-y-0.5" style={{ borderColor: active ? config.color_primary : "#d7e2ef", background: active ? "#eaf3ff" : "#ffffff", color: active ? "#0d478f" : "#334155", boxShadow: active ? "0 8px 20px rgba(21,89,182,.10)" : undefined }}>
                {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                {labels[aspect.key]?.trim() || aspect.label}
              </button>
            );
          })}
        </div>
      </section>

      {seoKeywords.length > 0 && (
        <section className="mt-4 rounded-[1.6rem] border border-emerald-100 bg-emerald-50/55 p-4 sm:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#10233d]"><Search className="h-4 w-4 text-emerald-700" />Palabras que pueden ayudarte</h2>
            <p className="mt-1 text-xs leading-5 text-[#42526b]">Toca únicamente las que describan de verdad tu visita. Se añadirán al comentario y podrás editarlo libremente.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {seoKeywords.map((keyword) => {
              const active = comment.toLowerCase().includes(keyword.toLowerCase());
              return (
                <button key={keyword} type="button" aria-pressed={active} onClick={() => toggleKeyword(keyword)} className={`rounded-full border px-3 py-2 text-left text-[11px] font-bold transition ${active ? "border-emerald-500 bg-emerald-600 text-white" : "border-emerald-200 bg-white text-emerald-800 hover:border-emerald-400"}`}>
                  {active ? "✓ " : "+ "}{keyword}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-4 rounded-[1.6rem] border border-blue-100 bg-white p-4 shadow-[0_14px_40px_rgba(59,36,31,0.06)] sm:p-5">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-[#10233d]"><Sparkles className="h-4 w-4" style={{ color: config.color_primary }} />Hemos preparado una reseña natural para ti</h2>
          <p className="mt-1 text-xs leading-5 text-[#42526b]">Elige tus puntos favoritos, genera el texto y edítalo a tu gusto antes de enviarlo.</p>
        </div>

        <button type="button" disabled={!canGenerate} onClick={() => prepareComment()} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 bg-[#f7faff] px-4 text-sm font-extrabold transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-35" style={{ borderColor: "#bfd5ef", color: "#0d478f" }}>
          <MessageCircleMore className="h-4 w-4" /> Preparar comentario
        </button>

        {aspects.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{closingPhrasesByRating[rating].map((phrase) => <button key={phrase} type="button" onClick={() => prepareComment(phrase)} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-bold text-slate-600">+ {phrase}</button>)}</div>}

        <label className="mt-4 block">
          <span className="text-sm font-extrabold text-[#10233d]">Tu comentario <span className="font-medium text-slate-400">(opcional)</span></span>
          <textarea value={comment} onChange={(event) => onCommentChange(event.target.value.slice(0, 2000))} rows={5} placeholder={rating >= 4 ? "Cuéntanos qué fue lo que más te gustó…" : "Cuéntanos qué ocurrió y qué podríamos mejorar…"} className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500"><ClipboardCopy className="h-3.5 w-3.5" />{comment.trim() ? "Lo copiaremos para que puedas pegarlo en Google." : "También puedes enviar solo las estrellas."}</span>
            <span className="shrink-0 text-[11px] text-slate-400">{comment.length}/2000</span>
          </div>
        </label>
      </section>

      <label className="mt-4 block">
        <span className="text-sm font-extrabold text-[#10233d]">Tu nombre <span className="font-medium text-slate-400">(opcional)</span></span>
        <input type="text" value={name} onChange={(event) => onNameChange(event.target.value.slice(0, 100))} autoComplete="name" placeholder="Nombre" className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
      </label>

      <div className="sr-only" aria-hidden="true"><label>Sitio web<input type="text" value={website} tabIndex={-1} autoComplete="off" onChange={(event) => onWebsiteChange(event.target.value)} /></label></div>

      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f5fbf]" />
        <span className="text-xs leading-5 text-slate-600">Acepto que {config.restaurante_nombre} y GastroHelp traten esta información para gestionar mi opinión. Consulta el <Link href="/privacidad/opiniones" target="_blank" className="font-bold underline underline-offset-2" style={{ color: config.color_primary }}>aviso de privacidad</Link>.</span>
      </label>

      {error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <button type="button" disabled={sending} onClick={onSubmit} className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-bold text-white shadow-lg disabled:opacity-60" style={{ background: config.color_primary, boxShadow: `0 18px 40px ${config.color_primary}35` }}>
        {sending ? <><Loader2 className="h-5 w-5 animate-spin" />Guardando tu opinión…</> : <>Enviar y continuar<ArrowRight className="h-5 w-5" /></>}
      </button>
    </div>
  );
}
