"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../(app)/lib/supabaseClient";
import { useRestaurante } from "../../../hooks/useRestaurante";

type Table = { id: string; nombre: string; capacidad: number; orden: number; activa: boolean; bloqueada: boolean };
type Occupancy = { id: string; mesa_id: string };
type Booking = { id: string; mesa_id: string | null; personas: number; nombre_cliente: string; inicio_at: string; fin_at: string; estado: string };
type GroupTable = { reserva_id: string; mesa_id: string };
const button = "min-h-11 rounded-xl border border-[#bdc6bf] bg-white px-4 py-2 text-sm font-bold text-[#203831] disabled:opacity-50";
const madridDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
}).format(value);

export default function WhiteLabelRoomPage() {
  const { data: restaurant, isLoading } = useRestaurante();
  const [tables, setTables] = useState<Table[]>([]);
  const [occupancies, setOccupancies] = useState<Occupancy[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [groupTables, setGroupTables] = useState<GroupTable[]>([]);
  const [groupId, setGroupId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const restaurantId = restaurant?.id;

  const refresh = useCallback(async () => {
    if (!restaurantId) return;
    const earliest = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const [tableRes, occupancyRes, bookingRes, groupRes] = await Promise.all([
      supabase.from("sala_mesas").select("id,nombre,capacidad,orden,activa,bloqueada").eq("restaurante_id",restaurantId).order("orden"),
      supabase.from("sala_ocupaciones").select("id,mesa_id").eq("restaurante_id",restaurantId).is("liberada_en",null),
      supabase.from("reservas").select("id,mesa_id,personas,nombre_cliente,inicio_at,fin_at,estado")
        .eq("restaurante_id",restaurantId).gte("inicio_at",earliest).order("inicio_at").limit(300),
      supabase.from("reserva_mesas_grupo").select("reserva_id,mesa_id").eq("restaurante_id",restaurantId),
    ]);
    if (tableRes.error || occupancyRes.error || bookingRes.error || groupRes.error) {
      setError("No se pudo cargar la sala. Comprueba tu sesión y vuelve a intentarlo."); return;
    }
    setTables((tableRes.data || []) as Table[]);
    setOccupancies((occupancyRes.data || []) as Occupancy[]);
    setBookings((bookingRes.data || []) as Booking[]);
    setGroupTables((groupRes.data || []) as GroupTable[]);
  }, [restaurantId]);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  const today = madridDate(new Date());
  const activeBookings = useMemo(() => bookings.filter(row => !["cancelada","cancelado","no-show","no_show"].includes(row.estado.toLowerCase())),[bookings]);
  const pendingGroups = activeBookings.filter(row => row.estado === "pendiente" && row.personas > 4);
  const selectedGroup = pendingGroups.find(row => row.id === groupId);
  const selectedCapacity = tables.filter(table => selected.includes(table.id)).reduce((sum,table) => sum+table.capacidad,0);

  function tableBooking(tableId: string) {
    return activeBookings.find(row => madridDate(new Date(row.inicio_at)) === today && new Date(row.fin_at).getTime() > Date.now() &&
      (row.mesa_id === tableId || groupTables.some(link => link.reserva_id === row.id && link.mesa_id === tableId))) || null;
  }
  function conflictsWithGroup(tableId: string) {
    if (!selectedGroup) return false;
    return activeBookings.some(row => row.id !== selectedGroup.id &&
      row.inicio_at < selectedGroup.fin_at && row.fin_at > selectedGroup.inicio_at &&
      (row.mesa_id === tableId || groupTables.some(link => link.reserva_id === row.id && link.mesa_id === tableId)));
  }
  async function act(action: () => PromiseLike<{ error: { message: string } | null }>, success: string, afterSuccess?: () => void) {
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await action();
      if (result.error) throw result.error;
      await refresh(); afterSuccess?.(); setMessage(success);
    } catch (caught) {
      const code = caught instanceof Error ? caught.message : String((caught as { message?: string })?.message || "");
      setError(code.includes("TABLE_HAS_FUTURE_RESERVATION") ? "Esta mesa tiene una reserva futura. Resuélvela antes de bloquearla." :
        code.includes("TABLE_TIME_CONFLICT") ? "La mesa ya tiene una reserva en esa franja." :
        code.includes("SLOT_NOT_AVAILABLE") ? "La hora del grupo ya no está disponible." :
        "No se pudo guardar el cambio. Revisa las mesas y vuelve a intentarlo.");
    } finally { setBusy(false); }
  }
  function occupy(table: Table) {
    void act(() => supabase.rpc("cambiar_ocupacion_mesa",{p_mesa_id:table.id,p_ocupar:true}),`${table.nombre} ocupada. Ya no se ofrece para nuevas reservas.`);
  }
  function free(table: Table) {
    if (!window.confirm(`¿Liberar ${table.nombre}? Hazlo solo cuando la mesa esté realmente libre.`)) return;
    void act(() => supabase.rpc("cambiar_ocupacion_mesa",{p_mesa_id:table.id,p_ocupar:false}),`${table.nombre} liberada.`);
  }
  function toggleBlock(table: Table) {
    if (!window.confirm(`${table.bloqueada ? "Desbloquear" : "Bloquear"} ${table.nombre}? Las reservas existentes no se cancelan.`)) return;
    void act(() => supabase.from("sala_mesas").update({bloqueada:!table.bloqueada})
      .eq("id",table.id).eq("restaurante_id",restaurantId!),`${table.nombre} ${table.bloqueada ? "desbloqueada" : "bloqueada"}.`);
  }
  function confirmGroup() {
    if (!selectedGroup || selectedCapacity < selectedGroup.personas || selected.length < 2) return;
    if (!window.confirm(`¿Confirmar el grupo de ${selectedGroup.personas} personas con ${selected.length} mesas?`)) return;
    void act(() => supabase.rpc("confirmar_reserva_grupo",{p_reserva_id:selectedGroup.id,p_mesa_ids:selected}),"Grupo confirmado y mesas asignadas.",() => { setSelected([]); setGroupId(""); });
  }

  if (isLoading) return <p role="status" className="p-6">Cargando sala…</p>;
  if (!restaurantId) return <p role="alert" className="p-6">No hay restaurante autorizado.</p>;
  return <div className="mx-auto max-w-6xl space-y-6 pb-12 text-[#203831]">
    <header className="rounded-2xl bg-[#203831] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#d9b7a4]">{restaurant?.nombre || "Restaurante"} · hoy</p><h1 className="mt-2 font-serif text-4xl">Mesas</h1><p className="mt-2 text-sm leading-6">{tables.length} mesas configuradas. Ocupa o libera una mesa con un toque; la disponibilidad se recalcula en la web.</p></header>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">{error}</p> : null}
    {message ? <p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p> : null}
    {pendingGroups.length ? <section className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5">
      <h2 className="font-serif text-2xl">Grupos pendientes</h2><p className="mt-1 text-sm">Elige una solicitud y al menos dos mesas suficientes antes de confirmar.</p>
      <div className="mt-4 flex flex-wrap gap-2">{pendingGroups.map(row => <button key={row.id} type="button" onClick={() => {setGroupId(row.id);setSelected([]);}} aria-pressed={groupId===row.id} className={`${button} ${groupId===row.id ? "!bg-[#203831] !text-white" : ""}`}>{row.personas} personas · {new Date(row.inicio_at).toLocaleString("es-ES",{timeZone:"Europe/Madrid",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</button>)}</div>
      {selectedGroup ? <div className="mt-4"><p className="text-sm font-bold">Mesas elegidas: {selected.length} · {selectedCapacity} plazas para {selectedGroup.personas} personas.</p><button type="button" disabled={busy || selected.length<2 || selectedCapacity<selectedGroup.personas} onClick={confirmGroup} className="mt-3 min-h-12 rounded-xl bg-[#b75b42] px-5 text-sm font-bold text-white disabled:opacity-50">Confirmar grupo y mesas</button></div> : null}
    </section> : null}
    <section aria-label="Estado de las mesas" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{tables.map(table => {
      const occupancy = occupancies.find(row => row.mesa_id===table.id);
      const booking = tableBooking(table.id);
      const status = table.bloqueada ? "BLOQUEADA" : occupancy ? "OCUPADA" : booking ? "RESERVADA" : "LIBRE";
      return <article key={table.id} className="rounded-2xl border border-[#ded7cb] bg-[#fffdf9] p-5">
        <div className="flex items-start justify-between gap-2"><h2 className="font-serif text-2xl">{table.nombre}</h2><span className="rounded-full bg-[#e7e8df] px-3 py-1 text-xs font-bold">{status}</span></div>
        <p className="mt-2 text-sm">{table.capacidad} plazas</p>
        {booking ? <p className="mt-2 text-sm">{new Date(booking.inicio_at).toLocaleTimeString("es-ES",{timeZone:"Europe/Madrid",hour:"2-digit",minute:"2-digit"})} · {booking.personas} personas</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {status==="LIBRE" ? <button type="button" disabled={busy} onClick={() => occupy(table)} className={button}>Ocupar mesa</button> : null}
          {occupancy ? <button type="button" disabled={busy} onClick={() => free(table)} className={button}>Liberar mesa</button> : null}
          {booking ? <Link href="/panel-personalizado/reservas" className={`${button} inline-flex items-center`}>Ver reserva</Link> : null}
          <button type="button" disabled={busy} onClick={() => toggleBlock(table)} className={button}>{table.bloqueada ? "Desbloquear" : "Bloquear"}</button>
          {selectedGroup && !table.bloqueada && !occupancy && !conflictsWithGroup(table.id) ? <button type="button" onClick={() => setSelected(current => current.includes(table.id) ? current.filter(id=>id!==table.id) : [...current,table.id])} aria-pressed={selected.includes(table.id)} className={`${button} ${selected.includes(table.id) ? "!bg-[#203831] !text-white" : ""}`}>{selected.includes(table.id) ? "Mesa elegida" : "Elegir para grupo"}</button> : null}
        </div>
      </article>;
    })}</section>
    <div className="flex flex-wrap gap-3"><Link href="/panel-personalizado/reservas" className={`${button} inline-flex items-center`}>Ver calendario y reservas</Link><Link href="/panel-personalizado/ajustes/reservas" className={`${button} inline-flex items-center`}>Cambiar horarios</Link></div>
  </div>;
}
