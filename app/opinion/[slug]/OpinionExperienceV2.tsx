"use client";

import {
  ArrowRight,
  ExternalLink,
  Flame,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import ReviewForm from "./ReviewForm";
import ReviewHandoff from "./ReviewHandoff";
import {
  allowedOrigins,
  completedKey,
  copyText,
  createSubmissionToken,
  draftKey,
  readCompletedSession,
  redirectKey,
  sessionGet,
  sessionRemove,
  sessionSet,
  toggleHighlight,
  tokenKey,
  type CopyState,
  type PublicConfig,
  type ReviewStep,
} from "@/lib/opiniones/public-review";

export default function OpinionExperienceV2({ slug }: { slug: string }) {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [step, setStep] = useState<ReviewStep>("intro");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
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
    const completed = readCompletedSession(slug);
    if (completed) {
      setRating(completed.rating);
      setComment(completed.comment);
      setName(completed.name);
      setCopyState(completed.copyState);
      setHasOpenedGoogle(sessionGet(redirectKey(slug)) === "done");
      setStep("handoff");
      setSessionReady(true);
      return;
    }

    const draftRaw = sessionGet(draftKey(slug));
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw) as {
          rating?: number; comment?: string; name?: string; consent?: boolean; step?: ReviewStep;
        };
        setRating(Number.isInteger(draft.rating) ? Number(draft.rating) : 0);
        setComment(typeof draft.comment === "string" ? draft.comment : "");
        setName(typeof draft.name === "string" ? draft.name : "");
        setConsent(Boolean(draft.consent));
        if (draft.step === "form") setStep("form");
      } catch {
        sessionRemove(draftKey(slug));
      }
    }
    setSessionReady(true);
  }, [slug]);

  useEffect(() => {
    if (!sessionReady || step === "handoff") return;
    sessionSet(draftKey(slug), JSON.stringify({ rating, comment, name, consent, step }));
  }, [comment, consent, name, rating, sessionReady, slug, step]);

  useEffect(() => {
    let cancelled = false;
    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/opiniones/${encodeURIComponent(slug)}`);
        const payload = (await response.json()) as { config?: PublicConfig; error?: string };
        if (!response.ok || !payload.config) throw new Error(payload.error ?? "No se pudo cargar esta página.");
        if (!cancelled) setConfig(payload.config);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "No se pudo cargar esta página.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadConfig();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (step !== "handoff" || !config || hasOpenedGoogle) return;
    const duration = 2200;
    const startedAt = Date.now();
    setCountdown(3);
    const interval = window.setInterval(() => {
      const remaining = Math.max(0, duration - (Date.now() - startedAt));
      setCountdown(Math.max(1, Math.ceil(remaining / 1000)));
    }, 200);
    const timeout = window.setTimeout(() => {
      sessionSet(redirectKey(slug), "done");
      setHasOpenedGoogle(true);
      setCountdown(null);
      window.location.assign(config.google_review_url);
    }, duration);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [config, hasOpenedGoogle, slug, step]);

  async function submitOpinion() {
    if (!config || sending) return;
    if (rating < 1) return setError("Selecciona una valoración antes de continuar.");
    if (!consent) return setError("Acepta el aviso de privacidad para enviar tu opinión.");

    setSending(true);
    setError(null);
    const normalizedComment = comment.trim();
    const copyPromise = normalizedComment ? copyText(normalizedComment) : Promise.resolve(false);

    try {
      const response = await fetch(`/api/opiniones/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          comentario: normalizedComment,
          nombreCliente: name.trim(),
          origen: origin,
          consentimiento: consent,
          submissionToken: createSubmissionToken(slug),
          website,
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo enviar tu opinión.");

      const copied = normalizedComment ? await copyPromise : false;
      const nextCopyState: CopyState = normalizedComment ? (copied ? "copied" : "failed") : "empty";
      setCopyState(nextCopyState);
      sessionSet(completedKey(slug), JSON.stringify({
        rating, comment: normalizedComment, name: name.trim(), copyState: nextCopyState, completedAt: Date.now(),
      }));
      sessionRemove(draftKey(slug));
      sessionRemove(tokenKey(slug));
      sessionRemove(redirectKey(slug));
      setHasOpenedGoogle(false);
      setStep("handoff");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "No se pudo enviar tu opinión.");
    } finally {
      setSending(false);
    }
  }

  async function copyCommentAgain() {
    if (!comment.trim()) return setCopyState("empty");
    const copied = await copyText(comment.trim());
    const nextState: CopyState = copied ? "copied" : "failed";
    setCopyState(nextState);
    const completed = readCompletedSession(slug);
    if (completed) sessionSet(completedKey(slug), JSON.stringify({ ...completed, copyState: nextState }));
  }

  function openGoogle() {
    if (!config) return;
    sessionSet(redirectKey(slug), "done");
    setHasOpenedGoogle(true);
    setCountdown(null);
    window.location.assign(config.google_review_url);
  }

  function restartExperience() {
    [completedKey(slug), redirectKey(slug), draftKey(slug), tokenKey(slug)].forEach(sessionRemove);
    setRating(0); setHoverRating(0); setComment(""); setName(""); setConsent(false); setWebsite("");
    setCopyState("idle"); setCountdown(null); setHasOpenedGoogle(false); setError(null); setStep("intro");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (loading) return <LoadingState />;
  if (!config || error?.includes("no está disponible")) return <UnavailableState message={error} />;

  const theme = {
    "--brand-primary": config.color_primary,
    "--brand-secondary": config.color_secondary,
    "--brand-bg": config.color_background,
  } as CSSProperties;

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-5 sm:px-6 sm:py-10"
      style={{ ...theme, background: config.color_background }}>
      <BackgroundDecoration primary={config.color_primary} />
      <div className="relative mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-black/5 bg-white/95 shadow-[0_30px_100px_rgba(59,36,31,0.14)] backdrop-blur">
          <div className="h-2 w-full" style={{ background: config.color_primary }} />
          <div className="px-5 py-6 sm:px-10 sm:py-9">
            <BrandHeader config={config} compact={step === "form"} />
            {step === "intro" && <IntroStep config={config} onContinue={() => { setError(null); setStep("form"); }} />}
            {step === "form" && <ReviewForm
              config={config} rating={rating} hoverRating={hoverRating} comment={comment} name={name}
              consent={consent} website={website} sending={sending} error={error}
              onRatingChange={(value) => { setRating(value); setError(null); }}
              onHoverRatingChange={setHoverRating} onCommentChange={setComment} onNameChange={setName}
              onConsentChange={(value) => { setConsent(value); if (value) setError(null); }}
              onWebsiteChange={setWebsite} onHighlightToggle={(phrase) => setComment((value) => toggleHighlight(value, phrase))}
              onSubmit={submitOpinion} />}
            {step === "handoff" && <ReviewHandoff
              config={config} rating={rating} comment={comment} copyState={copyState} countdown={countdown}
              hasOpenedGoogle={hasOpenedGoogle} onCopy={copyCommentAgain} onOpenGoogle={openGoogle}
              onRestart={restartExperience} />}
          </div>
        </section>
      </div>
      <p className="relative mt-4 text-center text-[11px] font-medium text-[#3b241f]/45">Sistema de opiniones gestionado por GastroHelp</p>
    </main>
  );
}

