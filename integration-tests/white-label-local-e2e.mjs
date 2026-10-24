import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";

const required = [
  "GH_LOCAL_URL", "GH_LOCAL_ANON_KEY", "GH_LOCAL_SERVICE_KEY",
  "GH_LOCAL_RESTAURANT_A_ID", "GH_LOCAL_RESTAURANT_B_ID",
  "GH_LOCAL_A_EMAIL", "GH_LOCAL_A_PASSWORD",
  "GH_LOCAL_B_EMAIL", "GH_LOCAL_B_PASSWORD",
  "GH_LOCAL_AGENCY_EMAIL", "GH_LOCAL_AGENCY_PASSWORD",
  "GH_LOCAL_BOOKING_DATE", "GH_LOCAL_CAPACITY_ONE_DATE",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const missing = required.filter(name => !process.env[name]);
const url = process.env.GH_LOCAL_URL ? new URL(process.env.GH_LOCAL_URL) : null;

// This runner writes only to a local Supabase test stack. It must never be
// pointed at GastroHelp Cloud, QA, or another network endpoint.
if (missing.length) throw new Error(`LOCAL_FIXTURE_MISSING: ${missing.join(", ")}`);
if (process.env.GH_LOCAL_E2E !== "1" || url?.protocol !== "http:"
    || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
  throw new Error("LOCAL_ONLY_TARGET_REQUIRED");
}
const A = process.env.GH_LOCAL_RESTAURANT_A_ID;
const B = process.env.GH_LOCAL_RESTAURANT_B_ID;
if (!uuid.test(A) || !uuid.test(B) || A === B) throw new Error("TWO_DISTINCT_LOCAL_RESTAURANTS_REQUIRED");
for (const name of ["GH_LOCAL_BOOKING_DATE", "GH_LOCAL_CAPACITY_ONE_DATE"]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(process.env[name])) throw new Error(`INVALID_LOCAL_DATE: ${name}`);
}
if (process.env.GH_LOCAL_BOOKING_DATE === process.env.GH_LOCAL_CAPACITY_ONE_DATE) {
  throw new Error("TWO_DISTINCT_LOCAL_BOOKING_DATES_REQUIRED");
}

