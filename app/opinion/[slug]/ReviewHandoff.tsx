"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  Info,
  RotateCcw,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CopyState, PublicConfig } from "@/lib/opiniones/public-review";

export default function ReviewHandoff({
  config,
  rating,
  comment,
  copyState,
  countdown,
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
  const copyBlocked = hasComment && copyState === "failed";
  const automaticMessage = hasOpenedGoogle
    ? "Google ya se ha abierto. Puedes volver a abrirlo si todavía no terminaste."
    : copyBlocked
      ? "Primero copiaremos el comentario para que no tengas que escribirlo otra vez."
      : countdown
        ? `Abriremos Google automáticamente en ${countdown}…`
        : config.auto_open_google
          ? "Preparando el formulario oficial de Google…"
          : "Todo está preparado para continuar en Google.";

  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div
        className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: `${config.color_primary}14` }}
      >
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-[0_14px_34px_rgba(31,95,191,0.28)]"
          style={{ background: config.color_primary }}
        >
          <Check className="h-7 w-7" strokeWidth={2.7} />
        </div>
      </div>

      <h1
        className="mt-5 font-serif text-3xl font-semibold leading-tight sm:text-4xl"
        style={{ color: config.color_secondary }}
      >
        Tu opinión ya está guardada
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#3b241f]/60 sm:text-base">
        {config.restaurante_nombre} ya puede verla. Solo queda terminar la publicación en Google.
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

      <div className="mt-7 grid gap-3 text-left sm:grid-cols-3">
        <StatusCard
          icon={<CheckCircle2 />}
          title="Guardada"
          detail="El restaurante ya la tiene."
          primary={config.color_primary}
          complete
        />
        <StatusCard
          icon={copyState === "copied" ? <ClipboardCheck /> : <ClipboardCopy />}
          title={
            copyState === "copied"
              ? "Texto copiado"
              : copyState === "empty"
                ? "Sin texto"
                : "Pendiente de copiar"
          }
          detail={
            copyState === "copied"
              ? "Listo para pegar en Google."
              : copyState === "empty"
                ? "Solo elige las estrellas."
                : "Pulsa el botón para copiarlo."
          }
          primary={config.color_primary}
          complete={copyState === "copied" || copyState === "empty"}
        />
        <StatusCard
          icon={hasOpenedGoogle ? <CheckCircle2 /> : <ExternalLink />}
          title={hasOpenedGoogle ? "Google abierto" : "Siguiente paso"}
          detail={automaticMessage}
          primary={config.color_primary}
          complete={hasOpenedGoogle}
          loading={!hasOpenedGoogle && !copyBlocked}
        />
      </div>

      {hasComment && (
        <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-black/[0.06] bg-[#fbfaf7] text-left">
          <div className="flex items-center justify-between gap-3 border-b border-black/[0.05] px-4 py-3">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#3b241f]/45">
              Tu comentario
            </p>
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-extrabold"
              style={{
                background:
                  copyState === "copied"
                    ? `${config.color_primary}12`
                    : "rgba(59,36,31,.06)",
                color:
                  copyState === "copied"
                    ? config.color_primary
                    : "rgba(59,36,31,.55)",
              }}
            >
              {copyState === "copied" ? "COPIADO" : "LISTO"}
            </span>
          </div>
          <p className="max-h-36 overflow-auto whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-[#3b241f]/72">
            “{comment.trim()}”
          </p>
        </div>
      )}

      <div className="mt-5 rounded-[1.5rem] border border-black/[0.06] bg-white p-4 text-left shadow-[0_12px_34px_rgba(59,36,31,0.06)]">
        <p className="text-sm font-extrabold text-[#3b241f]">
          En Google solo faltan estos pasos
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          <Instruction
            number="1"
            primary={config.color_primary}
            text={
              <>
                Elige <strong>{rating} {rating === 1 ? "estrella" : "estrellas"}</strong>.
              </>
            }
          />
          <Instruction
            number="2"
            primary={config.color_primary}
            text={
              hasComment ? (
                <>Mantén pulsado en el campo y toca <strong>Pegar</strong>.</>
              ) : (
                <>El comentario es opcional.</>
              )
            }
          />
          <Instruction
            number="3"
            primary={config.color_primary}
            text={<>Pulsa <strong>Publicar</strong>.</>}
          />
        </ol>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-[#3b241f]/[0.045] px-4 py-3 text-left">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#3b241f]/45" />
        <p className="text-[11px] leading-5 text-[#3b241f]/52">
          Google exige que cada persona confirme las estrellas y pulse Publicar. Por eso te llevamos directamente a su formulario y dejamos el texto preparado.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenGoogle}
        className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
        style={{
          background: config.color_primary,
          boxShadow: `0 18px 40px ${config.color_primary}35`,
        }}
      >
        {copyBlocked
          ? "Copiar y abrir Google"
          : hasOpenedGoogle
            ? "Volver a abrir Google"
            : countdown
              ? `Abrir Google ahora · ${countdown}`
              : "Abrir Google"}
        <ExternalLink className="h-5 w-5" />
      </button>

      {hasComment && (
        <button
          type="button"
          onClick={onCopy}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-extrabold transition hover:-translate-y-0.5"
          style={{
            color: config.color_primary,
            borderColor: `${config.color_primary}40`,
          }}
        >
          {copyState === "copied" ? (
            <>
              <ClipboardCheck className="h-4 w-4" />
              Comentario copiado
            </>
          ) : (
            <>
              <ClipboardCopy className="h-4 w-4" />
              Copiar comentario
            </>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={onRestart}
        className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-[#3b241f]/42 underline-offset-4 hover:underline"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Crear una opinión nueva
      </button>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  detail,
  primary,
  complete,
  loading,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  primary: string;
  complete?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-[#fbfaf7] p-4 text-center sm:text-left">
      <div
        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full sm:mx-0 [&_svg]:h-5 [&_svg]:w-5 ${loading ? "animate-pulse" : ""}`}
        style={{
          background: complete ? `${primary}16` : "rgba(59,36,31,.06)",
          color: complete || loading ? primary : "rgba(59,36,31,.48)",
        }}
      >
        {icon}
      </div>
      <p className="mt-3 text-sm font-extrabold text-[#3b241f]">{title}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#3b241f]/52">{detail}</p>
    </div>
  );
}

function Instruction({
  number,
  primary,
  text,
}: {
  number: string;
  primary: string;
  text: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl bg-[#fbfaf7] p-3 text-xs leading-5 text-[#3b241f]/65">
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
        style={{ background: primary }}
      >
        {number}
      </span>
      <span>{text}</span>
    </li>
  );
}
