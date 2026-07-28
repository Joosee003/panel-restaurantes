"use client";

import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileImage,
  ImageIcon,
  Loader2,
  Printer,
  QrCode,
  Share2,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { HISPANOS_BRAND } from "@/lib/opiniones/hispanos-brand";
import type { OpinionConfig, OriginKey, Restaurant } from "./reputation";

type AssetId = "hero" | "exterior" | "food1" | "food2" | "food3";
type MaterialKind = "print" | "social" | "sticker";

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

const materials: MaterialDefinition[] = [
  {
    id: "poster-a4",
    origin: "caja",
    label: "Cartel A4 premium",
    shortLabel: "Cartel A4",
    title: "Tu opinión nos ayuda a mejorar",
    subtitle: "Escanea el código y cuéntanos cómo ha sido tu experiencia.",
    widthMm: 210,
    heightMm: 297,
    useCase: "Para caja, recepción, escaparate o zona de salida.",
    photo: "hero",
    kind: "print",
  },
  {
    id: "sobremesa",
    origin: "mesa",
    label: "Sobremesa / table tent",
    shortLabel: "Sobremesa",
    title: "¿Qué tal ha ido todo?",
    subtitle: "Tu opinión nos ayuda a cuidar cada detalle.",
    widthMm: 105,
    heightMm: 148,
    useCase: "Para metacrilato A6 o soporte de sobremesa.",
    photo: "food1",
    kind: "print",
  },
  {
    id: "portacuentas",
    origin: "portacuentas",
    label: "Tarjeta para la cuenta",
    shortLabel: "Tarjeta",
    title: "Gracias por elegirnos",
    subtitle: "Antes de irte, déjanos tu opinión.",
    widthMm: 90,
    heightMm: 55,
    useCase: "Tarjeta horizontal para introducir en el portacuentas.",
    photo: "food2",
    kind: "print",
  },
  {
    id: "pegatina",
    origin: "entrada",
    label: "Pegatina para puerta",
    shortLabel: "Pegatina",
    title: "Tu opinión nos inspira",
    subtitle: "Escanea y ayúdanos a seguir mejorando.",
    widthMm: 120,
    heightMm: 120,
    useCase: "Para puerta, escaparate, caja o zona de recogida.",
    photo: "exterior",
    kind: "sticker",
  },
  {
    id: "instagram-story",
    origin: "redes",
    label: "Historia de Instagram",
    shortLabel: "Instagram",
    title: "Tu opinión nos ayuda a mejorar",
    subtitle: "Escanea y comparte tu experiencia con Hispanos Grill.",
    widthMm: 108,
    heightMm: 192,
    useCase: "Formato 1080 × 1920 para historias y reels.",
    photo: "food3",
    kind: "social",
  },
  {
    id: "whatsapp",
    origin: "redes",
    label: "Imagen para WhatsApp",
    shortLabel: "WhatsApp",
    title: "Gracias por tu visita",
    subtitle: "Tu opinión nos ayuda a mejorar cada día.",
    widthMm: 108,
    heightMm: 135,
    useCase: "Formato vertical para estado, difusión o envío directo.",
    photo: "food1",
    kind: "social",
  },
];

const assetUrl = (id: "logo" | AssetId) =>
  `/api/reputacion/brand-asset?id=${id}`;

