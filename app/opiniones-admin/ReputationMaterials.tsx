"use client";

import {
  Download,
  ExternalLink,
  FileDown,
  Loader2,
  Printer,
  QrCode,
} from "lucide-react";
import QRCode from "qrcode";
import { useMemo, useState } from "react";
import type { OpinionConfig, OriginKey, Restaurant } from "./reputation";

const PX_PER_MM_300_DPI = 300 / 25.4;

type MaterialDefinition = {
  id: string;
  origin: Exclude<OriginKey, "redes" | "desconocido">;
  label: string;
  title: string;
  subtitle: string;
  widthMm: number;
  heightMm: number;
  useCase: string;
};

const materials: MaterialDefinition[] = [
  {
    id: "mesa",
    origin: "mesa",
    label: "Cartel de mesa",
    title: "Tu opinión nos hace mejores",
    subtitle: "Escanea y cuéntanos cómo ha sido tu experiencia.",
    widthMm: 105,
    heightMm: 148,
    useCase: "Metacrilato A6, sobremesa o soporte de madera.",
  },
  {
    id: "portacuentas",
    origin: "portacuentas",
    label: "Tarjeta portacuentas",
    title: "Gracias por visitarnos",
    subtitle: "Antes de irte, cuéntanos qué te ha parecido.",
    widthMm: 90,
    heightMm: 55,
    useCase: "Tarjeta horizontal para introducir en el portacuentas.",
  },
  {
    id: "caja",
    origin: "caja",
    label: "Cartel de caja",
    title: "¿Qué tal ha sido tu visita?",
    subtitle: "Tu opinión nos ayuda a cuidar cada detalle.",
    widthMm: 148,
    heightMm: 210,
    useCase: "A5 para mostrador, caja o recepción.",
  },
  {
    id: "entrada",
    origin: "entrada",
    label: "Cartel de entrada",
    title: "¿Has comido con nosotros?",
    subtitle: "Escanea el código y comparte tu experiencia.",
    widthMm: 210,
    heightMm: 297,
    useCase: "A4 para puerta, escaparate o zona de salida.",
  },
];

