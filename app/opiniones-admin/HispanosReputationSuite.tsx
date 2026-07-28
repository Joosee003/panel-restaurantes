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
} from "lucide-react";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import ReputationElite from "./ReputationElite";

const googleMapsUrl = "https://maps.app.goo.gl/7yQWWwVW6nxZz4NbA?g_st=ic";

export default function HispanosReputationSuite() {
  return (
    <div className="hispanos-suite min-h-screen bg-[#edf4fb] text-[#10233d]">
      <header className="sticky top-0 z-50 border-b border-white/70 bg-white/90 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1550px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-blue-100 bg-white p-1 shadow-lg shadow-blue-950/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={HISPANOS_BRAND.logo}
                alt="Logo oficial de Hispanos Grill"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[.22em] text-[#1559b6]">
                GastroHelp Reputation
              </p>
              <p className="truncate text-base font-black text-[#10233d] sm:text-lg">
                Hispanos Grill
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={HISPANOS_BRAND.instagram}
              target="_blank"
              rel="noreferrer"
              className="hidden h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-[#1559b6] transition hover:-translate-y-0.5 hover:shadow-md md:flex"
            >
              <Instagram className="h-4 w-4" /> Instagram
            </a>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex h-10 items-center gap-2 rounded-xl bg-[#1559b6] px-3 text-xs font-black text-white shadow-lg shadow-blue-700/20 transition hover:-translate-y-0.5 hover:bg-[#0d478f]"
            >
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Google Maps</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-blue-950/10 bg-[#062b5c] text-white">
        <div className="absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HISPANOS_BRAND.hero}
            alt="Interior real de Hispanos Grill"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,31,68,.98)_0%,rgba(6,43,92,.92)_38%,rgba(6,43,92,.42)_72%,rgba(6,43,92,.18)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(4,31,68,.8)_0%,transparent_58%)]" />
        </div>

        <div className="relative mx-auto grid min-h-[330px] max-w-[1550px] items-end gap-8 px-4 py-8 sm:px-7 lg:grid-cols-[1fr_auto] lg:items-center lg:py-12">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-4">
              <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-[1.7rem] border border-white/25 bg-white p-2 shadow-2xl sm:h-28 sm:w-28">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={HISPANOS_BRAND.logo}
                  alt="Hispanos Grill"
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.17em] text-blue-100 backdrop-blur-xl">
                  <ShieldCheck className="h-3.5 w-3.5" /> Identidad oficial
                </div>
                <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
                  Hispanos Grill
                </h1>
              </div>
            </div>

            <h2 className="max-w-2xl text-2xl font-black leading-tight text-white sm:text-3xl">
              Tu reputación, cuidada con la misma atención que cada mesa.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-100/90 sm:text-base">
              Opiniones, clientes que necesitan respuesta, evolución e imágenes QR listas para usar, todo visible en pocos segundos.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#062b5c] shadow-xl transition hover:-translate-y-0.5"
              >
                <MapPin className="h-4 w-4 text-[#1559b6]" /> Ver en Google Maps
                <ExternalLink className="h-4 w-4" />
              </a>
              <a
                href={HISPANOS_BRAND.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 text-sm font-black text-white backdrop-blur-xl transition hover:bg-white/20"
              >
                <Globe2 className="h-4 w-4" /> Web del restaurante
              </a>
            </div>

            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-bold text-blue-100/90">
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {HISPANOS_BRAND.contact.address}
              </span>
              <a
                href={`tel:${HISPANOS_BRAND.contact.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 hover:text-white"
              >
                <Phone className="h-4 w-4" /> {HISPANOS_BRAND.contact.phone}
              </a>
            </div>
          </div>

          <div className="hidden w-[310px] rounded-[2rem] border border-white/20 bg-[#041f44]/75 p-5 shadow-2xl backdrop-blur-2xl lg:block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.18em] text-blue-200">
                  Centro de control
                </p>
                <p className="mt-1 text-xl font-black">Estado en directo</p>
              </div>
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-blue-100">
                <Sparkles className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2">
              <BrandSignal icon={<Star />} label="Opiniones" />
              <BrandSignal icon={<ShieldCheck />} label="Seguimiento" />
              <BrandSignal icon={<Sparkles />} label="Insights" />
            </div>
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/[.06] p-4 text-xs font-semibold leading-5 text-blue-100">
              Los datos que aparecen debajo son reales y se actualizan desde el sistema de opiniones de Hispanos Grill.
            </p>
          </div>
        </div>
      </section>

      <ReputationElite />

      <style jsx global>{`
        .hispanos-suite > main > header {
          display: none !important;
        }
        .hispanos-suite > main {
          min-height: auto !important;
          background: #edf4fb !important;
          color: #10233d !important;
        }
        .hispanos-suite > main > div {
          padding-top: 1.25rem !important;
        }
        .hispanos-suite > main > div > section:first-child {
          display: none !important;
        }
        .hispanos-suite > main nav {
          position: sticky;
          top: 73px;
          z-index: 35;
          border-color: rgba(21, 89, 182, 0.13) !important;
          box-shadow: 0 14px 40px rgba(6, 43, 92, 0.08) !important;
        }
        .hispanos-suite > main nav button {
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }
        .hispanos-suite > main nav button:hover {
          transform: translateY(-1px);
        }
        .hispanos-suite > main article,
        .hispanos-suite > main section {
          border-color: rgba(21, 89, 182, 0.12) !important;
        }
        .hispanos-suite > main article:hover {
          box-shadow: 0 18px 44px rgba(6, 43, 92, 0.09);
        }
        @media (max-width: 640px) {
          .hispanos-suite > main nav {
            top: 73px;
          }
        }
      `}</style>
    </div>
  );
}

function BrandSignal({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[.07] p-3 text-center">
      <span className="mx-auto grid h-8 w-8 place-items-center text-blue-100 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-blue-100/80">
        {label}
      </p>
    </div>
  );
}
