"use client";

import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  RotateCcw,
  Star,
} from "lucide-react";
import type { ReactNode } from "react";
import type { CopyState, PublicConfig } from "@/lib/opiniones/public-review";

export default function ReviewHandoff({
  config, rating, comment, copyState, countdown, hasOpenedGoogle,
  onCopy, onOpenGoogle, onRestart,
}: {
  config: PublicConfig;
  rating: number;
  comment: string;
  copyState: CopyState;
  countdown: number | null;
  hasOpenedGoogle: boolean;
  onCopy: () => void;
  onOpenGoogle: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="animate-[fadeIn_.35s_ease-out] text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full"
        style={{ background: `${config.color_primary}14` }}>
        <div className="flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
          style={{ background: config.color_primary }}>
          <Check className="h-7 w-7" strokeWidth={2.5} />
        </div>
      </div>

      <div className="mt-5 flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#3b241f]/45">
        <span className="h-px w-8 bg-[#3b241f]/10" />Paso 2 de 2<span className="h-px w-8 bg-[#3b241f]/10" />
      </div>
      <h1 className="mt-3 font-serif text-3xl font-semibold sm:text-4xl" style={{ color: config.color_secondary }}>
        ¡Opinión enviada!
      </h1>
      <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#3b241f]/65">
        Ya ha llegado a {config.restaurante_nombre}. Ahora te ayudamos a terminar la publicación en Google.
      </p>

      <div className="mt-5 flex justify-center gap-1" aria-label={`${rating} estrellas`}>
        {[1, 2, 3, 4, 5].map((value) => (
          <Star key={value} className="h-6 w-6" fill={value <= rating ? "#f4b942" : "transparent"}
            stroke={value <= rating ? "#f4b942" : "#d9d3cc"} />
        ))}
      </div>
      <p className="mt-1 text-sm font-bold" style={{ color: config.color_primary }}>
        Marcaste {rating} {rating === 1 ? "estrella" : "estrellas"}
      </p>

      <div className="mt-7 space-y-3 text-left">
        <StatusRow icon={<CheckCircle2 />} title="Opinión guardada"
          detail="Hispanos Grill ya puede verla en su panel." primary={config.color_primary} complete />
        <StatusRow icon={copyState === "copied" ? <ClipboardCheck /> : <ClipboardCopy />}
          title={copyState === "copied" ? "Comentario copiado" : copyState === "empty" ? "Sin comentario que copiar" : "Pulsa para copiar el comentario"}
          detail={copyState === "copied" ? "En Google, mantén pulsado en el cuadro de texto y toca Pegar."
            : copyState === "empty" ? "En Google solo tendrás que seleccionar las estrellas y publicar."
            : "Tu opinión está segura; puedes copiar el texto con el botón inferior."}
          primary={config.color_primary} complete={copyState === "copied" || copyState === "empty"} />
        <StatusRow icon={hasOpenedGoogle ? <CheckCircle2 /> : <ExternalLink />}
          title={hasOpenedGoogle ? "Google ya se ha abierto" : "Abriendo Google"}
          detail={hasOpenedGoogle ? "Si no terminaste la reseña, puedes abrirlo otra vez."
            : countdown ? `Te llevamos automáticamente en ${countdown}…` : "Preparando el formulario de reseña."}
          primary={config.color_primary} complete={hasOpenedGoogle} loading={!hasOpenedGoogle} />
      </div>

      {comment.trim() && (
        <div className="mt-5 rounded-3xl border border-black/5 bg-[#fbfaf7] p-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3b241f]/45">Texto preparado</p>
            {copyState === "copied" && <span className="rounded-full px-2.5 py-1 text-[10px] font-bold"
              style={{ background: `${config.color_primary}12`, color: config.color_primary }}>Copiado</span>}
          </div>
          <p className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap text-sm leading-6 text-[#3b241f]/70">“{comment.trim()}”</p>
        </div>
      )}

      <div className="mt-6 rounded-3xl border border-black/5 bg-white p-4 text-left shadow-sm">
        <p className="text-sm font-bold text-[#3b241f]">En Google solo faltan 3 pasos:</p>
        <ol className="mt-3 space-y-3 text-sm text-[#3b241f]/65">
          <li className="flex gap-3"><StepNumber value="1" primary={config.color_primary} />
            <span>Elige <strong>{rating} {rating === 1 ? "estrella" : "estrellas"}</strong>.</span></li>
          <li className="flex gap-3"><StepNumber value="2" primary={config.color_primary} />
            <span>{comment.trim() ? "Mantén pulsado en el comentario y toca Pegar." : "Añade un comentario si quieres; este paso es opcional."}</span></li>
          <li className="flex gap-3"><StepNumber value="3" primary={config.color_primary} />
            <span>Pulsa <strong>Publicar</strong>.</span></li>
        </ol>
      </div>

      <button type="button" onClick={onOpenGoogle}
        className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
        style={{ background: config.color_primary, boxShadow: `0 18px 36px ${config.color_primary}33` }}>
        {hasOpenedGoogle ? "Volver a abrir Google" : "Abrir Google ahora"}<ExternalLink className="h-5 w-5" />
      </button>

      {comment.trim() && (
        <button type="button" onClick={onCopy}
          className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 bg-white px-4 text-sm font-semibold transition hover:-translate-y-0.5"
          style={{ color: config.color_primary, borderColor: `${config.color_primary}45` }}>
          {copyState === "copied" ? <><ClipboardCheck className="h-4 w-4" />Comentario copiado</>
            : <><ClipboardCopy className="h-4 w-4" />Copiar comentario</>}
        </button>
      )}

      <button type="button" onClick={onRestart}
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#3b241f]/45 underline-offset-4 hover:underline">
        <RotateCcw className="h-3.5 w-3.5" />Reiniciar esta pantalla
      </button>
    </div>
  );
}

function StatusRow({ icon, title, detail, primary, complete, loading }: {
  icon: ReactNode; title: string; detail: string; primary: string; complete?: boolean; loading?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-black/5 bg-[#fbfaf7] p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full [&_svg]:h-5 [&_svg]:w-5 ${loading ? "animate-pulse" : ""}`}
        style={{ background: complete ? `${primary}16` : "rgba(59,36,31,.06)", color: complete || loading ? primary : "rgba(59,36,31,.55)" }}>
        {icon}
      </div>
      <div><p className="text-sm font-bold text-[#3b241f]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[#3b241f]/55">{detail}</p></div>
    </div>
  );
}

function StepNumber({ value, primary }: { value: string; primary: string }) {
  return <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
    style={{ background: primary }}>{value}</span>;
}
