// Real PostgreSQL, synthetic fixtures, independent backend connections.
// No DB URL is accepted. This script starts its OWN cluster with TCP disabled.
// Usage: node scripts/test-sql-concurrent.mjs <postgres-bin-directory> <pg-module-directory>
// Example module directory: /tmp/gastrohelp-tests/node_modules/pg
// --self-check validates fixture extraction only; it is NOT a concurrency test.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
function literal(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Fixture marker missing: ${marker}`);
  const valueStart = start + marker.length;
  const end = source.indexOf('`', valueStart);
  assert.notEqual(end, -1, 'Unterminated fixture literal');
  const result = source.slice(valueStart, end);
  assert.ok(!result.includes('${'), 'Fixture SQL must be a literal, not JavaScript');
  return result;
}
async function baseline(file, name) {
  const source = await read(`supabase/migrations/${file}`);
  const marker = `create or replace function public.${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Baseline function missing: ${name}`);
  const end = source.indexOf('$$;', start);
  assert.notEqual(end, -1, `Baseline function terminator missing: ${name}`);
  return source.slice(start, end + 3);
}
const capacitySchema = literal(await read('scripts/test-room-capacity.mjs'), 'await db.exec(`');
const qrSchema = literal(await read('scripts/test-qr-close-sql.mjs'), 'const schema = `');
const capacityReaders = await Promise.all([
  baseline('20260802161820_connect_booking_blocks_to_public_availability.sql', 'obtener_disponibilidad_reservas'),
  baseline('20260903203000_safe_manual_bookings_and_table_history.sql', 'obtener_disponibilidad_manual'),
  baseline('20260903204028_secure_chatbot_foundation.sql', 'obtener_disponibilidad_chatbot'),
]);
const settings = (await baseline('20260715224047_native_booking_settings.sql', 'guardar_configuracion_web_reservas'))
  .replace('function public.guardar_configuracion_web_reservas(', 'function app_private.guardar_configuracion_web_reservas(');
const capacitySql = await read('docs/sql/connect-room-capacity.sql');
const qrSql = await read('docs/sql/harden-qr-close.sql');
assert.match(capacitySql, /CAPACITY_BUSY/);
assert.match(qrSql, /cerrar_mesa_qr_validada/);
if (process.argv[2] === '--self-check') {
  console.log('PASS fixture extraction and baseline signatures. NO database/concurrency checks executed.');
  process.exit(0);
}
if (process.getuid?.() === 0) {
  console.error('BLOCKED: PostgreSQL cannot run as root. Run this harness as an already-authorized non-root user. No identity changes attempted.');
  process.exit(2);
}
assert.ok(process.argv[2] && process.argv[3], 'Supply local PostgreSQL bin and pg module directories');
const bin = path.resolve(process.argv[2]);
const pgModule = await import(pathToFileURL(path.join(path.resolve(process.argv[3]), 'lib/index.js')).href);
const { Client } = pgModule.default || pgModule;
const cluster = await mkdtemp(path.join(tmpdir(), 'gastrohelp-concurrency-'));
const data = path.join(cluster, 'data');
const clients = new Set();
let server;
let passed = 0;

