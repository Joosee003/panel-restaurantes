import type { SupabaseClient } from "@supabase/supabase-js";

type ScheduleRow = {
  dia_semana: number;
  turno: string;
  hora_inicio: string;
  hora_fin: string;
  activo: boolean;
};
type ExceptionRow = {
  tipo: string;
  turno: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
};
type Range = { service: string; start: string; end: string };
const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const serviceName = (value: string) => ({ comida: "Comidas", cena: "Cenas", desayuno: "Desayunos", especial: "Horario especial" })[value]
  || value.replace(/_/g, " ");
const rangesFor = (rows: ScheduleRow[], day: number): Range[] => rows
  .filter(row => row.activo && row.dia_semana === day)
  .map(row => ({ service: row.turno, start: row.hora_inicio.slice(0, 5), end: row.hora_fin.slice(0, 5) }));
function rangeText(ranges: Range[]) {
  if (!ranges.length) return "Cerrado";
  return ranges.sort((a, b) => a.start.localeCompare(b.start))
    .map(range => `${serviceName(range.service)}: ${range.start}–${range.end}`).join("\n");
}

export async function readChatbotHours(
  supabase: Pick<SupabaseClient, "from">,
  restaurantId: string,
  date?: string,
): Promise<string | null> {
  const { data, error } = await supabase.from("reservas_horarios")
    .select("dia_semana,turno,hora_inicio,hora_fin,activo")
    .eq("restaurante_id", restaurantId);
  if (error) throw new Error("CHATBOT_HOURS_UNAVAILABLE");
  const rows = (data || []) as ScheduleRow[];
  if (date) {
    const { data: exceptionData, error: exceptionError } = await supabase.from("reservas_excepciones")
      .select("tipo,turno,hora_inicio,hora_fin")
      .eq("restaurante_id", restaurantId).eq("fecha", date)
      .in("tipo", ["cierre", "horario_especial"]);
    if (exceptionError) throw new Error("CHATBOT_HOURS_UNAVAILABLE");
    const exceptions = (exceptionData || []) as ExceptionRow[];
    if (!rows.length && !exceptions.length) return null;
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const special = exceptions.filter(row => row.tipo === "horario_especial");
    let ranges = special.length ? special.filter(row => row.hora_inicio && row.hora_fin)
      .map(row => ({ service: row.turno || "especial", start: row.hora_inicio!.slice(0, 5), end: row.hora_fin!.slice(0, 5) }))
      : rangesFor(rows, day);
    // Match the booking calendar: special hours replace the day, closures subtract intervals.
    for (const closure of exceptions.filter(row => row.tipo === "cierre")) {
      if (!closure.hora_inicio || !closure.hora_fin) { ranges = []; break; }
      const start = closure.hora_inicio.slice(0, 5), end = closure.hora_fin.slice(0, 5);
      ranges = ranges.flatMap(range => {
        if (end <= range.start || start >= range.end) return [range];
        return [range.start < start ? { ...range, end: start } : null,
          end < range.end ? { ...range, start: end } : null].filter((value): value is Range => value !== null);
      });
    }
    const label = new Intl.DateTimeFormat("es-ES", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
      .format(new Date(`${date}T12:00:00Z`));
    return `Horario del ${label}:\n${rangeText(ranges)}`;
  }
  if (!rows.length) return null;
  const week = [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, text: rangeText(rangesFor(rows, day)) }));
  if (week.every(day => day.text === week[0].text)) return `Horario habitual, todos los días:\n${week[0].text}`;
  const groups: { days: number[]; text: string }[] = [];
  for (const day of week) {
    const last = groups.at(-1);
    if (last?.text === day.text) last.days.push(day.day);
    else groups.push({ days: [day.day], text: day.text });
  }
  return "Horario habitual:\n" + groups.map(group => {
    const label = group.days.length > 1 ? `${days[group.days[0]]} a ${days[group.days.at(-1)!]}` : days[group.days[0]];
    return `${label[0].toUpperCase()}${label.slice(1)}:\n${group.text}`;
  }).join("\n\n");
}
