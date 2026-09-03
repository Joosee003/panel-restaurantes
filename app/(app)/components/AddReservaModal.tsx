"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, Loader2, Users, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

type Props = {
  open: boolean;
  onClose: () => void;
  restauranteId: string | null;
  onCreated?: () => void | Promise<void>;
};

type SlotDisponible = {
  inicio_at: string;
  fin_at: string;
  hora_local: string;
  turno: string;
  capacidad_disponible: number;
};

function fechaLocalHoy() {
  const ahora = new Date();
  const year = ahora.getFullYear();
  const month = String(ahora.getMonth() + 1).padStart(2, "0");
  const day = String(ahora.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mensajeErrorReserva(message: string | undefined) {
  const value = message || "";
  if (value.includes("SLOT_NOT_AVAILABLE")) {
    return "Esa hora acaba de dejar de estar disponible. Elige otra.";
  }
  if (value.includes("INVALID_BOOKING_REQUEST")) {
    return "Revisa el nombre, el contacto y el número de personas.";
  }
  if (value.includes("BOOKING_SETTINGS_NOT_FOUND")) {
    return "Falta configurar el horario de reservas del restaurante.";
  }
  if (value.includes("DEMO_READ_ONLY")) {
    return "La demostración es de solo lectura.";
  }
  return "No se pudo guardar la reserva. Vuelve a intentarlo.";
}

export default function AddReservaModal({
  open,
  onClose,
  restauranteId,
  onCreated,
}: Props) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [fecha, setFecha] = useState(fechaLocalHoy);
  const [personas, setPersonas] = useState<number | "">(2);
  const [notas, setNotas] = useState("");
  const [slots, setSlots] = useState<SlotDisponible[]>([]);
  const [slotSeleccionado, setSlotSeleccionado] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  useEffect(() => {
    const read = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const resetAlVolver = () => {
      if (document.visibilityState === "visible") setLoading(false);
    };
    document.addEventListener("visibilitychange", resetAlVolver);
    return () => document.removeEventListener("visibilitychange", resetAlVolver);
  }, []);

  useEffect(() => {
    if (!open || !restauranteId || !fecha || !personas || personas < 1) {
      setSlots([]);
      setSlotSeleccionado("");
      return;
    }

    let active = true;
    setLoadingSlots(true);
    setErrorMsg(null);

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("obtener_disponibilidad_manual", {
          p_restaurante_id: restauranteId,
          p_fecha: fecha,
          p_personas: Number(personas),
        });
        if (!active) return;
        if (error) {
          setSlots([]);
          setSlotSeleccionado("");
          setErrorMsg(mensajeErrorReserva(error.message));
          return;
        }

        const disponibles = (data || []) as SlotDisponible[];
        setSlots(disponibles);
        setSlotSeleccionado((current) =>
          disponibles.some((slot) => slot.inicio_at === current)
            ? current
            : disponibles[0]?.inicio_at || "",
        );
      } finally {
        if (active) setLoadingSlots(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [fecha, open, personas, restauranteId]);

  if (!open) return null;

  const limpiarFormulario = () => {
    setNombre("");
    setTelefono("");
    setEmail("");
    setFecha(fechaLocalHoy());
    setPersonas(2);
    setNotas("");
    setSlots([]);
    setSlotSeleccionado("");
    setErrorMsg(null);
    idempotencyKey.current = null;
  };

  const cerrarModal = () => {
    if (!loading) onClose();
  };

  const guardar = async () => {
    if (loading) return;

    const nombreLimpio = nombre.trim();
    const telefonoLimpio = telefono.trim();
    const emailLimpio = email.trim();

    if (!restauranteId) {
      setErrorMsg("El restaurante aún se está cargando.");
      return;
    }
    if (!nombreLimpio || (!telefonoLimpio && !emailLimpio)) {
      setErrorMsg("Indica el nombre y al menos un teléfono o email.");
      return;
    }
    if (!personas || personas < 1 || !slotSeleccionado) {
      setErrorMsg("Elige el número de personas y una hora disponible.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    idempotencyKey.current ||= crypto.randomUUID();

    try {
      const { error } = await supabase.rpc("crear_reserva_manual", {
        p_restaurante_id: restauranteId,
        p_inicio_at: slotSeleccionado,
        p_personas: Number(personas),
        p_nombre: nombreLimpio,
        p_telefono: telefonoLimpio || null,
        p_email: emailLimpio || null,
        p_notas: notas.trim() || null,
        p_idempotency_key: idempotencyKey.current,
      });

      if (error) {
        setErrorMsg(mensajeErrorReserva(error.message));
        if (error.message.includes("SLOT_NOT_AVAILABLE")) {
          setSlotSeleccionado("");
        }
        return;
      }

      limpiarFormulario();
      onClose();
      await onCreated?.();
    } catch (error) {
      console.error("Error guardando la reserva manual", error);
      setErrorMsg("No se pudo guardar la reserva. Vuelve a intentarlo.");
    } finally {
      setLoading(false);
    }
  };

  const overlayClass = isDark ? "bg-black/70" : "bg-slate-950/45";
  const modalClass = isDark
    ? "border-slate-800 bg-slate-950 text-slate-100"
    : "border-white bg-white text-slate-950";
  const inputClass = isDark
    ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-blue-500/20"
    : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 focus:border-blue-400 focus:ring-blue-100";

  return (
    <div className={`fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center ${overlayClass}`}>
      <div className={`max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-[2rem] border p-5 shadow-2xl sm:p-6 ${modalClass}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
              Nueva reserva
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Añadir al calendario</h2>
            <p className={`mt-1 text-sm font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Solo se muestran horas con capacidad disponible.
            </p>
          </div>
          <button
            type="button"
            onClick={cerrarModal}
            disabled={loading}
            aria-label="Cerrar"
            className={`rounded-2xl border p-2 disabled:opacity-40 ${isDark ? "border-slate-700 hover:bg-slate-900" : "border-slate-200 hover:bg-slate-50"}`}
          >
            <X size={19} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-xs font-black uppercase tracking-wide">Nombre</span>
            <input
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Nombre del cliente"
              autoComplete="name"
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>

          <label>
            <span className="text-xs font-black uppercase tracking-wide">Teléfono</span>
            <input
              value={telefono}
              onChange={(event) => setTelefono(event.target.value)}
              placeholder="Teléfono"
              inputMode="tel"
              autoComplete="tel"
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>

          <label>
            <span className="text-xs font-black uppercase tracking-wide">Email opcional</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="cliente@email.com"
              inputMode="email"
              autoComplete="email"
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>

          <label>
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide">
              <CalendarDays size={14} /> Fecha
            </span>
            <input
              type="date"
              min={fechaLocalHoy()}
              value={fecha}
              onChange={(event) => setFecha(event.target.value)}
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>

          <label>
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide">
              <Users size={14} /> Personas
            </span>
            <input
              type="number"
              min={1}
              max={500}
              value={personas}
              onChange={(event) =>
                setPersonas(event.target.value === "" ? "" : Number(event.target.value))
              }
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide">
              <Clock3 size={14} /> Hora disponible
            </span>
            <select
              value={slotSeleccionado}
              onChange={(event) => setSlotSeleccionado(event.target.value)}
              disabled={loadingSlots || slots.length === 0}
              className={`mt-1 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-60 ${inputClass}`}
            >
              {loadingSlots ? <option value="">Comprobando horarios…</option> : null}
              {!loadingSlots && slots.length === 0 ? (
                <option value="">No hay horas libres para esta fecha</option>
              ) : null}
              {slots.map((slot) => (
                <option key={slot.inicio_at} value={slot.inicio_at}>
                  {slot.hora_local} · {slot.turno} · quedan {slot.capacidad_disponible} plazas
                </option>
              ))}
            </select>
          </label>

          <label className="sm:col-span-2">
            <span className="text-xs font-black uppercase tracking-wide">Notas opcionales</span>
            <textarea
              value={notas}
              onChange={(event) => setNotas(event.target.value)}
              placeholder="Alergias, carrito, celebración…"
              maxLength={800}
              className={`mt-1 min-h-24 w-full resize-none rounded-2xl border px-4 py-3 text-sm font-bold outline-none focus:ring-4 ${inputClass}`}
            />
          </label>
        </div>

        {errorMsg ? (
          <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-800">
            {errorMsg}
          </p>
        ) : null}

        <p className={`mt-4 text-xs font-semibold leading-5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Guardar los datos de contacto no autoriza el envío de promociones.
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cerrarModal}
            disabled={loading}
            className={`rounded-2xl border px-5 py-3 text-sm font-black disabled:opacity-50 ${isDark ? "border-slate-700 text-slate-200 hover:bg-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || loadingSlots || !slotSeleccionado}
            onClick={guardar}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin" size={17} /> : <CalendarDays size={17} />}
            {loading ? "Guardando…" : "Guardar reserva"}
          </button>
        </div>
      </div>
    </div>
  );
}
