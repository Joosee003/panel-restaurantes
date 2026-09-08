// Isolated in-memory PostgreSQL tests. Never connects to Supabase or a DB URL.
// GASTROHELP_SQL_TEST_ROOT points to a directory with @electric-sql/pglite.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { PGlite } = require(require.resolve("@electric-sql/pglite", {
  paths: [process.env.GASTROHELP_SQL_TEST_ROOT || process.cwd()],
}));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = new PGlite();
const RID = "00000000-0000-4000-8000-000000000101";
const RID2 = "00000000-0000-4000-8000-000000000102";
const ZONE = "00000000-0000-4000-8000-000000000201";
const TABLE = "00000000-0000-4000-8000-000000000301";
const BOOKING = "00000000-0000-4000-8000-000000000401";
const DAY = "((now() at time zone 'Europe/Madrid')::date + 1)";
const START = `(${DAY} + time '12:00') at time zone 'Europe/Madrid'`;

async function readFunction(filename, name, schema = "public") {
  const source = await readFile(path.join(root, "supabase/migrations", filename), "utf8");
  const start = source.indexOf(`create or replace function ${schema}.${name}(`);
  assert.notEqual(start, -1, `Missing baseline function ${name}`);
  const end = source.indexOf("$$;", start);
  assert.notEqual(end, -1);
  return source.slice(start, end + 3);
}

await db.exec(`
  create schema app_private;
  create role anon;
  create role authenticated;
  create role service_role;
  create function public.user_can_access_restaurant(uuid) returns boolean
    language sql as 'select true'; -- Authentication is not under test here.
  create table public.reservas_config (
    restaurante_id uuid primary key, activo boolean default true,
    zona_horaria text default 'Europe/Madrid', intervalo_minutos integer default 30,
    duracion_minutos integer default 90, capacidad_por_turno integer default 20,
    personas_minimas integer default 1, personas_maximas integer default 30,
    antelacion_minutos integer default 0, dias_maximos_antelacion integer default 365
  );
  create table public.sala_zonas (
    id uuid primary key, restaurante_id uuid not null, activa boolean default true
  );
  create table public.sala_mesas (
    id uuid primary key default gen_random_uuid(), restaurante_id uuid not null,
    zona_id uuid, capacidad integer not null, activa boolean default true,
    bloqueada boolean default false
  );
  create table public.restaurante_webs (
    restaurante_id uuid, slug text, publicada boolean default true
  );
  create table public.reservas_horarios (
    restaurante_id uuid, dia_semana integer, turno text, hora_inicio time,
    hora_fin time, capacidad_override integer, activo boolean default true
  );
  create table public.reservas_excepciones (
    restaurante_id uuid, fecha date, tipo text, turno text, hora_inicio time,
    hora_fin time, capacidad_override integer, updated_at timestamptz default now()
  );
  create table public.bloqueos_reservas (
    restaurante_id uuid, fecha date, hora_inicio time, hora_fin time, activo boolean default true
  );
  create table public.reservas (
    id uuid primary key default gen_random_uuid(), restaurante_id uuid,
    inicio_at timestamptz, fin_at timestamptz, fecha_hora_reserva timestamp,
    estado text default 'confirmada', personas integer default 1
  );
`);

for (const [filename, name] of [
  ["20260802161820_connect_booking_blocks_to_public_availability.sql", "obtener_disponibilidad_reservas"],
  ["20260903203000_safe_manual_bookings_and_table_history.sql", "obtener_disponibilidad_manual"],
  ["20260903204028_secure_chatbot_foundation.sql", "obtener_disponibilidad_chatbot"],
]) await db.exec(await readFunction(filename, name));

// Use the actual legacy RPC definition, moved as in production. This fixture
// does not execute unrelated website/legal writes; it verifies the patch target.
await db.exec((await readFunction(
  "20260715224047_native_booking_settings.sql", "guardar_configuracion_web_reservas",
)).replace("function public.guardar_configuracion_web_reservas(",
  "function app_private.guardar_configuracion_web_reservas("));

const patch = await readFile(path.join(root, "docs/sql/connect-room-capacity.sql"), "utf8");
await db.exec(patch);

