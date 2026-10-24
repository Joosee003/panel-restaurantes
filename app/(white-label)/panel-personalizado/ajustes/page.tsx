"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useRestaurante } from "../../../hooks/useRestaurante";
import { queryKeys } from "../../../query/queryKeys";
import { supabase } from "../../../(app)/lib/supabaseClient";
import { serviceHoursError } from "../../../lib/serviceHours";

type RestaurantForm = {
  nombre: string;
  telefono: string;
  horario_comida: string;
  horario_cena: string;
  capacidad_total: string;
  capacidad_comida: string;
  capacidad_cena: string;
};

const blank: RestaurantForm = {
  nombre: "", telefono: "", horario_comida: "", horario_cena: "",
  capacidad_total: "", capacidad_comida: "", capacidad_cena: "",
};

const field = "mt-1 block w-full rounded-xl border border-[#c9c1b3] bg-white px-3 py-3 text-sm text-[#203831] focus:border-[#b75b42] focus:outline-none focus:ring-2 focus:ring-[#b75b42]/25";
const label = "block text-xs font-bold uppercase tracking-wider text-[#56665e]";

function capacity(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 500 ? number : null;
}

export default function WhiteLabelSettingsPage() {
  const { data: restaurant, isLoading } = useRestaurante();
  const queryClient = useQueryClient();
  const initializedRestaurant = useRef<string | null>(null);
  const [form, setForm] = useState<RestaurantForm>(blank);
  const [booking, setBooking] = useState<{ activo: boolean; capacidad_por_turno: number; zona_horaria: string } | null>(null);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!restaurant?.id || initializedRestaurant.current === restaurant.id) return;
    initializedRestaurant.current = restaurant.id;
    setForm({
      nombre: restaurant.nombre || "", telefono: restaurant.telefono || "",
      horario_comida: restaurant.horario_comida || "", horario_cena: restaurant.horario_cena || "",
      capacidad_total: String(restaurant.capacidad_total ?? 0),
      capacidad_comida: String(restaurant.capacidad_comida ?? 0),
      capacidad_cena: String(restaurant.capacidad_cena ?? 0),
    });
    void supabase.from("reservas_config")
      .select("activo,capacidad_por_turno,zona_horaria")
      .eq("restaurante_id", restaurant.id).maybeSingle()
      .then(({ data }) => setBooking(data));
    void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email || ""));
  }, [restaurant]);

  const set = (key: keyof RestaurantForm, value: string) => setForm(current => ({ ...current, [key]: value }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!restaurant?.id || saving) return;
    setNotice(""); setError("");
    const total = capacity(form.capacidad_total);
    const lunch = capacity(form.capacidad_comida);
    const dinner = capacity(form.capacidad_cena);
    const hoursError = serviceHoursError(form.horario_comida, form.horario_cena);
    if (!form.nombre.trim() || total === null || lunch === null || dinner === null
      || lunch > total || dinner > total || hoursError) {
      setError(hoursError || "Revisa el nombre y las capacidades: cada turno debe caber en la capacidad total.");
      return;
    }
    setSaving(true);
    const { data, error: saveError } = await supabase.from("restaurantes").update({
      nombre: form.nombre.trim(), telefono: form.telefono.trim(),
      horario_comida: form.horario_comida.trim(), horario_cena: form.horario_cena.trim(),
      capacidad_total: total, capacidad_comida: lunch, capacidad_cena: dinner,
    }).eq("id", restaurant.id)
      .select("id,nombre,telefono,horario_comida,horario_cena,capacidad_total,capacidad_comida,capacidad_cena")
      .maybeSingle();
    setSaving(false);
    if (saveError || data?.id !== restaurant.id) {
      setError("No se pudieron guardar los cambios. Comprueba tu sesión y vuelve a intentarlo.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.restaurante.all });
    setNotice("Datos del restaurante guardados.");
  }

  if (isLoading) return <p role="status" className="p-6">Cargando ajustes…</p>;
  if (!restaurant?.id) return <p role="alert" className="p-6">No hay un restaurante autorizado en esta sesión.</p>;

  return <div className="mx-auto max-w-5xl space-y-6 pb-8 text-[#203831]">
    <header className="rounded-2xl bg-[#203831] px-5 py-6 text-[#f8f4ec] sm:px-7">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#d9b7a4]">Tu restaurante</p>
      <h1 className="mt-2 text-4xl font-normal">Ajustes</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#d9e1d9]">Datos y capacidad del restaurante. Los turnos de reserva se ajustan por separado, sin confundirlos con el horario de cocina.</p>
    </header>
    <form onSubmit={save} className="space-y-6 rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5 sm:p-7">
      <div><h2 className="text-2xl">Datos y capacidad</h2><p className="mt-1 text-sm text-[#56665e]">Los cambios se guardan solo para este restaurante.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Nombre interno<input className={field} maxLength={120} required value={form.nombre} onChange={e => set("nombre", e.target.value)} /></label>
        <label className={label}>Teléfono interno<input className={field} type="tel" maxLength={40} value={form.telefono} onChange={e => set("telefono", e.target.value)} placeholder="Pendiente de confirmar" /></label>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>Capacidad total<input className={field} type="number" min="0" max="500" value={form.capacidad_total} onChange={e => set("capacidad_total", e.target.value)} /></label>
        <label className={label}>Capacidad comida<input className={field} type="number" min="0" max="500" value={form.capacidad_comida} onChange={e => set("capacidad_comida", e.target.value)} /></label>
        <label className={label}>Capacidad cena<input className={field} type="number" min="0" max="500" value={form.capacidad_cena} onChange={e => set("capacidad_cena", e.target.value)} /></label>
      </div>
      <p className="text-xs leading-5 text-[#56665e]">El horario de cocina no está confirmado. La capacidad física y los turnos de reserva se gestionan por separado.</p>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      <button disabled={saving} className="min-h-12 rounded-xl bg-[#b75b42] px-6 text-sm font-bold text-white disabled:opacity-60" type="submit">{saving ? "Guardando…" : "Guardar ajustes"}</button>
    </form>
    <section className="grid gap-4 sm:grid-cols-2" aria-label="Estado de la configuración">
      <div className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5"><h2 className="text-xl">Reglas de reservas</h2><p className="mt-2 text-sm leading-6">{booking?.activo ? "Disponibilidad configurada en GastroHelp. La web de reservas permanece cerrada hasta comprobar los avisos." : "Reservas online desactivadas"}</p><p className="mt-2 text-xs text-[#56665e]">Zona horaria: {booking?.zona_horaria || "pendiente"} · Capacidad por turno: {booking?.capacidad_por_turno ?? "pendiente"}</p><Link href="/panel-personalizado/ajustes/reservas" className="mt-4 inline-flex min-h-12 items-center rounded-xl bg-[#203831] px-5 text-sm font-bold text-white">Configurar reservas</Link></div>
      <div className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5"><h2 className="text-xl">Acceso privado</h2><p className="mt-2 break-all text-sm">{email || "Sesión autenticada"}</p><p className="mt-2 text-xs text-[#56665e]">La identidad y recuperación de contraseña usan GastroHelp Auth. Usa «Salir» en la cabecera para cerrar la sesión.</p></div>
    </section>
  </div>;
}
