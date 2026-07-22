"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addCalendarDays,
  dateInTimezone,
  isBookingDateAllowed,
} from "../../lib/bookingDate";

type AvailabilitySlot = {
  start: string;
  end: string;
  time: string;
  shift: string;
  availableCapacity: number;
};

type BookingWidgetProps = {
  slug: string;
  restaurantName: string;
  timezone: string;
  minParty: number;
  maxParty: number;
  maxAdvanceDays: number;
  requiresPhone: boolean;
  requiresEmail: boolean;
  notice: string;
  cancellationPolicy: string;
  primaryColor: string;
  accentColor: string;
  demo: boolean;
};

type BookingResult = {
  reservationId: string;
  status: string;
  start: string;
  managePath: string;
};

function friendlyDate(date: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${date}T12:00:00`));
}

function readableError(code: string) {
  const errors: Record<string, string> = {
    SLOT_NOT_AVAILABLE:
      "Esa hora acaba de ocuparse. Actualiza la disponibilidad y elige otra.",
    INVALID_BOOKING_REQUEST: "Revisa los datos antes de continuar.",
    BOOKING_NOT_AVAILABLE: "Las reservas online no están disponibles ahora mismo.",
    RATE_LIMITED: "Has hecho varios intentos seguidos. Espera un momento y prueba otra vez.",
  };

  return errors[code] || "No hemos podido completar la reserva. Inténtalo de nuevo.";
}

export default function BookingWidget({
  slug,
  restaurantName,
  timezone,
  minParty,
  maxParty,
  maxAdvanceDays,
  requiresPhone,
  requiresEmail,
  notice,
  cancellationPolicy,
  primaryColor,
  accentColor,
  demo,
}: BookingWidgetProps) {
  const today = useMemo(() => dateInTimezone(timezone), [timezone]);
  const maxDate = useMemo(
    () => addCalendarDays(today, maxAdvanceDays),
    [maxAdvanceDays, today],
  );
  const [date, setDate] = useState(today);
  const [party, setParty] = useState(Math.max(2, minParty));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<BookingResult | null>(null);

  useEffect(() => {
    if (!isBookingDateAllowed(date, timezone, maxAdvanceDays)) {
      setSlots([]);
      setSelectedSlot(null);
      setSlotsError("Selecciona una fecha válida desde hoy.");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingSlots(true);
      setSlotsError("");
      setSelectedSlot(null);
      setIdempotencyKey("");

      try {
        const query = new URLSearchParams({ date, party: String(party) });
        const response = await fetch(
          `/api/public/restaurants/${encodeURIComponent(slug)}/availability?${query}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const payload = (await response.json()) as {
          ok?: boolean;
          slots?: AvailabilitySlot[];
          error?: string;
        };

        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || "AVAILABILITY_FAILED");
        }

        setSlots(payload.slots || []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSlots([]);
          setSlotsError(
            readableError((error as Error).message || "AVAILABILITY_FAILED"),
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [date, maxAdvanceDays, party, slug, timezone]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || submitting) return;

    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setSubmitError("");

    try {
      const response = await fetch(
        `/api/public/restaurants/${encodeURIComponent(slug)}/bookings`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start: selectedSlot.start,
            party,
            name: String(form.get("name") || ""),
            phone: String(form.get("phone") || ""),
            email: String(form.get("email") || ""),
            notes: String(form.get("notes") || ""),
            company: String(form.get("company") || ""),
            idempotencyKey,
          }),
        },
      );

      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        reservation?: BookingResult;
      };

      if (!response.ok || !payload.ok || !payload.reservation) {
        throw new Error(payload.error || "BOOKING_FAILED");
      }

      setResult(payload.reservation);
    } catch (error) {
      setSubmitError(readableError((error as Error).message || "BOOKING_FAILED"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div
        className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-7 text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.12)] sm:p-9"
        role="status"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <Check className="h-7 w-7" strokeWidth={3} />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.22em] text-emerald-700">
          Reserva recibida
        </p>
        <h3 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
          Tu mesa está {result.status === "confirmada" ? "confirmada" : "pendiente"}
        </h3>
        <p className="mt-3 max-w-lg text-sm font-semibold leading-6 text-slate-600">
          Hemos registrado tu solicitud en {restaurantName}. Guarda la referencia corta por si necesitas contactar con el restaurante.
        </p>
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-white p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Referencia
          </span>
          <p className="mt-1 font-mono text-lg font-black text-slate-950">
            {result.reservationId.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <a
          href={result.managePath}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-black text-white hover:bg-emerald-800"
        >
          Ver o cambiar mi reserva
          <ChevronRight className="h-4 w-4" />
        </a>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white text-slate-950 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
      <div
        className="flex items-center justify-between gap-4 px-6 py-5 text-white sm:px-8"
        style={{ backgroundColor: primaryColor }}
      >
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">
            Reserva online
          </p>
          <h3 className="mt-1 text-xl font-black text-white">Encuentra tu mesa</h3>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: accentColor, color: primaryColor }}
        >
          <CalendarDays className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-6 p-6 sm:p-8">
        {demo ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
            Vista piloto: puedes probar el formulario. Ninguna reserva real se enviará hasta activar la base de datos.
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <CalendarDays className="h-4 w-4" /> Día
            </span>
            <input
              type="date"
              value={date}
              min={today}
              max={maxDate}
              onChange={(event) => {
                const nextDate = event.target.value;
                if (isBookingDateAllowed(nextDate, timezone, maxAdvanceDays)) {
                  setDate(nextDate);
                  setSubmitError("");
                }
              }}
              className="h-12 w-full rounded-xl border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none focus:border-slate-500"
              style={{ colorScheme: "light" }}
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500">
              <Users className="h-4 w-4" /> Personas
            </span>
            <div className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-2">
              <button
                type="button"
                aria-label="Quitar una persona"
                onClick={() => setParty((value) => Math.max(minParty, value - 1))}
                disabled={party <= minParty}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm font-black">
                {party} {party === 1 ? "persona" : "personas"}
              </span>
              <button
                type="button"
                aria-label="Añadir una persona"
                onClick={() => setParty((value) => Math.min(maxParty, value + 1))}
                disabled={party >= maxParty}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-white disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </label>
        </div>

        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                Horas disponibles
              </p>
              <p className="mt-1 text-sm font-bold capitalize text-slate-900">
                {friendlyDate(date)}
              </p>
            </div>
            {loadingSlots ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((slot) => {
              const selected = selectedSlot?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(slot);
                    setIdempotencyKey(crypto.randomUUID());
                    setSubmitError("");
                  }}
                  className="h-11 rounded-xl border text-sm font-black transition hover:-translate-y-0.5"
                  style={
                    selected
                      ? {
                          backgroundColor: primaryColor,
                          borderColor: primaryColor,
                          color: "white",
                        }
                      : {
                          backgroundColor: "white",
                          borderColor: "#e2e8f0",
                          color: "#0f172a",
                        }
                  }
                >
                  {slot.time}
                </button>
              );
            })}
          </div>

          {!loadingSlots && !slotsError && slots.length === 0 ? (
            <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
              No quedan horas online para ese día. Prueba con otra fecha.
            </p>
          ) : null}
          {slotsError ? (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {slotsError}
            </p>
          ) : null}
        </div>

        {selectedSlot ? (
          <form onSubmit={submitBooking} className="space-y-4 border-t border-slate-100 pt-6">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${accentColor}33`, color: primaryColor }}
              >
                <Clock3 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500">Tu selección</p>
                <p className="text-sm font-black capitalize text-slate-950">
                  {friendlyDate(date)} · {selectedSlot.time} · {party} personas
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Nombre y apellidos
                </span>
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  className="h-12 w-full rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-slate-500"
                  placeholder="Tu nombre"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Teléfono {requiresPhone ? "*" : ""}
                </span>
                <input
                  name="phone"
                  type="tel"
                  required={requiresPhone}
                  maxLength={40}
                  autoComplete="tel"
                  className="h-12 w-full rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-slate-500"
                  placeholder="600 000 000"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  Email {requiresEmail ? "*" : ""}
                </span>
                <input
                  name="email"
                  type="email"
                  required={requiresEmail}
                  maxLength={254}
                  autoComplete="email"
                  className="h-12 w-full rounded-xl border-slate-200 bg-white px-4 text-sm font-semibold outline-none focus:border-slate-500"
                  placeholder="tu@email.com"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                  ¿Algo que debamos saber?
                </span>
                <textarea
                  name="notes"
                  maxLength={800}
                  rows={3}
                  className="w-full resize-none rounded-xl border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-slate-500"
                  placeholder="Alergias, carrito de bebé, celebración..."
                />
              </label>
              <label className="absolute -left-[9999px]" aria-hidden="true">
                Empresa
                <input name="company" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            <label className="flex items-start gap-3 text-xs font-semibold leading-5 text-slate-500">
              <input type="checkbox" required className="mt-1 h-4 w-4" />
              <span>
                Acepto que {restaurantName} use estos datos únicamente para gestionar esta reserva.
              </span>
            </label>

            {submitError ? (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {submitError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {submitting ? "Guardando tu reserva..." : "Confirmar reserva"}
              {!submitting ? <ChevronRight className="h-5 w-5" /> : null}
            </button>
          </form>
        ) : null}

        <div className="flex items-start gap-3 border-t border-slate-100 pt-5 text-xs font-semibold leading-5 text-slate-500">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: primaryColor }} />
          <p>
            {notice || "La disponibilidad se comprueba en tiempo real."}
            {cancellationPolicy ? ` ${cancellationPolicy}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