async function reset({ linked = true, quota = 20 } = {}) {
  await db.exec(`
    truncate public.reservas, public.sala_mesas, public.sala_zonas,
      public.reservas_config, public.restaurante_webs, public.reservas_horarios,
      public.reservas_excepciones, public.bloqueos_reservas;
    insert into public.reservas_config(restaurante_id, capacidad_vinculada_sala, capacidad_por_turno)
      values ('${RID}', ${linked}, ${quota}), ('${RID2}', true, 100);
    insert into public.restaurante_webs(restaurante_id, slug) values ('${RID}', 'fixture');
    insert into public.sala_zonas(id,restaurante_id) values ('${ZONE}', '${RID}');
    insert into public.sala_mesas(id,restaurante_id,zona_id,capacidad)
      values ('${TABLE}', '${RID}', '${ZONE}', 8),
        ('00000000-0000-4000-8000-000000000302', '${RID}', '${ZONE}', 4);
    insert into public.reservas_horarios(restaurante_id,dia_semana,turno,hora_inicio,hora_fin)
      select '${RID}', day, 'comida', '12:00', '16:00' from generate_series(0,6) day;
  `);
}

async function capacities(personas = 1) {
  const values = [];
  for (const call of [
    `public.obtener_disponibilidad_reservas('fixture',${DAY},${personas},null)`,
    `public.obtener_disponibilidad_manual('${RID}',${DAY},${personas})`,
    `public.obtener_disponibilidad_chatbot('${RID}',${DAY},${personas},null)`,
  ]) {
    const { rows } = await db.query(`select capacidad_disponible from ${call} where hora_local='12:00'`);
    values.push(rows[0]?.capacidad_disponible ?? 0);
  }
  return values;
}

async function reserve(personas, extra = "", id = BOOKING) {
  return db.exec(`insert into public.reservas(id,restaurante_id,inicio_at,fin_at,fecha_hora_reserva,personas${extra ? ",estado" : ""})
    values ('${id}','${RID}',${START},(${START})+interval '90 minutes',${DAY}+time '12:00',${personas}${extra ? `,'${extra}'` : ""})`);
}

let passed = 0;
async function check(name, test) {
  await test();
  passed += 1;
  console.log(`PASS ${name}`);
}

