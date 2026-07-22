"use client";

import { ArrowRight, Fish, Menu, X } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

const navigation = [
  ["inicio", "Inicio"],
  ["quienes-somos", "Quiénes somos"],
  ["carta", "Carta"],
  ["contacto", "Contacto y ubicación"],
] as const;

export function RestaurantHeader({
  name,
  logoUrl,
  primaryColor,
  accentColor,
}: {
  name: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("inicio");

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 28);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const sections = [...navigation.map(([id]) => id), "reservar"]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-28% 0px -58% 0px", threshold: [0, 0.15, 0.4] },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const darkText = scrolled || open;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "border-b border-black/10 bg-[#f8f5ef]/95 shadow-[0_10px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[4.75rem] max-w-[96rem] items-center justify-between px-4 sm:h-20 sm:px-7 lg:px-10 xl:px-12">
        <a href="#inicio" className="group flex min-w-0 items-center gap-3" onClick={() => setOpen(false)}>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border transition duration-500 sm:h-11 sm:w-11 ${
              darkText ? "border-black/10 bg-white" : "border-white/25 bg-white/10 backdrop-blur"
            }`}
            style={{ color: darkText ? primaryColor : accentColor }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Fish className="h-5 w-5 transition group-hover:rotate-6" />
            )}
          </span>
          <span className={`hidden truncate text-sm font-black tracking-[-0.02em] transition-colors sm:block sm:text-base ${darkText ? "text-slate-950" : "text-white"}`}>
            {name}
          </span>
        </a>

        <nav className="hidden items-center gap-0.5 lg:flex">
          {navigation.map(([id, label]) => (
            <a
              key={id}
              href={`#${id}`}
              className={`relative rounded-full px-3.5 py-2.5 text-[12px] font-black transition xl:px-4 ${
                darkText ? "text-slate-600 hover:bg-black/[0.04] hover:text-slate-950" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              {label}
              <span
                className={`absolute inset-x-4 -bottom-0.5 h-0.5 origin-center rounded-full transition-transform duration-300 ${active === id ? "scale-x-100" : "scale-x-0"}`}
                style={{ backgroundColor: accentColor }}
              />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="#reservar"
            className="inline-flex items-center gap-2 rounded-full px-4 py-3 text-[11px] font-black shadow-lg transition hover:-translate-y-0.5 sm:px-5 sm:text-xs"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            Reservar
            <ArrowRight className="hidden h-4 w-4 sm:block" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={`flex h-11 w-11 items-center justify-center rounded-full border transition lg:hidden ${
              darkText
                ? "border-black/10 bg-white text-slate-950"
                : "border-white/20 bg-white/10 text-white backdrop-blur"
            }`}
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div
        className={`absolute inset-x-0 top-full overflow-hidden border-b border-black/10 bg-[#f8f5ef] transition-[max-height,opacity] duration-500 lg:hidden ${
          open ? "max-h-[calc(100svh-4.75rem)] opacity-100" : "pointer-events-none max-h-0 opacity-0"
        }`}
      >
        <nav className="flex h-[calc(100svh-4.75rem)] flex-col px-5 pb-7 pt-8 sm:px-8">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-slate-400">Navegación</p>
          <div className="mt-5 divide-y divide-black/10">
            {navigation.map(([id, label], index) => (
              <a
                key={id}
                href={`#${id}`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between py-4 text-2xl font-black tracking-[-0.04em] text-slate-950 sm:text-3xl"
              >
                <span>{label}</span>
                <span className="text-xs font-black text-slate-300">0{index + 1}</span>
              </a>
            ))}
          </div>
          <a
            href="#reservar"
            onClick={() => setOpen(false)}
            className="mt-auto flex items-center justify-between rounded-2xl px-5 py-4 text-sm font-black shadow-xl"
            style={{ backgroundColor: accentColor, color: primaryColor }}
          >
            Reservar una mesa
            <ArrowRight className="h-5 w-5" />
          </a>
        </nav>
      </div>
    </header>
  );
}

export function ExpandingImage({
  src,
  alt,
  className = "h-[65svh] min-h-[30rem]",
  imageClassName = "object-cover",
}: {
  src: string;
  alt: string;
  className?: string;
  imageClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const viewport = window.innerHeight;
      const raw = (viewport - rect.top) / Math.max(viewport * 0.72, 1);
      setProgress(reduced ? 1 : Math.max(0, Math.min(1, raw)));
    };

    const requestUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const insetX = (1 - progress) * 11;
  const insetY = (1 - progress) * 5;
  const style = {
    clipPath: `inset(${insetY}% ${insetX}% round ${1.25 + progress * 1.25}rem)`,
  } as CSSProperties;

  return (
    <div ref={ref} className={`relative overflow-hidden ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 h-full w-full ${imageClassName}`}
        style={{ transform: `scale(${1.13 - progress * 0.13})` }}
      />
    </div>
  );
}

export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none ${
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
