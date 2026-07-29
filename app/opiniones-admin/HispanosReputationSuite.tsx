"use client";

import {
  ExternalLink,
  Globe2,
  Instagram,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Star,
  UtensilsCrossed,
} from "lucide-react";
import type { ReactNode } from "react";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import ReputationElite from "./ReputationElite";

export default function HispanosReputationSuite() {
  return (
    <div className="hispanos-suite min-h-screen bg-[#edf4fb] text-[#10233d]">
      <header className="sticky top-0 z-50 border-b border-blue-950/10 bg-white/88 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1550px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-white p-1 shadow-lg shadow-blue-950/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={HISPANOS_BRAND.logo} alt="Logo oficial de Hispanos Grill" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[.22em] text-[#1559b6]">GastroHelp Reputation</p>
              <p className="truncate text-base font-black text-[#10233d] sm:text-lg">Hispanos Grill</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-emerald-700 lg:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,.12)]" /> Sistema activo
            </span>
            <a href={HISPANOS_BRAND.instagram} target="_blank" rel="noreferrer" className="hidden h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-[#1559b6] transition hover:-translate-y-0.5 hover:shadow-md md:flex">
              <Instagram className="h-4 w-4" /> Instagram
            </a>
            <a href={HISPANOS_BRAND.googleMaps} target="_blank" rel="noreferrer" className="flex h-10 items-center gap-2 rounded-xl bg-[#1559b6] px-3 text-xs font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-[#0d478f]">
              <MapPin className="h-4 w-4" /> <span className="hidden sm:inline">Google Maps</span><ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <section className="px-3 pt-4 sm:px-6 sm:pt-6">
        <div className="relative mx-auto max-w-[1550px] overflow-hidden rounded-[2.6rem] border border-white/20 bg-[#031b3b] text-white shadow-[0_38px_110px_rgba(6,43,92,.28)]">
          <div className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={HISPANOS_BRAND.hero} alt="Interior real de Hispanos Grill" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-[linear-gradient(96deg,rgba(3,27,59,.99)_0%,rgba(6,43,92,.94)_42%,rgba(6,43,92,.58)_68%,rgba(3,27,59,.26)_100%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(1,15,36,.76),transparent_54%)]" />
            <div className="absolute right-[10%] top-[-25%] h-96 w-96 rounded-full bg-blue-300/20 blur-3xl" />
          </div>

          <div className="relative grid min-h-[430px] gap-10 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[minmax(0,1fr)_480px] lg:items-center lg:px-12 lg:py-12">
            <div className="max-w-3xl">
              <div className="flex items-center gap-4">
                <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[1.8rem] border border-white/30 bg-white p-2 shadow-2xl sm:h-28 sm:w-28">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={HISPANOS_BRAND.logo} alt="Hispanos Grill" className="h-full w-full object-contain" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100 backdrop-blur-xl">
                    <ShieldCheck className="h-3.5 w-3.5" /> Centro privado de reputación
                  </div>
                  <h1 className="mt-3 text-4xl font-black tracking-[-.04em] sm:text-6xl">Hispanos Grill</h1>
                </div>
              </div>

              <h2 className="mt-8 max-w-2xl text-balance text-2xl font-black leading-tight text-white sm:text-4xl">Todo lo que tus clientes sienten, convertido en decisiones claras.</h2>
              <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-blue-100/90 sm:text-base">Opiniones, evolución, insights y materiales listos para imprimir. Sin menús complicados y sin perder tiempo.</p>

              <div className="mt-7 flex flex-wrap gap-3">
                <a href={HISPANOS_BRAND.googleMaps} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#062b5c] shadow-xl transition hover:-translate-y-0.5">
                  <MapPin className="h-4 w-4 text-[#1559b6]" /> Ver ficha de Google <ExternalLink className="h-4 w-4" />
                </a>
                <a href={HISPANOS_BRAND.website} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/20">
                  <Globe2 className="h-4 w-4" /> Web del restaurante
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-blue-100/85">
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {HISPANOS_BRAND.contact.address}</span>
                <a href={`tel:${HISPANOS_BRAND.contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-white"><Phone className="h-4 w-4" /> {HISPANOS_BRAND.contact.phone}</a>
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-2 gap-3">
                <PhotoCard src={HISPANOS_BRAND.hero} label="Interior" className="col-span-2 aspect-[16/8]" />
                <PhotoCard src={HISPANOS_BRAND.food[0]} label="Cocina" className="aspect-square" />
                <div className="flex aspect-square flex-col justify-between rounded-[1.8rem] border border-white/18 bg-[#041f44]/76 p-5 shadow-2xl backdrop-blur-2xl">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-blue-100"><Sparkles className="h-5 w-5" /></div>
                  <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-200">Centro de control</p><p className="mt-2 text-2xl font-black">Visible en segundos.</p><p className="mt-2 text-xs font-semibold leading-5 text-blue-100/72">Lo importante aparece primero. El resto está a un clic.</p></div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3"><Signal icon={<Star />} label="Opiniones" /><Signal icon={<UtensilsCrossed />} label="Insights" /><Signal icon={<Sparkles />} label="Materiales" /></div>
            </div>
          </div>
        </div>
      </section>

      <ReputationElite />

      <style jsx global>{`
        .hispanos-suite > main > header { display: none !important; }
        .hispanos-suite > main { min-height: auto !important; background: #edf4fb !important; color: #10233d !important; }
        .hispanos-suite > main > div { padding-top: 1.25rem !important; padding-bottom: 2.5rem !important; }
        .hispanos-suite > main > div > section:first-child { display: none !important; }
        .hispanos-suite > main nav { position: sticky; top: 73px; z-index: 35; border: 1px solid rgba(21,89,182,.13) !important; border-radius: 1.25rem !important; box-shadow: 0 16px 46px rgba(6,43,92,.09) !important; backdrop-filter: blur(20px); }
        .hispanos-suite > main nav button { transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease; }
        .hispanos-suite > main nav button:hover { transform: translateY(-1px); }
        .hispanos-suite > main article, .hispanos-suite > main section { border-color: rgba(21,89,182,.12) !important; }
        .hispanos-suite > main article { box-shadow: 0 16px 50px rgba(6,43,92,.055); }
        .hispanos-suite > main article:hover { box-shadow: 0 22px 58px rgba(6,43,92,.095); }
        .hispanos-suite > main button.mb-3.flex.w-full.justify-between:first-of-type { display: none !important; }
        @media (max-width: 640px) { .hispanos-suite > main nav { top: 73px; } }
      `}</style>
    </div>
  );
}

function PhotoCard({ src, label, className }: { src: string; label: string; className?: string }) {
  return <div className={`group relative overflow-hidden rounded-[1.8rem] border border-white/18 bg-white/10 shadow-2xl ${className ?? ""}`}><img src={src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#031b3b]/78 via-transparent to-transparent" /><span className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-[#031b3b]/55 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.16em] text-white backdrop-blur-xl">{label}</span></div>;
}

function Signal({ icon, label }: { icon: ReactNode; label: string }) {
  return <div className="flex items-center gap-2 rounded-2xl border border-white/14 bg-white/[.07] px-3 py-3 text-blue-100 backdrop-blur-xl"><span className="grid h-8 w-8 place-items-center rounded-xl bg-white/[.08] [&_svg]:h-4 [&_svg]:w-4">{icon}</span><p className="text-[9px] font-black uppercase tracking-wide">{label}</p></div>;
}