try {
  await check("opt-out preserves configured capacity, including blocked tables", async () => {
    await reset({ linked: false });
    await db.exec("update public.sala_mesas set bloqueada=true");
    assert.deepEqual(await capacities(), [20, 20, 20]);
    await reserve(20);
  });
  await check("all three channels apply physical ceiling", async () => {
    await reset();
    assert.deepEqual(await capacities(), [12, 12, 12]);
  });
  await check("configured lower quota is not increased", async () => {
    await reset({ quota: 6 });
    assert.deepEqual(await capacities(), [6, 6, 6]);
  });
  await check("blocked table lowers physical ceiling and unblock restores it", async () => {
    await reset();
    await db.exec(`update public.sala_mesas set bloqueada=true where id='${TABLE}'`);
    assert.deepEqual(await capacities(), [4, 4, 4]);
    assert.deepEqual(await capacities(5), [0, 0, 0]);
    await db.exec(`update public.sala_mesas set bloqueada=false where id='${TABLE}'`);
    assert.deepEqual(await capacities(), [12, 12, 12]);
  });
  await check("inactive zones and tables contribute no seats", async () => {
    await reset();
    await db.exec(`update public.sala_zonas set activa=false where id='${ZONE}'`);
    assert.deepEqual(await capacities(), [0, 0, 0]);
    await db.exec(`update public.sala_zonas set activa=true where id='${ZONE}'; update public.sala_mesas set activa=false;`);
    assert.deepEqual(await capacities(), [0, 0, 0]);
  });
  await check("empty inventory, missing zones and cross-restaurant tables fail closed", async () => {
    await reset();
    await db.exec(`delete from public.sala_mesas;
      insert into public.sala_mesas(restaurante_id,zona_id,capacidad)
      values ('${RID}',null,100),('${RID2}','${ZONE}',100);`);
    assert.deepEqual(await capacities(), [0, 0, 0]);
  });
  await check("schedule and date-exception quotas remain bounded", async () => {
    await reset();
    await db.exec("update public.reservas_horarios set capacidad_override=3");
    assert.deepEqual(await capacities(), [3, 3, 3]);
    await db.exec(`insert into public.reservas_excepciones(restaurante_id,fecha,tipo,capacidad_override)
      values ('${RID}',${DAY},'capacidad',100)`);
    assert.deepEqual(await capacities(), [12, 12, 12]);
  });
  await check("existing reservations subtract once; cancellation frees seats", async () => {
    await reset();
    await reserve(5);
    assert.deepEqual(await capacities(), [7, 7, 7]);
    await db.exec(`update public.reservas set estado='cancelada' where id='${BOOKING}'`);
    assert.deepEqual(await capacities(), [12, 12, 12]);
  });
  await check("final insert guard rejects stale availability after a block", async () => {
    await reset();
    assert.deepEqual(await capacities(10), [12, 12, 12]);
    await db.exec(`update public.sala_mesas set bloqueada=true where id='${TABLE}'`);
    await assert.rejects(reserve(10), /SLOT_NOT_AVAILABLE/);
    await reserve(4);
    assert.deepEqual(await capacities(), [0, 0, 0]);
  });
  await check("party increase and reactivation recheck available physical seats", async () => {
    await reset();
    await reserve(5);
    await db.exec(`update public.sala_mesas set bloqueada=true where id='${TABLE}'`);
    await assert.rejects(db.exec(`update public.reservas set personas=6 where id='${BOOKING}'`), /SLOT_NOT_AVAILABLE/);
    await db.exec(`update public.reservas set estado='cancelada' where id='${BOOKING}'`);
    await assert.rejects(db.exec(`update public.reservas set estado='confirmada' where id='${BOOKING}'`), /SLOT_NOT_AVAILABLE/);
  });
  await check("existing over-capacity reservations are retained and arrival is allowed", async () => {
    await reset();
    await reserve(10);
    await db.exec(`update public.sala_mesas set bloqueada=true;
      update public.reservas set estado='ha venido' where id='${BOOKING}'`);
    assert.deepEqual(await capacities(), [0, 0, 0]);
    const { rows } = await db.query(`select estado,personas from public.reservas where id='${BOOKING}'`);
    assert.equal(rows[0].estado, "ha venido");
    assert.equal(rows[0].personas, 10);
  });
  await check("changing booking time checks overlap; adjacent intervals do not overlap", async () => {
    await reset();
    await reserve(8);
    await db.exec(`insert into public.reservas(id,restaurante_id,inicio_at,fin_at,fecha_hora_reserva,personas)
      values ('00000000-0000-4000-8000-000000000402','${RID}',(${START})+interval '90 minutes',
      (${START})+interval '180 minutes',${DAY}+time '13:30',8)`);
    await assert.rejects(db.exec(`update public.reservas set inicio_at=(${START})+interval '60 minutes',
      fin_at=(${START})+interval '150 minutes',fecha_hora_reserva=${DAY}+time '13:00'
      where id='00000000-0000-4000-8000-000000000402'`), /SLOT_NOT_AVAILABLE/);
  });
  await check("reschedule availability excludes its own reservation without double counting", async () => {
    await reset();
    await reserve(8);
    for (const call of [
      `public.obtener_disponibilidad_reservas('fixture',${DAY},8,'${BOOKING}')`,
      `public.obtener_disponibilidad_chatbot('${RID}',${DAY},8,'${BOOKING}')`,
    ]) {
      const { rows } = await db.query(`select capacidad_disponible from ${call} where hora_local='12:00'`);
      assert.equal(rows[0].capacidad_disponible, 12);
    }
    await db.exec(`update public.reservas set inicio_at=(${START})+interval '30 minutes',
      fin_at=(${START})+interval '120 minutes',fecha_hora_reserva=${DAY}+time '12:30'
      where id='${BOOKING}'`);
    const { rows } = await db.query("select count(*)::integer as count from public.reservas");
    assert.equal(rows[0].count, 1);
  });
  await check("multi-row insert cannot overfill physical seats", async () => {
    await reset();
    await assert.rejects(db.exec(`insert into public.reservas(restaurante_id,inicio_at,fin_at,fecha_hora_reserva,personas)
      select '${RID}',${START},(${START})+interval '90 minutes',${DAY}+time '12:00',8
      from generate_series(1,2)`), /SLOT_NOT_AVAILABLE/);
    const { rows } = await db.query("select count(*)::integer as count from public.reservas");
    assert.equal(rows[0].count, 0);
  });
  await check("private helpers are not callable as API roles", async () => {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await db.query(`select has_function_privilege('${role}',
        'app_private.limitar_capacidad_por_sala(uuid,integer)','EXECUTE') as allowed`);
      assert.equal(rows[0].allowed, false);
    }
  });
  await check("settings patch preserves existing mode for omitted JSON keys", async () => {
    const { rows } = await db.query(`select pg_get_functiondef(
      'app_private.guardar_configuracion_web_reservas(uuid,jsonb,jsonb,jsonb)'::regprocedure) as body`);
    assert.match(rows[0].body, /capacidad_vinculada_sala = coalesce\(\(p_config ->> 'capacidad_vinculada_sala'\)::boolean, capacidad_vinculada_sala\)/);
  });
  await check("draft can be reapplied without duplicating reader changes", async () => {
    await db.exec(patch);
    await reset();
    assert.deepEqual(await capacities(), [12, 12, 12]);
  });
  console.log(`${passed} room-capacity checks passed. Multi-session lock contention is NOT covered by PGlite.`);
} finally {
  await db.close();
}
