"use client";

import {
  BadgeCheck,
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  ImageIcon,
  Layers3,
  Loader2,
  Printer,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import type { OpinionConfig, OriginKey, Restaurant } from "./reputation";

type AssetId = "hero" | "exterior" | "food1" | "food2" | "food3";
type MaterialKind = "print" | "social" | "sticker";
type CollectionId = "signature" | "cristal" | "editorial" | "nocturna";

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
};

type CollectionDefinition = {
  id: CollectionId;
  label: string;
  description: string;
  ink: string;
  primary: string;
  secondary: string;
  paper: string;
  accent: string;
  photoOpacity: number;
};

const collections: CollectionDefinition[] = [
  {
    id: "signature",
    label: "Signature",
    description: "Blanco, azul profundo y detalles dorados. La opción más elegante para mesa y puerta.",
    ink: "#09274f",
    primary: "#062b5c",
    secondary: "#1559b6",
    paper: "#fffdf8",
    accent: "#c89b45",
    photoOpacity: 0.96,
  },
  {
    id: "cristal",
    label: "Cristal azul",
    description: "Más moderna, luminosa y tecnológica, sin perder la identidad del restaurante.",
    ink: "#062b5c",
    primary: "#0b4ca1",
    secondary: "#42a5ff",
    paper: "#f4f9ff",
    accent: "#85c6ff",
    photoOpacity: 0.9,
  },
  {
    id: "editorial",
    label: "Editorial",
    description: "Mucho aire, tipografía grande y fotografía tratada como una pieza de revista.",
    ink: "#10233d",
    primary: "#10233d",
    secondary: "#1559b6",
    paper: "#ffffff",
    accent: "#d9eaff",
    photoOpacity: 0.82,
  },
  {
    id: "nocturna",
    label: "Nocturna",
    description: "Azul noche, luz de local y acabado premium para entrada, caja o escaparate.",
    ink: "#ffffff",
    primary: "#031b3b",
    secondary: "#1559b6",
    paper: "#061f43",
    accent: "#d1a85c",
    photoOpacity: 0.75,
  },
];

