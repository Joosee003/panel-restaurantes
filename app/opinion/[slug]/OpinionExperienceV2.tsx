"use client";

import { Flame, Loader2, MessageCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import RatingStep from "./RatingStep";
import ReviewForm from "./ReviewForm";
import ReviewHandoff from "./ReviewHandoff";
import {
  allowedOrigins,
  completedKey,
  copyText,
  createSubmissionToken,
  draftKey,
  eventKey,
  isValidContact,
  readCompletedSession,
  redirectKey,
  sessionGet,
  sessionRemove,
  sessionSet,
  toggleAspect,
  tokenKey,
  trackPublicEvent,
  type AspectKey,
  type ContactType,
  type CopyState,
  type PublicConfig,
  type ReviewEventType,
  type ReviewStep,
} from "@/lib/opiniones/public-review";

const EVENTS_TO_CLEAR: ReviewEventType[] = [
  "view",
  "rating_selected",
  "details_opened",
  "submitted",
  "copy_succeeded",
  "copy_failed",
  "google_opened",
  "returned_from_google",
];

export default function OpinionExperienceV2({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [submissionToken, setSubmissionToken] = useState("");
  const [step, setStep] = useState<ReviewStep>("rating");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [aspects, setAspects] = useState<AspectKey[]>([]);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [requestContact, setRequestContact] = useState(false);
  const [contactType, setContactType] = useState<ContactType>("telefono");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [hasOpenedGoogle, setHasOpenedGoogle] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const origin = useMemo(() => {
    const raw = searchParams.get("origen")?.toLowerCase().trim() ?? "";
    return allowedOrigins.has(raw) ? raw : "desconocido";
  }, [searchParams]);

  useEffect(() => {
    const token = createSubmissionToken(slug);
    setSubmissionToken(token);

    const completed = readCompletedSession(slug);
    if (completed) {
      const opened = sessionGet(redirectKey(slug)) === "done";
      setRating(completed.rating);
      setComment(completed.comment);
      setName(completed.name);
      setAspects(completed.aspects ?? []);
      setCopyState(completed.copyState);
      setHasOpenedGoogle(opened);
      setStep("handoff");
      setSessionReady(true);

      if (opened) {
        trackPublicEvent({
          slug,
          token,
          event: "returned_from_google",
          origin,
          rating: completed.rating,
          once: true,
        });
      }
      return;
    }

    const draftRaw = sessionGet(draftKey(slug));
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw) as {
          rating?: number;
          comment?: string;
          name?: string;
          aspects?: AspectKey[];
          consent?: boolean;
          requestContact?: boolean;
          contactType?: ContactType;
          contact?: string;
          step?: ReviewStep;
        };
        setRating(Number.isInteger(draft.rating) ? Number(draft.rating) : 0);
        setComment(typeof draft.comment === "string" ? draft.comment : "");
        setName(typeof draft.name === "string" ? draft.name : "");
        setAspects(Array.isArray(draft.aspects) ? draft.aspects : []);
        setConsent(Boolean(draft.consent));
        setRequestContact(Boolean(draft.requestContact));
        setContactType(
          draft.contactType === "email" || draft.contactType === "telefono"
            ? draft.contactType
            : "telefono",
        );
        setContact(typeof draft.contact === "string" ? draft.contact : "");
        if (draft.step === "details" && draft.rating) setStep("details");
      } catch {
        sessionRemove(draftKey(slug));
      }
    }

    setSessionReady(true);
  }, [origin, slug]);

  useEffect(() => {
    if (!sessionReady || step === "handoff") return;
    sessionSet(
      draftKey(slug),
      JSON.stringify({
        rating,
        comment,
        name,
        aspects,
        consent,
        requestContact,
        contactType,
        contact,
        step,
      }),
    );
  }, [
    aspects,
    comment,
    consent,
    contact,
    contactType,
    name,
    rating,
    requestContact,
    sessionReady,
    slug,
    step,
  ]);

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

  useEffect(() => {
    if (!config || !submissionToken) return;
    trackPublicEvent({
      slug,
      token: submissionToken,
      event: "view",
      origin,
      once: true,
    });
  }, [config, origin, slug, submissionToken]);

  useEffect(() => {
    if (
      step !== "handoff" ||
      !config ||
      !submissionToken ||
      hasOpenedGoogle ||
      !config.auto_open_google ||
      (comment.trim() && copyState === "failed")
    ) {
      return;
    }

    const duration = Math.max(1200, Math.min(config.google_delay_ms, 12000));
    const startedAt = Date.now();
    setCountdown(Math.ceil(duration / 1000));

    const interval = window.setInterval(() => {
      const remaining = Math.max(0, duration - (Date.now() - startedAt));
      setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
    }, 200);

    const timeout = window.setTimeout(() => {
      trackPublicEvent({
        slug,
        token: submissionToken,
        event: "google_opened",
        origin,
        rating,
      });
      sessionSet(redirectKey(slug), "done");
      setHasOpenedGoogle(true);
      setCountdown(null);
      window.location.assign(config.google_review_url);
    }, duration);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [
    comment,
    config,
    copyState,
    hasOpenedGoogle,
    origin,
    rating,
    slug,
    step,
    submissionToken,
  ]);

  function selectRating(value: number) {
    setRating(value);
    setError(null);
    if (submissionToken) {
      trackPublicEvent({
        slug,
        token: submissionToken,
        event: "rating_selected",
        origin,
        rating: value,
      });
    }
  }

  function continueToDetails() {
    if (!rating) {
      setError("Selecciona una valoración antes de continuar.");
      return;
    }
    setError(null);
    setStep("details");
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (submissionToken) {
      trackPublicEvent({
        slug,
        token: submissionToken,
        event: "details_opened",
        origin,
        rating,
        once: true,
      });
    }
  }

  async function submitOpinion() {
    if (!config || sending) return;
    if (rating < 1) {
      setStep("rating");
      setError("Selecciona una valoración antes de continuar.");
      return;
    }
    if (!consent) {
      setError("Acepta el aviso de privacidad para enviar tu opinión.");
      return;
    }
    if (requestContact && !isValidContact(contactType, contact)) {
      setError(
        contactType === "email"
          ? "Introduce un correo válido para que puedan contactarte."
          : "Introduce un teléfono válido para que puedan contactarte.",
      );
      return;
    }

    setSending(true);
    setError(null);

    const token = submissionToken || createSubmissionToken(slug);
    if (!submissionToken) setSubmissionToken(token);
    const normalizedComment = comment.trim();
    const copyPromise = normalizedComment
      ? copyText(normalizedComment)
      : Promise.resolve(false);

    try {
      const response = await fetch(`/api/opiniones/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comentario: normalizedComment,
          nombreCliente: name.trim(),
          aspectos: aspects,
          origen: origin,
          consentimiento: consent,
          submissionToken: token,
          solicitaContacto: requestContact,
          contactoTipo: requestContact ? contactType : "ninguno",
          contacto: requestContact ? contact.trim() : "",
          website,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo enviar tu opinión.");
      }

      trackPublicEvent({
        slug,
        token,
        event: "submitted",
        origin,
        rating,
      });

      const copied = normalizedComment ? await copyPromise : false;
      const nextCopyState: CopyState = normalizedComment
        ? copied
          ? "copied"
          : "failed"
        : "empty";

      setCopyState(nextCopyState);
      trackPublicEvent({
        slug,
        token,
        event: copied ? "copy_succeeded" : "copy_failed",
        origin,
        rating,
      });

      sessionSet(
        completedKey(slug),
        JSON.stringify({
          rating,
          comment: normalizedComment,
          name: name.trim(),
          aspects,
          copyState: nextCopyState,
          completedAt: Date.now(),
        }),
      );
      sessionRemove(draftKey(slug));
      sessionRemove(redirectKey(slug));
      setHasOpenedGoogle(false);
      setStep("handoff");
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

  async function copyCommentAgain() {
    if (!comment.trim()) {
      setCopyState("empty");
      return false;
    }

    const copied = await copyText(comment.trim());
    const nextState: CopyState = copied ? "copied" : "failed";
    setCopyState(nextState);

    const completed = readCompletedSession(slug);
    if (completed) {
      sessionSet(
        completedKey(slug),
        JSON.stringify({ ...completed, copyState: nextState }),
      );
    }

    if (submissionToken) {
      trackPublicEvent({
        slug,
        token: submissionToken,
        event: copied ? "copy_succeeded" : "copy_failed",
        origin,
        rating,
      });
    }
    return copied;
  }

  async function openGoogle() {
    if (!config || !submissionToken) return;

    if (comment.trim() && copyState !== "copied") {
      await copyCommentAgain();
    }

    trackPublicEvent({
      slug,
      token: submissionToken,
      event: "google_opened",
      origin,
      rating,
    });
    sessionSet(redirectKey(slug), "done");
    setHasOpenedGoogle(true);
    setCountdown(null);
    window.location.assign(config.google_review_url);
  }

  function restartExperience() {
    [
      completedKey(slug),
      redirectKey(slug),
      draftKey(slug),
      tokenKey(slug),
      ...EVENTS_TO_CLEAR.map((event) => eventKey(slug, event)),
    ].forEach(sessionRemove);

    const nextToken = createSubmissionToken(slug);
    setSubmissionToken(nextToken);
    setRating(0);
    setHoverRating(0);
    setComment("");
    setName("");
    setAspects([]);
    setConsent(false);
    setWebsite("");
    setRequestContact(false);
    setContactType("telefono");
    setContact("");
    setCopyState("idle");
    setCountdown(null);
    setHasOpenedGoogle(false);
    setError(null);
    setStep("rating");
    window.scrollTo({ top: 0, behavior: "smooth" });

    trackPublicEvent({
      slug,
      token: nextToken,
      event: "view",
      origin,
      once: true,
    });
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
      className="relative min-h-screen overflow-hidden px-3 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-10"
      style={{ ...theme, background: config.color_background }}
    >
      <BackgroundDecoration primary={config.color_primary} />

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-2xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-white/70 bg-white/[0.96] shadow-[0_34px_110px_rgba(59,36,31,0.16)] backdrop-blur-xl sm:rounded-[2.4rem]">
          <div className="h-1.5 w-full" style={{ background: config.color_primary }} />
          <div className="px-5 py-6 sm:px-10 sm:py-9">
            <BrandHeader config={config} compact={step !== "rating"} />

            {step === "rating" && (
              <RatingStep
                config={config}
                rating={rating}
                hoverRating={hoverRating}
                onRatingChange={selectRating}
                onHoverRatingChange={setHoverRating}
                onContinue={continueToDetails}
              />
            )}

            {step === "details" && (
              <ReviewForm
                config={config}
                rating={rating}
                comment={comment}
                name={name}
                aspects={aspects}
                consent={consent}
                website={website}
                requestContact={requestContact}
                contactType={contactType}
                contact={contact}
                sending={sending}
                error={error}
                onCommentChange={setComment}
                onNameChange={setName}
                onAspectToggle={(aspect) =>
                  setAspects((current) => toggleAspect(current, aspect))
                }
                onConsentChange={(value) => {
                  setConsent(value);
                  if (value) setError(null);
                }}
                onWebsiteChange={setWebsite}
                onRequestContactChange={(value) => {
                  setRequestContact(value);
                  if (!value) setContact("");
                }}
                onContactTypeChange={(value) => {
                  setContactType(value);
                  setContact("");
                }}
                onContactChange={setContact}
                onBack={() => {
                  setError(null);
                  setStep("rating");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onSubmit={submitOpinion}
              />
            )}

            {step === "handoff" && (
              <ReviewHandoff
                config={config}
                rating={rating}
                comment={comment}
                copyState={copyState}
                countdown={countdown}
                hasOpenedGoogle={hasOpenedGoogle}
                onCopy={copyCommentAgain}
                onOpenGoogle={openGoogle}
                onRestart={restartExperience}
              />
            )}
          </div>
        </section>
      </div>

      <p className="relative mt-4 text-center text-[10px] font-semibold tracking-wide text-[#3b241f]/38">
        EXPERIENCIA SEGURA · GASTROHELP
      </p>
    </main>
  );
}

function BrandHeader({
  config,
  compact,
}: {
  config: PublicConfig;
  compact?: boolean;
}) {
  const logo = config.logo_url || "/brand/hispanos-grill-logo.svg";

  return (
    <header className={compact ? "mb-5 text-center" : "mb-6 text-center"}>
      <div
        className={`mx-auto flex items-center justify-center overflow-hidden rounded-[1.6rem] border border-black/[0.06] bg-[#fbfaf7] shadow-[0_12px_32px_rgba(59,36,31,0.09)] transition-all ${
          compact
            ? "h-20 w-20 p-1.5"
            : "h-28 w-28 p-2 sm:h-32 sm:w-32"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt={`Logo de ${config.restaurante_nombre}`}
          className="h-full w-full object-contain"
          decoding="async"
          onError={(event) => {
            const image = event.currentTarget;
            if (!image.src.endsWith("hispanos-grill-logo-vector.svg")) {
              image.src = "/brand/hispanos-grill-logo-vector.svg";
            }
          }}
        />
      </div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/75 px-3 py-1.5 text-[11px] font-bold text-[#3b241f]/65 shadow-sm">
        <Flame className="h-3.5 w-3.5" style={{ color: config.color_primary }} />
        {config.restaurante_nombre}
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
      <div className="text-center">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#1f5fbf]" />
        <p className="mt-4 text-sm font-semibold text-[#3b241f]/60">
          Preparando tu experiencia…
        </p>
      </div>
    </main>
  );
}

function UnavailableState({ message }: { message: string | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
      <section className="w-full max-w-md rounded-3xl border border-black/[0.06] bg-white p-8 text-center shadow-xl">
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
        className="absolute -left-24 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ background: `${primary}18` }}
      />
      <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-[#3b241f]/[0.07] blur-3xl" />
      <div
        className="absolute left-1/2 top-6 h-px w-56 -translate-x-1/2"
        style={{ background: `${primary}30` }}
      />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #3b241f 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}
