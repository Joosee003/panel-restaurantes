"use client";

import {
  ArrowRight,
  Check,
  ExternalLink,
  Flame,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

type PublicConfig = {
  restaurante_id: string;
  restaurante_nombre: string;
  slug: string;
  google_review_url: string;
  logo_url: string | null;
  color_primary: string;
  color_secondary: string;
  color_background: string;
  headline: string;
  subheadline: string;
};

type Step = "intro" | "form" | "thanks";

const allowedOrigins = new Set([
  "mesa",
  "caja",
  "entrada",
  "portacuentas",
  "redes",
]);

function createSubmissionToken(slug: string) {
  const key = `gastrohelp-opinion-token:${slug}`;
  const stored = window.sessionStorage.getItem(key);
  if (stored) return stored;

  const token = crypto.randomUUID();
  window.sessionStorage.setItem(key, token);
  return token;
}

export default function OpinionExperience({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [step, setStep] = useState<Step>("intro");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = useMemo(() => {
    const raw = searchParams.get("origen")?.toLowerCase().trim() ?? "";
    return allowedOrigins.has(raw) ? raw : "desconocido";
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/opiniones/${encodeURIComponent(slug)}`);
        const payload = (await response.json()) as {
          config?: PublicConfig;
          error?: string;
        };

        if (!response.ok || !payload.config) {
          throw new Error(payload.error ?? "No se pudo cargar esta página.");
        }

        if (!cancelled) setConfig(payload.config);
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar esta página.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function submitOpinion() {
    if (!config || sending) return;

    if (rating < 1) {
      setError("Selecciona una valoración antes de continuar.");
      return;
    }

    if (!consent) {
      setError("Acepta el aviso de privacidad para enviar tu opinión.");
      return;
    }

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/opiniones/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comentario: comment,
          nombreCliente: name,
          origen: origin,
          consentimiento: consent,
          submissionToken: createSubmissionToken(slug),
          website,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo enviar tu opinión.");
      }

      setStep("thanks");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "No se pudo enviar tu opinión.",
      );
    } finally {
      setSending(false);
    }
  }

  if (loading) return <LoadingState />;
  if (!config || error?.includes("no está disponible")) {
    return <UnavailableState message={error} />;
  }

  const theme = {
    "--brand-primary": config.color_primary,
    "--brand-secondary": config.color_secondary,
    "--brand-bg": config.color_background,
  } as CSSProperties;

  return (
    <main
      className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 sm:py-10"
      style={{ ...theme, background: config.color_background }}
    >
      <BackgroundDecoration primary={config.color_primary} />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-black/5 bg-white/95 shadow-[0_30px_100px_rgba(59,36,31,0.14)] backdrop-blur">
          <div
            className="h-2 w-full"
            style={{ background: config.color_primary }}
          />

          <div className="px-6 py-7 sm:px-10 sm:py-10">
            <BrandHeader config={config} />

            {step === "intro" && (
              <IntroStep
                config={config}
                onContinue={() => {
                  setError(null);
                  setStep("form");
                }}
              />
            )}

            {step === "form" && (
              <FormStep
                config={config}
                rating={rating}
                hoverRating={hoverRating}
                comment={comment}
                name={name}
                consent={consent}
                website={website}
                sending={sending}
                error={error}
                onRatingChange={setRating}
                onHoverRatingChange={setHoverRating}
                onCommentChange={setComment}
                onNameChange={setName}
                onConsentChange={setConsent}
                onWebsiteChange={setWebsite}
                onSubmit={submitOpinion}
              />
            )}

            {step === "thanks" && <ThanksStep config={config} rating={rating} />}
          </div>
        </section>
      </div>

      <p className="relative mt-5 text-center text-xs text-[#3b241f]/50">
        Sistema de opiniones gestionado por GastroHelp
      </p>
    </main>
  );
}

function BrandHeader({ config }: { config: PublicConfig }) {
  const logo = config.logo_url || "/brand/hispanos-grill-logo.svg";

  return (
    <header className="mb-8 text-center">
      <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#fbfaf7] p-2 shadow-sm sm:h-32 sm:w-32">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={`Logo de ${config.restaurante_nombre}`}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#3b241f]/70">
        <Flame className="h-3.5 w-3.5" style={{ color: config.color_primary }} />
        Sabor casero y brasa de verdad
      </div>
    </header>
  );
}

function IntroStep({
  config,
  onContinue,
}: {
  config: PublicConfig;
  onContinue: () => void;
}) {
  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <h1
        className="text-balance font-serif text-3xl font-semibold leading-tight sm:text-4xl"
        style={{ color: config.color_secondary }}
      >
        {config.headline}
      </h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[#3b241f]/65">
        {config.subheadline}
      </p>

      <div className="mt-7 grid grid-cols-3 gap-3">
        <TrustPoint icon={<MessageCircle />} label="Menos de 30 segundos" />
        <TrustPoint icon={<ShieldCheck />} label="Opinión privada y segura" />
        <TrustPoint icon={<Star />} label="Ayuda real al restaurante" />
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-4"
        style={{
          background: config.color_primary,
          boxShadow: `0 18px 36px ${config.color_primary}33`,
        }}
      >
        Compartir mi experiencia
        <ArrowRight className="h-5 w-5" />
      </button>

      <p className="mt-4 text-xs leading-5 text-[#3b241f]/45">
        Tu valoración se envía al restaurante. Al terminar también podrás
        publicarla en Google si lo deseas.
      </p>
    </div>
  );
}

function TrustPoint({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] px-2 py-4 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#1f5fbf]/10 text-[#1f5fbf] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <p className="mt-2 text-[11px] font-semibold leading-4 text-[#3b241f]/65">
        {label}
      </p>
    </div>
  );
}

function FormStep({
  config,
  rating,
  hoverRating,
  comment,
  name,
  consent,
  website,
  sending,
  error,
  onRatingChange,
  onHoverRatingChange,
  onCommentChange,
  onNameChange,
  onConsentChange,
  onWebsiteChange,
  onSubmit,
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
  onSubmit: () => void;
}) {
  const activeRating = hoverRating || rating;

  return (
    <div className="animate-[fadeIn_.35s_ease-out]">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#3b241f]/45">
          Tu experiencia
        </p>
        <h1
          className="mt-2 font-serif text-3xl font-semibold"
          style={{ color: config.color_secondary }}
        >
          ¿Cómo la valorarías?
        </h1>
        <p className="mt-2 text-sm text-[#3b241f]/55">
          Selecciona de 1 a 5 estrellas.
        </p>
      </div>

      <div
        className="mt-6 flex justify-center gap-2"
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
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-black/5 bg-[#fbfaf7] transition hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-[#1f5fbf]/15 sm:h-14 sm:w-14"
            >
              <Star
                className="h-7 w-7 sm:h-8 sm:w-8"
                fill={selected ? "#f4b942" : "transparent"}
                stroke={selected ? "#f4b942" : "#c9c2bb"}
                strokeWidth={1.8}
              />
            </button>
          );
        })}
      </div>

      <p className="mt-3 min-h-5 text-center text-sm font-medium text-[#3b241f]/65">
        {rating === 1 && "Sentimos que la experiencia no haya estado a la altura."}
        {rating === 2 && "Gracias por ayudarnos a detectar qué debemos mejorar."}
        {rating === 3 && "Gracias. Tu comentario nos ayudará a mejorar detalles."}
        {rating === 4 && "¡Nos alegra saber que disfrutaste de la experiencia!"}
        {rating === 5 && "¡Muchas gracias! Nos encanta saber que lo disfrutaste."}
      </p>

      <div className="mt-7 space-y-5">
        <label className="block">
          <span className="text-sm font-semibold text-[#3b241f]">
            Cuéntanos algo más <span className="font-normal text-[#3b241f]/45">(opcional)</span>
          </span>
          <textarea
            value={comment}
            onChange={(event) => onCommentChange(event.target.value.slice(0, 2000))}
            rows={4}
            placeholder="¿Qué te gustó? ¿Qué podríamos mejorar?"
            className="mt-2 w-full resize-none rounded-2xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 py-3.5 text-sm text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/35 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10"
          />
          <span className="mt-1 block text-right text-[11px] text-[#3b241f]/35">
            {comment.length}/2000
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-[#3b241f]">
            Tu nombre <span className="font-normal text-[#3b241f]/45">(opcional)</span>
          </span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value.slice(0, 100))}
            autoComplete="name"
            placeholder="Nombre"
            className="mt-2 min-h-12 w-full rounded-2xl border border-[#3b241f]/15 bg-[#fbfaf7] px-4 text-sm text-[#3b241f] outline-none transition placeholder:text-[#3b241f]/35 focus:border-[#1f5fbf]/50 focus:ring-4 focus:ring-[#1f5fbf]/10"
          />
        </label>

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

        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => onConsentChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#1f5fbf]"
          />
          <span className="text-xs leading-5 text-[#3b241f]/60">
            Acepto que Hispanos Grill y GastroHelp traten esta información para
            gestionar mi opinión. Consulta el{" "}
            <Link
              href="/privacidad/opiniones"
              target="_blank"
              className="font-semibold underline underline-offset-2"
              style={{ color: config.color_primary }}
            >
              aviso de privacidad
            </Link>
            .
          </span>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="button"
        disabled={sending}
        onClick={onSubmit}
        className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          background: config.color_primary,
          boxShadow: `0 18px 36px ${config.color_primary}33`,
        }}
      >
        {sending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Enviando…
          </>
        ) : (
          <>
            Enviar mi opinión
            <ArrowRight className="h-5 w-5" />
          </>
        )}
      </button>
    </div>
  );
}

function ThanksStep({ config, rating }: { config: PublicConfig; rating: number }) {
  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: `${config.color_primary}14` }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
          style={{ background: config.color_primary }}
        >
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
      </div>

      <h1
        className="mt-6 font-serif text-3xl font-semibold sm:text-4xl"
        style={{ color: config.color_secondary }}
      >
        ¡Gracias por ayudarnos!
      </h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[#3b241f]/65">
        Tu opinión ya ha llegado a {config.restaurante_nombre}. Cada comentario
        nos ayuda a seguir cuidando la experiencia.
      </p>

      <div className="mt-6 flex justify-center gap-1" aria-label={`${rating} estrellas`}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Star
            key={value}
            className="h-6 w-6"
            fill={value <= rating ? "#f4b942" : "transparent"}
            stroke={value <= rating ? "#f4b942" : "#d9d3cc"}
          />
        ))}
      </div>

      <div className="mt-8 rounded-3xl border border-black/5 bg-[#fbfaf7] p-5 text-left">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: config.color_primary }}
          >
            <ExternalLink className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-[#3b241f]">
              ¿Quieres compartirla también en Google?
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#3b241f]/55">
              Es opcional, pero ayuda a que otras personas conozcan el
              restaurante.
            </p>
          </div>
        </div>

        <a
          href={config.google_review_url}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-semibold transition hover:-translate-y-0.5"
          style={{
            color: config.color_primary,
            borderColor: `${config.color_primary}55`,
          }}
        >
          Publicar también en Google
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <p className="mt-6 text-sm font-medium text-[#3b241f]/45">
        Ya puedes cerrar esta página.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
      <div className="text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#1f5fbf]" />
        <p className="mt-4 text-sm font-medium text-[#3b241f]/65">
          Preparando tu experiencia…
        </p>
      </div>
    </main>
  );
}

function UnavailableState({ message }: { message: string | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
      <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1f5fbf]/10 text-[#1f5fbf]">
          <MessageCircle className="h-6 w-6" />
        </div>
        <h1 className="mt-5 font-serif text-2xl font-semibold text-[#3b241f]">
          Página no disponible
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#3b241f]/60">
          {message ?? "No hemos podido cargar este sistema de opiniones."}
        </p>
      </section>
    </main>
  );
}

function BackgroundDecoration({ primary }: { primary: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl"
        style={{ background: `${primary}16` }}
      />
      <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-[#3b241f]/[0.06] blur-3xl" />
      <div
        className="absolute left-1/2 top-10 h-px w-40 -translate-x-1/2"
        style={{ background: `${primary}35` }}
      />
    </div>
  );
}
