"use client";

import { useEffect, useMemo, useState } from "react";
import { QrCode, Download, Link2, Table2, Printer, Store } from "lucide-react";
import QRCode from "qrcode";

type MesaQR = {
  mesa: number;
  url: string;
};

export default function QRMesasPage() {
  const [tokenCarta, setTokenCarta] = useState(
    "680e5c04d4f7bfd3f0b25526c7a85d98"
  );
  const [baseUrl, setBaseUrl] = useState("https://panel.gastrohelp.es");
  const [mesaDesde, setMesaDesde] = useState(1);
  const [mesaHasta, setMesaHasta] = useState(10);
  const [nombreRestaurante, setNombreRestaurante] = useState("GastroHelp Demo");
  const [tituloQR, setTituloQR] = useState("Carta digital");
  const [subtituloQR, setSubtituloQR] = useState(
    "Escanea para ver la carta y pedir desde tu mesa"
  );
  const [pieQR, setPieQR] = useState("Haz tu pedido desde el móvil");
  const [descargandoTodos, setDescargandoTodos] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setIsDark(root.classList.contains("dark"));

    read();

    const obs = new MutationObserver(read);
    obs.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => obs.disconnect();
  }, []);

  const pageClass = isDark
    ? "min-h-screen bg-slate-950 p-6 text-slate-100"
    : "min-h-screen bg-slate-50 p-6 text-slate-900";

  const iconBoxClass = isDark
    ? "rounded-2xl bg-white/5 p-3 text-white shadow-sm ring-1 ring-white/10"
    : "rounded-2xl bg-slate-900 p-3 text-white shadow-sm";

  const titleClass = isDark
    ? "text-3xl font-black text-white"
    : "text-3xl font-black text-slate-900";

  const subtitleClass = isDark
    ? "mt-1 text-slate-400"
    : "mt-1 text-slate-500";

  const primaryButtonClass = isDark
    ? "flex items-center justify-center gap-2 rounded-2xl bg-white/5 px-5 py-3 text-sm font-black text-white shadow-sm ring-1 ring-white/10 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
    : "flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

  const panelClass = isDark
    ? "rounded-3xl border border-white/10 bg-white/5 p-6 shadow-sm"
    : "rounded-3xl border border-slate-200 bg-white p-6 shadow-sm";

  const inputClass = isDark
    ? "w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-white/20 focus:ring-4 focus:ring-white/10"
    : "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-300 focus:ring-4 focus:ring-slate-100";

  const labelClass = isDark
    ? "mb-2 block text-sm font-black text-slate-200"
    : "mb-2 block text-sm font-black text-slate-700";

  const cardClass = isDark
    ? "rounded-3xl border border-white/10 bg-white/5 p-5 shadow-sm transition hover:bg-white/[0.07]"
    : "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md";

  const tableIconClass = isDark
    ? "rounded-2xl bg-white/5 p-3 text-slate-300 ring-1 ring-white/10"
    : "rounded-2xl bg-slate-100 p-3 text-slate-700";

  const innerBoxClass = isDark
    ? "space-y-3 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/10"
    : "space-y-3 rounded-2xl bg-slate-50 p-4";

  const mutedTextClass = isDark ? "text-slate-400" : "text-slate-500";
  const mainTextClass = isDark ? "text-white" : "text-slate-900";
  const secondaryTextClass = isDark ? "text-slate-200" : "text-slate-700";
  const linkTextClass = isDark ? "text-slate-300" : "text-slate-700";

  const mesas = useMemo(() => {
    const desde = Math.max(1, Number(mesaDesde) || 1);
    const hasta = Math.max(desde, Number(mesaHasta) || desde);

    return Array.from({ length: hasta - desde + 1 }, (_, index) => {
      const mesa = desde + index;
      const url = `${baseUrl}/carta/${tokenCarta}?mesa=${mesa}`;

      return { mesa, url };
    });
  }, [baseUrl, tokenCarta, mesaDesde, mesaHasta]);

  function esperar(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function generarPosterQR(mesa: number, url: string) {
    const canvasQR = document.createElement("canvas");

    await QRCode.toCanvas(canvasQR, url, {
      width: 900,
      margin: 3,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

    const qrDataUrl = canvasQR.toDataURL("image/png");

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = 1240;
    finalCanvas.height = 1754;

    const ctx = finalCanvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);

    ctx.fillStyle = "#ffffff";
    roundRect(ctx, 70, 70, 1100, 1614, 40);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 64px Arial";
    ctx.textAlign = "center";
    ctx.fillText(tituloQR || "Carta digital", finalCanvas.width / 2, 180);

    ctx.fillStyle = "#334155";
    ctx.font = "bold 42px Arial";
    ctx.fillText(nombreRestaurante || "Restaurante", finalCanvas.width / 2, 250);

    ctx.fillStyle = "#f97316";
    roundRect(ctx, 430, 290, 380, 78, 40);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 44px Arial";
    ctx.fillText(`MESA ${mesa}`, finalCanvas.width / 2, 343);

    ctx.fillStyle = "#475569";
    ctx.font = "32px Arial";
    wrapTextCenter(
      ctx,
      subtituloQR || "Escanea para ver la carta y pedir desde tu mesa",
      finalCanvas.width / 2,
      430,
      900,
      42
    );

    const qrImage = new Image();

    return await new Promise<string | null>((resolve) => {
      qrImage.onload = () => {
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, 220, 500, 800, 800, 36);
        ctx.fill();

        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 3;
        roundRect(ctx, 220, 500, 800, 800, 36);
        ctx.stroke();

        ctx.drawImage(qrImage, 260, 540, 720, 720);

        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 38px Arial";
        ctx.fillText("1. Escanea el código", finalCanvas.width / 2, 1380);

        ctx.fillText("2. Mira la carta", finalCanvas.width / 2, 1440);
        ctx.fillText("3. Haz tu pedido", finalCanvas.width / 2, 1500);

        ctx.fillStyle = "#64748b";
        ctx.font = "30px Arial";
        ctx.fillText(
          pieQR || "Haz tu pedido desde el móvil",
          finalCanvas.width / 2,
          1585
        );

        ctx.fillStyle = "#94a3b8";
        ctx.font = "22px Arial";
        ctx.fillText(url, finalCanvas.width / 2, 1650);

        resolve(finalCanvas.toDataURL("image/png"));
      };

      qrImage.onerror = () => resolve(null);
      qrImage.src = qrDataUrl;
    });
  }

  async function descargarQR(mesa: number, url: string) {
    if (!tokenCarta.trim()) {
      alert("Primero pega el token de la carta.");
      return;
    }

    const poster = await generarPosterQR(mesa, url);
    if (!poster) return;

    const link = document.createElement("a");
    link.download = `qr-mesa-${mesa}.png`;
    link.href = poster;
    link.click();
  }

  async function descargarTodos() {
    if (!tokenCarta.trim()) {
      alert("Primero pega el token de la carta.");
      return;
    }

    setDescargandoTodos(true);

    try {
      for (const item of mesas) {
        const poster = await generarPosterQR(item.mesa, item.url);
        if (!poster) continue;

        const link = document.createElement("a");
        link.download = `qr-mesa-${item.mesa}.png`;
        link.href = poster;
        link.click();

        await esperar(350);
      }
    } finally {
      setDescargandoTodos(false);
    }
  }

  return (
    <main className={pageClass}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex items-center gap-4">
            <div className={iconBoxClass}>
              <QrCode className="h-6 w-6" />
            </div>

            <div>
              <h1 className={titleClass}>QR por mesa</h1>
              <p className={subtitleClass}>
                Genera QR listos para imprimir y pegar en cada mesa.
              </p>
            </div>
          </div>

          <button
            onClick={descargarTodos}
            disabled={descargandoTodos || mesas.length === 0}
            className={primaryButtonClass}
          >
            <Printer className="h-4 w-4" />
            {descargandoTodos ? "Descargando..." : "Descargar todos"}
          </button>
        </div>

        <section className={panelClass}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className={labelClass}>URL base</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className={inputClass}
                placeholder="https://panel.gastrohelp.es"
              />
            </div>

            <div>
              <label className={labelClass}>Token público de la carta</label>
              <input
                value={tokenCarta}
                onChange={(e) => setTokenCarta(e.target.value.trim())}
                className={inputClass}
                placeholder="680e5c04d4f7bfd3f0b25526c7a85d98"
              />
            </div>

            <div>
              <label className={labelClass}>Nombre del restaurante</label>
              <input
                value={nombreRestaurante}
                onChange={(e) => setNombreRestaurante(e.target.value)}
                className={inputClass}
                placeholder="Mi Restaurante"
              />
            </div>

            <div>
              <label className={labelClass}>Título</label>
              <input
                value={tituloQR}
                onChange={(e) => setTituloQR(e.target.value)}
                className={inputClass}
                placeholder="Carta digital"
              />
            </div>

            <div>
              <label className={labelClass}>Subtítulo</label>
              <input
                value={subtituloQR}
                onChange={(e) => setSubtituloQR(e.target.value)}
                className={inputClass}
                placeholder="Escanea para ver la carta y pedir"
              />
            </div>

            <div>
              <label className={labelClass}>Texto inferior</label>
              <input
                value={pieQR}
                onChange={(e) => setPieQR(e.target.value)}
                className={inputClass}
                placeholder="Haz tu pedido desde el móvil"
              />
            </div>

            <div>
              <label className={labelClass}>Desde mesa</label>
              <input
                type="number"
                value={mesaDesde}
                onChange={(e) => setMesaDesde(Number(e.target.value))}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Hasta mesa</label>
              <input
                type="number"
                value={mesaHasta}
                onChange={(e) => setMesaHasta(Number(e.target.value))}
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {mesas.map((item) => (
            <article key={item.mesa} className={cardClass}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={tableIconClass}>
                    <Table2 className="h-5 w-5" />
                  </div>

                  <div>
                    <p
                      className={`text-sm font-bold uppercase tracking-[0.12em] ${mutedTextClass}`}
                    >
                      Mesa
                    </p>
                    <h2 className={`text-2xl font-black ${mainTextClass}`}>
                      {item.mesa}
                    </h2>
                  </div>
                </div>

                <QrCode className={`h-6 w-6 ${mutedTextClass}`} />
              </div>

              <div className={innerBoxClass}>
                <div className="flex items-center gap-2">
                  <Store className={`h-4 w-4 ${mutedTextClass}`} />
                  <p className={`text-sm font-black ${secondaryTextClass}`}>
                    {nombreRestaurante || "Restaurante"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Link2 className={`h-4 w-4 ${mutedTextClass}`} />
                  <p
                    className={`text-xs font-black uppercase tracking-[0.12em] ${mutedTextClass}`}
                  >
                    Enlace del QR
                  </p>
                </div>

                <p className={`break-all text-sm font-bold ${linkTextClass}`}>
                  {item.url}
                </p>
              </div>

              <button
                onClick={() => descargarQR(item.mesa, item.url)}
                className={`mt-4 w-full ${primaryButtonClass}`}
              >
                <Download className="h-4 w-4" />
                Descargar QR
              </button>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapTextCenter(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";

  for (let n = 0; n < words.length; n++) {
    const testLine = `${line}${words[n]} `;
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;

    if (testWidth > maxWidth && n > 0) {
      lines.push(line.trim());
      line = `${words[n]} `;
    } else {
      line = testLine;
    }
  }

  lines.push(line.trim());

  lines.forEach((currentLine, index) => {
    ctx.fillText(currentLine, centerX, startY + index * lineHeight);
  });
}