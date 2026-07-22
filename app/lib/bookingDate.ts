export function dateInTimezone(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function isIsoDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function isBookingDateAllowed(
  date: string,
  timezone: string,
  maxAdvanceDays: number,
  now = new Date(),
) {
  if (!isIsoDate(date)) return false;
  const today = dateInTimezone(timezone, now);
  const lastDay = addCalendarDays(today, Math.max(0, maxAdvanceDays));
  return date >= today && date <= lastDay;
}

export function isBookingStartAllowed(
  start: string,
  timezone: string,
  maxAdvanceDays: number,
  minAdvanceMinutes: number,
  now = new Date(),
) {
  const parsed = new Date(start);
  if (Number.isNaN(parsed.getTime())) return false;

  const localDate = dateInTimezone(timezone, parsed);
  if (!isBookingDateAllowed(localDate, timezone, maxAdvanceDays, now)) return false;

  return parsed.getTime() >= now.getTime() + Math.max(0, minAdvanceMinutes) * 60_000;
}
