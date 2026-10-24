"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../../(app)/lib/supabaseClient";
import { useRestaurante } from "../../../../hooks/useRestaurante";

type Config = {
  activo: boolean; zona_horaria: string; intervalo_minutos: number; duracion_minutos: number;
  capacidad_por_turno: number; personas_minimas: number; personas_maximas: number;
  confirmacion_automatica: boolean; confirmacion_automatica_hasta: number;
  antelacion_minutos: number; dias_maximos_antelacion: number; cancelacion_minutos: number;
  requiere_telefono: boolean; requiere_email: boolean;
};
type Shift = "almuerzo" | "comida" | "cena";
type Slot = { day: number; shift: Shift; enabled: boolean; start: string; end: string };
const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const shifts: { key: Shift; label: string }[] = [
  { key: "almuerzo", label: "Almuerzo" }, { key: "comida", label: "Comida" }, { key: "cena", label: "Cena" },
];
const emptySlots = (): Slot[] => days.flatMap((_, day) => shifts.map(({ key }) => ({ day, shift: key, enabled: false, start: "", end: "" })));
const input = "min-h-12 w-full rounded-xl border border-[#c9c1b3] bg-white px-3 py-2 text-base focus:border-[#b75b42] focus:outline-none focus:ring-2 focus:ring-[#b75b42]/20";
const label = "block text-sm font-semibold text-[#33483e]";

