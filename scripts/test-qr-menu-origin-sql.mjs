// Synthetic in-memory SQL only. Never connects to Supabase or production.
// node scripts/test-qr-menu-origin-sql.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Pass the local PGlite 0.5.8 module path.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const base = await read('scripts/test-qr-close-sql.mjs');
const start = base.indexOf('const schema = `');
assert.notEqual(start, -1);
const end = base.indexOf('`;', start + 16);
assert.notEqual(end, -1);
const schema = base.slice(start + 'const schema = `'.length, end);
assert.ok(!schema.includes('${'), 'Only a literal synthetic schema may be reused.');
const draft = await read('docs/sql/preserve-qr-menu-origin.sql');
// Restore the two historical INSERT fragments to exercise the exact catalog
// predecessor. Its body fingerprint is verified independently by the SQL guard.
const creatorStart = draft.indexOf('CREATE OR REPLACE FUNCTION public.crear_pedido_mesa_qr_seguro');
assert.notEqual(creatorStart, -1);
const creator = draft.slice(creatorStart, draft.lastIndexOf('commit;')).trim();
const legacyCreator = creator
  .replace('pedido_id, producto_id, menu_id, nombre_producto, precio_unitario, cantidad, notas',
    'pedido_id, producto_id, nombre_producto, precio_unitario, cantidad, notas')
  .replace('v_pedido_id, v_producto_id, v_menu_id, v_nombre, v_precio, v_qty, v_notas',
    'v_pedido_id, v_producto_id, v_nombre, v_precio, v_qty, v_notas');