async function command(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (part) => { output += part; });
    child.stderr.on('data', (part) => { output += part; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} failed (${code}): ${output}`)));
  });
}
async function connect(database = 'postgres') {
  // Fixed Unix socket in a fresh directory; ignores PGHOST, DATABASE_URL etc.
  const client = new Client({ host: cluster, port: 5432, database, user: 'gastrohelp_fixture',
    connectionTimeoutMillis: 3000, query_timeout: 7000, ssl: false });
  await client.connect();
  clients.add(client);
  await client.query("set statement_timeout='5s'; set lock_timeout='4s'");
  return client;
}
async function waitBlocked(observer, backendPid) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const { rows } = await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [backendPid]);
    if (rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail(`Backend ${backendPid} did not reach a verified lock wait`);
}
async function group(name, fixture, patch, body) {
  const admin = await connect();
  await admin.query(`create database ${name}`); // fixed internal names only
  const a = await connect(name), b = await connect(name), observer = await connect(name);
  await a.query(fixture);
  await a.query(patch);
  const aPid = (await a.query('select pg_backend_pid() pid')).rows[0].pid;
  const bPid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(aPid, bPid, 'Tests require independent PostgreSQL backends');
  async function check(label, operation) {
    try { await operation(); passed++; console.log(`PASS ${label}`); }
    finally { await a.query('rollback'); await b.query('rollback'); }
  }
  async function afterLock(operation, commit) {
    const pending = operation().then(value => ({ value }), error => ({ error }));
    await waitBlocked(observer, bPid);
    await commit();
    return pending;
  }
  await body({ a, b, observer, check, afterLock });
}

try {
  await command(path.join(bin, 'initdb'), ['-D', data, '--auth=trust', '--username=gastrohelp_fixture', '--locale=C', '--encoding=UTF8']);
  server = spawn(path.join(bin, 'postgres'), ['-D', data, '-c', "listen_addresses=", '-c', `unix_socket_directories=${cluster}`,
    '-c', 'unix_socket_permissions=0700', '-c', 'max_connections=15', '-c', 'shared_buffers=16MB'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '';
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`PostgreSQL startup timed out: ${log}`)), 10000);
    server.on('error', error => { clearTimeout(timer); reject(error); });
    server.on('exit', code => { clearTimeout(timer); reject(new Error(`PostgreSQL exited (${code}): ${log}`)); });
    server.stderr.on('data', chunk => {
      log += chunk;
      if (log.includes('database system is ready to accept connections')) { clearTimeout(timer); resolve(); }
    });
  });
  const admin = await connect();
  console.log((await admin.query('select version() version')).rows[0].version);
  // Roles are cluster-wide. This is a fresh, script-owned cluster, never a user's DB.
  await admin.query('create role anon; create role authenticated; create role service_role');
  const removeRoles = sql => sql.replace(/create role (anon|authenticated|service_role);/g, '');
  const R = '00000000-0000-4000-8000-000000000101';
  const Z = '00000000-0000-4000-8000-000000000201';
  const M = '00000000-0000-4000-8000-000000000301';
  await group('capacity_fixture', removeRoles(capacitySchema), `${capacityReaders.join('\n')}\n${settings}\n${capacitySql}`,
    async ({ a, b, check }) => {
      async function reset(linked = true) {
        await a.query(`truncate reservas, sala_mesas, sala_zonas, reservas_config;
          insert into reservas_config(restaurante_id,capacidad_vinculada_sala) values('${R}',${linked});
          insert into sala_zonas(id,restaurante_id) values('${Z}','${R}');
          insert into sala_mesas(id,restaurante_id,zona_id,capacidad) values('${M}','${R}','${Z}',8);`);
      }
      const reserve = (client, people) => client.query(`insert into reservas(restaurante_id,inicio_at,fin_at,fecha_hora_reserva,personas)
        values($1,'2030-01-01 12:00Z','2030-01-01 13:30Z','2030-01-01 13:00',$2)`, [R, people]);
      const block = client => client.query('update sala_mesas set bloqueada=true where id=$1', [M]);
      const enable = client => client.query('update reservas_config set capacidad_vinculada_sala=true where restaurante_id=$1', [R]);
      const count = async () => (await a.query('select count(*)::int count from reservas')).rows[0].count;
      await check('capacity: booking vs booking rejects busy, then stale quota', async () => {
        await reset(); await a.query('begin'); await reserve(a, 6);
        await assert.rejects(reserve(b, 6), error => error.code === '55P03' && /CAPACITY_BUSY/.test(error.message));
        await a.query('commit'); await assert.rejects(reserve(b, 6), /SLOT_NOT_AVAILABLE/); assert.equal(await count(), 1);
      });
      await check('capacity: block first prevents stale booking', async () => {
        await reset(); await a.query('begin'); await block(a);
        await assert.rejects(reserve(b, 6), /CAPACITY_BUSY/); await a.query('commit');
        await assert.rejects(reserve(b, 6), /SLOT_NOT_AVAILABLE/); assert.equal(await count(), 0);
      });
      await check('capacity: accepted booking survives subsequent physical block', async () => {
        await reset(); await a.query('begin'); await reserve(a, 6);
        await assert.rejects(block(b), /CAPACITY_BUSY/); await a.query('commit'); await block(b);
        assert.equal(await count(), 1); await assert.rejects(reserve(b, 1), /SLOT_NOT_AVAILABLE/);
      });
      await check('capacity: opt-out booking serializes with enabling room limit', async () => {
        await reset(false); await a.query('begin'); await reserve(a, 10);
        await assert.rejects(enable(b), /CAPACITY_BUSY/); await a.query('commit'); await enable(b);
        assert.equal(await count(), 1); await assert.rejects(reserve(b, 1), /SLOT_NOT_AVAILABLE/);
      });
      await check('capacity: enabling first rejects new over-capacity demand', async () => {
        await reset(false); await a.query('begin'); await enable(a);
        await assert.rejects(reserve(b, 10), /CAPACITY_BUSY/); await a.query('commit');
        await assert.rejects(reserve(b, 10), /SLOT_NOT_AVAILABLE/); assert.equal(await count(), 0);
      });
    });

  await group('qr_fixture', removeRoles(qrSchema), qrSql, async ({ a, b, check, afterLock }) => {
    const U = '10000000-0000-4000-8000-000000000001', R = '20000000-0000-4000-8000-000000000001';
    const M = '30000000-0000-4000-8000-000000000001', S = '40000000-0000-4000-8000-000000000001';
    const P = '50000000-0000-4000-8000-000000000001';
    await a.query(`create trigger pedidos_qr_enforce_session_limits before insert on pedidos_qr
      for each row execute function public.enforce_pedido_qr_session_limits()`);
    for (const client of [a, b]) await client.query(`select set_config('test.user',$1,false),set_config('test.restaurant',$2,false),set_config('test.demo','no',false)`, [U, R]);
    async function reset() {
      await a.query(`truncate cierres_mesa_qr,pedido_qr_items,pedidos_qr,sala_mesas,restaurante_modulos cascade;
        insert into restaurante_modulos values('${R}',true,'activo');
        insert into sala_mesas(id,restaurante_id,nombre,qr_session_id,qr_access_token) values('${M}','${R}','Fixture','${S}',repeat('01',24));
        insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total,estado,created_at)
          values('${P}','${R}','${M}','${S}',10,'nuevo',now()-interval '2 minutes');
        insert into pedido_qr_items(pedido_id,nombre_producto,precio_unitario,cantidad) values('${P}','Fixture',10,1);`);
    }
    const close = client => client.query(`select public.cerrar_mesa_qr_validada($1::uuid,$2::uuid[],$3::uuid,10,0,0,'tarjeta','fixture') result`, [M, [P], S]);
    // Insert header and matching line in one statement/transaction. A competing
    // close must see a complete order, not fail only because a fixture lacks items.
    const insert = client => client.query(`with inserted as (
      insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total)
      values(gen_random_uuid(),$1,$2,$3,2) returning id
    ) insert into pedido_qr_items(pedido_id,nombre_producto,precio_unitario,cantidad)
      select id,'Concurrent fixture',2,1 from inserted`, [R, M, S]);
    const receipts = async () => (await a.query('select count(*)::int count from cierres_mesa_qr')).rows[0].count;
    await check('QR: inserted order invalidates a waiting stale quote', async () => {
      await reset(); await a.query('begin'); await insert(a);
      const result = await afterLock(() => close(b), () => a.query('commit'));
      assert.match(result.error?.message || '', /PEDIDOS_CAMBIADOS_ACTUALIZA|IMPORTE_CAMBIADO_ACTUALIZA/); assert.equal(await receipts(), 0);
    });
    await check('QR: close rejects an insertion waiting with the old session', async () => {
      await reset(); await a.query('begin'); await close(a);
      const result = await afterLock(() => insert(b), () => a.query('commit'));
      assert.match(result.error?.message || '', /SESION_MESA_NO_VALIDA/); assert.equal(await receipts(), 1);
    });
    await check('QR: simultaneous close writes one receipt', async () => {
      await reset(); await a.query('begin'); await close(a);
      const result = await afterLock(() => close(b), () => a.query('commit'));
      assert.match(result.error?.message || '', /SESION_MESA_CAMBIADA/); assert.equal(await receipts(), 1);
    });
    await check('QR: cancellation before a waiting close invalidates the quote', async () => {
      await reset(); await a.query('begin'); await a.query("update pedidos_qr set estado='cancelado' where id=$1", [P]);
      const result = await afterLock(() => close(b), () => a.query('commit'));
      assert.match(result.error?.message || '', /PEDIDOS_CAMBIADOS_ACTUALIZA|IMPORTE_CAMBIADO_ACTUALIZA/); assert.equal(await receipts(), 0);
    });
    await check('QR: paid orders cannot be changed by a waiting kitchen update', async () => {
      await reset(); await a.query('begin'); await close(a);
      const result = await afterLock(() => b.query("update pedidos_qr set estado='preparando' where id=$1 and estado not in ('cobrado','cerrado','cancelado')", [P]), () => a.query('commit'));
      assert.equal(result.error, undefined); assert.equal(result.value.rowCount, 0); assert.equal(await receipts(), 1);
    });
    await check('QR: module deactivation first blocks payment recording', async () => {
      await reset(); await a.query('begin'); await a.query('update restaurante_modulos set camarero_digital=false where restaurante_id=$1', [R]);
      const result = await afterLock(() => close(b), () => a.query('commit'));
      assert.match(result.error?.message || '', /CAMARERO_DIGITAL_NO_ACTIVO/); assert.equal(await receipts(), 0);
    });
    await check('QR: close holds active-module lock until its receipt commits', async () => {
      await reset(); await a.query('begin'); await close(a);
      const result = await afterLock(() => b.query('update restaurante_modulos set camarero_digital=false where restaurante_id=$1', [R]), () => a.query('commit'));
      assert.equal(result.error, undefined); assert.equal(await receipts(), 1);
    });
  });
  console.log(`${passed} REAL two-connection race checks passed. Reduced synthetic schemas only; not a production-schema or browser E2E test.`);
} finally {
  await Promise.allSettled([...clients].map(client => client.end()));
  if (server && server.exitCode === null) {
    server.kill('SIGINT');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(); else server.once('exit', resolve); });
  }
  // Retain only this fresh local fixture directory for diagnostics; no broad deletion.
  console.log(`Local fixture cluster stopped; retained at ${cluster}`);
}
