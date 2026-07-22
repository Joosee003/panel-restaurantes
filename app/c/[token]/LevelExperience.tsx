"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Crown, Gem, LockKeyhole, Medal, Sparkles, Trophy, X } from "lucide-react";

export type ClientLevelThresholds = {
  silver: number;
  gold: number;
  diamond: number;
  master: number;
};

type LevelKey = "bronze" | "silver" | "gold" | "diamond" | "master";

type LevelDefinition = {
  key: LevelKey;
  label: string;
  threshold: number;
  gradient: string;
  glow: string;
  text: string;
};

function levelIcon(key: LevelKey, className = "h-7 w-7") {
  if (key === "diamond") return <Gem className={className} />;
  if (key === "master") return <Crown className={className} />;
  if (key === "gold") return <Trophy className={className} />;
  return <Medal className={className} />;
}

function buildLevels(thresholds: ClientLevelThresholds): LevelDefinition[] {
  return [
    { key: "bronze", label: "Bronce", threshold: 0, gradient: "linear-gradient(135deg,#7c2d12,#f59e0b)", glow: "rgba(245,158,11,.34)", text: "Tu primera etapa en el club" },
    { key: "silver", label: "Plata", threshold: thresholds.silver, gradient: "linear-gradient(135deg,#64748b,#f8fafc 52%,#94a3b8)", glow: "rgba(148,163,184,.38)", text: "Ya eres cliente frecuente" },
    { key: "gold", label: "Oro", threshold: thresholds.gold, gradient: "linear-gradient(135deg,#a16207,#fde68a 50%,#f59e0b)", glow: "rgba(251,191,36,.42)", text: "Tu fidelidad ya destaca" },
    { key: "diamond", label: "Diamante", threshold: thresholds.diamond, gradient: "linear-gradient(135deg,#1d4ed8,#67e8f9 50%,#8b5cf6)", glow: "rgba(34,211,238,.42)", text: "Estás entre los clientes VIP" },
    { key: "master", label: "Maestro", threshold: thresholds.master, gradient: "linear-gradient(135deg,#4c1d95,#fbbf24 48%,#7c3aed)", glow: "rgba(168,85,247,.44)", text: "El nivel más exclusivo del club" },
  ];
}