export default function ReputationMaterials({
  config,
  restaurant,
}: {
  config: OpinionConfig;
  restaurant: Restaurant;
}) {
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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

  async function downloadQr(material: MaterialDefinition) {
    setWorking(`qr-${material.id}`);
    setMessage(null);
    try {
      const dataUrl = await QRCode.toDataURL(links[material.id], {
        width: 1600,
        margin: 3,
        errorCorrectionLevel: "H",
        color: { dark: "#111827", light: "#ffffff" },
      });
      downloadDataUrl(dataUrl, `qr-${config.slug}-${material.origin}.png`);
      setMessage(`QR de ${material.label.toLowerCase()} descargado.`);
    } catch {
      setMessage("No se pudo generar el QR. Inténtalo de nuevo.");
    } finally {
      setWorking(null);
    }
  }

  async function createMaterial(material: MaterialDefinition, mode: "download" | "print") {
    setWorking(`${mode}-${material.id}`);
    setMessage(null);
    try {
      const dataUrl = await renderMaterial({
        material,
        url: links[material.id],
        config,
        restaurant,
      });

      if (mode === "download") {
        downloadDataUrl(dataUrl, `${config.slug}-${material.id}-300dpi.png`);
        setMessage(`${material.label} descargado a 300 ppp.`);
      } else {
        const printWindow = window.open("", "_blank", "noopener,noreferrer");
        if (!printWindow) throw new Error("popup-blocked");
        printWindow.document.write(`<!doctype html>
          <html lang="es"><head><title>${escapeHtml(material.label)}</title>
          <style>
            @page { size: ${material.widthMm}mm ${material.heightMm}mm; margin: 0; }
            html, body { margin: 0; width: ${material.widthMm}mm; height: ${material.heightMm}mm; }
            img { display: block; width: 100%; height: 100%; object-fit: contain; }
          </style></head><body><img src="${dataUrl}" alt="${escapeHtml(material.label)}" />
          <script>window.onload=()=>{window.print();};<\/script></body></html>`);
        printWindow.document.close();
        setMessage("Ventana de impresión preparada. Puedes guardarla como PDF.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "popup-blocked"
          ? "El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes y repite."
          : "No se pudo generar el material. Inténtalo de nuevo.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
              Materiales listos para producción
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              Un QR distinto para cada punto del restaurante
            </h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
              Cada ubicación tiene su propio enlace. Así podrás saber si convierten mejor las mesas, la caja, la entrada o el portacuentas.
            </p>
          </div>
          <a
            href={`${baseUrl}/opinion/${config.slug}?origen=redes`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:-translate-y-0.5 hover:bg-slate-50"
          >
            Ver experiencia pública
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {message && (
          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
            {message}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {materials.map((material) => (
          <MaterialCard
            key={material.id}
            material={material}
            config={config}
            restaurant={restaurant}
            link={links[material.id]}
            working={working}
            onQr={() => downloadQr(material)}
            onDownload={() => createMaterial(material, "download")}
            onPrint={() => createMaterial(material, "print")}
          />
        ))}
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Resolución profesional"
          text="Los diseños se generan a 300 ppp, con tamaño real y suficiente calidad para imprenta."
        />
        <InfoCard
          title="Medición por ubicación"
          text="El parámetro de origen permite comparar cuántas opiniones llegan desde cada soporte."
        />
        <InfoCard
          title="Entrega flexible"
          text="Puedes descargar PNG, imprimir directamente o guardar la impresión como PDF."
        />
      </section>
    </div>
  );
}

function MaterialCard({
  material,
  config,
  restaurant,
  link,
  working,
  onQr,
  onDownload,
  onPrint,
}: {
  material: MaterialDefinition;
  config: OpinionConfig;
  restaurant: Restaurant;
  link: string;
  working: string | null;
  onQr: () => void;
  onDownload: () => void;
  onPrint: () => void;
}) {
  const busy = working?.endsWith(material.id);

  return (
    <article className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
      <div className="grid min-h-[25rem] place-items-center bg-[radial-gradient(circle_at_top,#eff6ff,transparent_58%)] p-6">
        <div
          className={`relative flex overflow-hidden rounded-2xl border border-black/5 bg-white p-4 shadow-[0_24px_70px_rgba(15,23,42,.16)] ${
            material.id === "portacuentas"
              ? "aspect-[90/55] w-full max-w-md items-center"
              : material.id === "entrada"
                ? "aspect-[210/297] w-56 flex-col"
                : material.id === "caja"
                  ? "aspect-[148/210] w-56 flex-col"
                  : "aspect-[105/148] w-56 flex-col"
          }`}
        >
          <div
            className="absolute inset-x-0 top-0 h-2"
            style={{ background: config.color_primary }}
          />
          <div className={material.id === "portacuentas" ? "flex w-full items-center gap-4" : "flex h-full flex-col items-center text-center"}>
            <div className={material.id === "portacuentas" ? "min-w-0 flex-1" : "mt-3"}>
              <p
                className="text-[9px] font-black uppercase tracking-[0.16em]"
                style={{ color: config.color_primary }}
              >
                {restaurant.nombre}
              </p>
              <h3
                className={`${material.id === "portacuentas" ? "mt-2 text-base" : "mt-4 text-xl"} font-black leading-tight`}
                style={{ color: config.color_secondary }}
              >
                {material.title}
              </h3>
              <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">
                {material.subtitle}
              </p>
            </div>
            <QrPreview url={link} compact={material.id === "portacuentas"} />
            {material.id !== "portacuentas" && (
              <p className="mt-auto pt-3 text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
                Escanea · Valora · Ayúdanos a mejorar
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-950">{material.label}</h3>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-500">
              {material.useCase}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">
            {material.widthMm} × {material.heightMm} mm
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <ActionButton
            icon={<QrCode />}
            label="Solo QR"
            disabled={busy}
            loading={working === `qr-${material.id}`}
            onClick={onQr}
          />
          <ActionButton
            icon={<Download />}
            label="PNG 300 ppp"
            disabled={busy}
            loading={working === `download-${material.id}`}
            onClick={onDownload}
          />
          <ActionButton
            icon={<Printer />}
            label="Imprimir / PDF"
            disabled={busy}
            loading={working === `print-${material.id}`}
            onClick={onPrint}
          />
        </div>
      </div>
    </article>
  );
}

function QrPreview({ url, compact }: { url: string; compact?: boolean }) {
  const [src, setSrc] = useState("");

  useMemo(() => {
    let active = true;
    QRCode.toDataURL(url, { width: 500, margin: 2, errorCorrectionLevel: "H" })
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [url]);

  if (!src) {
    return (
      <div className={`${compact ? "h-24 w-24" : "mt-5 h-32 w-32"} animate-pulse rounded-xl bg-slate-100`} />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Código QR" className={`${compact ? "h-24 w-24" : "mt-5 h-32 w-32"} rounded-xl`} />;
}

function ActionButton({
  icon,
  label,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-2 text-center text-[11px] font-black text-slate-700 transition enabled:hover:-translate-y-0.5 enabled:hover:bg-slate-50 disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4"
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <FileDown className="h-5 w-5 text-blue-700" />
      <h3 className="mt-3 text-sm font-black text-slate-950">{title}</h3>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{text}</p>
    </div>
  );
}

async function renderMaterial({
  material,
  url,
  config,
  restaurant,
}: {
  material: MaterialDefinition;
  url: string;
  config: OpinionConfig;
  restaurant: Restaurant;
}) {
  const width = Math.round(material.widthMm * PX_PER_MM_300_DPI);
  const height = Math.round(material.heightMm * PX_PER_MM_300_DPI);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");

  context.fillStyle = config.color_background || "#fbfaf7";
  context.fillRect(0, 0, width, height);

  const barHeight = Math.max(20, Math.round(height * 0.018));
  context.fillStyle = config.color_primary;
  context.fillRect(0, 0, width, barHeight);

  const padding = Math.round(width * 0.09);
  const horizontal = material.id === "portacuentas";
  const qrSize = horizontal
    ? Math.round(Math.min(height * 0.68, width * 0.32))
    : Math.round(Math.min(width * 0.58, height * 0.36));
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: qrSize,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#111827", light: "#ffffff" },
  });
  const qrImage = await loadImage(qrDataUrl);

  context.textAlign = horizontal ? "left" : "center";
  context.textBaseline = "top";
  context.fillStyle = config.color_primary;
  context.font = `800 ${Math.max(20, Math.round(width * 0.038))}px Arial`;
  const brandX = horizontal ? padding : width / 2;
  context.fillText(restaurant.nombre.toUpperCase(), brandX, padding);

  context.fillStyle = config.color_secondary;
  context.font = `800 ${Math.max(28, Math.round(width * (horizontal ? 0.07 : 0.085)))}px Arial`;
  const textWidth = horizontal ? Math.round(width * 0.53) : width - padding * 2;
  const titleY = padding + Math.round(width * 0.085);
  const titleBottom = drawWrappedText(
    context,
    material.title,
    brandX,
    titleY,
    textWidth,
    Math.round(width * (horizontal ? 0.086 : 0.105)),
    horizontal ? "left" : "center",
  );

  context.fillStyle = "#64748b";
  context.font = `600 ${Math.max(18, Math.round(width * 0.035))}px Arial`;
  drawWrappedText(
    context,
    material.subtitle,
    brandX,
    titleBottom + Math.round(width * 0.035),
    textWidth,
    Math.round(width * 0.052),
    horizontal ? "left" : "center",
  );

  const qrX = horizontal ? width - padding - qrSize : Math.round((width - qrSize) / 2);
  const qrY = horizontal ? Math.round((height - qrSize) / 2) : Math.round(height * 0.47);
  const qrPadding = Math.round(qrSize * 0.08);
  roundedRect(context, qrX - qrPadding, qrY - qrPadding, qrSize + qrPadding * 2, qrSize + qrPadding * 2, qrPadding);
  context.fillStyle = "#ffffff";
  context.fill();
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  if (!horizontal) {
    context.fillStyle = config.color_secondary;
    context.font = `800 ${Math.max(20, Math.round(width * 0.038))}px Arial`;
    context.textAlign = "center";
    context.fillText("ESCANEA AQUÍ", width / 2, qrY + qrSize + Math.round(height * 0.045));
    context.fillStyle = "#94a3b8";
    context.font = `700 ${Math.max(14, Math.round(width * 0.025))}px Arial`;
    context.fillText(
      "VALORA · COMENTA · AYÚDANOS A MEJORAR",
      width / 2,
      height - padding,
    );
  }

  return canvas.toDataURL("image/png", 1);
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  align: CanvasTextAlign,
) {
  context.textAlign = align;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  lines.forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function downloadDataUrl(dataUrl: string, fileName: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#039;",
      '"': "&quot;",
    };
    return entities[character];
  });
}
