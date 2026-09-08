// Synthetic in-memory PostgreSQL only. No production database, customer data,
// network connection, or credentials are used by this script.
// Usage: node scripts/test-qr-profitability-sql.mjs tests/sql/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

assert.ok(process.argv[2], 'Pass the pinned local PGlite module path.');
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

// Extract literal SQL, never import/evaluate the JavaScript of another suite.
const source = await read('scripts/test-qr-reservation-sql.mjs');
const declaration = source.match(/const ids=\{([^;]+)\};/);
assert.ok(declaration, 'Linked fixture IDs declaration is missing.');
const ids = Object.fromEntries([...declaration[1].matchAll(/([a-z]+):'([a-f0-9-]{36})'/g)]
  .map(([, key, value]) => [key, value]));
assert.equal(Object.keys(ids).length, 8, 'Fixture IDs changed; review extraction.');
Object.assign(ids, {
  product: '90000000-0000-4000-8000-000000000001',
  otherProduct: '90000000-0000-4000-8000-000000000002',
  dish: 'a0000000-0000-4000-8000-000000000001',
  otherDish: 'a0000000-0000-4000-8000-000000000002',
  ingredient: 'b0000000-0000-4000-8000-000000000001',
  otherIngredient: 'b0000000-0000-4000-8000-000000000002',
  item: 'c0000000-0000-4000-8000-000000000001',
  item2: 'c0000000-0000-4000-8000-000000000002',
  item3: 'c0000000-0000-4000-8000-000000000003',
  menu: 'd0000000-0000-4000-8000-000000000001',
  foreignRestaurant: 'e0000000-0000-4000-8000-000000000001',
});
function literal(marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing fixture marker: ${marker}`);
  const end = source.indexOf('`', start + marker.length);
  assert.notEqual(end, -1, 'Unterminated fixture SQL.');
  const sql = source.slice(start + marker.length, end).replace(/\$\{ids\.([a-z]+)\}/g, (_, key) => {
    assert.match(ids[key] || '', /^[a-f0-9-]{36}$/, `Unknown synthetic ID: ${key}`);
    return ids[key];
  });
  assert.ok(!sql.includes('${'), 'Only literal fixture SQL is accepted.');
  return sql;
}
const schema = literal('const schema=`');
const seedSql = literal('await db.exec(`')
  .replace('insert into restaurantes values', 'insert into restaurantes(id,puntos_activo,puntos_por_euro) values')
  .replace('insert into restaurante_modulos values',
    'insert into restaurante_modulos(restaurante_id,camarero_digital,estado,reservas,clientes,fidelizacion) values')
  .replace(`values(gen_random_uuid(),'${ids.order}'`, `values('${ids.item}','${ids.order}'`);
