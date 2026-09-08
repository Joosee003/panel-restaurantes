// In-memory synthetic SQL tests; never connects to Supabase or another database.
// Usage: node scripts/test-manual-consumption-sql.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Pass the local PGlite 0.5.8 module path.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
// Read only literal synthetic SQL from the existing fixture. Never import or
// evaluate its JavaScript, which would run a second test suite unintentionally.
const source = await read('scripts/test-qr-reservation-sql.mjs');
const declaration = source.match(/const ids=\{([^;]+)\};/);
assert.ok(declaration, 'Linked fixture IDs declaration is missing');
const ids = Object.fromEntries([...declaration[1].matchAll(/([a-z]+):'([a-f0-9-]{36})'/g)]
  .map(([, key, value]) => [key, value]));
assert.equal(Object.keys(ids).length, 8, 'Fixture IDs changed; review extraction');
function literal(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing fixture marker: ${marker}`);
  const end = source.indexOf('`', start + marker.length);
  assert.notEqual(end, -1, 'Unterminated fixture SQL');
  const sql = source.slice(start + marker.length, end).replace(/\$\{ids\.([a-z]+)\}/g, (_, key) => {
    assert.match(ids[key] || '', /^[a-f0-9-]{36}$/, `Unknown synthetic ID: ${key}`);
    return ids[key];
  });
  assert.ok(!sql.includes('${'), 'Only literal fixture SQL is accepted');
  return sql;
}
const schema = literal('const schema=`');
const seedSql = literal('await db.exec(`');
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const seed = () => db.exec(seedSql);
async function call(amount = 10) {
  return (await db.query(`select public.registrar_consumo_reserva_interno($1,$2,$3,'tarjeta',null) result`,
    [ids.reservation, ids.restaurant, amount])).rows[0].result;
}
async function snapshot() {
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(r) order by id) from reservas r) reservations,
    (select jsonb_agg(to_jsonb(c) order by id) from clientes c) clients,
    (select jsonb_agg(to_jsonb(h) order by id) from clientes_historial h) history,
    (select jsonb_agg(to_jsonb(p) order by id) from puntos_movimientos p) movements,
    (select jsonb_agg(to_jsonb(n) order by id) from cliente_notificaciones n) notifications`)).rows[0];
}
async function expectPoints(name, setup, expected, amount = 10) {
  await seed();
  if (setup) await db.exec(setup);
  const response = await call(amount);
  const state = await snapshot();
  assert.equal(response.ok, true);
  assert.equal(response.puntos_generados, expected);
  assert.equal(state.reservations[0].puntos_generados, expected);
  assert.equal(state.clients[0].puntos_totales, expected);
  assert.equal(state.clients[0].visitas_totales, 1);
  assert.equal(state.history.length, 1);
  assert.equal(state.movements?.length || 0, expected > 0 ? 1 : 0);
  assert.equal(state.movements?.[0]?.puntos || 0, expected);
  assert.equal(state.notifications.length, 1);
  assert.equal(state.notifications[0].titulo, expected > 0 ? 'Puntos añadidos' : 'Visita registrada');
  assert.equal(state.notifications[0].mensaje,
    expected > 0 ? `Tu visita ha sumado ${expected} puntos.` : 'Tu visita ha sido registrada.');
  pass(name);
}
try {
  await db.exec(schema);
  await db.exec(await read('docs/sql/harden-qr-close.sql'));
  await db.exec(await read('supabase/migrations/20260906143000_guard_loyalty_history_trigger.sql'));
  await db.exec(`create trigger trg_historial_gasto_a_puntos after insert on clientes_historial
    for each row execute function public.trg_clientes_historial_gasto_a_puntos()`);
  await db.exec(await read('supabase/migrations/20260906142000_guard_loyalty_points_when_module_disabled.sql'));
  await db.exec(await read('docs/sql/connect-qr-reservation.sql'));
  await seed();
  const previous = await call();
  assert.equal(previous.puntos_generados, 0);
  assert.equal((await snapshot()).movements[0].puntos, 20);
  pass('baseline reproduces zero reported points while the history trigger writes 20');

  const privileges = () => db.query(`select proacl,proowner::text,prosecdef,proconfig
    from pg_proc where oid='public.registrar_consumo_reserva_interno(uuid,uuid,numeric,text,text)'::regprocedure`);
  const beforePrivileges = (await privileges()).rows;
  await db.exec(await read('docs/sql/align-manual-consumption-points.sql'));
  assert.deepEqual((await privileges()).rows, beforePrivileges);
  pass('replacement preserves owner, privileges, security mode and search path');
  await expectPoints('missing loyalty configuration uses actual restaurant rate in response and notification', '', 20);
  await expectPoints('explicit configuration overrides restaurant rate once',
    `insert into fidelizacion_config values('${ids.restaurant}',3)`, 32, 10.75);
  await expectPoints('explicit zero rate does not fall back to restaurant rate',
    `insert into fidelizacion_config values('${ids.restaurant}',0)`, 0);
  await expectPoints('disabled loyalty records one visit and zero points',
    'update restaurante_modulos set fidelizacion=false', 0);
  await expectPoints('disabled restaurant points records one visit and zero points',
    'update restaurantes set puntos_activo=false', 0);
  await expectPoints('null rates use the history trigger fallback in every reported value',
    'update restaurantes set puntos_por_euro=null', 10);

  await seed();
  await db.exec(`update reservas set cliente_id=null,telefono='+34000000000',email='fixture@example.invalid'`);
  const newCustomerResponse = await call();
  const newCustomerState = await snapshot();
  const newCustomer = newCustomerState.clients.find(client => client.id === newCustomerResponse.cliente_id);
  assert.equal(newCustomerState.clients.length, 2);
  assert.equal(newCustomer.permite_whatsapp, false);
  assert.equal(newCustomer.permite_email, false);
  assert.equal(newCustomer.visitas_totales, 1);
  assert.equal(newCustomerResponse.puntos_generados, 20);
  pass('creating a customer from consumption grants no WhatsApp or email marketing permission');

  await seed();
  await db.exec('update clientes set permite_whatsapp=true,permite_email=true');
  await call();
  const existingCustomer = (await snapshot()).clients[0];
  assert.equal(existingCustomer.permite_whatsapp, true);
  assert.equal(existingCustomer.permite_email, true);
  pass('recording consumption preserves existing customer contact permissions');

  await seed();
  await db.exec(`update clientes set restaurante_id='${ids.user}'`);
  const foreignCustomerState = await snapshot();
  await assert.rejects(() => call(), /CLIENTE_RESERVA_NO_VALIDO/);
  assert.deepEqual(await snapshot(), foreignCustomerState);
  pass('assigned customer from another restaurant is rejected before any visit or points');

  await seed();
  const beforeZero = await snapshot();
  await assert.rejects(() => call(0), /IMPORTE_INVALIDO/);
  assert.deepEqual(await snapshot(), beforeZero);
  pass('zero manual spend retains its existing rejection with no visit or points written');

  await seed();
  await call();
  const recorded = await snapshot();
  const replay = await call();
  assert.equal(replay.ok, false);
  assert.equal(replay.error, 'CONSUMO_YA_REGISTRADO');
  assert.equal(replay.puntos_generados, 20);
  assert.deepEqual(await snapshot(), recorded);
  pass('repeated consumption returns recorded points and adds no visit, notification or movement');

  await seed();
  await db.exec(`create function public.fixture_reject_notification() returns trigger language plpgsql as $$
    begin raise exception 'FIXTURE_NOTIFICATION_FAILURE'; end $$;
    create trigger fixture_notification_failure before insert on cliente_notificaciones
      for each row execute function public.fixture_reject_notification()`);
  const beforeFailure = await snapshot();
  await assert.rejects(() => call(), /FIXTURE_NOTIFICATION_FAILURE/);
  assert.deepEqual(await snapshot(), beforeFailure);
  pass('failure after awarding points rolls back visit, movement, balances and reservation');
  console.log(`\n${passed} manual consumption SQL checks passed (in-memory fixture, no production connection).`);
} finally {
  await db.close();
}
