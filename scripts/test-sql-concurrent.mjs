// Real PostgreSQL, synthetic fixtures, independent backend connections.
// No DB URL is accepted. This script starts its OWN cluster with TCP disabled.
// Usage: node scripts/test-sql-concurrent.mjs <postgres-bin-directory> <pg-module-directory>
// Example module directory: /tmp/gastrohelp-tests/node_modules/pg
// --self-check validates fixture extraction only; it is NOT a concurrency test.
// --fixture-check <pglite-module-file> checks assembled SQL/entry points only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFile(path.join(root, file), 'utf8');
function literal(source, marker, fixtureIds = {}) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Fixture marker missing: ${marker}`);
  const valueStart = start + marker.length;
  const end = source.indexOf('`', valueStart);
  assert.notEqual(end, -1, 'Unterminated fixture literal');
  const result = source.slice(valueStart, end).replace(/\$\{ids\.([a-z]+)\}/g, (_, key) => {
    assert.match(fixtureIds[key] || '', /^[a-f0-9-]{36}$/, `Unknown synthetic fixture ID: ${key}`);
    return fixtureIds[key];
  });
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
const linkedSource = await read('scripts/test-qr-reservation-sql.mjs');
// Reuse its declared synthetic IDs and SQL templates without evaluating JavaScript.
const idsDeclaration = linkedSource.match(/const ids=\{([^;]+)\};/);
assert.ok(idsDeclaration, 'Linked fixture IDs declaration is missing');
const linkedIds = Object.fromEntries([...idsDeclaration[1].matchAll(/([a-z]+):'([a-f0-9-]{36})'/g)]
  .map(([, key, value]) => [key, value]));
assert.equal(Object.keys(linkedIds).length, 8, 'Linked fixture IDs changed; review the harness');
const linkedSchema = literal(linkedSource, 'const schema=`', linkedIds);
const linkedSeed = literal(linkedSource, 'await db.exec(`', linkedIds)
  .replace('insert into restaurante_modulos values',
    'insert into restaurante_modulos(restaurante_id,camarero_digital,estado,reservas,clientes,fidelizacion) values');
const profitIds = {
  product: '90000000-0000-4000-8000-000000000001',
  unmappedProduct: '90000000-0000-4000-8000-000000000002',
  dish: 'a0000000-0000-4000-8000-000000000001',
  ingredient: 'b0000000-0000-4000-8000-000000000001',
  item: 'c0000000-0000-4000-8000-000000000001',
  unmappedItem: 'c0000000-0000-4000-8000-000000000002',
};
// Keep capture disabled in the original 22 cases. The four added cases opt in
// through the authenticated RPC and use explicit product/recipe identities.
const profitSchema = `
  alter table restaurante_modulos add column rentabilidad boolean not null default false;
  alter table pedido_qr_items add column menu_id uuid;
  create table carta_productos(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text not null,precio numeric);
  create table platos(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text not null,precio_venta numeric,activo boolean not null default true);
  create table ingredientes(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text,coste_compra numeric,cantidad_compra numeric,merma_pct numeric,
    activo boolean not null default true);
  create table plato_ingredientes(id uuid primary key default gen_random_uuid(),
    plato_id uuid not null references platos on delete cascade,
    ingrediente_id uuid references ingredientes,cantidad_usada numeric);
`;
const profitSeed = `
  reset role;
  update restaurante_modulos set rentabilidad=true where restaurante_id='${linkedIds.restaurant}';
  insert into carta_productos(id,restaurante_id,nombre,precio) values
    ('${profitIds.product}','${linkedIds.restaurant}','Mapped catalogue product',99),
    ('${profitIds.unmappedProduct}','${linkedIds.restaurant}','Unmapped catalogue product',88);
  insert into platos(id,restaurante_id,nombre,precio_venta,activo)
    values('${profitIds.dish}','${linkedIds.restaurant}','Mapped recipe',50,true);
  insert into ingredientes(id,restaurante_id,nombre,coste_compra,cantidad_compra,merma_pct,activo)
    values('${profitIds.ingredient}','${linkedIds.restaurant}','Fixture ingredient',8,2,20,true);
  insert into plato_ingredientes(plato_id,ingrediente_id,cantidad_usada)
    values('${profitIds.dish}','${profitIds.ingredient}',0.4);
  delete from pedido_qr_items where pedido_id='${linkedIds.order}';
  insert into pedido_qr_items(id,pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) values
    ('${profitIds.item}','${linkedIds.order}','${profitIds.product}','Fixture item',20.15,1),
    ('${profitIds.unmappedItem}','${linkedIds.order}','${profitIds.unmappedProduct}',
      'Unmapped order item',20.15,1);
  set role authenticated;
  select public.vincular_producto_qr_plato('${profitIds.product}','${profitIds.dish}');
  select public.configurar_rentabilidad_qr('${linkedIds.restaurant}',true);
`;
const capacityReaders = await Promise.all([
  baseline('20260802161820_connect_booking_blocks_to_public_availability.sql', 'obtener_disponibilidad_reservas'),
  baseline('20260903203000_safe_manual_bookings_and_table_history.sql', 'obtener_disponibilidad_manual'),
  baseline('20260903204028_secure_chatbot_foundation.sql', 'obtener_disponibilidad_chatbot'),
]);
const settings = (await baseline('20260715224047_native_booking_settings.sql', 'guardar_configuracion_web_reservas'))
  .replace('function public.guardar_configuracion_web_reservas(', 'function app_private.guardar_configuracion_web_reservas(');
