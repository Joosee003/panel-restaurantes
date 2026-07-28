"use client";

import { CheckCircle2, Clock3, ShieldCheck, Sparkles, Star } from "lucide-react";
import type { ReactNode } from "react";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import OpinionExperienceV2 from "./OpinionExperienceV2";

export default function HispanosOpinionExperience({ slug }: { slug: string }) {
  return (
    <div className="hispanos-public relative min-h-screen overflow-hidden bg-[#031b3b]">
      <div className="fixed inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HISPANOS_BRAND.hero}
          alt="Interior real de Hispanos Grill"
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(106deg,rgba(3,27,59,.98)_0%,rgba(6,43,92,.94)_38%,rgba(6,43,92,.73)_58%,rgba(3,27,59,.58)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_12%,rgba(83,168,255,.28),transparent_32%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(1,15,36,.76),transparent_48%)]" />
      </div>

      <aside className="pointer-events-none fixed inset-y-0 left-0 z-10 hidden w-[46%] p-7 xl:block 2xl:p-10">
        <div className="flex h-full flex-col justify-between rounded-[2.8rem] border border-white/15 bg-[#031b3b]/38 p-8 text-white shadow-[0_42px_120px_rgba(0,0,0,.28)] backdrop-blur-[10px] 2xl:p-11">
          <div>
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-[1.6rem] border border-white/30 bg-white p-2 shadow-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={HISPANOS_BRAND.logo} alt="Logo oficial de Hispanos Grill" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.22em] text-blue-200">Experiencia oficial</p>
                <h1 className="mt-1 text-2xl font-black tracking-tight">Hispanos Grill</h1>
              </div>
            </div>

            <div className="mt-16 max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100 backdrop-blur-xl">
                <Sparkles className="h-3.5 w-3.5" /> Tu opinión nos hace mejores
              </div>
              <h2 className="mt-5 text-balance text-5xl font-black leading-[1.02] tracking-[-.045em] 2xl:text-6xl">
                Cuéntanos cómo ha sido tu visita.
              </h2>
              <p className="mt-5 max-w-lg text-base font-semibold leading-7 text-blue-100/88">
                Son solo unos segundos. Tu opinión llega directamente al equipo de Hispanos Grill y nos ayuda a cuidar cada mesa, cada plato y cada detalle.
              </p>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              <PromiseCard icon={<Clock3 />} title="30 segundos" text="Rápido y sencillo" />
              <PromiseCard icon={<ShieldCheck />} title="Directo" text="Llega al restaurante" />
              <PromiseCard icon={<Star />} title="Tu experiencia" text="Es lo importante" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6 border-t border-white/15 pt-6">
            <div className="flex items-center gap-3 text-xs font-bold text-blue-100/80">
              <CheckCircle2 className="h-4 w-4 text-blue-300" /> Sistema privado y seguro
            </div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-white/55">Powered by GastroHelp</p>
          </div>
        </div>
      </aside>

      <div className="pointer-events-none fixed left-4 top-4 z-20 flex items-center gap-3 rounded-2xl border border-white/20 bg-[#041f44]/80 p-2 pr-4 text-white shadow-2xl backdrop-blur-2xl xl:hidden">
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HISPANOS_BRAND.logo} alt="Logo oficial de Hispanos Grill" className="h-full w-full object-contain" />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-blue-200">Opinión oficial</p>
          <p className="text-sm font-black">Hispanos Grill</p>
        </div>
      </div>

      <OpinionExperienceV2 slug={slug} />

      <style jsx global>{`
        .hispanos-public > main {
          position: relative;
          z-index: 12;
          background: transparent !important;
        }
        .hispanos-public > main > div:nth-child(1) {
          opacity: 0 !important;
        }
        .hispanos-public main section {
          border-color: rgba(255, 255, 255, 0.82) !important;
          background: rgba(255, 255, 255, 0.975) !important;
          box-shadow: 0 42px 130px rgba(1, 20, 49, 0.48) !important;
        }
        .hispanos-public main section > div:first-child {
          background: linear-gradient(90deg, #062b5c, #2478d4) !important;
        }
        .hispanos-public main button,
        .hispanos-public main a {
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .hispanos-public main button:hover,
        .hispanos-public main a:hover {
          transform: translateY(-1px);
        }
        .hispanos-public main > p {
          color: rgba(255, 255, 255, 0.74) !important;
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.45);
        }
        @media (min-width: 1280px) {
          .hispanos-public > main {
            width: 54%;
            margin-left: 46%;
            padding-left: 2rem !important;
            padding-right: 2.5rem !important;
          }
          .hispanos-public > main > div:nth-child(2) {
            max-width: 44rem !important;
          }
        }
        @media (max-width: 1279px) {
          .hispanos-public > main {
            padding-top: 5.8rem !important;
          }
        }
      `}</style>
    </div>
  );
}

function PromiseCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/14 bg-white/[.075] p-4 backdrop-blur-xl">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-blue-100 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <p className="mt-3 text-xs font-black text-white">{title}</p>
      <p className="mt-1 text-[10px] font-semibold text-blue-100/65">{text}</p>
    </div>
  );
}
