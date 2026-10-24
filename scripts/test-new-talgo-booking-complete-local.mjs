import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const local = JSON.parse(await readFile("local-schema/supabase-status.json", "utf8"));
const fixture = JSON.parse(await readFile("local-schema/fixture-credentials.json", "utf8"));
const apiUrl = new URL(local.API_URL);
assert.equal(apiUrl.hostname, "127.0.0.1");
assert.equal(apiUrl.port, "54321");
const app = new URL(process.env.NEW_TALGO_LOCAL_APP_URL || "http://127.0.0.1:4176");
assert.equal(app.hostname, "127.0.0.1");
const service = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
// Each local test run has its own synthetic client identity so earlier fixture runs
// do not exhaust the production rate limiter's ten-minute window.
const localTestIp = `192.0.2.${Math.floor(Math.random() * 254) + 1}`;
const restaurantId = fixture.restaurants.newTalgo;
let slug;

async function actor(name) {
  const client = createClient(local.API_URL, local.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await client.auth.signInWithPassword(fixture.users[name]);
  assert.ifError(error);
  return client;
}
async function request(path, init) {
  const response = await fetch(new URL(path, app), { ...init, headers: { "content-type": "application/json", "x-forwarded-for": localTestIp, ...(init?.headers || {}) } });
  return { status: response.status, body: await response.json() };
}
function madridDate(offset) {
  const date = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function booking(start, party, name, key = randomUUID(), testIp = localTestIp) {
  return request(`/api/public/restaurants/${slug}/bookings`, { method: "POST", headers: { "x-forwarded-for": testIp }, body: JSON.stringify({
    start, party, name, phone: "+34600000091", email: "", notes: "Prueba local ficticia",
    company: "", idempotencyKey: key, privacyInformed: true,
    conditionsAccepted: true, legalVersion: "2026-08-03", reviewWhatsapp: false,
  }) });
}
async function reservation(id, client = service) {
  const { data, error } = await client.from("reservas").select("id,restaurante_id,cliente_id,mesa_id,personas,estado,inicio_at,fin_at,nombre_cliente").eq("id", id).maybeSingle();
  assert.ifError(error);
  return data;
}

const { data: originalWeb, error: webError } = await service.from("restaurante_webs")
  .select("slug,publicada").eq("restaurante_id", restaurantId).single();
assert.ifError(webError);
slug = originalWeb.slug;
assert.equal(originalWeb.publicada, false, "La web local debe partir cerrada");
const { error: publishError } = await service.from("restaurante_webs")
  .update({ publicada: true }).eq("restaurante_id", restaurantId);
assert.ifError(publishError);
let pass = 0;
function check(condition, message) { assert.ok(condition, message); pass++; }
try {
  const [owner, other, agency] = await Promise.all([actor("newTalgo"), actor("mesaNorte"), actor("agency")]);
  let date, first, second, baselineSlotsCount;
  for (let offset = 2; offset <= 20; offset++) {
    const candidate = madridDate(offset);
    const result = await request(`/api/public/restaurants/${slug}/availability?date=${candidate}&party=2`);
    if (offset === 2) console.log(`Primer intento de disponibilidad: HTTP ${result.status}, ${result.body.error || `${result.body.slots?.length || 0} franjas`}`);
    if (result.status === 200 && result.body.slots?.length >= 3) {
      date = candidate; [first, second] = result.body.slots.slice(-2);
      baselineSlotsCount = result.body.slots.length;
      break;
    }
  }
  check(Boolean(first && second), "Disponibilidad pública original sin franjas");

  const { data: webForSettings, error: webSettingsError } = await owner.from("restaurante_webs")
    .select("*").eq("restaurante_id", restaurantId).single();
  const { data: bookingConfig, error: bookingConfigError } = await owner.from("reservas_config")
    .select("*").eq("restaurante_id", restaurantId).single();
  const { data: hours, error: hoursError } = await owner.from("reservas_horarios")
    .select("dia_semana,turno,hora_inicio,hora_fin,capacidad_override,activo")
    .eq("restaurante_id", restaurantId).eq("activo", true);
  assert.ifError(webSettingsError); assert.ifError(bookingConfigError); assert.ifError(hoursError);
  const settings = interval => owner.rpc("guardar_configuracion_web_reservas_legal", {
    p_restaurante_id: restaurantId, p_web: webForSettings,
    p_config: { ...bookingConfig, intervalo_minutos: interval }, p_horarios: hours,
    p_legal: webForSettings,
  });
  const changedSettings = await settings(15);
  check(!changedSettings.error, `Ajustes del propietario: ${changedSettings.error?.message}`);
  const expanded = await request(`/api/public/restaurants/${slug}/availability?date=${date}&party=2`);
  check(expanded.status === 200 && expanded.body.slots.length > baselineSlotsCount,
    "El intervalo del panel no se refleja en disponibilidad");
  const restoredSettings = await settings(bookingConfig.intervalo_minutos);
  check(!restoredSettings.error, `Restaurar intervalo: ${restoredSettings.error?.message}`);

  const block = await owner.from("bloqueos_reservas").insert({
    restaurante_id: restaurantId, fecha: date, hora_inicio: first.time,
    hora_fin: `${first.time.slice(0, 2)}:${String(Number(first.time.slice(3, 5)) + 1).padStart(2, "0")}`,
    motivo: "Bloqueo ficticio local", activo: true,
  }).select("id").single();
  check(!block.error, `Bloquear hora: ${block.error?.message}`);
  const withoutBlocked = await request(`/api/public/restaurants/${slug}/availability?date=${date}&party=2`);
  check(withoutBlocked.status === 200 && !withoutBlocked.body.slots.some(slot => slot.start === first.start),
    "La franja bloqueada aún aparece en la web");
  const unblocked = await owner.from("bloqueos_reservas").delete().eq("id", block.data.id);
  check(!unblocked.error, `Reabrir hora: ${unblocked.error?.message}`);
  const dayBlock = await owner.from("bloqueos_reservas").insert({
    restaurante_id: restaurantId, fecha: date, hora_inicio: "00:00", hora_fin: "23:59",
    motivo: "Cierre ficticio local", activo: true,
  }).select("id").single();
  check(!dayBlock.error, `Cerrar día: ${dayBlock.error?.message}`);
  const closed = await request(`/api/public/restaurants/${slug}/availability?date=${date}&party=2`);
  check(closed.status === 200 && closed.body.slots.length === 0, "Cierre de día no eliminó la disponibilidad");
  const reopened = await owner.from("bloqueos_reservas").delete().eq("id", dayBlock.data.id);
  check(!reopened.error, `Reabrir día: ${reopened.error?.message}`);

  const key = randomUUID();
  const created = await booking(first.start, 2, "Cliente ficticio New Talgo E2E", key);
  check(created.status === 201 && created.body.reservation?.status === "confirmada", `Reserva individual: ${JSON.stringify(created.body)}`);
  const id = created.body.reservation.reservationId;
  const token = created.body.reservation.managePath.split("/").at(-1);
  const own = await reservation(id, owner);
  check(own?.restaurante_id === restaurantId && own?.cliente_id && own?.mesa_id, "Persistencia, cliente y mesa original");
  check((await reservation(id, other)) === null, "RLS: restaurante ajeno leyó reserva");
  check((await reservation(id, agency))?.id === id, "Agencia no ve la misma reserva");
  const duplicate = await booking(first.start, 2, "Cliente ficticio New Talgo E2E", key);
  check(duplicate.status === 200 && duplicate.body.reservation?.reservationId === id, "Idempotencia pública");

  const manageAvailability = await request(`/api/public/reservations/${token}/availability?date=${date}&party=3`);
  check(manageAvailability.status === 200 && manageAvailability.body.slots?.some(slot => slot.start === second.start), "Disponibilidad para modificación");
  const changed = await request(`/api/public/reservations/${token}/reschedule`, {
    method: "POST", body: JSON.stringify({ start: second.start, party: 3 }),
  });
  if (changed.status !== 200) {
    const diagnosis = await service.rpc("modificar_reserva_publica_gestion", {
      p_gestion_token: token, p_nuevo_inicio_at: second.start, p_nuevas_personas: 3,
    });
    console.log(`Diagnóstico RPC cambio: ${diagnosis.error?.message || "RPC aceptada"}`);
  }
  check(changed.status === 200 && changed.body.party === 3, `Cambio de reserva: ${JSON.stringify(changed.body)}`);
  check((await reservation(id, owner))?.personas === 3, "Cambio no persistió en GastroHelp");
  const cancelled = await request(`/api/public/reservations/${token}/cancel`, { method: "POST" });
  check(cancelled.status === 200 && (await reservation(id, owner))?.estado === "cancelada", `Cancelación: ${JSON.stringify(cancelled.body)}`);

  const group = await booking(first.start, 5, "Grupo ficticio New Talgo E2E");
  check(group.status === 201 && group.body.reservation?.status === "pendiente", `Solicitud de grupo: ${JSON.stringify(group.body)}`);
  const groupId = group.body.reservation.reservationId;
  check((await reservation(groupId, owner))?.mesa_id === null, "Grupo pendiente ocupó una mesa");
  const { data: tables, error: tableError } = await owner.from("sala_mesas")
    .select("id").eq("restaurante_id", restaurantId).eq("activa", true).eq("bloqueada", false).order("orden");
  assert.ifError(tableError);
  const foreign = await other.rpc("confirmar_reserva_grupo", { p_reserva_id: groupId, p_mesa_ids: tables.slice(0, 2).map(t => t.id) });
  check(Boolean(foreign.error), "Usuario ajeno confirmó grupo");
  let approved;
  for (let i = 0; i < tables.length && approved?.error !== null; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      approved = await owner.rpc("confirmar_reserva_grupo", {
        p_reserva_id: groupId, p_mesa_ids: [tables[i].id, tables[j].id],
      });
      if (!approved.error) break;
    }
  }
  check(!approved.error && (await reservation(groupId, owner))?.estado === "confirmada", `Confirmación de grupo: ${approved.error?.message}`);
  const { data: links, error: linksError } = await owner.from("reserva_mesas_grupo").select("mesa_id").eq("reserva_id", groupId);
  assert.ifError(linksError);
  check(links?.length === 2, "Grupo no enlazado a dos mesas");
  const { data: foreignLinks, error: foreignLinksError } = await other.from("reserva_mesas_grupo").select("mesa_id").eq("reserva_id", groupId);
  assert.ifError(foreignLinksError);
  check(foreignLinks.length === 0, "RLS filtró mesas del grupo");

  const occupied = await owner.rpc("cambiar_ocupacion_mesa", { p_mesa_id: tables[2].id, p_ocupar: true });
  check(!occupied.error, `Ocupar mesa: ${occupied.error?.message}`);
  const foreignFree = await other.rpc("cambiar_ocupacion_mesa", { p_mesa_id: tables[2].id, p_ocupar: false });
  check(Boolean(foreignFree.error), "Usuario ajeno liberó mesa");
  const freed = await owner.rpc("cambiar_ocupacion_mesa", { p_mesa_id: tables[2].id, p_ocupar: false });
  check(!freed.error, `Liberar mesa: ${freed.error?.message}`);
  const { data: foreignBooking } = await other.from("reservas").select("id").eq("id", groupId);
  check(foreignBooking.length === 0, "RLS filtró reserva de grupo");

  let manualStart;
  for (let offset = 3; offset <= 22; offset++) {
    const candidate = madridDate(offset);
    if (candidate === date) continue;
    const { data, error } = await owner.rpc("obtener_disponibilidad_manual", {
      p_restaurante_id: restaurantId, p_fecha: candidate, p_personas: 2,
    });
    assert.ifError(error);
    if (data?.length) { manualStart = data.at(-1).inicio_at; break; }
  }
  check(Boolean(manualStart), "No hay franja para reserva telefónica");
  const manual = await owner.rpc("crear_reserva_manual", {
    p_restaurante_id: restaurantId, p_inicio_at: manualStart, p_personas: 2,
    p_nombre: "Teléfono ficticio New Talgo E2E", p_telefono: "+34600000092",
    p_email: null, p_notas: null, p_idempotency_key: randomUUID(),
  });
  check(!manual.error && manual.data?.estado === "confirmada", `Reserva telefónica: ${manual.error?.message}`);
  const manualRow = await reservation(manual.data.reserva_id, owner);
  check(Boolean(manualRow?.mesa_id), "Reserva telefónica no asignó mesa");
  const noShow = await owner.rpc("marcar_asistencia_reserva", { p_reserva_id: manualRow.id, p_asistio: false });
  check(!noShow.error && noShow.data?.atendida === false, `No-show: ${noShow.error?.message}`);
  check((await reservation(manualRow.id, owner))?.estado === "no-show", "No-show no persistió");

  let concurrentStart;
  for (let offset = 18; offset <= 29; offset++) {
    const candidate = madridDate(offset);
    const result = await request(`/api/public/restaurants/${slug}/availability?date=${candidate}&party=32`);
    if (result.status === 200 && result.body.slots?.length) {
      concurrentStart = result.body.slots.at(-1).start; break;
    }
  }
  check(Boolean(concurrentStart), "Sin fecha libre para prueba simultánea de 32 plazas");
  const simultaneous = await Promise.all(Array.from({ length: 9 }, (_, index) =>
    booking(concurrentStart, 4, `Concurrencia ficticia ${index}`, randomUUID(), `198.51.100.${index + 20}`)));
  const confirmed = simultaneous.filter(result => result.status === 201 && result.body.reservation?.status === "confirmada");
  const rejected = simultaneous.filter(result => result.status === 409 && result.body.error === "SLOT_NOT_AVAILABLE");
  check(confirmed.length === 8 && rejected.length === 1,
    `Concurrencia: ${confirmed.length} confirmadas, ${rejected.length} rechazadas`);
  for (const result of confirmed) {
    const { error } = await owner.from("reservas").update({ estado: "cancelada", mesa_id: null })
      .eq("id", result.body.reservation.reservationId).eq("restaurante_id", restaurantId);
    assert.ifError(error);
  }
  console.log(`PASS: ${pass} comprobaciones reales API → Auth/RPC → PostgreSQL → panel común y RLS; fecha ficticia ${date}.`);
} finally {
  const { error } = await service.from("restaurante_webs")
    .update({ publicada: originalWeb.publicada }).eq("restaurante_id", restaurantId);
  assert.ifError(error);
  console.log("Web pública ficticia cerrada de nuevo.");
}