const capacitySql = await read('docs/sql/connect-room-capacity.sql');
const qrSql = await read('docs/sql/harden-qr-close.sql');
const linkedSql = await read('docs/sql/connect-qr-reservation.sql');
const profitSql = await read('docs/sql/connect-qr-profitability.sql');
const historySql = await read('supabase/migrations/20260906143000_guard_loyalty_history_trigger.sql');
const manualSql = await read('supabase/migrations/20260906142000_guard_loyalty_points_when_module_disabled.sql');
const manualAlignmentSql = await read('docs/sql/align-manual-consumption-points.sql');
const manualPublicWrapper = (await read('supabase/migrations/20260903180000_block_demo_privileged_mutations.sql'))
  .match(/create function public\.registrar_consumo_reserva\([\s\S]*?\$\$;/)?.[0];
assert.ok(manualPublicWrapper, 'Manual public wrapper is missing');
// Exact private wrapper body inspected with pg_get_functiondef on 2026-09-08.
// It predates the checked-in migrations; the fixture reproduces its access guard.
const manualPrivateWrapper = `
create or replace function app_private.registrar_consumo_reserva(
  p_reserva_id uuid,p_restaurante_id uuid,p_gasto numeric,
  p_metodo_pago text default 'no_indicado'::text,p_notas text default null::text
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
begin
  if not public.user_can_access_restaurant(p_restaurante_id) then
    raise exception 'ACCESS_DENIED';
  end if;
  return public.registrar_consumo_reserva_interno(
    p_reserva_id,p_restaurante_id,p_gasto,p_metodo_pago,p_notas
  );
end;
$function$;
revoke all on function app_private.registrar_consumo_reserva(uuid,uuid,numeric,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.registrar_consumo_reserva_interno(uuid,uuid,numeric,text,text)
  from public,anon,authenticated,service_role;
`;
const linkedPatch = `${qrSql}\n${historySql}
create trigger trg_historial_gasto_a_puntos after insert on clientes_historial
  for each row execute function public.trg_clientes_historial_gasto_a_puntos();
${manualSql}\n${manualAlignmentSql}\n${manualPrivateWrapper}\n${manualPublicWrapper}
revoke all on function public.registrar_consumo_reserva(uuid,uuid,numeric,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.registrar_consumo_reserva(uuid,uuid,numeric,text,text)
  to authenticated,service_role;
${linkedSql}\n${profitSql}`;
assert.match(capacitySql, /CAPACITY_BUSY/);
assert.match(qrSql, /cerrar_mesa_qr_validada/);
assert.match(linkedSql, /QR_CIERRE_EN_CURSO/);
assert.match(linkedSchema, /trg_actualizar_visitas_cliente/);
assert.match(linkedSeed, /truncate app_private\.qr_cierre_operaciones/);
assert.match(profitSql, /qr_profitability_capture/);
function assertProfitRows(rows, closeId) {
  assert.equal(rows.length, 2, 'One immutable sale per original order item');
  for (const row of rows) {
    assert.equal(row.restaurante_id, linkedIds.restaurant);
    assert.equal(row.cierre_id, closeId);
    assert.equal(row.pedido_id, linkedIds.order);
    assert.equal(row.menu_id, null);
    assert.equal(row.cantidad, 1);
    assert.equal(Number(row.precio_unitario), 20.15, 'Use the ordered price, not current catalogue price');
    assert.equal(Number(row.ingreso_bruto), 20.15);
    assert.equal(Number(row.descuento), 2.5);
    assert.equal(Number(row.ingreso_total), 17.65, 'Allocated net income excludes the tip');
    assert.ok(row.fecha);
    assert.ok(Number.isFinite(new Date(row.creado_en).getTime()));
  }
  assert.equal(rows[0].id, profitIds.item);
  assert.equal(rows[0].producto_id, profitIds.product);
  assert.equal(rows[0].plato_id, profitIds.dish);
  assert.equal(rows[0].nombre_producto, 'Fixture item');
  assert.equal(rows[0].estado_coste, 'calculado');
  assert.equal(Number(rows[0].coste_unitario), 2);
  assert.equal(Number(rows[0].coste_total), 2);
  assert.equal(Number(rows[0].beneficio_total), 15.65);
  assert.equal(rows[1].id, profitIds.unmappedItem);
  assert.equal(rows[1].producto_id, profitIds.unmappedProduct);
  assert.equal(rows[1].plato_id, null);
  assert.equal(rows[1].nombre_producto, 'Unmapped order item');
  assert.equal(rows[1].estado_coste, 'sin_vinculo');
  assert.equal(rows[1].coste_unitario, null);
  assert.equal(rows[1].coste_total, null);
  assert.equal(rows[1].beneficio_total, null);
}
if (process.argv[2] === '--self-check') {
  console.log('PASS fixture extraction and baseline signatures. NO database/concurrency checks executed.');
  process.exit(0);
}
if (process.argv[2] === '--fixture-check') {
  assert.ok(process.argv[3], 'Supply the local PGlite module file');
  const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[3])).href);
  const fixture = new PGlite();
  try {
    // This single backend validates only assembly/grants and fixture entry points.
    await fixture.exec('create role service_role');
    await fixture.exec(linkedSchema);
    await fixture.exec(profitSchema);
    await fixture.exec(linkedPatch);
    await fixture.exec(linkedSeed);
    await fixture.exec('set role authenticated');
    const params = [linkedIds.operation, linkedIds.mesa, [linkedIds.order], linkedIds.session, linkedIds.reservation];
    const query = `select public.cerrar_mesa_qr_con_reserva($1,$2,$3,$4,40.30,5,2,'mixto','fixture',$5) result`;
    const first = (await fixture.query(query, params)).rows[0].result;
    assert.equal(first.ok, true); assert.equal(first.puntos_generados, 70);
    assert.equal((await fixture.query(query, params)).rows[0].result.replayed, true);
    const manual = (await fixture.query(`select public.registrar_consumo_reserva($1,$2,20,'efectivo','fixture') result`,
      [linkedIds.reservation, linkedIds.restaurant])).rows[0].result;
    assert.equal(manual.ok, false); assert.equal(manual.error, 'CONSUMO_YA_REGISTRADO');
    await fixture.exec(linkedSeed);
    await fixture.exec('set role authenticated');
    const manualFirst = (await fixture.query(`select public.registrar_consumo_reserva($1,$2,20,'efectivo','fixture') result`,
      [linkedIds.reservation, linkedIds.restaurant])).rows[0].result;
    assert.equal(manualFirst.ok, true); assert.equal(manualFirst.puntos_generados, 40);
    await assert.rejects(fixture.query(query, params), /CONSUMO_PREVIO_REQUIERE_REVISION/);
    await fixture.exec(linkedSeed);
    await fixture.exec(profitSeed);
    const profitClose = (await fixture.query(query, params)).rows[0].result;
    assert.equal(profitClose.ok, true);
    const profitRows = (await fixture.query('select * from ventas_qr order by id')).rows;
    assertProfitRows(profitRows, profitClose.cierre_id);
    assert.equal((await fixture.query(query, params)).rows[0].result.replayed, true);
    assert.deepEqual((await fixture.query('select * from ventas_qr order by id')).rows, profitRows);
    console.log('PASS assembled linked/profitability SQL fixture, authenticated entry points, snapshots and replay. NO concurrency checks executed.');
  } finally { await fixture.close(); }
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