export default function WhiteLabelBookingSettings() {
  const { data: restaurant, isLoading } = useRestaurante();
  const [web, setWeb] = useState<Record<string, unknown> | null>(null);
  const [legal, setLegal] = useState<Record<string, unknown> | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [configRow, setConfigRow] = useState<Record<string, unknown> | null>(null);
  const [slots, setSlots] = useState<Slot[]>(emptySlots);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;
    async function load() {
      const id = restaurant!.id;
      const [webRes, configRes, hoursRes] = await Promise.all([
        supabase.from("restaurante_webs").select("*").eq("restaurante_id", id).maybeSingle(),
        supabase.from("reservas_config").select("*").eq("restaurante_id", id).maybeSingle(),
        supabase.from("reservas_horarios").select("dia_semana,turno,hora_inicio,hora_fin,activo")
          .eq("restaurante_id", id),
      ]);
      if (cancelled) return;
      if (webRes.error || configRes.error || hoursRes.error || !webRes.data || !configRes.data) {
        setError("No se pudieron cargar las reglas de reserva. Vuelve a entrar al panel."); return;
      }
      setWeb(webRes.data as Record<string, unknown>);
      setLegal(webRes.data as Record<string, unknown>);
      const row = configRes.data as Record<string, unknown>;
      setConfigRow(row);
      setConfig({
        activo: Boolean(row.activo), zona_horaria: "Europe/Madrid",
        intervalo_minutos: Number(row.intervalo_minutos ?? 30), duracion_minutos: Number(row.duracion_minutos ?? 90),
        capacidad_por_turno: Number(row.capacidad_por_turno ?? 32), personas_minimas: Number(row.personas_minimas ?? 1),
        personas_maximas: Number(row.personas_maximas ?? 32), confirmacion_automatica: Boolean(row.confirmacion_automatica),
        confirmacion_automatica_hasta: Number(row.confirmacion_automatica_hasta ?? 4),
        antelacion_minutos: Number(row.antelacion_minutos ?? 60), dias_maximos_antelacion: Number(row.dias_maximos_antelacion ?? 30),
        cancelacion_minutos: Number(row.cancelacion_minutos ?? 120),
        requiere_telefono: true, requiere_email: false,
      });
      const existing = (hoursRes.data || []) as { dia_semana: number; turno: string; hora_inicio: string; hora_fin: string; activo: boolean }[];
      setSlots(emptySlots().map(slot => {
        const found = existing.find(row => row.dia_semana === slot.day && row.turno === slot.shift && row.activo);
        return found ? { ...slot, enabled: true, start: found.hora_inicio.slice(0, 5), end: found.hora_fin.slice(0, 5) } : slot;
      }));
    }
    void load();
    return () => { cancelled = true; };
  }, [restaurant?.id]);

  function setNumber(key: keyof Config, value: string) {
    setConfig(current => current ? { ...current, [key]: Number(value) } : current);
  }
  function setSlot(day: number, shift: Shift, patch: Partial<Slot>) {
    setSlots(current => current.map(slot => slot.day === day && slot.shift === shift ? { ...slot, ...patch } : slot));
  }

  async function save() {
    if (!restaurant?.id || !config || !configRow || !web || !legal || busy) return;
    setError(""); setMessage("");
    if (config.capacidad_por_turno < 1 || config.capacidad_por_turno > 32 ||
        config.personas_maximas < 1 || config.personas_maximas > 32 ||
        config.confirmacion_automatica_hasta < 1 || config.confirmacion_automatica_hasta > config.personas_maximas) {
      setError("New Talgo tiene 32 plazas. Revisa capacidad, máximo online y umbral automático."); return;
    }
    const active = slots.filter(slot => slot.enabled);
    if (config.activo && active.length === 0) { setError("Elige al menos un turno antes de activar reservas."); return; }
    if (active.some(slot => !slot.start || !slot.end || slot.end <= slot.start)) {
      setError("Completa las horas de cada turno activo. La hora final debe ser posterior."); return;
    }
    if (active.some((slot, index) => active.some((other, otherIndex) => index !== otherIndex &&
      slot.day === other.day && slot.start < other.end && other.start < slot.end))) {
      setError("Hay turnos solapados en un mismo día. Ajusta las horas antes de guardar."); return;
    }
    setBusy(true);
    const { error: saveError } = await supabase.rpc("guardar_configuracion_web_reservas_legal", {
      p_restaurante_id: restaurant.id,
      p_web: web,
      p_config: { ...configRow, ...config },
      p_horarios: active.map(slot => ({ dia_semana: slot.day, turno: slot.shift,
        hora_inicio: slot.start, hora_fin: slot.end, activo: true, capacidad_override: null })),
      p_legal: legal,
    });
    setBusy(false);
    if (saveError) {
      setError(/OVERLAP/.test(saveError.message) ? "Hay turnos incompatibles con los existentes." :
        "No se pudieron guardar las reglas. Comprueba que no afecten a reservas existentes.");
      return;
    }
    setMessage("Horarios y reglas guardados. La web pública sigue cerrada hasta verificar los avisos en el móvil de Ángel.");
  }

  if (isLoading || (!config && !error)) return <p role="status" className="p-6">Cargando reglas de reserva…</p>;
  if (!config) return <p role="alert" className="p-6">{error}</p>;
  if (!restaurant?.id) return <p role="alert" className="p-6">No hay restaurante autorizado.</p>;
  return <div className="mx-auto max-w-5xl space-y-6 pb-12 text-[#203831]">
    <header className="rounded-2xl bg-[#203831] p-6 text-white">
      <Link href="/panel-personalizado/ajustes" className="text-sm underline underline-offset-4">← Volver a Ajustes</Link>
      <h1 className="mt-4 font-serif text-4xl">Reservas</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6">Elige cuándo aceptar reservas y cuántas personas puede confirmar el sistema. Estos turnos son de reservas, no el horario de cocina.</p>
    </header>
    <section className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Reglas sencillas</h2>
      <label className="mt-5 flex min-h-12 items-center gap-3 text-base font-semibold"><input type="checkbox" checked={config.activo} onChange={e => setConfig({ ...config, activo: e.target.checked })} className="h-5 w-5 accent-[#b75b42]" />Aceptar reservas cuando la web sea habilitada</label>
      <p className="mt-1 text-sm text-[#56665e]">La web sigue cerrada hasta que GastroHelp confirme la recepción de avisos en el móvil de Ángel.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className={label}>Plazas simultáneas (máx. 32)<input className={input} type="number" min={1} max={32} value={config.capacidad_por_turno} onChange={e => setNumber("capacidad_por_turno", e.target.value)} /></label>
        <label className={label}>Personas máximas online<input className={input} type="number" min={1} max={32} value={config.personas_maximas} onChange={e => setNumber("personas_maximas", e.target.value)} /></label>
        <label className={label}>Confirmar automáticamente hasta<input className={input} type="number" min={1} max={config.personas_maximas} value={config.confirmacion_automatica_hasta} onChange={e => setNumber("confirmacion_automatica_hasta", e.target.value)} /><span className="text-xs font-normal">Los grupos mayores quedan pendientes.</span></label>
        <label className={label}>Cada cuántos minutos<select className={input} value={config.intervalo_minutos} onChange={e => setNumber("intervalo_minutos", e.target.value)}>{[15,30,45,60].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
        <label className={label}>Duración de cada reserva<select className={input} value={config.duracion_minutos} onChange={e => setNumber("duracion_minutos", e.target.value)}>{[60,90,120,150,180].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
        <label className={label}>Tiempo mínimo para reservar<select className={input} value={config.antelacion_minutos} onChange={e => setNumber("antelacion_minutos", e.target.value)}>{[0,30,60,120,240,1440].map(n => <option key={n} value={n}>{n} minutos</option>)}</select></label>
        <label className={label}>Hasta cuántos días antes<input className={input} type="number" min={1} max={365} value={config.dias_maximos_antelacion} onChange={e => setNumber("dias_maximos_antelacion", e.target.value)} /></label>
        <label className={label}>Límite para cambiar o cancelar<select className={input} value={config.cancelacion_minutos} onChange={e => setNumber("cancelacion_minutos", e.target.value)}>{[0,60,120,240,1440].map(n => <option key={n} value={n}>{n === 0 ? "Hasta la hora" : n < 60 ? `${n} minutos` : `${n / 60} horas antes`}</option>)}</select></label>
      </div>
    </section>
    <section className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Días y turnos de reserva</h2>
      <p className="mt-1 text-sm">Lunes cerrado. Elige solo franjas que Ángel haya confirmado para aceptar reservas.</p>
      <div className="mt-5 space-y-4">{days.map((day, dayIndex) => <div key={day} className="rounded-xl border border-[#ded7cb] p-4">
        <h3 className="font-bold">{day}</h3>
        {dayIndex === 1 ? <p className="mt-1 text-sm text-[#56665e]">Cerrado</p> : <div className="mt-3 grid gap-3 md:grid-cols-3">{shifts.map(({ key, label: shiftLabel }) => {
          const slot = slots.find(row => row.day === dayIndex && row.shift === key)!;
          return <div key={key} className="rounded-lg bg-[#f5f0e6] p-3">
            <label className="flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5 accent-[#b75b42]" checked={slot.enabled} onChange={e => setSlot(dayIndex,key,{enabled:e.target.checked})} />{shiftLabel}</label>
            {slot.enabled ? <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs">Desde<input className={input} type="time" value={slot.start} onChange={e => setSlot(dayIndex,key,{start:e.target.value})} /></label><label className="text-xs">Hasta<input className={input} type="time" value={slot.end} onChange={e => setSlot(dayIndex,key,{end:e.target.value})} /></label></div> : null}
          </div>;
        })}</div>}
      </div>)}</div>
    </section>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{message}</p> : null}
    <button type="button" disabled={busy} onClick={() => void save()} className="min-h-14 w-full rounded-xl bg-[#b75b42] px-6 text-base font-bold text-white disabled:opacity-60 sm:w-auto">{busy ? "Guardando…" : "Guardar reglas de reserva"}</button>
  </div>;
}