export default function LevelExperience({
  customerKey,
  restaurantName,
  visits,
  points,
  rankingPosition,
  thresholds,
}: {
  customerKey: string;
  restaurantName: string;
  visits: number;
  points: number;
  rankingPosition: number | null;
  thresholds: ClientLevelThresholds;
}) {
  const levels = useMemo(() => buildLevels(thresholds), [thresholds]);
  const currentIndex = useMemo(() => {
    let index = 0;
    levels.forEach((level, levelIndex) => {
      if (visits >= level.threshold) index = levelIndex;
    });
    return index;
  }, [levels, visits]);

  const current = levels[currentIndex];
  const next = levels[currentIndex + 1] ?? null;
  const range = next ? Math.max(1, next.threshold - current.threshold) : 1;
  const completedInLevel = Math.max(0, visits - current.threshold);
  const progress = next ? Math.min(100, Math.round((completedInLevel / range) * 100)) : 100;
  const remaining = next ? Math.max(0, next.threshold - visits) : 0;
  const [showCelebration, setShowCelebration] = useState(false);

  useEffect(() => {
    const storageKey = `gastrohelp:customer-level:${customerKey}`;
    const previousRaw = window.localStorage.getItem(storageKey);
    const previous = previousRaw === null ? null : Number(previousRaw);

    if (previous !== null && Number.isFinite(previous) && currentIndex > previous) {
      setShowCelebration(true);
    }

    window.localStorage.setItem(storageKey, String(currentIndex));
  }, [currentIndex, customerKey]);

  return (
    <>
      <section className="relative overflow-hidden rounded-[36px] bg-slate-950 p-5 text-white shadow-[0_28px_90px_rgba(15,23,42,.28)] sm:p-6">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: current.glow }} />
        <div className="absolute -bottom-28 -left-24 h-60 w-60 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-white/70">
              <Sparkles className="h-3.5 w-3.5" /> Club {restaurantName}
            </div>
            {rankingPosition ? (
              <div className="rounded-full border border-white/10 bg-white/[.07] px-3 py-1.5 text-[10px] font-black uppercase tracking-[.12em] text-white/70">
                Puesto #{rankingPosition}
              </div>
            ) : null}
          </div>

          <div className="mt-7 grid items-center gap-6 sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="relative mx-auto">
              <div className="absolute inset-2 rounded-full blur-2xl" style={{ background: current.glow }} />
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full border border-white/25 shadow-2xl" style={{ background: current.gradient }}>
                <div className="absolute inset-2 rounded-full border border-white/25" />
                <div className="absolute inset-5 rounded-full border border-white/15" />
                <div className="relative drop-shadow-lg">{levelIcon(current.key, "h-14 w-14")}</div>
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-4 py-1.5 text-[11px] font-black uppercase tracking-[.16em] text-slate-950 shadow-xl">
                Nivel {current.label}
              </div>
            </div>

            <div className="text-center sm:text-left">
              <div className="text-[11px] font-black uppercase tracking-[.18em] text-white/45">Tu nivel actual</div>
              <h2 className="mt-2 text-4xl font-black tracking-[-.07em] !text-white sm:text-5xl">{current.label}</h2>
              <p className="mt-2 text-sm font-semibold text-white/60">{current.text}</p>

              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3">
                  <div className="text-2xl font-black">{visits}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-white/45">visitas</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[.06] p-3">
                  <div className="text-2xl font-black">{points}</div>
                  <div className="mt-1 text-[10px] font-black uppercase tracking-[.13em] text-white/45">puntos</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[.07] p-4 backdrop-blur-xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[.16em] text-white/45">Próximo objetivo</div>
                <div className="mt-1 text-lg font-black text-white">{next ? `Nivel ${next.label}` : "Nivel máximo alcanzado"}</div>
                <div className="mt-1 text-xs font-semibold text-white/55">
                  {next ? `${remaining} visita${remaining === 1 ? "" : "s"} para subir` : "Ya formas parte del nivel más exclusivo"}
                </div>
              </div>
              <div className="text-2xl font-black">{progress}%</div>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/25">
              <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%`, background: next?.gradient ?? current.gradient }} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-5 gap-1.5">
            {levels.map((level, index) => {
              const reached = index <= currentIndex;
              const active = index === currentIndex;
              return (
                <div key={level.key} className="min-w-0 text-center">
                  <div
                    className={`mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border transition ${active ? "scale-110 border-white/40 shadow-lg" : reached ? "border-white/20" : "border-white/5 bg-white/[.04] text-white/25"}`}
                    style={reached ? { background: level.gradient, boxShadow: active ? `0 10px 30px ${level.glow}` : undefined } : undefined}
                  >
                    {reached ? levelIcon(level.key, "h-5 w-5") : <LockKeyhole className="h-4 w-4" />}
                  </div>
                  <div className={`mt-2 truncate text-[9px] font-black uppercase tracking-[.08em] ${active ? "text-white" : "text-white/40"}`}>{level.label}</div>
                  <div className="mt-0.5 text-[8px] font-bold text-white/30">{level.threshold} visitas</div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowCelebration(true)}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[.08] px-4 py-3 text-xs font-black text-white transition active:scale-[.98]"
          >
            <Sparkles className="h-4 w-4" /> Ver mi medalla {current.label}
          </button>
        </div>
      </section>

      {showCelebration ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-slate-950/75 p-5 backdrop-blur-md">
          {Array.from({ length: 20 }).map((_, index) => (
            <span
              key={index}
              className="level-confetti absolute top-[-12%] h-3 w-2 rounded-sm"
              style={{
                left: `${4 + ((index * 37) % 92)}%`,
                background: ["#fbbf24", "#22d3ee", "#a78bfa", "#fb7185"][index % 4],
                animationDelay: `${(index % 7) * 0.12}s`,
                animationDuration: `${1.9 + (index % 5) * 0.22}s`,
              }}
            />
          ))}

          <div className="level-medal-enter relative w-full max-w-sm overflow-hidden rounded-[38px] border border-white/15 bg-slate-950 p-6 text-center text-white shadow-[0_30px_120px_rgba(0,0,0,.45)]">
            <button onClick={() => setShowCelebration(false)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/70">
              <X className="h-4 w-4" />
            </button>
            <div className="absolute inset-x-0 top-0 h-40 opacity-50 blur-3xl" style={{ background: current.glow }} />
            <div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full border border-white/25 shadow-2xl" style={{ background: current.gradient }}>
              <div className="absolute inset-3 rounded-full border border-white/25" />
              {levelIcon(current.key, "h-16 w-16")}
            </div>
            <div className="relative mt-7 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[.18em] text-white/70">
              <Check className="h-3.5 w-3.5" /> Nivel desbloqueado
            </div>
            <h2 className="relative mt-3 text-4xl font-black tracking-[-.07em] !text-white">¡Ya eres {current.label}!</h2>
            <p className="relative mt-2 text-sm font-semibold leading-relaxed text-white/60">Tu fidelidad te ha hecho subir de nivel. La nueva medalla ya forma parte de tu perfil.</p>
            <button onClick={() => setShowCelebration(false)} className="relative mt-6 w-full rounded-2xl bg-white px-5 py-3.5 text-sm font-black text-slate-950 shadow-xl">Ver mi nuevo nivel</button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        @keyframes medal-enter {
          0% { opacity: 0; transform: translateY(30px) scale(.72) rotate(-5deg); }
          65% { opacity: 1; transform: translateY(-8px) scale(1.04) rotate(1deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0); }
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120vh) rotate(760deg); opacity: .1; }
        }
        .level-medal-enter { animation: medal-enter .8s cubic-bezier(.16,1,.3,1) both; }
        .level-confetti { animation-name: confetti-fall; animation-timing-function: linear; animation-iteration-count: infinite; }
        @media (prefers-reduced-motion: reduce) {
          .level-medal-enter, .level-confetti { animation: none; }
        }
      `}</style>
    </>
  );
}
