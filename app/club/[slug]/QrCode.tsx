"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function QrCode({
  value,
  label,
  size = 240,
}: {
  value: string;
  label: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void import("qrcode").then(({ default: QRCode }) =>
      QRCode.toDataURL(value, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#111827", light: "#ffffff" },
      }),
    ).then((dataUrl) => {
      if (active) setSrc(dataUrl);
    });
    return () => {
      active = false;
    };
  }, [size, value]);

  if (!src) {
    return <div aria-label={`Generando ${label}`} className="aspect-square w-full animate-pulse rounded-3xl bg-slate-100" />;
  }

  return (
    <Image
      unoptimized
      src={src}
      alt={label}
      width={size}
      height={size}
      className="h-auto w-full rounded-3xl"
    />
  );
}
