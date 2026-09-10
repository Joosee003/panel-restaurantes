export function parseServiceHours(value: string | null | undefined) {
  const match = (value || "").trim().match(/^([01]?\d|2[0-3]):([0-5]\d)\s*[-–—]\s*([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const start = `${match[1].padStart(2, "0")}:${match[2]}`;
  const end = `${match[3].padStart(2, "0")}:${match[4]}`;
  return start < end ? { start, end } : null;
}

export function serviceHoursError(lunch: string, dinner: string) {
  const a = parseServiceHours(lunch), b = parseServiceHours(dinner);
  if ((lunch.trim() && !a) || (dinner.trim() && !b)) {
    return "Indica apertura y cierre como HH:MM-HH:MM. El cierre debe ser posterior a la apertura.";
  }
  if (a && b && a.start < b.end && b.start < a.end) return "Los horarios de comida y cena no pueden solaparse.";
  return null;
}
