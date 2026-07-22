"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Loader2,
  LockKeyhole,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ManagedReservation } from "../../lib/managedReservation";

type AvailabilitySlot = {
  start: string;
  end: string;
  time: string;
  shift: string;
  availableCapacity: number;
};

type ManageReservationClientProps = {
  initialReservation: ManagedReservation;
};

function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formattedMoment(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function friendlyDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${value}T12:00:00`));
}

function statusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (["confirmada", "confirmado"].includes(normalized)) return "Confirmada";
  if (["cancelada", "cancelado"].includes(normalized)) return "Cancelada";
  if (["completada", "completado"].includes(normalized)) return "Completada";
  return "Pendiente";
}

function readableError(code: string) {
  const messages: Record<string, string> = {
    RATE_LIMITED: "Has hecho varios intentos seguidos. Espera un momento y vuelve a probar.",
    SLOT_NOT_AVAILABLE: "Esa hora acaba de ocuparse. Elige otra disponible.",
    CANCELLATION_WINDOW_CLOSED:
      "Ya no es posible modificar la reserva online. Contacta con el restaurante.",
    RESERVATION_CANNOT_BE_RESCHEDULED:
      "Esta reserva ya no se puede cambiar online.",
    RESERVATION_NOT_FOUND: "No hemos encontrado esta reserva.",
  };
  return messages[code] || "No hemos podido completar la acción. Inténtalo de nuevo.";
}

function normalizePhone(phone: string) {
  return phone.replace(/[^+\d]/g, "");
}

export default function ManageReservationClient({
  initialReservation,
}: ManageReservationClientProps) {
  const [reservation, setReservation] = useState(initialReservation);
  const [mode, setMode] = useState<"summary" | "reschedule" | "cancel">("summary");
  const [date, setDate] = useState(() =>
    dateInTimezone(initialReservation.start, initialReservation.timezone),
  );
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const cancelled = ["cancelada", "cancelado"].includes(
    reservation.status.toLowerCase(),
  );
  const currentDate = useMemo(
    () => dateInTimezone(new Date().toISOString(), reservation.timezone),
    [reservation.timezone],
  );

  useEffect(() => {
    if (mode !== "reschedule") return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingSlots(true);
      setSelectedSlot(null);
      setError("");

      try {
        const query = new URLSearchParams({ date });
        const response = await fetch(
          `/api/public/reservations/${reservation.managementToken}/availability?${query}`,
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
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setSlots([]);
          setError(readableError((fetchError as Error).message));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [date, mode, reservation.managementToken]);

  function returnToSummary() {
    setMode("summary");
    setSelectedSlot(null);
    setError("");
  }

  async function cancelReservation() {
    if (saving) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/public/reservations/${reservation.managementToken}/cancel`,
        { method: "POST" },
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "CANCELLATION_FAILED");
      }

      setReservation((current) => ({
        ...current,
        status: "cancelada",
        canCancel: false,
        canReschedule: false,
      }));
      setMode("summary");
      setNotice("La reserva se ha cancelado correctamente.");
    } catch (requestError) {
      setError(readableError((requestError as Error).message));
    } finally {
      setSaving(false);
    }
  }

  async function rescheduleReservation() {
    if (!selectedSlot || saving) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/public/reservations/${reservation.managementToken}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ start: selectedSlot.start }),
        },
      );
      const payload = (await response.json()) as {
        ok?: boolean;
        start?: string;
        end?: string;
        error?: string;
      };
      if (!response.ok || !payload.ok || !payload.start) {
        throw new Error(payload.error || "RESCHEDULE_FAILED");
      }

      setReservation((current) => ({
        ...current,
        start: payload.start || current.start,
        end: payload.end || current.end,
      }));
      setMode("summary");
      setSelectedSlot(null);
      setNotice("La fecha de tu reserva se ha actualizado.");
    } catch (requestError) {
      setError(readableError((requestError as Error).message));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f1e9] px-5 py-8 text-slate-950 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <a
            href={reservation.restaurantSlug ? `/restaurante/${reservation.restaurantSlug}` : "#"}
            className="inline-flex items-center gap-2 text-sm font-black text-slate-700 hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            {reservation.restaurantName}
          </a>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wider text-slate-500 shadow-sm">
            <LockKeyhole className="h-3.5 w-3.5" /> Enlace privado
          </span>
        </header>

        <div className="mt-7 grid overflow-hidden rounded-[2rem] border border-white bg-white shadow-[0_28px_100px_rgba(15,23,42,0.14)] lg:grid-cols-[0.78fr_1.22fr]">
          <aside className="relative overflow-hidden bg-[#123c3a] p-7 text-white sm:p-10">
            <div className="absolute -right-20 -top-16 h-64 w-64 rounded-full border-[2.5rem] border-white/[0.04]" />
            <div className="relative">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e7b75f] text-[#123c3a]">
                <CalendarDays className="h-6 w-6" />
              </div>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-white/45">
                Tu reserva
              </p>
              <h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.045em] text-white sm:text-4xl">
                {reservation.restaurantName}
              </h1>

              <div className="mt-9 space-y-4 border-t border-white/10 pt-7">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#e7b75f]" />
                  <div>
                    <p className="text-xs font-bold text-white/45">Fecha y hora</p>
                    <p className="mt-1 text-sm font-black capitalize text-white">
                      {formattedMoment(reservation.start, reservation.timezone)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#e7b75f]" />
                  <div>
                    <p className="text-xs font-bold text-white/45">Personas</p>
                    <p className="mt-1 text-sm font-black text-white">
                      {reservation.party} {reservation.party === 1 ? "persona" : "personas"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-9 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                  Referencia
                </p>
                <p className="mt-1 font-mono text-lg font-black text-white">
                  {reservation.reservationId.slice(0, 8).toUpperCase()}
                </p>
              </div>
            </div>
          </aside>

          <section className="p-7 sm:p-10 lg:p-12">
            {mode === "summary" ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                      Hola, {reservation.customerName}
                    </p>
                    <h2 className="mt-2 text-3xl font-black tracking-[-0.04em] text-slate-950">
                      Gestiona tu mesa
                    </h2>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black ${
                      cancelled
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {cancelled ? <X className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                    {statusLabel(reservation.status)}
                  </span>
                </div>

                {notice ? (
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
                  </div>
                ) : null}

                {!cancelled ? (
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("reschedule");
                        setNotice("");
                      }}
                      disabled={!reservation.canReschedule}
                      className="group flex min-h-28 items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-5 text-left hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span>
                        <RefreshCw className="h-5 w-5 text-[#123c3a]" />
                        <span className="mt-3 block text-sm font-black text-slate-950">
                          Cambiar fecha
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          Consulta otras horas disponibles
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-slate-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMode("cancel");
                        setNotice("");
                      }}
                      disabled={!reservation.canCancel}
                      className="group flex min-h-28 items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left hover:border-red-200 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <span>
                        <Trash2 className="h-5 w-5 text-red-500" />
                        <span className="mt-3 block text-sm font-black text-slate-950">
                          Cancelar reserva
                        </span>
                        <span className="mt-1 block text-xs font-semibold text-slate-500">
                          Libera la mesa si no puedes venir
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-red-500" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-8 rounded-2xl bg-slate-50 p-5 text-sm font-semibold leading-6 text-slate-600">
                    Esta reserva ya está cancelada. Si quieres volver, crea una nueva reserva desde la web del restaurante.
                  </div>
                )}

                {!reservation.canCancel && !cancelled ? (
                  <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-xs font-bold leading-5 text-amber-900">
                    El plazo de cambios online ha terminado. Contacta con el restaurante si necesitas ayuda.
                  </p>
                ) : null}
              </>
            ) : null}

            {mode === "reschedule" ? (
              <>
                <button
                  type="button"
                  onClick={returnToSummary}
                  className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-950"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver
                </button>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-slate-950">
                  Elige otra hora
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                  Conservamos tus datos y el número de personas.
                </p>

                <label className="mt-7 block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">
                    Nuevo día
                  </span>
                  <input
                    type="date"
                    min={currentDate}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="h-12 w-full rounded-xl border-slate-200 bg-white px-4 text-sm font-bold outline-none focus:border-slate-500"
                    style={{ colorScheme: "light" }}
                  />
                </label>

                <div className="mt-6 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500">
                      Horas disponibles
                    </p>
                    <p className="mt-1 text-sm font-bold capitalize text-slate-900">
                      {friendlyDate(date)}
                    </p>
                  </div>
                  {loadingSlots ? <Loader2 className="h-5 w-5 animate-spin text-slate-400" /> : null}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setError("");
                      }}
                      className={`h-11 rounded-xl border text-sm font-black ${
                        selectedSlot?.start === slot.start
                          ? "border-[#123c3a] bg-[#123c3a] text-white"
                          : "border-slate-200 bg-white text-slate-950 hover:border-slate-400"
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
                {!loadingSlots && slots.length === 0 && !error ? (
                  <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                    No quedan horas online para ese día. Prueba con otra fecha.
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={rescheduleReservation}
                  disabled={!selectedSlot || saving}
                  className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#123c3a] px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  {saving ? "Guardando cambio..." : "Confirmar nueva hora"}
                </button>
              </>
            ) : null}

            {mode === "cancel" ? (
              <>
                <button
                  type="button"
                  onClick={returnToSummary}
                  className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-950"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver
                </button>
                <div className="mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                  <Trash2 className="h-6 w-6" />
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.04em] text-slate-950">
                  ¿Cancelar la reserva?
                </h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                  La mesa quedará libre para otros clientes. Esta acción no se puede deshacer desde este enlace.
                </p>
                {reservation.cancellationPolicy ? (
                  <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-5 text-slate-600">
                    {reservation.cancellationPolicy}
                  </p>
                ) : null}
                {error ? (
                  <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    {error}
                  </p>
                ) : null}
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={returnToSummary}
                    disabled={saving}
                    className="h-12 rounded-xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
                  >
                    Mantener reserva
                  </button>
                  <button
                    type="button"
                    onClick={cancelReservation}
                    disabled={saving}
                    className="flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                    {saving ? "Cancelando..." : "Sí, cancelar"}
                  </button>
                </div>
              </>
            ) : null}

            <footer className="mt-10 border-t border-slate-100 pt-6">
              <div className="flex flex-wrap gap-2">
                {reservation.restaurantAddress ? (
                  <a
                    href={reservation.restaurantMapsUrl || undefined}
                    target={reservation.restaurantMapsUrl ? "_blank" : undefined}
                    rel={reservation.restaurantMapsUrl ? "noreferrer" : undefined}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    <MapPin className="h-3.5 w-3.5" /> {reservation.restaurantAddress}
                    {reservation.restaurantMapsUrl ? <ExternalLink className="h-3 w-3" /> : null}
                  </a>
                ) : null}
                {reservation.restaurantPhone ? (
                  <a
                    href={`tel:${normalizePhone(reservation.restaurantPhone)}`}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    <Phone className="h-3.5 w-3.5" /> {reservation.restaurantPhone}
                  </a>
                ) : null}
              </div>
              <p className="mt-5 flex items-start gap-2 text-[11px] font-semibold leading-5 text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Este enlace permite gestionar únicamente esta reserva. No lo compartas.
              </p>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
