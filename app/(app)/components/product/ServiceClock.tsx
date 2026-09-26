"use client";

import { useEffect, useState } from "react";

/** Presentation clock only. Data refresh remains owned by each existing page. */
export function useServiceClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = window.setInterval(update, 30000);
    return () => window.clearInterval(interval);
  }, []);
  return now;
}

export default function ServiceClock({ large = false }: { large?: boolean }) {
  const now = useServiceClock();
  return (
    <div className={`gh-service-clock${large ? " gh-service-clock--large" : ""}`}>
      <span>{now?.toLocaleDateString("es-ES", { timeZone: "Europe/Madrid", weekday: "long", day: "numeric", month: "long" }) ?? "Hoy"}</span>
      <time dateTime={now?.toISOString()}>{now?.toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" }) ?? "—:—"}</time>
    </div>
  );
}