const materials: MaterialDefinition[] = [
  {
    id: "poster-a4",
    origin: "caja",
    label: "Cartel A4 para caja",
    shortLabel: "A4 premium",
    title: "Cuéntanos tu experiencia",
    subtitle: "Escanea el código y déjanos tu opinión en menos de 30 segundos.",
    widthMm: 210,
    heightMm: 297,
    useCase: "Caja, recepción, salida o pared interior. Preparado a 300 ppp.",
    photo: "hero",
    kind: "print",
  },
  {
    id: "poster-puerta",
    origin: "entrada",
    label: "Cartel de puerta",
    shortLabel: "Puerta",
    title: "¿Has disfrutado tu visita?",
    subtitle: "Tu opinión nos ayuda a seguir cuidando cada detalle.",
    widthMm: 150,
    heightMm: 210,
    useCase: "Puerta, escaparate o zona de espera. Alto contraste y lectura a distancia.",
    photo: "exterior",
    kind: "print",
  },
  {
    id: "sobremesa",
    origin: "mesa",
    label: "Sobremesa A6",
    shortLabel: "Sobremesa",
    title: "Tu opinión cuenta",
    subtitle: "Escanea, valora y ayúdanos a mejorar.",
    widthMm: 105,
    heightMm: 148,
    useCase: "Metacrilato A6, soporte de mesa o display junto a la carta.",
    photo: "food1",
    kind: "print",
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
    useCase: "Puerta, caja, mostrador, take away o zona de recogida.",
    photo: "exterior",
    kind: "sticker",
  },
  {
    id: "instagram-story",
    origin: "redes",
    label: "Historia de Instagram",
    shortLabel: "Story 9:16",
    title: "Tu opinión nos ayuda a mejorar",
    subtitle: "Escanea y comparte tu experiencia con Hispanos Grill.",
    widthMm: 108,
    heightMm: 192,
    useCase: "Formato 1080 × 1920 para historias, reels y pantallas verticales.",
    photo: "food3",
    kind: "social",
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
  },
];

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
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = materials.find((item) => item.id === selectedId) ?? materials[0];
  const collection = collections.find((item) => item.id === collectionId) ?? collections[0];
  const baseUrl = "https://panel.gastrohelp.es";

  const links = useMemo(
    () =>
      Object.fromEntries(
        materials.map((material) => [
          material.id,
          `${baseUrl}/opinion/${config.slug}?origen=${material.origin}`,
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
      const logo = await fetchAsDataUrl(assetUrl("logo"));
      const qr = await buildBrandedQr(links[material.id], logo, collection.primary);

      if (mode === "qr") {
        downloadDataUrl(qr, `qr-${config.slug}-${material.origin}-gastrohelp.png`);
        setMessage("QR personalizado con el logo real descargado.");
        return;
      }

      const photo = await fetchAsDataUrl(assetUrl(material.photo));
      const svg = buildMaterialSvg({
        material,
        collection,
        restaurantName: restaurant.nombre,
        qr,
        logo,
        photo,
      });

      const filename = `${config.slug}-${material.id}-${collection.id}`;

      if (mode === "svg") {
        downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), `${filename}.svg`);
        setMessage("Diseño vectorial descargado para imprenta.");
        return;
      }

      if (mode === "print") {
        const printWindow = window.open("", "_blank", "noopener,noreferrer");
        if (!printWindow) throw new Error("popup-blocked");
        printWindow.document.write(`<!doctype html><html lang="es"><head>
          <title>${escapeHtml(material.label)}</title>
          <style>@page{size:${material.widthMm}mm ${material.heightMm}mm;margin:0}html,body{margin:0;width:${material.widthMm}mm;height:${material.heightMm}mm;overflow:hidden;background:#fff}svg{display:block;width:100%;height:100%}</style>
          </head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),450);<\/script></body></html>`);
        printWindow.document.close();
        setMessage("Impresión preparada. En el diálogo también puedes guardar como PDF.");
        return;
      }

      const dataUrl = await svgToPng(svg, material);
      downloadDataUrl(dataUrl, `${filename}-300ppp.png`);
      setMessage("PNG de alta calidad descargado y listo para imprimir.");
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "popup-blocked"
          ? "El navegador bloqueó la ventana. Permite ventanas emergentes y repite."
          : "No se pudo generar el diseño. Inténtalo de nuevo en unos segundos.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.4rem] border border-blue-100 bg-[#062b5c] p-6 text-white shadow-[0_34px_90px_rgba(6,43,92,.22)] sm:p-8">
        <img src={assetUrl("hero")} alt="Interior de Hispanos Grill" className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,27,59,.98),rgba(6,43,92,.85),rgba(21,89,182,.42))]" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5" /> Estudio de impresión GastroHelp
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
              Materiales que el restaurante querrá poner en todas sus mesas.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-100/90">
              Logo real dentro del diseño y del QR, fotografía del local, identidad azul y blanca y firma discreta de GastroHelp. Todo listo para descargar e imprimir.
            </p>
          </div>
          <a href={`/opinion/${config.slug}?origen=redes`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#062b5c] shadow-xl transition hover:-translate-y-0.5">
            Ver experiencia pública <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {message && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" /> {message}
        </div>
      )}

      <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[.18em] text-[#1559b6]">Colección visual</p>
            <h3 className="mt-1 text-2xl font-black text-[#10233d]">Elige el acabado</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">El contenido se adapta automáticamente al soporte elegido.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {collections.map((item) => (
              <button key={item.id} type="button" onClick={() => setCollectionId(item.id)} className={`rounded-2xl border px-4 py-3 text-left transition ${item.id === collection.id ? "border-[#1559b6] bg-[#eaf4ff] shadow-md" : "border-slate-200 bg-white hover:border-blue-200"}`}>
                <span className="flex items-center gap-2 text-xs font-black text-[#10233d]"><span className="h-3 w-3 rounded-full border border-white shadow" style={{ background: item.primary }} />{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">{collection.description}</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_24px_70px_rgba(6,43,92,.09)]">
          <div className="flex items-center justify-between border-b border-blue-50 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">Vista real de impresión</p>
              <h3 className="text-xl font-black text-[#10233d]">{selected.label}</h3>
            </div>
            <span className="rounded-full bg-[#eaf4ff] px-3 py-1.5 text-[10px] font-black text-[#1559b6]">{selected.widthMm} × {selected.heightMm} mm</span>
          </div>

          <div className="grid min-h-[650px] place-items-center bg-[radial-gradient(circle_at_top,#eaf4ff,transparent_65%)] p-5 sm:p-10">
            <MaterialPreview material={selected} collection={collection} url={links[selected.id]} restaurantName={restaurant.nombre} />
          </div>

          <div className="border-t border-blue-50 p-5 sm:p-6">
            <p className="text-sm font-semibold leading-6 text-slate-500">{selected.useCase}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ActionButton icon={<FileImage />} label="PNG 300 ppp" loading={working === `png-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "png")} primary />
              <ActionButton icon={<ImageIcon />} label="SVG imprenta" loading={working === `svg-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "svg")} />
              <ActionButton icon={<Printer />} label="Imprimir / PDF" loading={working === `print-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "print")} />
              <ActionButton icon={<QrCode />} label="QR con logo" loading={working === `qr-${selected.id}`} disabled={Boolean(working)} onClick={() => generatePackage(selected, "qr")} />
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">Biblioteca de soportes</p>
              <h3 className="text-2xl font-black text-[#10233d]">Dónde va a colocarse</h3>
            </div>
            <Layers3 className="h-5 w-5 text-[#1559b6]" />
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Cada pieza lleva su propio enlace para saber qué soporte genera más opiniones.</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {materials.map((material) => (
              <button key={material.id} type="button" onClick={() => setSelectedId(material.id)} className={`group overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg ${selected.id === material.id ? "border-[#1559b6] bg-[#eaf4ff] shadow-md shadow-blue-900/10" : "border-slate-200 bg-white"}`}>
                <div className="relative aspect-[4/3] overflow-hidden bg-[#062b5c]">
                  <img src={assetUrl(material.photo)} alt="" className="h-full w-full object-cover opacity-70 transition duration-300 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#062b5c] via-[#062b5c]/20 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
                    <span className="text-xs font-black">{material.shortLabel}</span>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[8px] font-black uppercase backdrop-blur">{material.kind === "social" ? "Digital" : "Imprimir"}</span>
                  </div>
                </div>
                <div className="p-3"><p className="text-[10px] font-bold leading-4 text-slate-500">{material.useCase}</p></div>
              </button>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            <TrustRow icon={<BadgeCheck />} title="Logo oficial" text="Se utiliza el archivo real de Hispanos Grill, también dentro del QR." />
            <TrustRow icon={<ShieldCheck />} title="QR protegido" text="Corrección H, área silenciosa y contraste revisado para impresión." />
            <TrustRow icon={<Sparkles />} title="Firma GastroHelp" text="Integrada con discreción como sello profesional, nunca como anuncio invasivo." />
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard icon={<Download />} title="Listo para imprenta" text="PNG a 300 ppp, SVG vectorial y PDF mediante impresión directa." />
        <InfoCard icon={<QrCode />} title="QR personalizado" text="Incluye el logo real en el centro sin comprometer la lectura." />
        <InfoCard icon={<Sparkles />} title="Powered by GastroHelp" text="Una firma elegante que aumenta el valor percibido del servicio." />
      </section>
    </div>
  );
}

function MaterialPreview({ material, collection, url, restaurantName }: { material: MaterialDefinition; collection: CollectionDefinition; url: string; restaurantName: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    Promise.all([fetchAsDataUrl(assetUrl("logo")), fetchAsDataUrl(assetUrl(material.photo))])
      .then(async ([logo, photo]) => {
        const qr = await buildBrandedQr(url, logo, collection.primary);
        const svg = buildMaterialSvg({ material, collection, restaurantName, qr, logo, photo });
        objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
        if (active) setPreviewUrl(objectUrl);
      })
      .catch(() => active && setPreviewUrl(null));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [material, collection, restaurantName, url]);

  const horizontal = material.widthMm > material.heightMm;
  const square = material.widthMm === material.heightMm;
  const previewClass = horizontal
    ? "aspect-[90/55] w-full max-w-[660px]"
    : square
      ? "aspect-square w-full max-w-[470px]"
      : material.id === "instagram-story"
        ? "aspect-[9/16] w-full max-w-[330px]"
        : "aspect-[105/148] w-full max-w-[410px]";

  return (
    <div className={`relative overflow-hidden rounded-[1.8rem] bg-white shadow-[0_34px_90px_rgba(6,43,92,.25)] ${previewClass}`}>
      {previewUrl ? <img src={previewUrl} alt={`Diseño ${material.label}`} className="h-full w-full object-contain" /> : <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[#1559b6]" /></div>}
    </div>
  );
}

function ActionButton({ icon, label, loading, disabled, onClick, primary }: { icon: React.ReactNode; label: string; loading: boolean; disabled: boolean; onClick: () => void; primary?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55 ${primary ? "bg-[#1559b6] text-white shadow-lg shadow-blue-700/20" : "border border-blue-100 bg-white text-[#10233d] hover:bg-[#f4f9ff]"}`}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{label}
    </button>
  );
}

function TrustRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3 rounded-2xl border border-blue-100 bg-[#f7fbff] p-4"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#1559b6] shadow-sm [&_svg]:h-4 [&_svg]:w-4">{icon}</div><div><p className="text-xs font-black text-[#10233d]">{title}</p><p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">{text}</p></div></div>;
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#1559b6] [&_svg]:h-4 [&_svg]:w-4">{icon}</div><h3 className="mt-4 font-black text-[#10233d]">{title}</h3><p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p></article>;
}

async function buildBrandedQr(url: string, logo: string, dark: string) {
  const raw = await QRCode.toDataURL(url, { width: 1400, margin: 3, errorCorrectionLevel: "H", color: { dark, light: "#ffffff" } });
  const [qrImage, logoImage] = await Promise.all([loadImage(raw), loadImage(logo)]);
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 1400;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas-failed");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1400, 1400);
  context.drawImage(qrImage, 0, 0, 1400, 1400);
  const plate = 260;
  const x = (1400 - plate) / 2;
  const y = x;
  context.fillStyle = "#ffffff";
  roundRect(context, x, y, plate, plate, 46);
  context.fill();
  context.strokeStyle = "rgba(6,43,92,.14)";
  context.lineWidth = 8;
  context.stroke();
  const pad = 26;
  context.drawImage(logoImage, x + pad, y + pad, plate - pad * 2, plate - pad * 2);
  return canvas.toDataURL("image/png", 1);
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

function buildMaterialSvg({ material, collection, restaurantName, qr, logo, photo }: { material: MaterialDefinition; collection: CollectionDefinition; restaurantName: string; qr: string; logo: string; photo: string }) {
  const width = Math.round(material.widthMm * 10);
  const height = Math.round(material.heightMm * 10);
  const horizontal = width > height;
  const square = width === height;
  const margin = Math.round(Math.min(width, height) * 0.05);
  const photoHeight = horizontal ? height : Math.round(height * 0.33);
  const qrSize = Math.round(Math.min(width, height) * (horizontal ? 0.43 : square ? 0.48 : 0.45));
  const qrX = horizontal ? width - qrSize - margin : (width - qrSize) / 2;
  const qrY = horizontal ? (height - qrSize) / 2 : height - qrSize - margin * 1.45;
  const logoSize = Math.round(Math.min(width, height) * (horizontal ? 0.22 : 0.18));
  const logoX = horizontal ? margin : (width - logoSize) / 2;
  const logoY = horizontal ? margin : Math.max(margin, photoHeight - logoSize * 0.52);
  const titleSize = Math.max(34, Math.round(Math.min(width, height) * (horizontal ? 0.073 : 0.068)));
  const subtitleSize = Math.max(18, Math.round(titleSize * 0.36));
  const titleX = horizontal ? margin : width / 2;
  const titleY = horizontal ? height * 0.50 : photoHeight + logoSize * 0.72;
  const anchor = horizontal ? "start" : "middle";
  const titleLines = wrapText(material.title, horizontal ? 21 : 20);
  const subtitleLines = wrapText(material.subtitle, horizontal ? 34 : 35);
  const darkMode = collection.id === "nocturna";
  const panelFill = darkMode ? collection.paper : "#fffdf9";
  const titleFill = darkMode ? "#ffffff" : collection.ink;
  const subtitleFill = darkMode ? "#d9eaff" : "#35516f";
  const footerY = height - Math.max(20, height * 0.025);
  const stars = "★  ★  ★  ★  ★";

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${material.widthMm}mm" height="${material.heightMm}mm" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="photoShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${collection.primary}" stop-opacity=".05"/><stop offset="1" stop-color="${collection.primary}" stop-opacity=".72"/></linearGradient>
      <linearGradient id="footer" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${collection.primary}"/><stop offset=".55" stop-color="${collection.secondary}"/><stop offset="1" stop-color="${collection.primary}"/></linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#001d45" flood-opacity=".24"/></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
      <clipPath id="canvas"><rect width="${width}" height="${height}" rx="${material.kind === "sticker" ? width / 2 : 34}"/></clipPath>
    </defs>
    <g clip-path="url(#canvas)">
      <rect width="${width}" height="${height}" fill="${panelFill}"/>
      <image href="${photo}" x="0" y="0" width="${width}" height="${photoHeight}" preserveAspectRatio="xMidYMid slice" opacity="${collection.photoOpacity}"/>
      <rect x="0" y="0" width="${width}" height="${photoHeight}" fill="url(#photoShade)"/>
      ${collection.id === "editorial" ? `<rect x="0" y="${photoHeight - 16}" width="${width}" height="16" fill="${collection.secondary}"/>` : ""}
      <rect x="0" y="${height - Math.max(44, height * 0.06)}" width="${width}" height="${Math.max(44, height * 0.06)}" fill="url(#footer)"/>
      <circle cx="${width * 0.82}" cy="${height * 0.18}" r="${width * 0.16}" fill="#ffffff" opacity=".07" filter="url(#soft)"/>
    </g>

    <rect x="${margin * 0.42}" y="${margin * 0.42}" width="${width - margin * 0.84}" height="${height - margin * 0.84}" rx="${material.kind === "sticker" ? width / 2 : 28}" fill="none" stroke="${collection.accent}" stroke-width="${Math.max(3, width * 0.0022)}" opacity=".95"/>

    <g filter="url(#shadow)">
      <rect x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.22}" fill="#ffffff" stroke="${collection.accent}" stroke-width="${Math.max(3, logoSize * 0.018)}"/>
      <image href="${logo}" x="${logoX + logoSize * 0.08}" y="${logoY + logoSize * 0.08}" width="${logoSize * 0.84}" height="${logoSize * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    </g>

    <text x="${horizontal ? logoX + logoSize + 24 : width / 2}" y="${horizontal ? logoY + logoSize * 0.52 : logoY + logoSize + titleSize * 0.42}" text-anchor="${horizontal ? "start" : "middle"}" fill="${horizontal ? "#ffffff" : collection.secondary}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(16, titleSize * 0.25)}" font-weight="900" letter-spacing="4">${escapeXml(restaurantName.toUpperCase())}</text>

    <text x="${titleX}" y="${titleY - titleSize * 0.55}" text-anchor="${anchor}" fill="${collection.accent}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(17, titleSize * 0.28)}" font-weight="900" letter-spacing="6">${stars}</text>
    ${titleLines.map((line, index) => `<text x="${titleX}" y="${titleY + index * titleSize * 1.0}" text-anchor="${anchor}" fill="${titleFill}" font-family="Georgia, 'Times New Roman', serif" font-size="${titleSize}" font-weight="700">${escapeXml(line)}</text>`).join("")}
    ${subtitleLines.map((line, index) => `<text x="${titleX}" y="${titleY + titleLines.length * titleSize * 1.04 + 32 + index * subtitleSize * 1.35}" text-anchor="${anchor}" fill="${subtitleFill}" font-family="Arial, Helvetica, sans-serif" font-size="${subtitleSize}" font-weight="650">${escapeXml(line)}</text>`).join("")}

    <g filter="url(#shadow)">
      <rect x="${qrX - 18}" y="${qrY - 18}" width="${qrSize + 36}" height="${qrSize + 36}" rx="${Math.max(24, qrSize * 0.08)}" fill="#ffffff" stroke="${collection.secondary}" stroke-width="${Math.max(5, qrSize * 0.012)}"/>
      <image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    </g>

    ${!horizontal ? `<g><rect x="${width * 0.18}" y="${qrY + qrSize + margin * 0.34}" width="${width * 0.64}" height="${Math.max(44, titleSize * 0.9)}" rx="${Math.max(18, titleSize * 0.4)}" fill="${collection.primary}"/><text x="${width / 2}" y="${qrY + qrSize + margin * 0.34 + Math.max(44, titleSize * 0.9) * 0.64}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(17, titleSize * 0.28)}" font-weight="900" letter-spacing="2">ESCANEA AHORA</text></g>` : ""}

    <text x="${width / 2}" y="${footerY}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(13, Math.min(width, height) * 0.022)}" font-weight="700" letter-spacing="2">REPUTATION SYSTEM BY</text>
    <text x="${width / 2}" y="${footerY + Math.max(17, Math.min(width, height) * 0.028)}" text-anchor="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(18, Math.min(width, height) * 0.032)}" font-weight="900">GastroHelp</text>
  </svg>`;
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

function wrapText(text: string, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) { lines.push(current); current = word; } else { current = next; }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function escapeHtml(value: string) { return escapeXml(value); }
function downloadBlob(blob: Blob, filename: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function downloadDataUrl(dataUrl: string, filename: string) { const anchor = document.createElement("a"); anchor.href = dataUrl; anchor.download = filename; anchor.click(); }
