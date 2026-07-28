"use client";

import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import OpinionExperienceV2 from "./OpinionExperienceV2";

export default function HispanosOpinionExperience({ slug }: { slug: string }) {
  return (
    <div className="hispanos-public relative min-h-screen overflow-hidden bg-[#062b5c]">
      <div className="fixed inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={HISPANOS_BRAND.hero}
          alt="Interior real de Hispanos Grill"
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(4,31,68,.96)_0%,rgba(6,43,92,.84)_46%,rgba(21,89,182,.62)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,.16),transparent_34%)]" />
      </div>

      <div className="pointer-events-none fixed left-4 top-4 z-20 hidden items-center gap-3 rounded-2xl border border-white/20 bg-[#041f44]/75 p-2 pr-4 text-white shadow-2xl backdrop-blur-2xl sm:flex">
        <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-white p-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HISPANOS_BRAND.logo}
            alt="Logo oficial de Hispanos Grill"
            className="h-full w-full object-contain"
          />
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.18em] text-blue-200">
            Opinión privada
          </p>
          <p className="text-sm font-black">Hispanos Grill</p>
        </div>
      </div>

      <OpinionExperienceV2 slug={slug} />

      <style jsx global>{`
        .hispanos-public > main {
          background: transparent !important;
        }
        .hispanos-public > main > div:nth-child(1) {
          opacity: 0 !important;
        }
        .hispanos-public main section {
          border-color: rgba(255, 255, 255, 0.72) !important;
          background: rgba(255, 255, 255, 0.96) !important;
          box-shadow: 0 38px 120px rgba(1, 20, 49, 0.4) !important;
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
          color: rgba(255, 255, 255, 0.72) !important;
          text-shadow: 0 1px 12px rgba(0, 0, 0, 0.4);
        }
      `}</style>
    </div>
  );
}
