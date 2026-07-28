"use client";

import {
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Download,
  ExternalLink,
  FileImage,
  ImageIcon,
  Layers3,
  Loader2,
  MonitorSmartphone,
  Palette,
  Printer,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Store,
  Type,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { OpinionConfig, OriginKey, Restaurant } from "./reputation";

type AssetId = "hero" | "exterior" | "food1" | "food2" | "food3";
type MaterialKind = "print" | "social" | "sticker";
type CollectionId = "signature" | "brasa" | "editorial" | "cristal";
type PreviewMode = "artwork" | "mockup";

type MaterialDefinition = {
  id: string;
  origin: OriginKey;
  label: string;
  shortLabel: string;
  title: string;
  subtitle: string;
  widthMm: number;
  heightMm: number;
  useCase: string;
  photo: AssetId;
  kind: MaterialKind;
  category: "mesa" | "puerta" | "caja" | "digital";
  badge: string;
};

type CollectionDefinition = {
  id: CollectionId;
  label: string;
  description: string;
  primary: string;
  secondary: string;
  paper: string;
  ink: string;
  accent: string;
  texture: "classic" | "dark" | "editorial" | "glass";
};

type DesignOptions = {
  title: string;
  subtitle: string;
  showPhoto: boolean;
  showGastroHelp: boolean;
};

const collections: CollectionDefinition[] = [
  {
    id: "signature",
    label: "Signature Blue",
    description: "Blanco cálido, azul profundo y un detalle dorado muy fino. La opción más elegante y legible.",
    primary: "#062b5c",
    secondary: "#1559b6",
    paper: "#fffdf8",
    ink: "#08264d",
    accent: "#c89b45",
    texture: "classic",
  },
  {
    id: "brasa",
    label: "Brasa Azul",
    description: "Fotografía protagonista, azul noche y máximo contraste para puerta, caja y escaparate.",
    primary: "#031b3b",
    secondary: "#1559b6",
    paper: "#061f43",
    ink: "#ffffff",
    accent: "#d2a654",
    texture: "dark",
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Mucho aire, jerarquía clara y composición de revista. Limpia, sobria y profesional.",
    primary: "#10233d",
    secondary: "#1559b6",
    paper: "#ffffff",
    ink: "#10233d",
    accent: "#b9d9ff",
    texture: "editorial",
  },
  {
    id: "cristal",
    label: "Cristal Azul",
    description: "Capas luminosas y acabado moderno para metacrilato, pantallas y redes sociales.",
    primary: "#0b4ca1",
    secondary: "#3f9cf5",
    paper: "#eff7ff",
    ink: "#062b5c",
    accent: "#8bc8ff",
    texture: "glass",
  },
];

const materials: MaterialDefinition[] = [
  {
    id: "sobremesa-a6",
    origin: "mesa",
    label: "Sobremesa A6 premium",
    shortLabel: "Sobremesa",
    title: "Tu opinión cuenta",
    subtitle: "Escanea y cuéntanos cómo ha sido tu experiencia.",
    widthMm: 105,
    heightMm: 148,
    useCase: "Metacrilato A6, soporte de mesa o display junto a la carta.",
    photo: "hero",
    kind: "print",
    category: "mesa",
    badge: "Recomendado",
  },
  {
    id: "portacuentas",
    origin: "portacuentas",
    label: "Tarjeta portacuentas",
    shortLabel: "Portacuentas",
    title: "Gracias por elegirnos",
    subtitle: "Antes de irte, ¿nos dejas tu opinión?",
    widthMm: 90,
    heightMm: 55,
    useCase: "Tarjeta horizontal para introducir con la cuenta o entregar al cliente.",
    photo: "food2",
    kind: "print",
    category: "mesa",
    badge: "Conversión alta",
  },
  {
    id: "poster-a4",
    origin: "caja",
    label: "Cartel A4 para caja",
    shortLabel: "A4 caja",
    title: "Cuéntanos tu experiencia",
    subtitle: "Escanea el código y déjanos tu opinión en menos de 30 segundos.",
    widthMm: 210,
    heightMm: 297,
    useCase: "Caja, recepción, zona de salida o pared interior. Preparado a 300 ppp.",
    photo: "hero",
    kind: "print",
    category: "caja",
    badge: "Más visible",
  },
  {
    id: "poster-puerta",
    origin: "entrada",
    label: "Cartel A5 de puerta",
    shortLabel: "Puerta A5",
    title: "¿Has disfrutado tu visita?",
    subtitle: "Tu opinión nos ayuda a seguir mejorando cada día.",
    widthMm: 148,
    heightMm: 210,
    useCase: "Puerta, escaparate o zona de espera. Lectura clara a distancia.",
    photo: "exterior",
    kind: "print",
    category: "puerta",
    badge: "Exterior",
  },
  {
    id: "pegatina",
    origin: "entrada",
    label: "Pegatina premium",
    shortLabel: "Pegatina",
    title: "Valóranos",
    subtitle: "Escanea y comparte tu experiencia.",
    widthMm: 120,
    heightMm: 120,
    useCase: "Puerta, cristal, caja, mostrador o zona de recogida.",
    photo: "exterior",
    kind: "sticker",
    category: "puerta",
    badge: "Troquelable",
  },
  {
    id: "mini-ticket",
    origin: "caja",
    label: "Mini QR para ticket",
    shortLabel: "Ticket",
    title: "¿Nos valoras?",
    subtitle: "Escanea y cuéntanos cómo ha ido todo.",
    widthMm: 80,
    heightMm: 45,
    useCase: "Pie de ticket, pequeño expositor de caja o tarjeta de entrega.",
    photo: "food1",
    kind: "print",
    category: "caja",
    badge: "Compacto",
  },
  {
    id: "instagram-story",
    origin: "redes",
    label: "Historia de Instagram",
    shortLabel: "Story 9:16",
    title: "Tu experiencia importa",
    subtitle: "Escanea y comparte tu opinión con Hispanos Grill.",
    widthMm: 108,
    heightMm: 192,
    useCase: "1080 × 1920 para historias, reels y pantallas verticales.",
    photo: "food3",
    kind: "social",
    category: "digital",
    badge: "1080 × 1920",
  },
  {
    id: "whatsapp",
    origin: "redes",
    label: "Estado de WhatsApp",
    shortLabel: "WhatsApp",
    title: "Gracias por tu visita",
    subtitle: "Tu opinión nos ayuda a mejorar cada día.",
    widthMm: 108,
    heightMm: 135,
    useCase: "Estado, difusión o envío directo después de una visita.",
    photo: "food1",
    kind: "social",
    category: "digital",
    badge: "Compartir",
  },
];

const categoryLabels = {
  mesa: "Mesa y cuenta",
  puerta: "Puerta y escaparate",
  caja: "Caja y recepción",
  digital: "Redes y WhatsApp",
} as const;

const assetUrl = (id: "logo" | AssetId) => `/api/reputacion/brand-asset?id=${id}`;

export default function ReputationMaterials({
  config,
  restaurant,
}: {
  config: OpinionConfig;
  restaurant: Restaurant;
}) {
  const [selectedId, setSelectedId] = useState(materials[0].id);
  const [collectionId, setCollectionId] = useState<CollectionId>("signature");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("mockup");
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [category, setCategory] = useState<keyof typeof categoryLabels | "todos">("todos");
  const selected = materials.find((item) => item.id === selectedId) ?? materials[0];
  const collection = collections.find((item) => item.id === collectionId) ?? collections[0];
  const [options, setOptions] = useState<DesignOptions>({
    title: selected.title,
    subtitle: selected.subtitle,
    showPhoto: true,
    showGastroHelp: true,
  });

  useEffect(() => {
    setOptions((current) => ({ ...current, title: selected.title, subtitle: selected.subtitle }));
  }, [selected]);

  const visibleMaterials = useMemo(
    () => (category === "todos" ? materials : materials.filter((item) => item.category === category)),
    [category],
  );

  const links = useMemo(
    () =>
      Object.fromEntries(
        materials.map((material) => [
          material.id,
          `https://panel.gastrohelp.es/opinion/${config.slug}?origen=${material.origin}`,
        ]),
      ) as Record<string, string>,
    [config.slug],
  );

  async function generatePackage(
    material: MaterialDefinition,
    mode: "png" | "svg" | "print" | "qr",
  ) {
    setWorking(`${mode}-${material.id}`);
    setMessage(null);

    try {
      const [logo, photo] = await Promise.all([
        fetchAsDataUrl(assetUrl("logo")),
        fetchAsDataUrl(assetUrl(material.photo)),
      ]);
      const qr = await buildBrandedQr(links[material.id], logo, collection.primary);

      if (mode === "qr") {
        downloadDataUrl(qr, `qr-${config.slug}-${material.origin}-logo.png`);
        setMessage("QR con el logo oficial descargado.");
        return;
      }

      const svg = buildMaterialSvg({
        material,
        collection,
        restaurantName: restaurant.nombre,
        qr,
        logo,
        photo,
        options,
      });
      const filename = `${config.slug}-${material.id}-${collection.id}`;

      if (mode === "svg") {
        downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${filename}-imprenta.svg`);
        setMessage("Archivo vectorial descargado para imprenta.");
        return;
      }

      if (mode === "print") {
        const printWindow = window.open("", "_blank", "noopener,noreferrer");
        if (!printWindow) throw new Error("popup-blocked");
        printWindow.document.write(`<!doctype html><html lang="es"><head><title>${escapeHtml(material.label)}</title><style>@page{size:${material.widthMm}mm ${material.heightMm}mm;margin:0}html,body{margin:0;width:${material.widthMm}mm;height:${material.heightMm}mm;overflow:hidden;background:#fff}svg{display:block;width:100%;height:100%}</style></head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),450);<\/script></body></html>`);
        printWindow.document.close();
        setMessage("Impresión preparada. También puedes guardarla como PDF.");
        return;
      }

      const png = await svgToPng(svg, material);
      downloadDataUrl(png, `${filename}-300ppp.png`);
      setMessage("PNG de alta resolución descargado.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "popup-blocked"
          ? "El navegador bloqueó la ventana de impresión. Permite ventanas emergentes y repite."
          : "No se pudo generar el diseño. Inténtalo de nuevo.",
      );
    } finally {
      setWorking(null);
    }
  }

  function resetCopy() {
    setOptions({
      title: selected.title,
      subtitle: selected.subtitle,
      showPhoto: true,
      showGastroHelp: true,
    });
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/20 bg-[#031b3b] p-6 text-white shadow-[0_34px_100px_rgba(6,43,92,.28)] sm:p-8 lg:p-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl("hero")} alt="Interior de Hispanos Grill" className="absolute inset-0 h-full w-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-[linear-gradient(92deg,rgba(3,27,59,.99)_0%,rgba(6,43,92,.94)_46%,rgba(6,43,92,.48)_100%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.19em] text-blue-100 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5" /> Centro de materiales · GastroHelp
            </div>
            <h2 className="mt-5 text-balance text-3xl font-black tracking-[-.035em] sm:text-5xl lg:text-[3.5rem] lg:leading-[1.02]">
              Diseños limpios, legibles y listos para colocar.
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-blue-100/90 sm:text-base">
              Sin palabras amontonadas, sin textos perdidos sobre las fotos y con el QR como protagonista.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <HeroPill icon={<BadgeCheck />} text="Logo oficial" />
              <HeroPill icon={<ShieldCheck />} text="Contraste revisado" />
              <HeroPill icon={<Printer />} text="300 ppp" />
              <HeroPill icon={<Sparkles />} text="Firma GastroHelp" />
            </div>
          </div>
          <a
            href={`/opinion/${config.slug}?origen=redes`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-[#062b5c] shadow-2xl transition hover:-translate-y-0.5"
          >
            Ver experiencia pública <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {message && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-950 shadow-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#1559b6]" /> {message}
        </div>
      )}

      <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#1559b6]">Colecciones visuales</p>
            <h3 className="mt-1 text-2xl font-black tracking-tight text-[#10233d]">Elige el acabado</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">Todos mantienen una jerarquía clara y zonas de lectura protegidas.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {collections.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCollectionId(item.id)}
                className={`rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 ${item.id === collection.id ? "border-[#1559b6] bg-[#eaf4ff] shadow-lg shadow-blue-950/10" : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-md"}`}
              >
                <span className="flex items-center gap-2 text-xs font-black text-[#10233d]">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white shadow" style={{ background: item.primary }} />
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 rounded-2xl bg-[#f7fbff] px-4 py-3 text-xs font-semibold leading-5 text-slate-500">{collection.description}</p>
      </section>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.18fr)_420px]">
        <section className="overflow-hidden rounded-[2.2rem] border border-blue-100 bg-white shadow-[0_26px_80px_rgba(6,43,92,.10)]">
          <div className="flex flex-col gap-4 border-b border-blue-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">Vista previa real</p>
              <h3 className="mt-1 text-xl font-black text-[#10233d]">{selected.label}</h3>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-slate-100 p-1">
              <PreviewButton active={previewMode === "mockup"} onClick={() => setPreviewMode("mockup")} icon={<Store />} label="Cómo queda" />
              <PreviewButton active={previewMode === "artwork"} onClick={() => setPreviewMode("artwork")} icon={<FileImage />} label="Diseño" />
            </div>
          </div>

          <div className="min-h-[700px] bg-[radial-gradient(circle_at_top,#f4f9ff_0%,#eaf4ff_45%,#dcecff_100%)] p-4 sm:p-8 lg:p-10">
            <MaterialPreview material={selected} collection={collection} url={links[selected.id]} restaurantName={restaurant.nombre} options={options} mode={previewMode} />
          </div>

          <div className="border-t border-blue-50 bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-black text-[#10233d]">{selected.widthMm} × {selected.heightMm} mm</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{selected.useCase}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eaf4ff] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#1559b6]">
                <ShieldCheck className="h-3.5 w-3.5" /> Listo para imprimir
              </span>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ActionButton icon={<Download />} label="PNG 300 ppp" loading={working === `png-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "png")} primary />
              <ActionButton icon={<ImageIcon />} label="SVG imprenta" loading={working === `svg-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "svg")} />
              <ActionButton icon={<Printer />} label="Imprimir / PDF" loading={working === `print-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "print")} />
              <ActionButton icon={<QrCode />} label="Solo QR con logo" loading={working === `qr-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "qr")} />
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">Editor rápido</p>
                <h3 className="mt-1 text-xl font-black text-[#10233d]">Personaliza el mensaje</h3>
              </div>
              <Type className="h-5 w-5 text-[#1559b6]" />
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-black text-[#10233d]">Titular principal</span>
              <input
                value={options.title}
                onChange={(event) => setOptions((current) => ({ ...current, title: event.target.value.slice(0, 58) }))}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-[#f9fbfe] px-3 py-3 text-sm font-bold text-[#10233d] outline-none transition focus:border-[#1559b6] focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="mt-4 block">
              <span className="text-xs font-black text-[#10233d]">Texto de apoyo</span>
              <textarea
                value={options.subtitle}
                onChange={(event) => setOptions((current) => ({ ...current, subtitle: event.target.value.slice(0, 105) }))}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-[#f9fbfe] px-3 py-3 text-sm font-semibold leading-5 text-[#10233d] outline-none transition focus:border-[#1559b6] focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <ToggleCard icon={<Palette />} label="Foto real" active={options.showPhoto} onClick={() => setOptions((current) => ({ ...current, showPhoto: !current.showPhoto }))} />
              <ToggleCard icon={<Sparkles />} label="Firma GastroHelp" active={options.showGastroHelp} onClick={() => setOptions((current) => ({ ...current, showGastroHelp: !current.showGastroHelp }))} />
            </div>

            <button type="button" onClick={resetCopy} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-600 transition hover:bg-slate-50">
              <RotateCcw className="h-4 w-4" /> Restaurar texto recomendado
            </button>
          </section>

          <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">Biblioteca</p>
                <h3 className="mt-1 text-xl font-black text-[#10233d]">Elige el soporte</h3>
              </div>
              <Layers3 className="h-5 w-5 text-[#1559b6]" />
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              <CategoryButton active={category === "todos"} label="Todos" onClick={() => setCategory("todos")} />
              {(Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>).map((key) => (
                <CategoryButton key={key} active={category === key} label={categoryLabels[key]} onClick={() => setCategory(key)} />
              ))}
            </div>

            <div className="mt-4 max-h-[590px] space-y-2 overflow-y-auto pr-1">
              {visibleMaterials.map((material) => (
                <button
                  key={material.id}
                  type="button"
                  onClick={() => setSelectedId(material.id)}
                  className={`group flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${selected.id === material.id ? "border-[#1559b6] bg-[#eaf4ff] shadow-md shadow-blue-950/10" : "border-slate-200 bg-white hover:border-blue-200 hover:shadow-sm"}`}
                >
                  <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-[#062b5c]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(material.photo)} alt="" className="h-full w-full object-cover opacity-75 transition duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#062b5c]/80 to-transparent" />
                    <QrCode className="absolute bottom-2 left-2 h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-black text-[#10233d]">{material.shortLabel}</p>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-black uppercase text-[#1559b6] shadow-sm">{material.badge}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-4 text-slate-500">{material.useCase}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={<Printer />} title="Preparado para imprenta" text="Medidas reales, PNG a 300 ppp, SVG vectorial y PDF mediante impresión directa." />
        <InfoCard icon={<QrCode />} title="QR con logo oficial" text="Corrección H, zona silenciosa y logotipo centrado sin comprometer la lectura." />
        <InfoCard icon={<MonitorSmartphone />} title="También para redes" text="Piezas verticales listas para Instagram, WhatsApp y pantallas del restaurante." />
      </section>
    </div>
  );
}

function MaterialPreview({
  material,
  collection,
  url,
  restaurantName,
  options,
  mode,
}: {
  material: MaterialDefinition;
  collection: CollectionDefinition;
  url: string;
  restaurantName: string;
  options: DesignOptions;
  mode: PreviewMode;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    Promise.all([fetchAsDataUrl(assetUrl("logo")), fetchAsDataUrl(assetUrl(material.photo))])
      .then(async ([logo, photo]) => {
        const qr = await buildBrandedQr(url, logo, collection.primary);
        const svg = buildMaterialSvg({ material, collection, restaurantName, qr, logo, photo, options });
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        if (active) setPreviewUrl(objectUrl);
      })
      .catch(() => active && setPreviewUrl(null));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [collection, material, options, restaurantName, url]);

  const horizontal = material.widthMm > material.heightMm;
  const square = material.widthMm === material.heightMm;
  const maxWidth = horizontal ? 760 : square ? 500 : material.id === "instagram-story" ? 350 : 445;

  if (mode === "artwork") {
    return (
      <div className="grid min-h-[620px] place-items-center">
        <div
          className="relative w-full overflow-hidden rounded-[1.8rem] bg-white shadow-[0_38px_100px_rgba(6,43,92,.27)]"
          style={{ maxWidth, aspectRatio: `${material.widthMm}/${material.heightMm}` }}
        >
          {previewUrl ? <img src={previewUrl} alt={`Diseño ${material.label}`} className="h-full w-full object-contain" /> : <PreviewLoader />}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[620px] overflow-hidden rounded-[2rem] border border-white/70 bg-[#062b5c] shadow-inner">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={assetUrl(material.category === "puerta" ? "exterior" : "hero")} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,27,59,.08),rgba(3,27,59,.42))]" />
      <div className="absolute inset-x-[7%] bottom-[5%] h-[24%] rounded-[50%] bg-black/25 blur-2xl" />
      <div
        className={`absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 ${material.category === "mesa" ? "rotate-[-2deg]" : material.category === "puerta" ? "rotate-[1deg]" : "rotate-[-1deg]"}`}
        style={{ maxWidth: horizontal ? "78%" : square ? "58%" : material.id === "instagram-story" ? "34%" : "44%" }}
      >
        <div
          className="relative w-full overflow-hidden rounded-[1.6rem] bg-white shadow-[0_40px_90px_rgba(0,0,0,.45)]"
          style={{ aspectRatio: `${material.widthMm}/${material.heightMm}` }}
        >
          {previewUrl ? <img src={previewUrl} alt={`Mockup ${material.label}`} className="h-full w-full object-contain" /> : <PreviewLoader />}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-black/[.06]" />
        </div>
        {material.category === "mesa" && <div className="mx-auto h-12 w-[28%] rounded-b-2xl bg-white/90 shadow-xl" />}
      </div>
      <div className="absolute bottom-4 left-4 rounded-full border border-white/20 bg-[#031b3b]/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.15em] text-white backdrop-blur-xl">
        Vista simulada · {material.shortLabel}
      </div>
    </div>
  );
}

function PreviewLoader() {
  return <div className="grid h-full place-items-center bg-white"><Loader2 className="h-7 w-7 animate-spin text-[#1559b6]" /></div>;
}

function HeroPill({ icon, text }: { icon: ReactNode; text: string }) {
  return <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.08] px-3 py-2 text-[10px] font-black uppercase tracking-wide text-blue-100 backdrop-blur-xl [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}{text}</span>;
}

function PreviewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} className={`flex min-h-9 items-center gap-2 rounded-lg px-3 text-[10px] font-black transition [&_svg]:h-3.5 [&_svg]:w-3.5 ${active ? "bg-white text-[#1559b6] shadow-sm" : "text-slate-500"}`}>{icon}{label}</button>;
}

function CategoryButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-black transition ${active ? "bg-[#1559b6] text-white shadow-md shadow-blue-700/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{label}</button>;
}

function ToggleCard({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? "border-[#1559b6] bg-[#eaf4ff] text-[#1559b6]" : "border-slate-200 bg-white text-slate-500"}`}><span className="flex items-center gap-2 text-[10px] font-black [&_svg]:h-4 [&_svg]:w-4">{icon}{label}</span><span className="mt-2 block text-[9px] font-bold uppercase tracking-wide">{active ? "Visible" : "Oculto"}</span></button>;
}

function ActionButton({ icon, label, loading, disabled, onClick, primary }: { icon: ReactNode; label: string; loading: boolean; disabled: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 ${primary ? "bg-[#1559b6] text-white shadow-lg shadow-blue-700/20" : "border border-blue-100 bg-white text-[#10233d] hover:bg-[#f4f9ff]"}`}>
      {loading ? <Loader2 className="animate-spin" /> : icon}{label}
    </button>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="rounded-[1.6rem] border border-blue-100 bg-white p-5 shadow-[0_18px_50px_rgba(6,43,92,.06)]"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#eaf4ff] text-[#1559b6] [&_svg]:h-5 [&_svg]:w-5">{icon}</div><h3 className="mt-4 font-black text-[#10233d]">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p></article>;
}

async function buildBrandedQr(url: string, logo: string, dark: string) {
  const raw = await QRCode.toDataURL(url, {
    width: 1600,
    margin: 4,
    errorCorrectionLevel: "H",
    color: { dark, light: "#ffffff" },
  });
  const [qrImage, logoImage] = await Promise.all([loadImage(raw), loadImage(logo)]);
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-failed");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1600, 1600);
  context.drawImage(qrImage, 0, 0, 1600, 1600);
  const plate = 260;
  const x = (1600 - plate) / 2;
  const y = x;
  context.fillStyle = "#ffffff";
  roundRect(context, x, y, plate, plate, 48);
  context.fill();
  context.strokeStyle = "rgba(6,43,92,.15)";
  context.lineWidth = 8;
  context.stroke();
  const pad = 30;
  context.drawImage(logoImage, x + pad, y + pad, plate - pad * 2, plate - pad * 2);
  return canvas.toDataURL("image/png", 1);
}

function buildMaterialSvg({
  material,
  collection,
  restaurantName,
  qr,
  logo,
  photo,
  options,
}: {
  material: MaterialDefinition;
  collection: CollectionDefinition;
  restaurantName: string;
  qr: string;
  logo: string;
  photo: string;
  options: DesignOptions;
}) {
  const width = Math.round(material.widthMm * 10);
  const height = Math.round(material.heightMm * 10);
  const horizontal = width > height * 1.15;
  const square = Math.abs(width - height) < Math.min(width, height) * 0.08;
  const title = options.title.trim() || material.title;
  const subtitle = options.subtitle.trim() || material.subtitle;

  if (horizontal) {
    return buildHorizontalSvg({ width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle });
  }
  if (square) {
    return buildSquareSvg({ width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle });
  }
  return buildVerticalSvg({ width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle });
}

type SvgArgs = {
  width: number;
  height: number;
  material: MaterialDefinition;
  collection: CollectionDefinition;
  restaurantName: string;
  qr: string;
  logo: string;
  photo: string;
  options: DesignOptions;
  title: string;
  subtitle: string;
};

function buildVerticalSvg(args: SvgArgs) {
  const { width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle } = args;
  const margin = Math.round(width * 0.055);
  const photoHeight = Math.round(height * (material.id === "instagram-story" ? 0.34 : 0.25));
  const logoSize = Math.round(width * 0.17);
  const logoY = photoHeight - logoSize * 0.48;
  const footerHeight = Math.max(46, Math.round(height * 0.045));
  const titleSize = Math.round(width * (material.id === "instagram-story" ? 0.06 : 0.062));
  const subtitleSize = Math.round(titleSize * 0.34);
  const titleLines = wrapText(title, material.id === "instagram-story" ? 19 : 18, 2);
  const subtitleLines = wrapText(subtitle, 36, 2);
  const contentTop = logoY + logoSize + Math.round(margin * 0.72);
  const titleStart = contentTop + titleSize;
  const titleBottom = titleStart + (titleLines.length - 1) * titleSize * 1.05;
  const subtitleStart = titleBottom + titleSize * 0.62;
  const subtitleBottom = subtitleStart + (subtitleLines.length - 1) * subtitleSize * 1.35;
  const qrSize = Math.round(width * (material.id === "instagram-story" ? 0.39 : 0.41));
  const ctaHeight = Math.max(48, Math.round(width * 0.065));
  const ctaY = height - footerHeight - ctaHeight - margin * 0.52;
  const qrY = Math.min(
    ctaY - qrSize - margin * 0.62,
    Math.max(subtitleBottom + margin * 0.78, photoHeight + logoSize * 1.35),
  );
  const qrX = (width - qrSize) / 2;
  const paper = collection.texture === "dark" ? "#061f43" : collection.paper;
  const ink = collection.texture === "dark" ? "#ffffff" : collection.ink;
  const subInk = collection.texture === "dark" ? "#dcecff" : "#35516f";
  const borderRadius = material.kind === "sticker" ? width / 2 : Math.max(24, width * 0.03);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${material.widthMm}mm" height="${material.heightMm}mm" viewBox="0 0 ${width} ${height}">
    ${commonDefs(collection, width, height, borderRadius)}
    <g clip-path="url(#canvas)">
      <rect width="${width}" height="${height}" fill="${paper}"/>
      ${options.showPhoto ? `<image href="${photo}" x="0" y="0" width="${width}" height="${photoHeight}" preserveAspectRatio="xMidYMid slice"/><rect x="0" y="0" width="${width}" height="${photoHeight}" fill="url(#photoShade)"/>` : `<rect x="0" y="0" width="${width}" height="${photoHeight}" fill="url(#brandFill)"/>`}
      <rect x="0" y="${photoHeight}" width="${width}" height="${height - photoHeight}" fill="url(#dots)"/>
      <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="${collection.primary}"/>
    </g>
    <rect x="${margin * 0.4}" y="${margin * 0.4}" width="${width - margin * 0.8}" height="${height - margin * 0.8}" rx="${borderRadius * 0.72}" fill="none" stroke="${collection.accent}" stroke-width="${Math.max(3, width * 0.0022)}"/>

    <text x="${width / 2}" y="${Math.max(34, margin * 0.9)}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(15, width * 0.018)}" font-weight="900" letter-spacing="4">${escapeXml(restaurantName.toUpperCase())}</text>

    <g filter="url(#shadow)">
      <rect x="${(width - logoSize) / 2}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.22}" fill="#ffffff" stroke="${collection.accent}" stroke-width="${Math.max(3, logoSize * 0.018)}"/>
      <image href="${logo}" x="${(width - logoSize) / 2 + logoSize * 0.08}" y="${logoY + logoSize * 0.08}" width="${logoSize * 0.84}" height="${logoSize * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    </g>

    ${titleLines.map((line, index) => `<text x="${width / 2}" y="${titleStart + index * titleSize * 1.05}" text-anchor="middle" fill="${ink}" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`).join("")}
    ${subtitleLines.map((line, index) => `<text x="${width / 2}" y="${subtitleStart + index * subtitleSize * 1.35}" text-anchor="middle" fill="${subInk}" font-family="Arial, Helvetica, sans-serif" font-size="${subtitleSize}" font-weight="650">${escapeXml(line)}</text>`).join("")}

    <g filter="url(#shadow)">
      <rect x="${qrX - 18}" y="${qrY - 18}" width="${qrSize + 36}" height="${qrSize + 36}" rx="${Math.max(24, qrSize * 0.08)}" fill="#ffffff" stroke="${collection.secondary}" stroke-width="${Math.max(5, qrSize * 0.012)}"/>
      <image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    </g>

    <rect x="${width * 0.17}" y="${ctaY}" width="${width * 0.66}" height="${ctaHeight}" rx="${ctaHeight * 0.45}" fill="${collection.primary}" stroke="${collection.accent}" stroke-width="${Math.max(2, width * 0.002)}"/>
    <text x="${width / 2}" y="${ctaY + ctaHeight * 0.64}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(16, width * 0.021)}" font-weight="900" letter-spacing="2">ESCANEA Y VALÓRANOS</text>
    ${footerText(width, height, footerHeight, options.showGastroHelp)}
  </svg>`;
}

function buildHorizontalSvg(args: SvgArgs) {
  const { width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle } = args;
  const margin = Math.round(height * 0.08);
  const footerHeight = Math.max(28, Math.round(height * 0.08));
  const contentWidth = Math.round(width * 0.56);
  const panelX = margin * 0.55;
  const panelY = margin * 0.55;
  const panelHeight = height - footerHeight - margin * 1.1;
  const panelWidth = contentWidth - margin * 0.45;
  const logoSize = Math.round(height * 0.21);
  const titleSize = Math.round(height * 0.105);
  const subtitleSize = Math.round(titleSize * 0.35);
  const titleLines = wrapText(title, 20, 2);
  const subtitleLines = wrapText(subtitle, 34, 2);
  const titleStart = panelY + logoSize + margin * 1.15 + titleSize;
  const subtitleStart = titleStart + titleLines.length * titleSize * 1.03 + titleSize * 0.42;
  const ctaHeight = Math.max(34, Math.round(height * 0.10));
  const ctaY = panelY + panelHeight - ctaHeight - margin * 0.55;
  const qrSize = Math.round(height * 0.62);
  const qrX = width - qrSize - margin * 0.72;
  const qrY = (height - footerHeight - qrSize) / 2;
  const borderRadius = Math.max(20, height * 0.055);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${material.widthMm}mm" height="${material.heightMm}mm" viewBox="0 0 ${width} ${height}">
    ${commonDefs(collection, width, height, borderRadius)}
    <g clip-path="url(#canvas)">
      ${options.showPhoto ? `<image href="${photo}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${width}" height="${height}" fill="url(#brandFill)"/>`}
      <rect width="${width}" height="${height}" fill="url(#horizontalShade)"/>
      <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="${collection.primary}"/>
    </g>
    <rect x="${margin * 0.35}" y="${margin * 0.35}" width="${width - margin * 0.7}" height="${height - margin * 0.7}" rx="${borderRadius * 0.75}" fill="none" stroke="${collection.accent}" stroke-width="${Math.max(3, height * 0.008)}"/>

    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="${borderRadius}" fill="#031b3b" opacity=".86"/>
    <rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" rx="${borderRadius}" fill="none" stroke="#ffffff" stroke-opacity=".16"/>

    <rect x="${panelX + margin * 0.55}" y="${panelY + margin * 0.48}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.22}" fill="#ffffff" stroke="${collection.accent}" stroke-width="${Math.max(3, logoSize * 0.02)}"/>
    <image href="${logo}" x="${panelX + margin * 0.55 + logoSize * 0.08}" y="${panelY + margin * 0.48 + logoSize * 0.08}" width="${logoSize * 0.84}" height="${logoSize * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${panelX + margin * 0.55 + logoSize + margin * 0.45}" y="${panelY + margin * 0.48 + logoSize * 0.58}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(13, height * 0.035)}" font-weight="900" letter-spacing="4">${escapeXml(restaurantName.toUpperCase())}</text>

    ${titleLines.map((line, index) => `<text x="${panelX + margin * 0.55}" y="${titleStart + index * titleSize * 1.03}" fill="#ffffff" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`).join("")}
    ${subtitleLines.map((line, index) => `<text x="${panelX + margin * 0.55}" y="${subtitleStart + index * subtitleSize * 1.35}" fill="#dcecff" font-family="Arial, Helvetica, sans-serif" font-size="${subtitleSize}" font-weight="650">${escapeXml(line)}</text>`).join("")}

    <rect x="${panelX + margin * 0.55}" y="${ctaY}" width="${Math.min(panelWidth - margin * 1.1, width * 0.35)}" height="${ctaHeight}" rx="${ctaHeight * 0.45}" fill="${collection.secondary}" stroke="${collection.accent}" stroke-width="${Math.max(2, height * 0.005)}"/>
    <text x="${panelX + margin * 0.55 + Math.min(panelWidth - margin * 1.1, width * 0.35) / 2}" y="${ctaY + ctaHeight * 0.64}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(12, height * 0.032)}" font-weight="900" letter-spacing="2">ESCANEA AHORA</text>

    <g filter="url(#shadow)">
      <rect x="${qrX - 18}" y="${qrY - 18}" width="${qrSize + 36}" height="${qrSize + 36}" rx="${Math.max(22, qrSize * 0.08)}" fill="#ffffff" stroke="${collection.secondary}" stroke-width="${Math.max(5, qrSize * 0.012)}"/>
      <image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    </g>
    ${footerText(width, height, footerHeight, options.showGastroHelp)}
  </svg>`;
}

function buildSquareSvg(args: SvgArgs) {
  const { width, height, material, collection, restaurantName, qr, logo, photo, options, title, subtitle } = args;
  const margin = Math.round(width * 0.06);
  const footerHeight = Math.round(height * 0.07);
  const logoSize = Math.round(width * 0.16);
  const titleSize = Math.round(width * 0.07);
  const subtitleSize = Math.round(titleSize * 0.34);
  const titleLines = wrapText(title, 17, 2);
  const subtitleLines = wrapText(subtitle, 30, 2);
  const qrSize = Math.round(width * 0.36);
  const qrX = (width - qrSize) / 2;
  const qrY = height * 0.49;
  const ctaHeight = Math.round(height * 0.075);
  const ctaY = height - footerHeight - ctaHeight - margin * 0.35;
  const borderRadius = material.kind === "sticker" ? width / 2 : width * 0.04;

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${material.widthMm}mm" height="${material.heightMm}mm" viewBox="0 0 ${width} ${height}">
    ${commonDefs(collection, width, height, borderRadius)}
    <g clip-path="url(#canvas)">
      ${options.showPhoto ? `<image href="${photo}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>` : `<rect width="${width}" height="${height}" fill="url(#brandFill)"/>`}
      <rect width="${width}" height="${height}" fill="#031b3b" opacity=".72"/>
      <rect x="${margin}" y="${margin}" width="${width - margin * 2}" height="${height - footerHeight - margin * 1.25}" rx="${width * 0.04}" fill="#ffffff" opacity=".94"/>
      <rect x="0" y="${height - footerHeight}" width="${width}" height="${footerHeight}" fill="${collection.primary}"/>
    </g>

    <rect x="${(width - logoSize) / 2}" y="${margin * 1.35}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.22}" fill="#ffffff" stroke="${collection.accent}" stroke-width="${Math.max(3, logoSize * 0.018)}"/>
    <image href="${logo}" x="${(width - logoSize) / 2 + logoSize * 0.08}" y="${margin * 1.35 + logoSize * 0.08}" width="${logoSize * 0.84}" height="${logoSize * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    <text x="${width / 2}" y="${margin * 1.35 + logoSize + titleSize * 0.48}" text-anchor="middle" fill="${collection.secondary}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(15, width * 0.018)}" font-weight="900" letter-spacing="4">${escapeXml(restaurantName.toUpperCase())}</text>

    ${titleLines.map((line, index) => `<text x="${width / 2}" y="${height * 0.30 + index * titleSize * 1.03}" text-anchor="middle" fill="${collection.ink}" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`).join("")}
    ${subtitleLines.map((line, index) => `<text x="${width / 2}" y="${height * 0.42 + index * subtitleSize * 1.35}" text-anchor="middle" fill="#35516f" font-family="Arial, Helvetica, sans-serif" font-size="${subtitleSize}" font-weight="650">${escapeXml(line)}</text>`).join("")}

    <g filter="url(#shadow)">
      <rect x="${qrX - 16}" y="${qrY - 16}" width="${qrSize + 32}" height="${qrSize + 32}" rx="${qrSize * 0.08}" fill="#ffffff" stroke="${collection.secondary}" stroke-width="${Math.max(5, qrSize * 0.012)}"/>
      <image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    </g>

    <rect x="${width * 0.20}" y="${ctaY}" width="${width * 0.60}" height="${ctaHeight}" rx="${ctaHeight * 0.45}" fill="${collection.primary}" stroke="${collection.accent}" stroke-width="${Math.max(2, width * 0.002)}"/>
    <text x="${width / 2}" y="${ctaY + ctaHeight * 0.64}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(15, width * 0.021)}" font-weight="900" letter-spacing="2">ESCANEA Y VALÓRANOS</text>
    ${footerText(width, height, footerHeight, options.showGastroHelp)}
  </svg>`;
}

function commonDefs(collection: CollectionDefinition, width: number, height: number, radius: number) {
  return `<defs>
    <linearGradient id="photoShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${collection.primary}" stop-opacity=".08"/><stop offset="1" stop-color="${collection.primary}" stop-opacity=".86"/></linearGradient>
    <linearGradient id="horizontalShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#031b3b" stop-opacity=".96"/><stop offset=".58" stop-color="#031b3b" stop-opacity=".72"/><stop offset="1" stop-color="#031b3b" stop-opacity=".30"/></linearGradient>
    <linearGradient id="brandFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${collection.primary}"/><stop offset="1" stop-color="${collection.secondary}"/></linearGradient>
    <pattern id="dots" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="${collection.secondary}" opacity=".06"/></pattern>
    <filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#001d45" flood-opacity=".22"/></filter>
    <clipPath id="canvas"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>
  </defs>`;
}

function footerText(width: number, height: number, footerHeight: number, showGastroHelp: boolean) {
  const label = showGastroHelp ? "POWERED BY GASTROHELP" : "GRACIAS POR AYUDARNOS A MEJORAR";
  return `<text x="${width / 2}" y="${height - footerHeight * 0.34}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(12, Math.min(width, height) * 0.019)}" font-weight="800" letter-spacing="2">${label}</text>`;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image-failed"));
    image.src = src;
  });
}

async function fetchAsDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("asset-failed");
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("asset-failed"));
    reader.readAsDataURL(blob);
  });
}

async function svgToPng(svg: string, material: MaterialDefinition) {
  const width = material.kind === "social" ? 1080 : Math.round(material.widthMm * (300 / 25.4));
  const height = material.kind === "social" ? Math.round(width * (material.heightMm / material.widthMm)) : Math.round(material.heightMm * (300 / 25.4));
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas-failed");
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png", 1);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wrapText(text: string, max: number, maxLines = 2) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function escapeHtml(value: string) {
  return escapeXml(value);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