const catalogueSchema = `
  -- Supabase exposes auth.uid() to authenticated callers; the older synthetic
  -- close fixture only needed its definer-owned path, so add this standard grant.
  grant usage on schema auth to authenticated;
  alter table restaurante_modulos add column rentabilidad boolean not null default true;
  alter table pedido_qr_items add column menu_id uuid;
  create table carta_productos(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text not null,precio numeric);
  alter table pedido_qr_items add foreign key(producto_id) references carta_productos(id) on delete set null;
  create table platos(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text not null,precio_venta numeric,activo boolean default true);
  create table ingredientes(id uuid primary key,restaurante_id uuid not null references restaurantes,
    nombre text,coste_compra numeric,cantidad_compra numeric,merma_pct numeric,activo boolean default true);
  create table plato_ingredientes(id uuid primary key default gen_random_uuid(),
    plato_id uuid not null references platos on delete cascade,
    ingrediente_id uuid references ingredientes,cantidad_usada numeric);
`;
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
async function seed({ enabled = true, mapped = true } = {}) {
  await db.exec(seedSql);
  await db.exec(`
    insert into restaurantes(id,puntos_activo,puntos_por_euro) values('${ids.foreignRestaurant}',false,0);
    insert into carta_productos values('${ids.product}','${ids.restaurant}','Catalogue name',99),
      ('${ids.otherProduct}','${ids.foreignRestaurant}','Other tenant product',5);
    insert into platos(id,restaurante_id,nombre,precio_venta) values('${ids.dish}','${ids.restaurant}','Recipe name',50),
      ('${ids.otherDish}','${ids.foreignRestaurant}','Other tenant recipe',5);
    insert into ingredientes(id,restaurante_id,nombre,coste_compra,cantidad_compra,merma_pct)
      values('${ids.ingredient}','${ids.restaurant}','Ingredient',8,2,20),
      ('${ids.otherIngredient}','${ids.foreignRestaurant}','Other tenant ingredient',1,1,0);
    insert into plato_ingredientes(plato_id,ingrediente_id,cantidad_usada)
      values('${ids.dish}','${ids.ingredient}',0.4);
    update pedido_qr_items set producto_id='${ids.product}';
  `);
  await db.exec('set role authenticated');
  if (mapped) await map(ids.product, ids.dish);
  if (enabled) await configure(true);
  await db.exec('reset role');
}
async function configure(active) {
  return db.query('select public.configurar_rentabilidad_qr($1::uuid,$2::boolean)', [ids.restaurant, active]);
}
async function map(product, dish) {
  return db.query('select public.vincular_producto_qr_plato($1::uuid,$2::uuid)', [product, dish]);
}
async function report(restaurant = ids.restaurant, from = '2026-09-01', to = '2026-10-01') {
  return (await db.query('select public.consultar_ventas_qr($1::uuid,$2::date,$3::date) report',
    [restaurant, from, to])).rows[0].report;
}
async function close(options = {}) {
  const p = { total: '40.30', discount: '5', tip: '2', reservation: ids.reservation, ...options };
  return (await db.query(`select public.cerrar_mesa_qr_con_reserva($1::uuid,$2::uuid,$3::uuid[],$4::uuid,
    $5::numeric,$6::numeric,$7::numeric,'tarjeta','synthetic profitability',$8::uuid) result`,
  [ids.operation, ids.mesa, [ids.order], ids.session, p.total, p.discount, p.tip, p.reservation])).rows[0].result;
}
const sales = async () => (await db.query('select * from public.ventas_qr order by id')).rows;
async function snapshot() {
  return (await db.query(`select
    (select jsonb_agg(to_jsonb(s) order by id) from ventas_qr s) sales,
    (select jsonb_agg(to_jsonb(c) order by id) from cierres_mesa_qr c) closes,
    (select jsonb_agg(to_jsonb(o) order by id) from pedidos_qr o) orders,
    (select jsonb_agg(to_jsonb(h) order by id) from clientes_historial h) history,
    (select jsonb_agg(to_jsonb(m) order by id) from puntos_movimientos m) points,
    (select jsonb_agg(to_jsonb(c) order by id) from clientes c) clients,
    (select jsonb_agg(to_jsonb(r) order by id) from reservas r) reservations,
    (select jsonb_agg(to_jsonb(m) order by id) from sala_mesas m) tables,
    (select jsonb_agg(to_jsonb(c) order by restaurante_id) from qr_rentabilidad_config c) configuration,
    (select jsonb_agg(to_jsonb(m) order by restaurante_id,producto_id) from qr_producto_plato m) mappings,
    (select count(*)::int from app_private.qr_cierre_operaciones) operations`)).rows[0];
}
async function expectMissingCost(name, setup, status) {
  await seed();
  await db.exec(setup);
  await close();
  const [row] = await sales();
  assert.equal(row.estado_coste, status);
  assert.equal(row.coste_unitario, null);
  assert.equal(row.coste_total, null);
  assert.equal(row.beneficio_total, null);
  assert.equal(Number(row.ingreso_total), 35.3);
  pass(name);
}
async function expectDenied(name, action, setup = '') {
  await seed();
  if (setup) await db.exec(setup);
  const before = await snapshot();
  await db.exec('set role authenticated');
  await assert.rejects(action);
  await db.exec('reset role');
  assert.deepEqual(await snapshot(), before);
  pass(name);
}
try {
  await db.exec(schema);
  await db.exec(catalogueSchema);
  await db.exec(await read('docs/sql/harden-qr-close.sql'));
  await db.exec(await read('supabase/migrations/20260906143000_guard_loyalty_history_trigger.sql'));
  await db.exec(`create trigger trg_historial_gasto_a_puntos after insert on clientes_historial
    for each row execute function public.trg_clientes_historial_gasto_a_puntos()`);
  await db.exec(await read('supabase/migrations/20260906142000_guard_loyalty_points_when_module_disabled.sql'));
  await db.exec(await read('docs/sql/connect-qr-reservation.sql'));
  await db.exec(await read('docs/sql/align-manual-consumption-points.sql'));
  await db.exec(await read('docs/sql/connect-qr-profitability.sql'));

  await seed();
  await db.exec('set role authenticated');
  const result = await close();
  const [row] = await sales();
  await db.exec('reset role');
  assert.equal(result.ok, true);
  assert.equal(row.id, ids.item);
  assert.equal(row.cierre_id, result.cierre_id);
  assert.equal(row.producto_id, ids.product);
  assert.equal(row.plato_id, ids.dish);
  assert.equal(row.nombre_producto, 'Fixture item');
  assert.equal(row.cantidad, 2);
  assert.equal(Number(row.precio_unitario), 20.15);
  assert.equal(Number(row.ingreso_bruto), 40.3);
  assert.equal(Number(row.descuento), 5);
  assert.equal(Number(row.ingreso_total), 35.3);
  assert.equal(Number(row.coste_unitario), 2);
  assert.equal(Number(row.coste_total), 4);
  assert.equal(Number(row.beneficio_total), 31.3);
  assert.equal(row.estado_coste, 'calculado');
  pass('authenticated linked close records actual order price, allocated discount and recipe cost after waste; tip excluded');

  const firstSnapshot = await snapshot();
  const replay = await close();
  assert.equal(replay.replayed, true);
  assert.deepEqual(await snapshot(), firstSnapshot);
  pass('same operation retry does not duplicate sales, visit, points, close or table-session rotation');

  await db.exec(`update carta_productos set precio=700,nombre='Changed catalogue' where id='${ids.product}';
    update platos set precio_venta=900,nombre='Changed recipe' where id='${ids.dish}';
    update ingredientes set coste_compra=100,merma_pct=50 where id='${ids.ingredient}';
    update plato_ingredientes set cantidad_usada=5 where plato_id='${ids.dish}'`);
  assert.deepEqual(await sales(), [row]);
  await db.exec(`delete from platos where id='${ids.dish}'`);
  assert.deepEqual(await sales(), [row]);
  await assert.rejects(() => db.exec(`delete from carta_productos where id='${ids.product}'`), /PEDIDO_QR_FINALIZADO/);
  assert.deepEqual(await sales(), [row]);
  pass('historical sales survive catalogue edits and recipe deletion; finalized-order FK still blocks deleting its product');

  await seed({ enabled: false });
  await close();
  assert.equal((await sales()).length, 0);
  await configure(true);
  assert.equal((await sales()).length, 0);
  pass('capture starts disabled and enabling it never backfills a previous close');

  await seed();
  await configure(false);
  await close();
  assert.equal((await sales()).length, 0);
  pass('explicitly disabling capture preserves ordinary close with no profitability sale');

  await seed();
  await db.exec('update restaurante_modulos set rentabilidad=false');
  await close();
  assert.equal((await sales()).length, 0);
  pass('disabled profitability module prevents automatic capture even with saved enabled configuration');

  await seed();
  await db.exec('update restaurante_modulos set reservas=false,clientes=false');
  const standalone = await close({ reservation: null });
  assert.equal(standalone.ok, true);
  assert.equal((await sales()).length, 1);
  assert.equal((await db.query('select count(*)::int n from clientes_historial')).rows[0].n, 0);
  pass('QR-only restaurant captures profitability without inventing a reservation or customer visit');

  await expectMissingCost('unmapped product keeps revenue but reports unknown cost',
    'delete from qr_producto_plato', 'sin_vinculo');
  await expectMissingCost('missing recipe lines are unknown cost, never a fictitious zero',
    'delete from plato_ingredientes', 'receta_incompleta');
  await expectMissingCost('ingredient belonging to another restaurant cannot supply a cost',
    `update plato_ingredientes set ingrediente_id='${ids.otherIngredient}'`, 'receta_incompleta');
  for (const invalid of [
    'update ingredientes set cantidad_compra=0',
    'update ingredientes set coste_compra=-1',
    'update ingredientes set coste_compra=null',
    'update ingredientes set merma_pct=100',
    'update ingredientes set merma_pct=-1',
    'update plato_ingredientes set cantidad_usada=0',
  ]) {
    await seed();
    await db.exec(invalid);
    await close();
    const [invalidRow] = await sales();
    assert.equal(invalidRow.estado_coste, 'receta_incompleta', invalid);
    assert.equal(invalidRow.coste_total, null, invalid);
    assert.equal(invalidRow.beneficio_total, null, invalid);
  }
  pass('invalid or missing recipe inputs produce unknown costs across six data-validation cases');

  for (const invalid of [
    `update ingredientes set coste_compra=null where id='${ids.ingredient}'`,
    `update ingredientes set cantidad_compra=null where id='${ids.ingredient}'`,
    `update ingredientes set merma_pct=null where id='${ids.ingredient}'`,
    `update ingredientes set coste_compra='NaN' where id='${ids.ingredient}'`,
    `update ingredientes set coste_compra='Infinity' where id='${ids.ingredient}'`,
    `update plato_ingredientes set cantidad_usada=null where ingrediente_id='${ids.ingredient}'`,
  ]) {
    await seed();
    await db.exec(`update ingredientes set restaurante_id='${ids.restaurant}' where id='${ids.otherIngredient}';
      insert into plato_ingredientes(plato_id,ingrediente_id,cantidad_usada)
        values('${ids.dish}','${ids.otherIngredient}',1); ${invalid}`);
    await close();
    const [partial] = await sales();
    assert.equal(partial.estado_coste, 'receta_incompleta', invalid);
    assert.equal(partial.coste_total, null, invalid);
    assert.equal(partial.beneficio_total, null, invalid);
  }
  pass('one valid recipe line cannot hide a NULL, NaN or infinite line and invent a partial cost');

  await expectMissingCost('a menu order is visible without pretending its recipe is costed',
    `update pedido_qr_items set producto_id=null,menu_id='${ids.menu}'`, 'menu_sin_escandallo');
  await expectMissingCost('a menu with a product ID still cannot borrow the individual-product recipe cost',
    `update pedido_qr_items set menu_id='${ids.menu}'`, 'menu_sin_escandallo');
  await expectMissingCost('an item without product or menu retains its revenue with unknown origin',
    'update pedido_qr_items set producto_id=null,menu_id=null', 'origen_desconocido');

  await seed();
  await db.exec(`update ingredientes set coste_compra=1,cantidad_compra=3,merma_pct=0 where id='${ids.ingredient}';
    update ingredientes set restaurante_id='${ids.restaurant}',coste_compra=1,cantidad_compra=3,merma_pct=0
      where id='${ids.otherIngredient}';
    update plato_ingredientes set cantidad_usada=0.5;
    insert into plato_ingredientes(plato_id,ingrediente_id,cantidad_usada)
      values('${ids.dish}','${ids.otherIngredient}',0.5)`);
  await close();
  assert.equal(Number((await sales())[0].coste_total), 0.67);
  pass('fractional ingredient costs are combined before line rounding, avoiding double-rounding loss');

  await seed();
  await db.exec(`delete from pedido_qr_items;
    insert into pedido_qr_items(id,pedido_id,producto_id,nombre_producto,precio_unitario,cantidad) values
      ('${ids.item3}','${ids.order}','${ids.product}','Third',0.01,1),
      ('${ids.item}','${ids.order}','${ids.product}','First',0.01,1),
      ('${ids.item2}','${ids.order}','${ids.product}','Second',0.01,1);
    update pedidos_qr set total=0.03`);
  await close({ total: '0.03', discount: '0.02', tip: '9' });
  const pennies = await sales();
  assert.deepEqual(pennies.map(line => Number(line.descuento)), [0.01, 0.01, 0]);
  assert.deepEqual(pennies.map(line => Number(line.ingreso_total)), [0, 0, 0.01]);
  assert.equal(pennies.reduce((sum, line) => sum + Math.round(Number(line.descuento) * 100), 0), 2);
  pass('largest-remainder discount allocation preserves every cent with stable item-ID ties, independent of insertion order');

  await seed();
  await close({ discount: '40.30', tip: '0' });
  const [free] = await sales();
  assert.equal(Number(free.ingreso_total), 0);
  assert.equal(Number(free.descuento), 40.3);
  assert.equal(Number(free.coste_total), 4);
  assert.equal(Number(free.beneficio_total), -4);
  pass('a full discount keeps the recipe cost and records the resulting negative margin');

  await seed();
  await db.exec('update pedido_qr_items set precio_unitario=0; update pedidos_qr set total=0');
  await close({ total: '0', discount: '0', tip: '0' });
  const [zeroGross] = await sales();
  assert.equal(Number(zeroGross.ingreso_bruto), 0);
  assert.equal(Number(zeroGross.descuento), 0);
  assert.equal(Number(zeroGross.ingreso_total), 0);
  assert.equal(Number(zeroGross.coste_total), 4);
  assert.equal(Number(zeroGross.beneficio_total), -4);
  pass('zero-price orders avoid division by zero while retaining the actual recipe cost');

  await seed();
  await db.exec('update ingredientes set coste_compra=0');
  await close();
  assert.equal((await sales())[0].estado_coste, 'calculado');
  assert.equal(Number((await sales())[0].coste_total), 0);
  pass('an explicitly zero-cost valid recipe is distinguished from an unknown cost');

  await seed();
  await db.exec(`alter table cierres_mesa_qr add column creado_en timestamptz
    default '2026-09-08T00:30:00Z'; update reservas_config set zona_horaria='America/Los_Angeles'`);
  await close();
  const [dated] = await sales();
  assert.equal(dated.creado_en.toISOString(), '2026-09-08T00:30:00.000Z');
  assert.equal(dated.fecha.toISOString().slice(0, 10), '2026-09-07');
  pass('sale date follows the restaurant local day when close time is on the next UTC date');

  await seed();
  await db.exec("update reservas_config set zona_horaria='Not/A_Timezone'");
  const beforeBadZone = await snapshot();
  await assert.rejects(() => close(), /ZONA_HORARIA_RENTABILIDAD_INVALIDA/);
  assert.deepEqual(await snapshot(), beforeBadZone);
  pass('invalid local timezone fails the whole close without orphan sales or consumption');

  await expectDenied('missing authenticated identity cannot enable capture', () => configure(true),
    "select set_config('test.user','',false)");
  await expectDenied('access to another restaurant cannot change capture configuration', () => configure(true),
    `select set_config('test.restaurant','${ids.foreignRestaurant}',false)`);
  await expectDenied('demo accounts cannot change capture configuration', () => configure(false),
    "select set_config('test.demo','yes',false)");
  await expectDenied('a product cannot be mapped to a dish from another tenant', () => map(ids.product, ids.otherDish));
  await expectDenied('a product from another tenant cannot be mapped to an accessible dish', () => map(ids.otherProduct, ids.dish));
  await expectDenied('disabled profitability module cannot change mappings', () => map(ids.product, null),
    'update restaurante_modulos set rentabilidad=false');
  await expectDenied('disabled QR module cannot enable profitability capture', () => configure(true),
    'update restaurante_modulos set camarero_digital=false');

  await seed();
  await assert.rejects(() => db.exec(`update carta_productos set restaurante_id='${ids.foreignRestaurant}'
    where id='${ids.product}'`), /foreign key constraint/);
  await assert.rejects(() => db.exec(`update platos set restaurante_id='${ids.foreignRestaurant}'
    where id='${ids.dish}'`), /foreign key constraint/);
  assert.equal((await db.query('select restaurante_id from qr_producto_plato')).rows[0].restaurante_id, ids.restaurant);
  pass('composite foreign keys block moving a mapped product or recipe into another tenant');

  await seed();
  await db.exec('set role authenticated');
  await map(ids.product, null);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from qr_producto_plato')).rows[0].n, 0);
  pass('authorized null mapping deliberately disconnects a product');

  await seed();
  await close();
  const beforeRls = await sales();
  await db.exec(`select set_config('test.restaurant','${ids.foreignRestaurant}',false); set role authenticated`);
  assert.equal((await sales()).length, 0);
  await db.exec(`reset role; select set_config('test.restaurant','${ids.restaurant}',false);
    update restaurante_modulos set rentabilidad=false; set role authenticated`);
  assert.equal((await sales()).length, 0);
  await db.exec('reset role');
  assert.deepEqual(await sales(), beforeRls);
  pass('sales RLS hides other tenants and denies reading after profitability module is disabled');

  await seed();
  await close();
  const beforeWrites = await sales();
  await db.exec('set role authenticated');
  for (const sql of [
    'update ventas_qr set ingreso_total=0',
    'delete from ventas_qr',
    'insert into ventas_qr select * from ventas_qr',
    'update qr_rentabilidad_config set activa=false',
    'delete from qr_producto_plato',
  ]) await assert.rejects(() => db.exec(sql), /permission denied|row-level security/);
  await db.exec('reset role');
  assert.deepEqual(await sales(), beforeWrites);
  pass('browser database role cannot forge or edit immutable sales, configuration or product mapping directly');

  await seed();
  await db.exec('set role anon');
  await assert.rejects(() => configure(true), /permission denied/);
  await assert.rejects(() => map(ids.product, ids.dish), /permission denied/);
  await assert.rejects(() => report(), /permission denied/);
  await assert.rejects(() => sales(), /permission denied/);
  await db.exec('reset role');
  pass('anonymous database role has no access to sales or either configuration RPC');

  await seed();
  await db.exec(`update pedido_qr_items set cantidad=1;
    insert into pedido_qr_items(id,pedido_id,nombre_producto,precio_unitario,cantidad)
      values('${ids.item2}','${ids.order}','Unmapped order item',20.15,1)`);
  await close();
  await db.exec('set role authenticated');
  const displayed = await report();
  assert.equal(displayed.rows.length, 2);
  assert.equal(displayed.has_more, false);
  assert.ok(Number.isFinite(Date.parse(displayed.snapshot)));
  assert.equal(displayed.rows[0].ingreso_total, '17.65');
  assert.equal(displayed.rows[0].coste_total, '2.00');
  assert.equal(displayed.rows[0].beneficio_total, '15.65');
  assert.equal(displayed.rows[1].ingreso_total, '17.65');
  assert.equal(displayed.rows[1].coste_total, null);
  assert.equal(displayed.rows[1].beneficio_total, null);
  assert.deepEqual((await report(ids.restaurant, '2026-09-07', '2026-09-08')).rows, []);
  assert.equal((await report(ids.restaurant, '2026-09-08', '2026-09-09')).rows.length, 2);
  await db.exec('reset role');
  pass('authorized report returns one consistent dated snapshot, actual income and explicit missing costs with exclusive end date');

  await seed();
  await close();
  // Deliberately owner-seeded transport boundary, not a supported high-value
  // linked close. Preserve every real table constraint and immutability guard.
  await db.exec(`insert into ventas_qr(id,restaurante_id,cierre_id,pedido_id,producto_id,
    nombre_producto,cantidad,precio_unitario,ingreso_bruto,descuento,ingreso_total,
    coste_unitario,coste_total,beneficio_total,estado_coste,fecha,creado_en)
    select '${ids.item2}',restaurante_id,cierre_id,pedido_id,producto_id,
      'Synthetic exact-decimal transport boundary',1,90071992547409.93,90071992547409.93,0,90071992547409.93,
      0.01,0.01,90071992547409.92,'calculado',fecha,creado_en from ventas_qr where id='${ids.item}'`);
  await db.exec('set role authenticated');
  const large = (await report()).rows.find(sale => sale.id === ids.item2);
  assert.equal(large.ingreso_total, '90071992547409.93');
  assert.equal(large.coste_total, '0.01');
  assert.equal(large.beneficio_total, '90071992547409.92');
  assert.equal(BigInt(large.ingreso_total.replace('.', '')), 9007199254740993n);
  await db.exec('reset role');
  pass('report transports monetary values beyond safe JavaScript integer cents as exact two-decimal strings');

  await seed();
  await db.exec('set role authenticated');
  await assert.rejects(() => report(ids.foreignRestaurant), /RENTABILIDAD_NO_AUTORIZADA/);
  await db.exec('reset role; update restaurante_modulos set rentabilidad=false; set role authenticated');
  await assert.rejects(() => report(), /RENTABILIDAD_NO_AUTORIZADA/);
  await db.exec("reset role; update restaurante_modulos set rentabilidad=true; select set_config('test.user','',false); set role authenticated");
  await assert.rejects(() => report(), /RENTABILIDAD_NO_AUTORIZADA/);
  await db.exec('reset role');
  pass('report explicitly rejects foreign restaurant, disabled module and absent identity instead of presenting false zero sales');

  await seed();
  await db.exec('set role authenticated');
  for (const [from, to] of [[null, '2026-09-08'], ['2026-09-08', null],
    ['2026-09-08', '2026-09-08'], ['2026-09-09', '2026-09-08'], ['2026-09-01', '2026-10-03']]) {
    await assert.rejects(() => report(ids.restaurant, from, to), /PERIODO_RENTABILIDAD_INVALIDO/);
  }
  await db.exec('reset role');
  pass('report rejects absent, reversed, empty and over-31-day periods');

  await seed();
  await db.exec(`create function public.fixture_profitability_reject_history() returns trigger language plpgsql as $$
    begin raise exception 'FIXTURE_HISTORY_FAILURE'; end $$;
    create trigger fixture_profitability_history_failure before insert on clientes_historial
      for each row execute function public.fixture_profitability_reject_history()`);
  const beforeFailure = await snapshot();
  await assert.rejects(() => close(), /FIXTURE_HISTORY_FAILURE/);
  assert.deepEqual(await snapshot(), beforeFailure);
  pass('downstream linked customer-history failure rolls back profitability sales, close, points and QR session together');

  console.log(`\n${passed} QR profitability SQL checks passed (reduced in-memory schema; no full-schema, browser or concurrency claim).`);
} catch (error) {
  console.error('FAIL', error.message);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await db.close();
}
