"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode } from "lucide-react";

type Props = {
  title: string;
  subtitle: string;
  code: string;
  accent: string;
  status: "activo" | "canjeado" | "caducado" | "pendiente" | "confirmado" | "cancelado";
};

export default function ScratchCoupon({ title, subtitle, code, accent, status }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    gradient.addColorStop(0, "#cbd5e1");
    gradient.addColorStop(0.45, "#f8fafc");
    gradient.addColorStop(1, "#94a3b8");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "rgba(15,23,42,0.72)";
    ctx.font = "900 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RASCA AQUÍ", rect.width / 2, rect.height / 2 - 4);

    ctx.font = "700 11px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(15,23,42,0.48)";
    ctx.fillText("desliza el dedo para ver el código", rect.width / 2, rect.height / 2 + 16);
  }, []);

  function scratch(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, Math.PI * 2);
    ctx.fill();

    checkProgress();
  }

  function checkProgress() {
    const canvas = canvasRef.current;
    if (!canvas || revealed) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0;

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] === 0) clear++;
    }

    const pct = clear / (pixels.length / 4);

    if (pct > 0.45) {
      setRevealed(true);
      canvas.style.opacity = "0";
      setTimeout(() => {
        canvas.style.display = "none";
      }, 250);
    }
  }

  const blocked = status === "canjeado" || status === "caducado" || status === "cancelado";

  return (
    <div className="overflow-hidden rounded-[30px] border border-slate-100 bg-white shadow-[0_16px_48px_rgba(15,23,42,0.08)]">
      <div
        className="p-5 text-white"
        style={{ background: `linear-gradient(135deg, ${blocked ? "#64748b" : accent}, #0f172a)` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/65">Cupón privado</div>
            <div className="mt-2 text-2xl font-black tracking-[-0.06em]">{title}</div>
            <div className="mt-1 text-sm font-semibold text-white/70">{subtitle}</div>
          </div>

          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/14">
            <QrCode className="h-7 w-7" />
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="relative overflow-hidden rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-5 text-center">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Código</div>

          <div className="mt-2 select-none text-3xl font-black tracking-[-0.06em] text-slate-950">{code}</div>

          {!blocked ? (
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full touch-none transition-opacity duration-300"
              onPointerDown={(e) => {
                isDrawing.current = true;
                scratch(e.clientX, e.clientY);
              }}
              onPointerMove={(e) => {
                if (!isDrawing.current) return;
                scratch(e.clientX, e.clientY);
              }}
              onPointerUp={() => {
                isDrawing.current = false;
              }}
              onPointerCancel={() => {
                isDrawing.current = false;
              }}
              onPointerLeave={() => {
                isDrawing.current = false;
              }}
            />
          ) : null}
        </div>

        <div className="mt-4 text-center text-xs font-bold text-slate-400">
          {blocked
            ? "Este cupón ya no está disponible."
            : revealed
              ? "Código descubierto. Muéstralo al personal."
              : "Rasca con el dedo para ver el código."}
        </div>
      </div>
    </div>
  );
}