function bounded(promise, ms, description) {
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${description} timed out (${ms}ms)`)), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}
async function command(executable, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(executable)} timed out (20000ms)`));
    }, 20000);
    let output = '';
    child.stdout.on('data', (part) => { output += part; });
    child.stderr.on('data', (part) => { output += part; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} failed (${code}): ${output}`));
    });
  });
}
async function connect(database = 'postgres') {
  // Fixed Unix socket in a fresh directory; ignores PGHOST, DATABASE_URL etc.
  const client = new Client({ host: cluster, port: 5432, database, user: 'gastrohelp_fixture',
    connectionTimeoutMillis: 3000, query_timeout: 7000, ssl: false });
  await client.connect();
  clients.add(client);
  client.on('error', error => { console.error(`Fixture connection error: ${error.message}`); });
  await client.query("set statement_timeout='5s'; set lock_timeout='4s'");
  return client;
}
async function waitBlocked(observer, backendPid, blockingPid, settled) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const { rows } = await observer.query(`select wait_event_type, pg_blocking_pids(pid) blockers
      from pg_stat_activity where pid=$1`, [backendPid]);
    if (rows[0]?.wait_event_type === 'Lock' && rows[0].blockers.includes(blockingPid)) return;
    if (settled()) assert.fail(`Backend ${backendPid} finished before a lock held by ${blockingPid} was observed`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail(`Backend ${backendPid} did not reach a verified lock wait on backend ${blockingPid}`);
}
async function group(name, fixture, patch, body) {
  const admin = await connect();
  await admin.query(`create database ${name}`); // fixed internal names only
  const a = await connect(name), b = await connect(name), observer = await connect(name);
  await a.query(fixture);
  await a.query(patch);
  const aPid = (await a.query('select pg_backend_pid() pid')).rows[0].pid;
  const bPid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
  const observerPid = (await observer.query('select pg_backend_pid() pid')).rows[0].pid;
  assert.notEqual(aPid, bPid, 'Tests require independent PostgreSQL backends');
  assert.equal(new Set([aPid, bPid, observerPid]).size, 3, 'Observer needs its own backend');
  console.log(`BACKENDS ${name}: writer A=${aPid}, writer B=${bPid}, observer=${observerPid}`);
  async function check(label, operation) {
    try { await operation(); passed++; console.log(`PASS ${label}`); }
    finally { await Promise.all([a.query('rollback'), b.query('rollback')]); }
  }
  async function afterLock(operation, release) {
    let settled = false;
    const pending = operation().then(value => ({ value }), error => ({ error }))
      .finally(() => { settled = true; });
    try {
      await waitBlocked(observer, bPid, aPid, () => settled);
      await release();
      return await pending;
    } finally {
      // Failure to observe a wait must release A before draining B. Otherwise
      // queued rollbacks/client.end can themselves wait behind the blocked query.
      await a.query('rollback');
      await pending;
    }
  }
  try { await body({ a, b, observer, aPid, bPid, check, afterLock }); }
  finally {
    await Promise.all([admin, a, b, observer].map(async client => {
      await bounded(client.end(), 3000, `Closing ${name} connection`);
      clients.delete(client);
    }));
  }
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

  await group('linked_qr_fixture', `${removeRoles(linkedSchema)}\n${profitSchema}`, linkedPatch,
    async ({ a, b, observer, aPid, check, afterLock }) => {
      const ids = linkedIds;
      const otherOperation = '80000000-0000-4000-8000-000000000002';
      for (const client of [a, b]) {
        await client.query(`select set_config('test.user',$1,false),set_config('test.restaurant',$2,false),
          set_config('test.demo','no',false)`, [ids.user, ids.restaurant]);
        await client.query('set role authenticated');
      }
      async function reset() {
        await a.query(linkedSeed);
        await a.query('set role authenticated');
      }
      async function resetProfit() {
        await reset();
        await a.query(profitSeed);
      }
      const configureProfit = (client, active) => client.query(
        'select public.configurar_rentabilidad_qr($1::uuid,$2::boolean)', [ids.restaurant, active]);
      const profitRows = async () => (await observer.query(
        'select to_jsonb(v) sale from public.ventas_qr v order by id')).rows.map(row => row.sale);
      const profitActive = async () => (await observer.query(
        'select activa from public.qr_rentabilidad_config where restaurante_id=$1', [ids.restaurant])).rows[0].activa;
      const close = async (client, options = {}) => {
        const p = { operation: ids.operation, tip: '2', ...options };
        const { rows } = await client.query(`select public.cerrar_mesa_qr_con_reserva(
          $1::uuid,$2::uuid,$3::uuid[],$4::uuid,40.30,5,$5::numeric,'mixto','fixture',$6::uuid
        ) result`, [p.operation, ids.mesa, [ids.order], ids.session, p.tip, ids.reservation]);
        return rows[0].result;
      };
      const manual = async client => {
        const { rows } = await client.query(`select public.registrar_consumo_reserva(
          $1::uuid,$2::uuid,20,'efectivo','manual fixture') result`, [ids.reservation, ids.restaurant]);
        return rows[0].result;
      };
      async function snapshot() {
        return (await observer.query(`select
          (select count(*)::int from cierres_mesa_qr) closes,
          (select count(*)::int from app_private.qr_cierre_operaciones) operations,
          (select count(*)::int from clientes_historial) visits,
          (select count(*)::int from puntos_movimientos) movements,
          (select coalesce(sum(puntos),0)::int from puntos_movimientos) points,
          (select count(*)::int from cliente_notificaciones) notifications,
          (select jsonb_agg(to_jsonb(r) order by id) from reservas r) reservations,
          (select jsonb_agg(to_jsonb(c) order by id) from clientes c) clients,
          (select jsonb_agg(to_jsonb(h) order by id) from clientes_historial h) history,
          (select jsonb_agg(to_jsonb(p) order by id) from puntos_movimientos p) ledger,
          (select jsonb_agg(to_jsonb(o) order by operacion_id) from app_private.qr_cierre_operaciones o) requests,
          (select jsonb_agg(to_jsonb(c) order by id) from cierres_mesa_qr c) receipts,
          (select qr_session_id::text from sala_mesas where id=$1) session,
          (select estado from pedidos_qr where id=$2) status`, [ids.mesa, ids.order])).rows[0];
      }
      async function assertVisit(kind, operation = ids.operation) {
        const state = await snapshot();
        const linked = kind === 'linked';
        assert.equal(state.closes, linked ? 1 : 0);
        assert.equal(state.operations, linked ? 1 : 0);
        assert.equal(state.visits, 1);
        assert.equal(state.movements, 1);
        assert.equal(state.points, linked ? 70 : 40);
        assert.equal(state.notifications, 1);
        assert.equal(state.clients.length, 1);
        assert.equal(state.clients[0].id, ids.client);
        assert.equal(state.clients[0].visitas_totales, 1);
        assert.equal(state.clients[0].puntos_totales, state.points);
        assert.equal(state.clients[0].permite_email, false);
        assert.equal(state.clients[0].permite_whatsapp, false);
        assert.equal(state.reservations[0].cliente_id, ids.client);
        assert.equal(Number(state.reservations[0].consumo_total), linked ? 35.3 : 20);
        assert.ok(state.reservations[0].consumo_registrado_en);
        assert.equal(state.reservations[0].puntos_generados, state.points);
        assert.equal(state.history[0].reserva_id, ids.reservation);
        assert.equal(Number(state.history[0].gasto_eur), linked ? 35.3 : 20);
        assert.equal(state.ledger[0].referencia, `visita:${ids.reservation}`);
        if (linked) {
          assert.equal(state.status, 'cobrado');
          assert.notEqual(state.session, ids.session);
          assert.equal(Number(state.receipts[0].total_cobrado), 37.3);
          assert.equal(state.requests[0].operacion_id, operation);
          assert.equal(state.requests[0].cierre_id, state.receipts[0].id);
          assert.equal(state.requests[0].historial_id, state.history[0].id);
          assert.equal(state.requests[0].reserva_id, ids.reservation);
        } else {
          assert.equal(state.status, 'nuevo');
          assert.equal(state.session, ids.session);
        }
        return state;
      }
      async function assertOperationLock() {
        // NOWAIT/try-lock conflicts finish immediately. Confirm that A still
        // owns the exact operation's advisory lock before starting B's attempt.
        const { rows } = await observer.query(`select count(*)::int count from pg_locks
          where pid=$1 and locktype='advisory' and granted and objsubid=1
            and classid::bigint=((hashtextextended('qr-operation:' || $2::text,0)>>32)&4294967295)
            and objid::bigint=(hashtextextended('qr-operation:' || $2::text,0)&4294967295)`,
        [aPid, ids.operation]);
        assert.equal(rows[0].count, 1, 'Writer A must hold the exact operation advisory lock');
      }
      const inProgress = error => error.code === '55P03' && error.message === 'QR_CIERRE_EN_CURSO';

      await check('linked QR: manual commit first rejects the waiting close without losing its visit', async () => {
        await reset(); await a.query('begin');
        assert.equal((await manual(a)).ok, true);
        const result = await afterLock(() => close(b), () => a.query('commit'));
        assert.match(result.error?.message || '', /CONSUMO_PREVIO_REQUIERE_REVISION/);
        await assertVisit('manual');
      });
      await check('linked QR: close commit first makes the waiting manual RPC return already recorded', async () => {
        await reset(); await a.query('begin');
        assert.equal((await close(a)).ok, true);
        const result = await afterLock(() => manual(b), () => a.query('commit'));
        assert.equal(result.error, undefined);
        assert.equal(result.value.ok, false);
        assert.equal(result.value.error, 'CONSUMO_YA_REGISTRADO');
        await assertVisit('linked');
      });
      await check('linked QR: manual rollback lets the waiting close write the only visit and points', async () => {
        await reset(); const before = await snapshot(); await a.query('begin');
        assert.equal((await manual(a)).ok, true);
        assert.deepEqual(await snapshot(), before, 'Uncommitted manual spend must stay invisible');
        const result = await afterLock(() => close(b), () => a.query('rollback'));
        assert.equal(result.error, undefined);
        assert.equal(result.value.ok, true); assert.equal(result.value.replayed, false);
        await assertVisit('linked');
      });
      await check('linked QR: close rollback lets the waiting manual RPC write one visit with the QR still open', async () => {
        await reset(); const before = await snapshot(); await a.query('begin');
        assert.equal((await close(a)).ok, true);
        assert.deepEqual(await snapshot(), before, 'Uncommitted QR close and rewards must stay invisible');
        const result = await afterLock(() => manual(b), () => a.query('rollback'));
        assert.equal(result.error, undefined); assert.equal(result.value.ok, true);
        await assertVisit('manual');
      });
      await check('linked QR: same operation is busy, then replays the committed receipt once', async () => {
        await reset(); await a.query('begin'); const first = await close(a);
        await assertOperationLock(); await assert.rejects(close(b), inProgress);
        await a.query('commit'); const closed = await assertVisit('linked');
        const replay = await close(b);
        assert.equal(replay.replayed, true); assert.equal(replay.cierre_id, first.cierre_id);
        assert.deepEqual(await snapshot(), closed, 'Replay must not rotate the QR or add visits/points');
      });
      await check('linked QR: same operation after rollback creates a fresh complete close', async () => {
        await reset(); const before = await snapshot(); await a.query('begin');
        const aborted = await close(a);
        await assertOperationLock(); await assert.rejects(close(b), inProgress);
        await a.query('rollback'); assert.deepEqual(await snapshot(), before);
        const retry = await close(b);
        assert.equal(retry.ok, true); assert.equal(retry.replayed, false);
        assert.notEqual(retry.cierre_id, aborted.cierre_id);
        const closed = await assertVisit('linked');
        assert.equal((await close(a)).replayed, true);
        assert.deepEqual(await snapshot(), closed);
      });
      await check('linked QR: a different operation waits, then rejects an already consumed reservation', async () => {
        await reset(); await a.query('begin'); await close(a);
        const result = await afterLock(() => close(b, { operation: otherOperation }), () => a.query('commit'));
        assert.match(result.error?.message || '', /CONSUMO_PREVIO_REQUIERE_REVISION/);
        const closed = await assertVisit('linked');
        await assert.rejects(close(b, { operation: otherOperation }), /CONSUMO_PREVIO_REQUIERE_REVISION/);
        assert.deepEqual(await snapshot(), closed);
      });
      await check('linked QR: a different waiting operation succeeds only after the first rolls back', async () => {
        await reset(); await a.query('begin'); await close(a);
        const result = await afterLock(() => close(b, { operation: otherOperation }), () => a.query('rollback'));
        assert.equal(result.error, undefined);
        assert.equal(result.value.ok, true); assert.equal(result.value.replayed, false);
        const closed = await assertVisit('linked', otherOperation);
        await assert.rejects(close(a), /CONSUMO_PREVIO_REQUIERE_REVISION/);
        assert.deepEqual(await snapshot(), closed);
      });
      await check('linked QR: same operation with changed money stays busy, then rejects the changed payload', async () => {
        await reset(); await a.query('begin'); await close(a);
        await assertOperationLock(); await assert.rejects(close(b, { tip: '3' }), inProgress);
        await a.query('commit'); const closed = await assertVisit('linked');
        await assert.rejects(close(b, { tip: '3' }), /OPERACION_REUTILIZADA_CON_OTROS_DATOS/);
        assert.deepEqual(await snapshot(), closed);
      });
      await check('linked QR: a locked client returns a retryable conflict and the same operation can recover', async () => {
        await reset(); const before = await snapshot();
        await a.query('reset role; begin');
        await a.query('select id from clientes where id=$1 for update', [ids.client]);
        await assert.rejects(close(b), error => error.code === '55P03');
        assert.deepEqual(await snapshot(), before);
        await a.query('rollback; set role authenticated');
        const retry = await close(b);
        assert.equal(retry.ok, true); assert.equal(retry.replayed, false);
        const closed = await assertVisit('linked');
        assert.equal((await close(a)).replayed, true);
        assert.deepEqual(await snapshot(), closed);
      });
      await check('QR profitability: simultaneous retry writes each item snapshot once and replays the complete close', async () => {
        await resetProfit(); const before = await snapshot();
        await a.query('begin'); const first = await close(a);
        assert.deepEqual(await snapshot(), before, 'An unfinished close remains invisible to the observer');
        assert.deepEqual(await profitRows(), [], 'Uncommitted sale snapshots must stay invisible');
        await assertOperationLock(); await assert.rejects(close(b), inProgress);
        await a.query('commit'); const closed = await assertVisit('linked');
        const sales = await profitRows(); assertProfitRows(sales, first.cierre_id);
        const replay = await close(b);
        assert.equal(replay.replayed, true); assert.equal(replay.cierre_id, first.cierre_id);
        assert.deepEqual(await snapshot(), closed);
        assert.deepEqual(await profitRows(), sales, 'Retry must not duplicate or recompute sale snapshots');
      });
      await check('QR profitability: disabling capture waits for the close commit and preserves its snapshots', async () => {
        await resetProfit(); await a.query('begin'); const first = await close(a);
        const result = await afterLock(() => configureProfit(b, false), () => a.query('commit'));
        assert.equal(result.error, undefined); assert.equal(await profitActive(), false);
        const closed = await assertVisit('linked');
        const sales = await profitRows(); assertProfitRows(sales, first.cierre_id);
        assert.equal((await close(b)).replayed, true);
        assert.deepEqual(await snapshot(), closed);
        assert.deepEqual(await profitRows(), sales, 'Opt-out cannot erase a committed historical sale');
      });
      await check('QR profitability: rollback releases a waiting opt-out with no partial sale, then close respects opt-out', async () => {
        await resetProfit(); const before = await snapshot();
        await a.query('begin'); await close(a);
        const result = await afterLock(() => configureProfit(b, false), () => a.query('rollback'));
        assert.equal(result.error, undefined); assert.equal(await profitActive(), false);
        assert.deepEqual(await snapshot(), before, 'Rollback must remove the close, visit and points together');
        assert.deepEqual(await profitRows(), [], 'Rollback must remove every sale item');
        const retry = await close(b);
        assert.equal(retry.ok, true); assert.equal(retry.replayed, false);
        await assertVisit('linked'); assert.deepEqual(await profitRows(), []);
      });
      await check('QR profitability: opt-out commit first prevents a waiting close from capturing obsolete enabled state', async () => {
        await resetProfit(); await a.query('begin'); await configureProfit(a, false);
        const result = await afterLock(() => close(b), () => a.query('commit'));
        assert.equal(result.error, undefined); assert.equal(result.value.ok, true);
        assert.equal(await profitActive(), false);
        await assertVisit('linked'); assert.deepEqual(await profitRows(), []);
      });
    });
  console.log(`${passed} REAL two-connection race checks passed. Reduced synthetic schemas only; not a production-schema or browser E2E test.`);
} finally {
  // Stop our child server first so an outstanding query cannot keep end() stuck.
  // All signals target only this process's owned cluster, never another server.
  if (server?.pid && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolve => {
      if (server.exitCode !== null || server.signalCode !== null) resolve();
      else server.once('exit', resolve);
    });
    server.kill('SIGINT');
    try { await bounded(exited, 5000, 'PostgreSQL fast shutdown'); }
    catch {
      server.kill('SIGQUIT');
      try { await bounded(exited, 3000, 'PostgreSQL immediate shutdown'); }
      catch {
        server.kill('SIGKILL');
        await bounded(exited, 3000, 'PostgreSQL forced shutdown');
      }
    }
  }
  const ended = await Promise.allSettled([...clients].map(client => bounded(client.end(), 3000, 'Closing fixture connection')));
  for (const result of ended) if (result.status === 'rejected') {
    console.error(result.reason.message); process.exitCode = 1;
  }
  // Retain only this fresh local fixture directory for diagnostics; no broad deletion.
  console.log(`Local fixture cluster stopped; retained at ${cluster}`);
}
