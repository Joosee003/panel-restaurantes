// Presentation buckets only: no reservation state, attendance or service rule is changed.
export type ServiceArrival = {
  id: string;
  nombre_cliente: string | null;
  personas: number | null;
  estado: string | null;
  fecha_hora_reserva: string | null;
};

export function groupServiceArrivals<T extends ServiceArrival>(reservations: T[], now: Date | null) {
  const groups: Record<"current" | "next" | "later" | "earlier" | "finished" | "undated", T[]> = {
    current: [], next: [], later: [], earlier: [], finished: [], undated: [],
  };
  const clock = now?.getTime();
  for (const item of reservations) {
    const timestamp = item.fecha_hora_reserva ? Date.parse(item.fecha_hora_reserva) : NaN;
    if (!Number.isFinite(timestamp)) { groups.undated.push(item); continue; }
    if (clock == null || !Number.isFinite(clock)) { groups.later.push(item); continue; }
    const state = (item.estado || "").toLowerCase().trim().replace(/[_ -]/g, "");
    const finished = ["completada", "completado", "cancelada", "cancelado", "noshow"].includes(state);
    const minutes = (timestamp - clock) / 60_000;
    if (finished) groups.finished.push(item);
    else if (minutes >= -90 && minutes <= 0) groups.current.push(item);
    else if (minutes > 0 && minutes <= 90) groups.next.push(item);
    else if (minutes > 90) groups.later.push(item);
    else groups.earlier.push(item);
  }
  // Work on new arrays; never reorder or mutate the page's source data.
  for (const rows of Object.values(groups)) rows.sort((a, b) =>
    (Date.parse(a.fecha_hora_reserva || "") || 0) - (Date.parse(b.fecha_hora_reserva || "") || 0));
  return groups;
}