const ids = {
  restaurant: '20000000-0000-4000-8000-000000000001',
  foreign: '20000000-0000-4000-8000-000000000002',
  table: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
  menu: '50000000-0000-4000-8000-000000000001',
  product: '60000000-0000-4000-8000-000000000001',
  card: '70000000-0000-4000-8000-000000000001',
  otherCard: '70000000-0000-4000-8000-000000000002',
};
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
async function seed() {
  await db.exec(`
    truncate pedido_qr_items, pedidos_qr, cierres_mesa_qr, sala_mesas,
      restaurante_modulos, carta_productos, menus_dia_qr, cartas_digitales cascade;
    select set_config('test.user','',false);
    select set_config('test.restaurant','${ids.restaurant}',false);
    select set_config('test.demo','no',false);
    insert into restaurante_modulos values ('${ids.restaurant}',true,'activo');
    insert into sala_mesas(id,restaurante_id,nombre,qr_session_id,qr_access_token)
      values('${ids.table}','${ids.restaurant}','Synthetic table','${ids.session}',repeat('01',24));
    insert into cartas_digitales values ('${ids.card}','${ids.restaurant}',repeat('ab',16),'activa');
    insert into carta_productos values ('${ids.product}','${ids.restaurant}','${ids.card}','Product',2.50,true);
    insert into menus_dia_qr(id,restaurante_id,carta_id,titulo,precio,activo)
      values ('${ids.menu}','${ids.restaurant}','${ids.card}','Menu',12.50,true);
  `);
}
const defaultItems = () => [{ producto_id: `menu-${ids.menu}`, cantidad: 2 }];
async function call(items = defaultItems(), overrides = {}) {
  const args = {
    token: 'ab'.repeat(16), table: ids.table, access: '01'.repeat(24), ...overrides,
  };
  await db.exec('set role anon');
  try {
    return (await db.query('select public.crear_pedido_mesa_qr_seguro($1,$2,$3,$4,$5) result',
      [args.token,args.table,args.access,'synthetic',JSON.stringify(items)])).rows[0].result;
  } finally { await db.exec('reset role'); }
}
async function state() {
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(p) order by id) from pedidos_qr p) orders,
    (select jsonb_agg(to_jsonb(i) order by id) from pedido_qr_items i) items`)).rows[0];
}
async function rejected(name, setup, items, expected, overrides) {
  await seed();
  if (setup) await db.exec(setup);
  const before = await state();
  await assert.rejects(() => call(items, overrides), expected);
  assert.deepEqual(await state(), before, 'Rejected creation must roll back header and all lines.');
  pass(name);
}
try {
  await db.exec(schema);
  await db.exec(`
    alter table pedidos_qr add column carta_id uuid, add column mesa text, add column notas text;
    create table cartas_digitales(id uuid primary key, restaurante_id uuid not null,
      public_token text, estado text);
    create table carta_productos(id uuid primary key, restaurante_id uuid not null,
      carta_id uuid, nombre text, precio numeric, activo boolean);
    create table menus_dia_qr(id uuid primary key, restaurante_id uuid not null,
      carta_id uuid, titulo text, precio numeric, activo boolean,
      fecha_desde date, fecha_hasta date, hora_inicio time, hora_fin time, dias_semana integer[]);
  `);
  await db.exec(legacyCreator);
  await db.exec(`
    -- Preserve the existing intentional token-protected anonymous grant.
    revoke all on function public.crear_pedido_mesa_qr_seguro(text,uuid,text,text,jsonb) from public;
    grant execute on function public.crear_pedido_mesa_qr_seguro(text,uuid,text,text,jsonb) to anon, authenticated;
  `);
  await assert.rejects(() => db.exec(draft), /QR_MENU_ORIGIN_DEPENDENCIES_MISSING/);
  await db.exec('rollback');
  pass('missing close hardening rejects the whole patch');
  await db.exec(await read('docs/sql/harden-qr-close.sql'));
  await db.exec(`create trigger pedidos_qr_enforce_session_limits before insert on pedidos_qr
    for each row execute function public.enforce_pedido_qr_session_limits()`);
  await db.exec(legacyCreator.replace('\ndeclare\n', '\n-- Another reviewed change\ndeclare\n'));
  await assert.rejects(() => db.exec(draft), /QR_MENU_CREATOR_CHANGED_REVIEW_REQUIRED/);
  await db.exec('rollback');
  await db.exec(legacyCreator);
  pass('a changed creator body requires review instead of being overwritten');
  const privilegeQuery = `select proowner,proacl::text,prosecdef,proconfig
    from pg_proc where oid='public.crear_pedido_mesa_qr_seguro(text,uuid,text,text,jsonb)'::regprocedure`;
  const privileges = (await db.query(privilegeQuery)).rows[0];
  await seed();
  // The genuine predecessor accepts the menu but retains only its label.
  await call();
  assert.equal((await state()).items[0].producto_id, null);
  await db.exec(draft);
  assert.equal((await db.query('select menu_id from pedido_qr_items')).rows[0].menu_id, null);
  pass('legacy unknown origins stay unknown');
  assert.deepEqual((await db.query(privilegeQuery)).rows[0], privileges);
  pass('existing creator owner, grants, definer and search path are preserved');

  await seed();
  const menuResult = await call();
  let rows = await state();
  assert.equal(menuResult.total, 25);
  assert.equal(rows.items[0].menu_id, ids.menu);
  assert.equal(rows.items[0].producto_id, null);
  assert.equal(rows.items[0].cantidad, 2);
  pass('anonymous token-protected menu order preserves its validated menu ID');

  await seed();
  await call([{producto_id:ids.product,cantidad:3,notas:'sample'}]);
  rows = await state();
  assert.equal(rows.items[0].producto_id, ids.product);
  assert.equal(rows.items[0].menu_id, null);
  assert.equal(rows.orders[0].total, 7.5);
  pass('regular products keep their original source and server price');

  await seed();
  await call([{producto_id:ids.product,cantidad:1},...defaultItems()]);
  rows = await state();
  assert.equal(rows.items.length, 2);
  assert.equal(rows.orders[0].total, 27.5);
  assert.equal(rows.items.filter(i => i.menu_id === ids.menu).length, 1);
  pass('a mixed order keeps separate product and menu origins');

  await seed();
  await db.exec('update menus_dia_qr set carta_id=null');
  await call();
  pass('restaurant-wide menus remain supported');

  for (const [name, setup] of [
    ['foreign-restaurant menu', `update menus_dia_qr set restaurante_id='${ids.foreign}'`],
    ['other-card menu', `update menus_dia_qr set carta_id='${ids.otherCard}'`],
    ['inactive menu', 'update menus_dia_qr set activo=false'],
    ['expired menu', `update menus_dia_qr set fecha_hasta=(now() at time zone 'Europe/Madrid')::date-1`],
  ]) {
    await rejected(name, setup, defaultItems(), /PRODUCTO_NO_VALIDO/);
  }
  await rejected('foreign-restaurant product',
    `update carta_productos set restaurante_id='${ids.foreign}'`,
    [{producto_id:ids.product,cantidad:1}],/PRODUCTO_NO_VALIDO/);
  await rejected('invalid menu UUID',null,[{producto_id:'menu-invalid',cantidad:1}],/PRODUCTO_NO_VALIDO/);
  await rejected('failed later item rolls back the already inserted menu',
    null,[...defaultItems(),{producto_id:'missing',cantidad:1}],/PRODUCTO_NO_VALIDO/);
  await rejected('wrong QR access token',null,defaultItems(),/ACCESO_MESA_INVALIDO/,{access:'ff'.repeat(24)});
  await rejected('inactive QR module','update restaurante_modulos set camarero_digital=false',
    defaultItems(),/CAMARERO_DIGITAL_NO_ACTIVO/);

  await seed();
  await call();
  const unchanged = await state();
  await assert.rejects(() => db.query('update pedido_qr_items set producto_id=$1',[ids.product]), /ORIGEN_QR_AMBIGUO/);
  assert.deepEqual(await state(),unchanged);
  pass('a direct write cannot assign both origin kinds');

  await seed();
  await call([{producto_id:ids.product,cantidad:1}]);
  await db.exec(`update menus_dia_qr set restaurante_id='${ids.foreign}'`);
  const beforeForeign = await state();
  await assert.rejects(() => db.query('update pedido_qr_items set producto_id=null,menu_id=$1',[ids.menu]),
    /MENU_QR_ORIGEN_NO_VALIDO/);
  assert.deepEqual(await state(),beforeForeign);
  pass('a direct origin edit cannot cross restaurant boundaries');

  await seed();
  await call();
  await db.exec('delete from menus_dia_qr');
  assert.equal((await state()).items[0].menu_id,ids.menu);
  pass('removing a catalog menu does not erase the recorded origin');

  await seed();
  await call();
  const orderId = (await state()).orders[0].id;
  await db.exec(`select set_config('test.user','10000000-0000-4000-8000-000000000001',false)`);
  await db.query('select public.cerrar_mesa_qr_validada($1,$2,$3,$4,$5,$6,$7,$8)',
    [ids.table,[orderId],ids.session,25,0,0,'tarjeta',null]);
  const closed = await state();
  await assert.rejects(() => db.exec('update pedido_qr_items set menu_id=null'),/PEDIDO_QR_FINALIZADO/);
  assert.deepEqual(await state(),closed);
  pass('the finalized item origin cannot be cleared');

  await db.exec(draft);
  assert.deepEqual(await state(),closed);
  pass('reapplying the patch leaves recorded origins and final states unchanged');
  console.log(`${passed} QR menu-origin SQL checks passed. Synthetic schema only; no production or browser verification.`);
} finally { await db.close(); }