function client() {
  return createClient(url.href, process.env.GH_LOCAL_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
async function signedIn(email, password) {
  const api = client();
  const { data, error } = await api.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.user?.id, "fictional local user must authenticate");
  return api;
}
async function query(result) {
  assert.ifError(result.error);
  return result.data;
}
async function access(api, restaurantId) {
  return query(await api.rpc("puede_acceder_restaurante", { p_restaurante_id: restaurantId }));
}
async function createFictionalClient(api, restaurantId, suffix) {
  const rows = await query(await api.from("clientes").insert({
    restaurante_id: restaurantId,
    nombre: `Cliente ficticio ${suffix}`,
    email: `gastrohelp-local-${suffix}@example.invalid`,
    telefono: null,
    visitas_totales: 0,
    puntos_totales: 0,
    permite_whatsapp: false,
    permite_email: false,
  }).select("id,restaurante_id,nombre").single());
  return rows;
}
async function availability(api, restaurantId, date) {
  // Repeated local runs leave fictional reservations in PostgreSQL. Search
  // subsequent fixture days instead of treating a consumed slot as a failure.
  for (let offset = 0; offset < 30; offset++) {
    const day = new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
    const slots = await query(await api.rpc("obtener_disponibilidad_manual", {
      p_restaurante_id: restaurantId, p_fecha: day, p_personas: 1,
    }));
    if (Array.isArray(slots) && slots.length) return slots[0].inicio_at;
  }
  assert.fail("fictional local fixture must expose a free slot within 30 days");
}
async function book(api, restaurantId, instant, key, suffix) {
  const result = await api.rpc("crear_reserva_manual", {
    p_restaurante_id: restaurantId, p_inicio_at: instant, p_personas: 1,
    p_nombre: `Reserva ficticia ${suffix}`,
    p_telefono: "+34600000091", p_email: `gastrohelp-booking-${suffix}@example.invalid`,
    p_notas: null, p_idempotency_key: key,
  });
  if (result.error) return { error: result.error.message };
  if (result.data?.ok !== true) return { error: result.data?.error || "BOOKING_FAILED" };
  return { id: result.data.reserva_id, duplicate: result.data.duplicate === true };
}

test("original GastroHelp Auth, RLS, clients and booking RPCs on isolated local Supabase", async () => {
  const a = await signedIn(process.env.GH_LOCAL_A_EMAIL, process.env.GH_LOCAL_A_PASSWORD);
  const b = await signedIn(process.env.GH_LOCAL_B_EMAIL, process.env.GH_LOCAL_B_PASSWORD);
  const agency = await signedIn(process.env.GH_LOCAL_AGENCY_EMAIL, process.env.GH_LOCAL_AGENCY_PASSWORD);
  const anonymous = client();

  assert.equal(await access(a, A), true);
  assert.equal(await access(a, B), false);
  assert.equal(await access(b, A), false);
  assert.equal(await access(b, B), true);
  assert.equal(await access(agency, A), true);
  assert.equal(await access(agency, B), true);

  const run = randomUUID().slice(0, 8);
  const ca = await createFictionalClient(a, A, `a-${run}`);
  const cb = await createFictionalClient(b, B, `b-${run}`);
  assert.equal(ca.restaurante_id, A);
  assert.equal(cb.restaurante_id, B);

  for (const [actor, foreignId] of [[a, cb.id], [b, ca.id]]) {
    const rows = await query(await actor.from("clientes").select("id").eq("id", foreignId));
    assert.deepEqual(rows, [], "RLS must hide foreign client");
  }
  const anonymousClient = await anonymous.from("clientes").select("id").eq("id", ca.id);
  assert.ok(anonymousClient.error || anonymousClient.data?.length === 0, "anonymous client access must be denied");
  const tamper = await b.from("clientes").update({ nombre: "Acceso indebido" }).eq("id", ca.id).select("id");
  assert.ok(tamper.error || tamper.data?.length === 0, "foreign client update must be denied");
  assert.equal((await query(await a.from("clientes").select("nombre").eq("id", ca.id).single())).nombre, ca.nombre);
  for (const id of [ca.id, cb.id]) {
    assert.ok(await query(await agency.from("clientes").select("id").eq("id", id).single()));
  }

  const normalSlot = await availability(a, A, process.env.GH_LOCAL_BOOKING_DATE);
  const key = randomUUID();
  const first = await book(a, A, normalSlot, key, `${run}-once`);
  assert.ok(first.id, first.error || "first reservation failed");
  const retry = await book(a, A, normalSlot, key, `${run}-once`);
  assert.equal(retry.id, first.id, "original RPC must deduplicate retries");
  const visible = await query(await a.from("reservas").select("id,restaurante_id,cliente_id").eq("id", first.id).single());
  assert.equal(visible.restaurante_id, A);
  assert.ok(visible.cliente_id, "booking must link to a customer");
  assert.deepEqual(await query(await b.from("reservas").select("id").eq("id", first.id)), []);
  const anonymousBooking = await anonymous.from("reservas").select("id").eq("id", first.id);
  assert.ok(anonymousBooking.error || anonymousBooking.data?.length === 0, "anonymous booking access must be denied");
  assert.ok(await query(await agency.from("reservas").select("id").eq("id", first.id).single()));
  const foreignEdit = await b.from("reservas").update({ notas: "Acceso indebido" })
    .eq("id", first.id).select("id");
  assert.ok(foreignEdit.error || foreignEdit.data?.length === 0, "foreign reservation update must be denied");

  const bSlot = await availability(b, B, process.env.GH_LOCAL_BOOKING_DATE);
  const bBooking = await book(b, B, bSlot, randomUUID(), `${run}-b`);
  assert.ok(bBooking.id, bBooking.error || "second restaurant reservation failed");
  assert.deepEqual(await query(await a.from("reservas").select("id").eq("id", bBooking.id)), []);
  assert.ok(await query(await agency.from("reservas").select("id").eq("id", bBooking.id).single()));

  const wrongMinute = new Date(Date.parse(normalSlot) + 60_000).toISOString();
  const outside = await book(a, A, wrongMinute, randomUUID(), `${run}-closed`);
  assert.match(outside.error || "", /SLOT_NOT_AVAILABLE/, "original schedule rules must reject an invalid minute");

  const capacity = await query(await b.from("reservas_config")
    .select("capacidad_por_turno").eq("restaurante_id", B).single());
  assert.equal(capacity.capacidad_por_turno, 1, "capacity fixture must be set to one");
  const oneSlot = await availability(b, B, process.env.GH_LOCAL_CAPACITY_ONE_DATE);
  const concurrent = await Promise.all([
    book(b, B, oneSlot, randomUUID(), `${run}-race-1`),
    book(b, B, oneSlot, randomUUID(), `${run}-race-2`),
  ]);
  assert.equal(concurrent.filter(result => result.id).length, 1, "one-capacity slot must accept exactly one concurrent booking");
  assert.equal(concurrent.filter(result => /SLOT_NOT_AVAILABLE/.test(result.error || "")).length, 1);

  const winningId = concurrent.find(result => result.id).id;
  const cancel = await b.from("reservas").update({ estado: "cancelada", atendida: null, mesa_id: null })
    .eq("id", winningId).eq("restaurante_id", B).select("id,estado").single();
  assert.ifError(cancel.error);
  assert.equal(cancel.data.estado, "cancelada");
  assert.deepEqual(await query(await a.from("reservas").select("id").eq("id", winningId)), []);
  assert.equal((await query(await agency.from("reservas").select("estado").eq("id", winningId).single())).estado, "cancelada");

  const earlyAttendance = await a.rpc("marcar_asistencia_reserva", { p_reserva_id: first.id, p_asistio: true });
  assert.match(earlyAttendance.error?.message || "", /RESERVA_AUN_NO_INICIADA/);
  const service = createClient(url.href, process.env.GH_LOCAL_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
  await query(await service.from("reservas").update({ inicio_at: past, fin_at: past, fecha_hora_reserva: past, mesa_id: null })
    .eq("id", first.id).eq("restaurante_id", A).select("id").single());
  const foreignAttendance = await b.rpc("marcar_asistencia_reserva", { p_reserva_id: first.id, p_asistio: true });
  assert.ok(foreignAttendance.error, "foreign restaurant must not mark attendance");
  const attendance = await query(await a.rpc("marcar_asistencia_reserva", { p_reserva_id: first.id, p_asistio: true }));
  assert.equal(attendance.atendida, true);
  assert.equal((await query(await a.from("reservas").select("atendida").eq("id", first.id).single())).atendida, true);
});