export default function ReputationMaterials({
  config,
  restaurant,
}: {
  config: OpinionConfig;
  restaurant: Restaurant;
}) {
  const [selectedId, setSelectedId] = useState(materials[0].id);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const selected =
    materials.find((material) => material.id === selectedId) ?? materials[0];
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
      const qr = await QRCode.toDataURL(links[material.id], {
        width: 1400,
        margin: 2,
        errorCorrectionLevel: "H",
        color: { dark: HISPANOS_BRAND.colors.navy, light: "#ffffff" },
      });

      if (mode === "qr") {
        downloadDataUrl(qr, `qr-${config.slug}-${material.origin}.png`);
        setMessage(`QR de ${material.shortLabel.toLowerCase()} descargado.`);
        return;
      }

      const [logo, photo] = await Promise.all([
        fetchAsDataUrl(assetUrl("logo")),
        fetchAsDataUrl(assetUrl(material.photo)),
      ]);
      const svg = buildMaterialSvg({
        material,
        restaurantName: restaurant.nombre,
        qr,
        logo,
        photo,
      });

      if (mode === "svg") {
        downloadBlob(
          new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
          `${config.slug}-${material.id}.svg`,
        );
        setMessage(`${material.label} descargado en formato vectorial.`);
        return;
      }

      if (mode === "print") {
        const printWindow = window.open("", "_blank", "noopener,noreferrer");
        if (!printWindow) throw new Error("popup-blocked");
        printWindow.document.write(`<!doctype html><html lang="es"><head>
          <title>${escapeHtml(material.label)}</title>
          <style>@page{size:${material.widthMm}mm ${material.heightMm}mm;margin:0}html,body{margin:0;width:${material.widthMm}mm;height:${material.heightMm}mm;overflow:hidden}svg{display:block;width:100%;height:100%}</style>
          </head><body>${svg}<script>window.onload=()=>setTimeout(()=>window.print(),350);<\/script></body></html>`);
        printWindow.document.close();
        setMessage("Impresión preparada. También puedes guardarla como PDF.");
        return;
      }

      const dataUrl = await svgToPng(svg, material);
      downloadDataUrl(dataUrl, `${config.slug}-${material.id}-alta-calidad.png`);
      setMessage(`${material.label} descargado en PNG de alta calidad.`);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "popup-blocked"
          ? "El navegador bloqueó la ventana. Permite ventanas emergentes y repite."
          : "No se pudo generar el diseño. Pulsa de nuevo en unos segundos.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-blue-100 bg-[#062b5c] p-6 text-white shadow-[0_30px_80px_rgba(6,43,92,.18)] sm:p-8">
        <div className="absolute inset-0 opacity-30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={assetUrl("hero")}
            alt="Interior de Hispanos Grill"
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,43,92,.98),rgba(6,43,92,.78),rgba(21,89,182,.45))]" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-blue-100 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5" /> Estudio creativo incluido
            </div>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              Materiales que parecen diseñados a medida.
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-blue-100/90">
              Fotografías reales, logo oficial y tonos azules y blancos de Hispanos Grill. Elige un formato y descárgalo listo para imprimir o compartir.
            </p>
          </div>
          <a
            href={`/opinion/${config.slug}?origen=redes`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-[#062b5c] shadow-xl transition hover:-translate-y-0.5"
          >
            Ver experiencia pública <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </section>

      {message && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-900">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          {message}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
        <section className="overflow-hidden rounded-[2rem] border border-blue-100 bg-white shadow-[0_24px_70px_rgba(6,43,92,.09)]">
          <div className="flex items-center justify-between border-b border-blue-50 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">
                Vista previa
              </p>
              <h3 className="text-xl font-black text-[#10233d]">{selected.label}</h3>
            </div>
            <span className="rounded-full bg-[#eaf4ff] px-3 py-1.5 text-[10px] font-black text-[#1559b6]">
              {selected.widthMm} × {selected.heightMm} mm
            </span>
          </div>

          <div className="grid min-h-[590px] place-items-center bg-[radial-gradient(circle_at_top,#eaf4ff,transparent_62%)] p-6 sm:p-10">
            <MaterialPreview
              material={selected}
              url={links[selected.id]}
              restaurantName={restaurant.nombre}
            />
          </div>

          <div className="border-t border-blue-50 p-5 sm:p-6">
            <p className="text-sm font-semibold leading-6 text-slate-500">
              {selected.useCase}
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <ActionButton
                icon={<FileImage />}
                label="PNG alta calidad"
                loading={working === `png-${selected.id}`}
                disabled={Boolean(working)}
                onClick={() => generatePackage(selected, "png")}
                primary
              />
              <ActionButton
                icon={<ImageIcon />}
                label="SVG vectorial"
                loading={working === `svg-${selected.id}`}
                disabled={Boolean(working)}
                onClick={() => generatePackage(selected, "svg")}
              />
              <ActionButton
                icon={<Printer />}
                label="Imprimir / PDF"
                loading={working === `print-${selected.id}`}
                disabled={Boolean(working)}
                onClick={() => generatePackage(selected, "print")}
              />
              <ActionButton
                icon={<QrCode />}
                label="Solo QR"
                loading={working === `qr-${selected.id}`}
                disabled={Boolean(working)}
                onClick={() => generatePackage(selected, "qr")}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-blue-100 bg-white p-5 shadow-[0_24px_70px_rgba(6,43,92,.08)] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.17em] text-[#1559b6]">
                Biblioteca visual
              </p>
              <h3 className="text-2xl font-black text-[#10233d]">Elige el soporte</h3>
            </div>
            <Share2 className="h-5 w-5 text-[#1559b6]" />
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
            Cada soporte utiliza un enlace distinto para medir desde dónde llegan las opiniones.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            {materials.map((material) => (
              <button
                key={material.id}
                type="button"
                onClick={() => setSelectedId(material.id)}
                className={`group overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5 hover:shadow-lg ${
                  selected.id === material.id
                    ? "border-[#1559b6] bg-[#eaf4ff] shadow-md shadow-blue-900/10"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[#062b5c]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={assetUrl(material.photo)}
                    alt=""
                    className="h-full w-full object-cover opacity-65 transition duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#062b5c] via-[#062b5c]/20 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
                    <span className="text-xs font-black">{material.shortLabel}</span>
                    <span className="rounded-full bg-white/15 px-2 py-1 text-[8px] font-black uppercase backdrop-blur">
                      {material.kind === "social" ? "Digital" : "Imprimir"}
                    </span>
                  </div>
                </div>
                <div className="p-3">
                  <p className="text-[10px] font-bold leading-4 text-slate-500">
                    {material.useCase}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-blue-100 bg-[#f4f9ff] p-4">
            <p className="text-xs font-black text-[#10233d]">Diseño protegido para impresión</p>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">
              El QR mantiene contraste alto y margen de seguridad. Antes de mandar a imprenta, prueba una copia con la cámara del móvil.
            </p>
          </div>
        </section>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          icon={<Download />}
          title="Listo para enviar"
          text="Descarga PNG para WhatsApp o SVG para diseñador e imprenta."
        />
        <InfoCard
          icon={<QrCode />}
          title="Medición por soporte"
          text="Mesa, caja, portacuentas, entrada y redes conservan su origen."
        />
        <InfoCard
          icon={<Sparkles />}
          title="Marca real"
          text="Logo oficial, fotos reales y paleta azul y blanca de Hispanos Grill."
        />
      </section>
    </div>
  );
}

function MaterialPreview({
  material,
  url,
  restaurantName,
}: {
  material: MaterialDefinition;
  url: string;
  restaurantName: string;
}) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(url, {
      width: 900,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: HISPANOS_BRAND.colors.navy, light: "#ffffff" },
    }).then((value) => active && setQr(value));
    return () => {
      active = false;
    };
  }, [url]);

  const isHorizontal = material.widthMm > material.heightMm;
  const isSquare = material.widthMm === material.heightMm;
  const previewClass = isHorizontal
    ? "aspect-[90/55] w-full max-w-[560px]"
    : isSquare
      ? "aspect-square w-full max-w-[430px] rounded-full"
      : material.id === "instagram-story"
        ? "aspect-[9/16] w-full max-w-[300px]"
        : "aspect-[105/148] w-full max-w-[360px]";

  return (
    <article
      className={`relative overflow-hidden border border-blue-950/10 bg-white shadow-[0_34px_90px_rgba(6,43,92,.24)] ${previewClass} ${
        isSquare ? "rounded-full" : "rounded-[1.8rem]"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(material.photo)}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,43,92,.2),rgba(6,43,92,.92))]" />
      <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-[#062b5c] via-[#2478d4] to-[#062b5c]" />

      <div
        className={`relative flex h-full ${
          isHorizontal ? "items-center gap-5 p-5" : "flex-col items-center p-6 text-center"
        }`}
      >
        <div className={isHorizontal ? "min-w-0 flex-1" : "w-full"}>
          <div className={`flex ${isHorizontal ? "items-center gap-3" : "justify-center"}`}>
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={assetUrl("logo")}
                alt={`Logo de ${restaurantName}`}
                className="h-full w-full object-contain"
              />
            </div>
            {isHorizontal && (
              <p className="text-[10px] font-black uppercase tracking-[.16em] text-blue-100">
                {restaurantName}
              </p>
            )}
          </div>
          {!isHorizontal && (
            <p className="mt-3 text-[10px] font-black uppercase tracking-[.18em] text-blue-100">
              {restaurantName}
            </p>
          )}
          <h4
            className={`${isHorizontal ? "mt-3 text-2xl" : "mt-5 text-3xl"} font-black leading-[.95] tracking-tight text-white`}
          >
            {material.title}
          </h4>
          <p className="mt-3 text-[11px] font-semibold leading-5 text-blue-50/90">
            {material.subtitle}
          </p>
        </div>

        <div
          className={`${isHorizontal ? "w-[34%]" : "mt-auto w-[58%] max-w-[210px]"} rounded-[1.2rem] bg-white p-2 shadow-2xl`}
        >
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Código QR" className="aspect-square w-full" />
          ) : (
            <div className="grid aspect-square place-items-center bg-slate-50">
              <Loader2 className="h-6 w-6 animate-spin text-[#1559b6]" />
            </div>
          )}
        </div>
        {!isHorizontal && (
          <p className="mt-3 text-[9px] font-black uppercase tracking-[.18em] text-white">
            Escanea · Valora · Ayúdanos a mejorar
          </p>
        )}
      </div>
    </article>
  );
}

function ActionButton({
  icon,
  label,
  loading,
  disabled,
  onClick,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-[11px] font-black transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-55 ${
        primary
          ? "bg-[#1559b6] text-white shadow-lg shadow-blue-700/20"
          : "border border-blue-100 bg-white text-[#10233d] hover:bg-[#f4f9ff]"
      }`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#eaf4ff] text-[#1559b6] [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <h3 className="mt-4 font-black text-[#10233d]">{title}</h3>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p>
    </article>
  );
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

function buildMaterialSvg({
  material,
  restaurantName,
  qr,
  logo,
  photo,
}: {
  material: MaterialDefinition;
  restaurantName: string;
  qr: string;
  logo: string;
  photo: string;
}) {
  const width = Math.round(material.widthMm * 10);
  const height = Math.round(material.heightMm * 10);
  const horizontal = width > height;
  const qrSize = Math.round(Math.min(width, height) * (horizontal ? 0.42 : 0.52));
  const qrX = horizontal ? width - qrSize - width * 0.06 : (width - qrSize) / 2;
  const qrY = horizontal ? (height - qrSize) / 2 : height - qrSize - height * 0.09;
  const logoSize = Math.round(Math.min(width, height) * 0.18);
  const titleSize = Math.max(34, Math.round(Math.min(width, height) * 0.075));
  const subtitleSize = Math.max(18, Math.round(titleSize * 0.38));
  const textWidth = horizontal ? width * 0.48 : width * 0.82;
  const titleX = horizontal ? width * 0.07 : width / 2;
  const titleY = horizontal ? height * 0.45 : height * 0.33;
  const anchor = horizontal ? "start" : "middle";
  const titleLines = wrapText(material.title, horizontal ? 22 : 19);
  const subtitleLines = wrapText(material.subtitle, horizontal ? 40 : 34);

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${material.widthMm}mm" height="${material.heightMm}mm" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="overlay" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#062b5c" stop-opacity=".28"/>
        <stop offset="1" stop-color="#062b5c" stop-opacity=".96"/>
      </linearGradient>
      <linearGradient id="bluebar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#062b5c"/><stop offset=".5" stop-color="#2478d4"/><stop offset="1" stop-color="#062b5c"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#001d45" flood-opacity=".35"/></filter>
      <clipPath id="canvas"><rect width="${width}" height="${height}" rx="${material.kind === "sticker" ? width / 2 : 30}"/></clipPath>
    </defs>
    <g clip-path="url(#canvas)">
      <image href="${photo}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>
      <rect width="${width}" height="${height}" fill="url(#overlay)"/>
      <rect width="${width}" height="${Math.max(12, height * 0.018)}" fill="url(#bluebar)"/>
    </g>
    <g filter="url(#shadow)">
      <rect x="${horizontal ? width * 0.06 : (width - logoSize) / 2}" y="${height * 0.07}" width="${logoSize}" height="${logoSize}" rx="${logoSize * 0.2}" fill="#fff"/>
      <image href="${logo}" x="${horizontal ? width * 0.06 + logoSize * 0.08 : (width - logoSize) / 2 + logoSize * 0.08}" y="${height * 0.07 + logoSize * 0.08}" width="${logoSize * 0.84}" height="${logoSize * 0.84}" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <text x="${horizontal ? width * 0.06 + logoSize + 20 : width / 2}" y="${height * 0.07 + logoSize * 0.56}" text-anchor="${horizontal ? "start" : "middle"}" fill="#eaf4ff" font-family="Arial, sans-serif" font-size="${Math.max(16, titleSize * 0.28)}" font-weight="800" letter-spacing="3">${escapeXml(restaurantName.toUpperCase())}</text>
    ${titleLines
      .map(
        (line, index) =>
          `<text x="${titleX}" y="${titleY + index * titleSize * 1.02}" text-anchor="${anchor}" fill="#fff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="900">${escapeXml(line)}</text>`,
      )
      .join("")}
    ${subtitleLines
      .map(
        (line, index) =>
          `<text x="${titleX}" y="${titleY + titleLines.length * titleSize * 1.08 + 28 + index * subtitleSize * 1.35}" text-anchor="${anchor}" fill="#eaf4ff" font-family="Arial, sans-serif" font-size="${subtitleSize}" font-weight="600">${escapeXml(line)}</text>`,
      )
      .join("")}
    <g filter="url(#shadow)">
      <rect x="${qrX - 14}" y="${qrY - 14}" width="${qrSize + 28}" height="${qrSize + 28}" rx="24" fill="#fff"/>
      <image href="${qr}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    </g>
    ${!horizontal ? `<text x="${width / 2}" y="${height - height * 0.035}" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="${Math.max(14, titleSize * 0.28)}" font-weight="800" letter-spacing="2">ESCANEA · VALORA · AYÚDANOS A MEJORAR</text>` : ""}
    <rect x="${width * 0.04}" y="${height * 0.04}" width="${width * 0.92}" height="${height * 0.92}" rx="${material.kind === "sticker" ? width / 2 : 24}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="3"/>
    <rect x="0" y="0" width="${textWidth * 0}" height="0" fill="none"/>
  </svg>`;
}

async function svgToPng(svg: string, material: MaterialDefinition) {
  const width = material.kind === "social" ? 1080 : Math.round(material.widthMm * (300 / 25.4));
  const height = material.kind === "social" ? Math.round(width * (material.heightMm / material.widthMm)) : Math.round(material.heightMm * (300 / 25.4));
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image-failed"));
      element.src = url;
    });
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
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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