function BrandHeader({ config, compact }: { config: PublicConfig; compact?: boolean }) {
  const logo = config.logo_url || "/brand/hispanos-grill-logo.svg";
  return (
    <header className={compact ? "mb-5 text-center" : "mb-7 text-center"}>
      <div className={`mx-auto flex items-center justify-center overflow-hidden rounded-3xl border border-black/5 bg-[#fbfaf7] shadow-sm ${compact ? "h-20 w-20 p-1.5" : "h-28 w-28 p-2 sm:h-32 sm:w-32"}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt={`Logo de ${config.restaurante_nombre}`} className="h-full w-full object-contain" decoding="async"
          onError={(event) => {
            const image = event.currentTarget;
            if (!image.src.endsWith("hispanos-grill-logo-vector.svg")) image.src = "/brand/hispanos-grill-logo-vector.svg";
          }} />
      </div>
      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-[#3b241f]/70">
        <Flame className="h-3.5 w-3.5" style={{ color: config.color_primary }} />Sabor casero y brasa de verdad
      </div>
    </header>
  );
}

function IntroStep({ config, onContinue }: { config: PublicConfig; onContinue: () => void }) {
  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold"
        style={{ background: `${config.color_primary}12`, color: config.color_primary }}>
        <Sparkles className="h-3.5 w-3.5" />Solo tardarás unos segundos
      </div>
      <h1 className="text-balance font-serif text-3xl font-semibold leading-tight sm:text-4xl" style={{ color: config.color_secondary }}>{config.headline}</h1>
      <p className="mx-auto mt-4 max-w-md text-base leading-7 text-[#3b241f]/65">{config.subheadline}</p>
      <div className="mt-7 grid grid-cols-3 gap-2.5 sm:gap-3">
        <TrustPoint icon={<MessageCircle />} label="Menos de 30 segundos" />
        <TrustPoint icon={<ShieldCheck />} label="Se envía al restaurante" />
        <TrustPoint icon={<ExternalLink />} label="Después abrimos Google" />
      </div>
      <button type="button" onClick={onContinue}
        className="mt-8 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
        style={{ background: config.color_primary, boxShadow: `0 18px 36px ${config.color_primary}33` }}>
        Compartir mi experiencia<ArrowRight className="h-5 w-5" />
      </button>
      <p className="mx-auto mt-4 max-w-sm text-xs leading-5 text-[#3b241f]/45">
        Al enviarla, guardaremos tu opinión y abriremos Google para que elijas las mismas estrellas, pegues tu comentario y pulses Publicar.
      </p>
    </div>
  );
}

function TrustPoint({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] px-2 py-3.5 text-center">
    <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#1f5fbf]/10 text-[#1f5fbf] [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
    <p className="mt-2 text-[10px] font-semibold leading-4 text-[#3b241f]/65 sm:text-[11px]">{label}</p>
  </div>;
}

function LoadingState() {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6"><div className="text-center">
    <Loader2 className="mx-auto h-10 w-10 animate-spin text-[#1f5fbf]" />
    <p className="mt-4 text-sm font-medium text-[#3b241f]/65">Preparando tu experiencia…</p>
  </div></main>;
}

function UnavailableState({ message }: { message: string | null }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-6">
    <section className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 text-center shadow-xl">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#1f5fbf]/10 text-[#1f5fbf]"><MessageCircle className="h-6 w-6" /></div>
      <h1 className="mt-5 font-serif text-2xl font-semibold text-[#3b241f]">Página no disponible</h1>
      <p className="mt-3 text-sm leading-6 text-[#3b241f]/60">{message ?? "No hemos podido cargar este sistema de opiniones."}</p>
    </section>
  </main>;
}

function BackgroundDecoration({ primary }: { primary: string }) {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0">
    <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ background: `${primary}16` }} />
    <div className="absolute -bottom-24 -right-20 h-80 w-80 rounded-full bg-[#3b241f]/[0.06] blur-3xl" />
    <div className="absolute left-1/2 top-10 h-px w-40 -translate-x-1/2" style={{ background: `${primary}35` }} />
  </div>;
}
