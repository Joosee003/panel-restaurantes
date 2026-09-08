// Isolated SQL fixtures only. Never connects to Supabase or production.
// node scripts/test-qr-close-sql.mjs /path/to/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const modulePath = process.argv[2];
if (!modulePath) throw new Error('Pass a local @electric-sql/pglite 0.5.8 module path.');
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite();
const draftSql = await readFile(new URL('../docs/sql/harden-qr-close.sql', import.meta.url), 'utf8');
const schema = `
  create schema auth; create schema app_private; create schema extensions;
  create role anon; create role authenticated;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('test.user', true), '')::uuid
  $$;
  create function public.user_can_access_restaurant(p_id uuid)
  returns boolean language sql stable as $$
    select auth.uid() = '10000000-0000-4000-8000-000000000001'::uuid
      and p_id::text = current_setting('test.restaurant', true)
  $$;
  create function app_private.assert_mutation_allowed() returns void
  language plpgsql as $$ begin
    if current_setting('test.demo', true) = 'yes' then raise exception 'DEMO_READ_ONLY'; end if;
  end $$;
  -- Local stand-in only: these tests do not verify pgcrypto randomness.
  create function extensions.gen_random_bytes(n integer) returns bytea
  language sql as $$ select decode(repeat('ab', n), 'hex') $$;
  create table sala_mesas (
    id uuid primary key, restaurante_id uuid not null, nombre text not null,
    qr_session_id uuid not null, qr_access_token text not null,
    qr_expires_at timestamptz not null default now() + interval '12 hours',
    activa boolean not null default true, bloqueada boolean not null default false,
    updated_at timestamptz not null default now()
  );
  create table restaurante_modulos (
    restaurante_id uuid primary key, camarero_digital boolean, estado text
  );
  create table pedidos_qr (
    id uuid primary key, restaurante_id uuid not null,
    mesa_id uuid not null references sala_mesas(id), mesa_session_id uuid not null,
    estado text not null default 'nuevo', total numeric not null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
  );
  create table cierres_mesa_qr (
    id uuid primary key default gen_random_uuid(), restaurante_id uuid not null,
    mesa_id uuid, mesa_session_id uuid, mesa text, pedidos_ids uuid[] not null,
    total_bruto numeric not null, descuento numeric not null, propina numeric not null,
    total_cobrado numeric not null, metodo_pago text not null, notas text
  );
  create table pedido_qr_items (
    id uuid primary key default gen_random_uuid(), pedido_id uuid not null references pedidos_qr(id) on delete cascade,
    producto_id uuid, nombre_producto text not null, precio_unitario numeric not null,
    cantidad integer not null default 1, notas text, created_at timestamptz not null default now()
  );
  create function public.cerrar_mesa_qr_segura(
    p_mesa_id uuid, p_pedidos_ids uuid[], p_descuento numeric default 0, p_propina numeric default 0,
    p_metodo_pago text default 'tarjeta', p_notas text default null
  ) returns jsonb language plpgsql security definer set search_path='' as $$ begin
    perform app_private.assert_mutation_allowed();
    return app_private.cerrar_mesa_qr_segura(p_mesa_id,p_pedidos_ids,p_descuento,p_propina,p_metodo_pago,p_notas);
  end $$;
  revoke all on function public.cerrar_mesa_qr_segura(uuid,uuid[],numeric,numeric,text,text) from public, anon;
  grant execute on function public.cerrar_mesa_qr_segura(uuid,uuid[],numeric,numeric,text,text) to authenticated;
  -- Deliberately generous table grants: guards must hold even where a historic
  -- table policy permits writes. Tenant RLS remains a separate production gate.
  grant usage on schema public, auth to authenticated;
  grant select, insert, update, delete on pedidos_qr, pedido_qr_items, cierres_mesa_qr, restaurante_modulos, sala_mesas to authenticated;
`;

const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  restaurant: '20000000-0000-4000-8000-000000000001',
  mesa: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
  first: '50000000-0000-4000-8000-000000000001',
  second: '50000000-0000-4000-8000-000000000002',
  cancelled: '50000000-0000-4000-8000-000000000003',
};
await db.exec(schema);
await db.exec(draftSql);
await db.exec(`create trigger pedidos_qr_enforce_session_limits before insert on pedidos_qr
  for each row execute function public.enforce_pedido_qr_session_limits()`);

async function seed() {
  await db.exec(`truncate cierres_mesa_qr, pedido_qr_items, pedidos_qr, sala_mesas, restaurante_modulos cascade;
    select set_config('test.user','${ids.user}',false);
    select set_config('test.restaurant','${ids.restaurant}',false);
    select set_config('test.demo','no',false);
    select set_config('app.allow_demo_write','',false);
    insert into restaurante_modulos values('${ids.restaurant}',true,'activo');
    insert into sala_mesas(id, restaurante_id, nombre, qr_session_id, qr_access_token)
      values('${ids.mesa}', '${ids.restaurant}', 'Fixture table', '${ids.session}', repeat('01',24));
    insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total,estado,created_at) values
      ('${ids.first}','${ids.restaurant}','${ids.mesa}','${ids.session}',10.10,'nuevo',now()-interval '2 minutes'),
      ('${ids.second}','${ids.restaurant}','${ids.mesa}','${ids.session}',30.20,'servido',now()-interval '2 minutes'),
      ('${ids.cancelled}','${ids.restaurant}','${ids.mesa}','${ids.session}',5,'cancelado',now()-interval '2 minutes');
    insert into pedido_qr_items(pedido_id,nombre_producto,precio_unitario,cantidad) values
      ('${ids.first}','Fixture first',10.10,1),('${ids.second}','Fixture second',15.10,2);`);
}
function call(overrides = {}) {
  const p = { mesa: ids.mesa, orders: [ids.first, ids.second], session: ids.session,
    total: '40.30', discount: '5', tip: '2', method: 'mixto', ...overrides };
  return db.query(`select public.cerrar_mesa_qr_validada($1::uuid,$2::uuid[],$3::uuid,
    $4::numeric,$5::numeric,$6::numeric,$7::text,$8::text) result`,
  [p.mesa,p.orders,p.session,p.total,p.discount,p.tip,p.method,'fixture']);
}
async function snapshot() {
  return (await db.query(`select
    (select count(*)::int from cierres_mesa_qr) closes,
    (select qr_session_id::text from sala_mesas limit 1) session,
    (select string_agg(id::text || ':' || estado, ',' order by id) from pedidos_qr) orders,
    (select jsonb_agg(to_jsonb(p) order by id) from pedidos_qr p) order_details,
    (select jsonb_agg(to_jsonb(i) order by id) from pedido_qr_items i) items,
    (select jsonb_agg(to_jsonb(c) order by id) from cierres_mesa_qr c) receipts`)).rows[0];
}
async function asRole(role, operation) {
  assert.ok(['authenticated','anon'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}
let passed = 0;
async function rejection(name, params, expected) {
  await seed();
  const before = await snapshot();
  await assert.rejects(() => call(params), expected);
  assert.deepEqual(await snapshot(), before, `${name}: rejected call must not write`);
  passed++; console.log(`PASS ${name}`);
}
try {
  await rejection('partial session rejected', {orders:[ids.first]}, /PEDIDOS_CAMBIADOS_ACTUALIZA/);
  await rejection('duplicate order rejected', {orders:[ids.first,ids.first,ids.second]}, /PEDIDOS_NO_VALIDOS/);
  await rejection('null order rejected', {orders:[ids.first,null,ids.second]}, /PEDIDOS_NO_VALIDOS/);
  await rejection('cancelled order rejected', {orders:[ids.first,ids.second,ids.cancelled]}, /PEDIDOS_CAMBIADOS_ACTUALIZA/);
  await rejection('empty order list rejected', {orders:[]}, /PEDIDOS_REQUERIDOS/);
  await rejection('stale session rejected', {session:ids.user}, /SESION_MESA_CAMBIADA/);
  await rejection('changed gross total rejected', {total:'40.29'}, /IMPORTE_CAMBIADO_ACTUALIZA/);
  await rejection('non-finite expected total rejected', {total:'NaN'}, /TOTAL_ESPERADO_INVALIDO/);
  await rejection('fractional cents rejected', {tip:'0.001'}, /IMPORTES_CIERRE_INVALIDOS/);
  await rejection('negative discount rejected', {discount:'-1'}, /IMPORTES_CIERRE_INVALIDOS/);
  await rejection('oversized discount rejected', {discount:'40.31'}, /IMPORTES_CIERRE_INVALIDOS/);
  await rejection('infinite tip rejected', {tip:'Infinity'}, /IMPORTES_CIERRE_INVALIDOS/);
  await rejection('unknown payment method rejected', {method:'unverified'}, /METODO_PAGO_INVALIDO/);

  for (const [name,key,value,error] of [
    ['anonymous caller','test.user','',/AUTH_REQUIRED/],
    ['unknown signed-in user','test.user',ids.session,/MESA_NO_AUTORIZADA/],
    ['wrong restaurant','test.restaurant',ids.user,/MESA_NO_AUTORIZADA/],
    ['demo caller','test.demo','yes',/DEMO_READ_ONLY/],
  ]) {
    await seed(); const before=await snapshot();
    await db.query('select set_config($1,$2,false)',[key,value]);
    await assert.rejects(()=>call(),error);
    assert.deepEqual(await snapshot(),before);
    passed++; console.log(`PASS ${name}`);
  }

  await seed();
  const result=(await call({orders:[ids.second,ids.first]})).rows[0].result;
  assert.equal(result.ok,true); assert.equal(Number(result.total_cobrado),37.30);
  const after=await snapshot(); assert.equal(after.closes,1); assert.notEqual(after.session,ids.session);
  assert.match(after.orders,new RegExp(`${ids.cancelled}:cancelado`));
  assert.match(after.orders,new RegExp(`${ids.first}:cobrado`));
  await assert.rejects(()=>call(),/SESION_MESA_CAMBIADA/);
  assert.deepEqual(await snapshot(),after);
  passed++; console.log('PASS full close writes once and repeated response cannot close again');

  await assert.rejects(()=>db.query(`insert into pedidos_qr
    (id,restaurante_id,mesa_id,mesa_session_id,total) values(gen_random_uuid(),$1,$2,$3,1)`,
    [ids.restaurant,ids.mesa,ids.session]),/SESION_MESA_NO_VALIDA/);
  assert.deepEqual(await snapshot(),after);
  passed++; console.log('PASS order created from stale session cannot be inserted after close');

  await seed();
  await assert.rejects(()=>db.query(`insert into pedidos_qr
    (id,restaurante_id,mesa_id,mesa_session_id,total) values(gen_random_uuid(),$1,$2,$3,1)`,
    [ids.user,ids.mesa,ids.session]),/SESION_MESA_NO_VALIDA/);
  passed++; console.log('PASS order cannot cross restaurant boundary');

  for (let i=0;i<5;i++) await db.query(`insert into pedidos_qr
    (id,restaurante_id,mesa_id,mesa_session_id,total) values(gen_random_uuid(),$1,$2,$3,1)`,
    [ids.restaurant,ids.mesa,ids.session]);
  await assert.rejects(()=>db.query(`insert into pedidos_qr
    (id,restaurante_id,mesa_id,mesa_session_id,total) values(gen_random_uuid(),$1,$2,$3,1)`,
    [ids.restaurant,ids.mesa,ids.session]),/DEMASIADOS_PEDIDOS/);
  passed++; console.log('PASS existing per-minute limit preserved');

  const grants=(await db.query(`select
    has_function_privilege('anon','public.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)','execute') anon,
    has_function_privilege('authenticated','public.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)','execute') authenticated,
    has_function_privilege('authenticated','app_private.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)','execute') private_body`)).rows[0];
  assert.deepEqual(grants,{anon:false,authenticated:true,private_body:true});
  passed++; console.log('PASS function grants restrict public and private entry points');

  await seed();
  await db.exec('set role anon');
  await assert.rejects(()=>call(),/permission denied/);
  await db.exec('reset role');
  assert.equal((await snapshot()).closes,0);
  passed++; console.log('PASS actual anon role cannot execute public close');

  await db.exec('set role authenticated');
  assert.equal((await call()).rows[0].result.ok,true);
  await db.exec('reset role');
  assert.equal((await snapshot()).closes,1);
  passed++; console.log('PASS authenticated invoker can delegate to guarded private body');

  await seed();
  await db.query("select set_config('test.user',$1,false)",[ids.session]);
  await db.exec('set role authenticated');
  await assert.rejects(()=>call(),/MESA_NO_AUTORIZADA/);
  await db.exec('reset role');
  assert.equal((await snapshot()).closes,0);
  passed++; console.log('PASS actual authenticated role with unknown user is rejected');

  for (const [name,setup] of [
    ['disabled module',"update restaurante_modulos set camarero_digital=false"],
    ['null module flag',"update restaurante_modulos set camarero_digital=null"],
    ['inactive module row',"update restaurante_modulos set estado='inactivo'"],
    ['null module status',"update restaurante_modulos set estado=null"],
    ['missing module row','delete from restaurante_modulos'],
  ]) {
    await seed(); await db.exec(setup); const before = await snapshot();
    await assert.rejects(()=>asRole('authenticated',()=>call()),/CAMARERO_DIGITAL_NO_ACTIVO/);
    await assert.rejects(()=>asRole('authenticated',()=>db.query(`select public.cerrar_mesa_qr_segura(
      $1::uuid,$2::uuid[],0,0,'efectivo',null)`,[ids.mesa,[ids.first,ids.second]])),/CAMARERO_DIGITAL_NO_ACTIVO/);
    await assert.rejects(()=>db.query(`insert into pedidos_qr
      (id,restaurante_id,mesa_id,mesa_session_id,total) values(gen_random_uuid(),$1,$2,$3,1)`,
      [ids.restaurant,ids.mesa,ids.session]),/CAMARERO_DIGITAL_NO_ACTIVO/);
    await assert.rejects(()=>asRole('authenticated',()=>db.query("update pedidos_qr set estado='preparando' where id=$1",[ids.first])),/CAMARERO_DIGITAL_NO_ACTIVO/);
    await assert.rejects(()=>asRole('authenticated',()=>db.query("update pedido_qr_items set notas='disabled' where pedido_id=$1",[ids.first])),/CAMARERO_DIGITAL_NO_ACTIVO/);
    assert.deepEqual(await snapshot(),before);
    passed++; console.log(`PASS ${name} blocks both close APIs, new orders, kitchen and item writes`);
  }

  await seed();
  for (const state of ['preparando','listo','servido']) {
    await asRole('authenticated',()=>db.query('update pedidos_qr set estado=$1 where id=$2',[state,ids.first]));
  }
  await asRole('authenticated',()=>db.query("update pedido_qr_items set notas='sin sal' where pedido_id=$1",[ids.first]));
  assert.equal((await db.query('select estado from pedidos_qr where id=$1',[ids.first])).rows[0].estado,'servido');
  assert.equal((await db.query('select notas from pedido_qr_items where pedido_id=$1',[ids.first])).rows[0].notas,'sin sal');
  passed++; console.log('PASS active kitchen statuses and open-order item notes remain editable');

  for (const [name,sql,error] of [
    ['changed item price',"update pedido_qr_items set precio_unitario=1 where pedido_id=$1",/IMPORTE_PEDIDO_DESCUADRADO/],
    ['changed item quantity',"update pedido_qr_items set cantidad=2 where pedido_id=$1",/IMPORTE_PEDIDO_DESCUADRADO/],
    ['missing items','delete from pedido_qr_items where pedido_id=$1',/IMPORTE_PEDIDO_DESCUADRADO/],
    ['zero quantity',"update pedido_qr_items set cantidad=0 where pedido_id=$1",/LINEA_PEDIDO_INVALIDA/],
    ['negative quantity',"update pedido_qr_items set cantidad=-1 where pedido_id=$1",/LINEA_PEDIDO_INVALIDA/],
    ['negative line price',"update pedido_qr_items set precio_unitario=-1 where pedido_id=$1",/LINEA_PEDIDO_INVALIDA/],
    ['non-finite line price',"update pedido_qr_items set precio_unitario='NaN' where pedido_id=$1",/LINEA_PEDIDO_INVALIDA/],
    ['fractional line cents',"update pedido_qr_items set precio_unitario=10.101 where pedido_id=$1",/LINEA_PEDIDO_INVALIDA/],
  ]) {
    await seed(); await asRole('authenticated',()=>db.query(sql,[ids.first]));
    const before=await snapshot();
    await assert.rejects(()=>asRole('authenticated',()=>call()),error);
    assert.deepEqual(await snapshot(),before);
    passed++; console.log(`PASS ${name} cannot be recorded as a matching bill`);
  }
  await seed();
  await asRole('authenticated',()=>db.query('delete from pedidos_qr where id=$1',[ids.first]));
  assert.equal((await db.query('select count(*)::int n from pedido_qr_items where pedido_id=$1',[ids.first])).rows[0].n,0);
  passed++; console.log('PASS permitted open-order deletion preserves its item cascade');

  // Direct API writes have deliberately broad grants above. The SQL boundary,
  // not a hidden UI button, must reject fabricated payment state and receipts.
  await seed();
  let before=await snapshot();
  await assert.rejects(()=>asRole('authenticated',()=>db.query("update pedidos_qr set estado='cobrado' where id=$1",[ids.first])),/CIERRE_QR_SOLO_RPC/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query(`insert into pedidos_qr
    (id,restaurante_id,mesa_id,mesa_session_id,total,estado) values(gen_random_uuid(),$1,$2,$3,1,'cerrado')`,
    [ids.restaurant,ids.mesa,ids.session])),/CIERRE_QR_SOLO_RPC/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query(`insert into cierres_mesa_qr
    (restaurante_id,pedidos_ids,total_bruto,descuento,propina,total_cobrado,metodo_pago)
    values($1,$2,10.10,0,0,10.10,'efectivo')`,[ids.restaurant,[ids.first]])),/CIERRE_QR_SOLO_RPC/);
  assert.deepEqual(await snapshot(),before);
  passed++; console.log('PASS authenticated cannot fabricate receipt, paid order or direct paid transition');

  await seed();
  await asRole('authenticated',()=>call());
  before=await snapshot();
  for (const [name,sql,params,error] of [
    ['reopen paid order',"update pedidos_qr set estado='nuevo' where id=$1",[ids.first],/PEDIDO_QR_FINALIZADO/],
    ['edit paid amount','update pedidos_qr set total=0 where id=$1',[ids.first],/CIERRE_QR_SOLO_RPC|PEDIDO_QR_FINALIZADO/],
    ['delete paid order','delete from pedidos_qr where id=$1',[ids.first],/PEDIDO_QR_FINALIZADO/],
    ['edit paid item','update pedido_qr_items set precio_unitario=0 where pedido_id=$1',[ids.first],/PEDIDO_QR_FINALIZADO/],
    ['delete paid item','delete from pedido_qr_items where pedido_id=$1',[ids.first],/PEDIDO_QR_FINALIZADO/],
    ['add paid item',`insert into pedido_qr_items(pedido_id,nombre_producto,precio_unitario) values($1,'late',1)`,[ids.first],/PEDIDO_QR_FINALIZADO/],
    ['move paid item','update pedido_qr_items set pedido_id=$1 where pedido_id=$2',[ids.cancelled,ids.first],/ITEM_QR_IDENTIDAD_INMUTABLE/],
    ['edit receipt','update cierres_mesa_qr set total_cobrado=0',[],/CIERRE_QR_INMUTABLE/],
    ['delete receipt','delete from cierres_mesa_qr',[],/CIERRE_QR_INMUTABLE/],
  ]) {
    await assert.rejects(()=>asRole('authenticated',()=>db.query(sql,params)),error);
    assert.deepEqual(await snapshot(),before);
    passed++; console.log(`PASS ${name} rejected with all records unchanged`);
  }
  await assert.rejects(()=>db.query("update pedidos_qr set total=0 where id=$1",[ids.first]),/PEDIDO_QR_FINALIZADO/);
  await assert.rejects(()=>db.query("delete from pedido_qr_items where pedido_id=$1",[ids.first]),/PEDIDO_QR_FINALIZADO/);
  passed++; console.log('PASS SQL owner also cannot edit already final order or its item');

  await seed(); before=await snapshot();
  await assert.rejects(()=>asRole('authenticated',()=>db.query('update pedidos_qr set restaurante_id=$1 where id=$2',[ids.user,ids.first])),/PEDIDO_QR_IDENTIDAD_INMUTABLE/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query('update pedido_qr_items set pedido_id=$1 where pedido_id=$2',[ids.second,ids.first])),/ITEM_QR_IDENTIDAD_INMUTABLE/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query("update pedidos_qr set estado='nuevo' where id=$1",[ids.cancelled])),/PEDIDO_QR_FINALIZADO/);
  assert.deepEqual(await snapshot(),before);
  passed++; console.log('PASS immutable parent identity and cancelled-order no-reopen');

  await seed();
  const legacyResult=await asRole('authenticated',()=>db.query(`select public.cerrar_mesa_qr_segura(
    $1::uuid,$2::uuid[],0,0,'efectivo',null) result`,[ids.mesa,[ids.first,ids.second]]));
  assert.equal(legacyResult.rows[0].result.ok,true);
  assert.equal((await snapshot()).closes,1);
  passed++; console.log('PASS deployed legacy wrapper still completes one protected atomic close');

  await seed();
  await db.exec('begin; savepoint qr_nested_call');
  assert.equal((await asRole('authenticated',()=>call())).rows[0].result.ok,true);
  await db.exec('release savepoint qr_nested_call; commit');
  assert.equal((await snapshot()).closes,1);
  passed++; console.log('PASS close remains valid inside a subtransaction');

  // The real public creation RPC writes header -> items -> final total. This
  // fixture checks those same writes under a definer with an anonymous caller;
  // token, menu and product validation remain outside this reduced fixture.
  await db.exec(`create function public.fixture_create_qr() returns uuid
    language plpgsql security definer set search_path='' as $$
    declare v_id uuid := gen_random_uuid(); begin
      insert into public.pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total)
        values(v_id,'${ids.restaurant}','${ids.mesa}','${ids.session}',0);
      insert into public.pedido_qr_items(pedido_id,nombre_producto,precio_unitario,cantidad)
        values(v_id,'Fixture create',4.50,2);
      update public.pedidos_qr set total=9 where id=v_id;
      return v_id;
    end $$;
    grant usage on schema public to anon;
    grant execute on function public.fixture_create_qr() to anon;`);
  await seed();
  await db.query("select set_config('test.user','',false)");
  const created=(await asRole('anon',()=>db.query('select public.fixture_create_qr() id'))).rows[0].id;
  assert.equal(Number((await db.query('select total from pedidos_qr where id=$1',[created])).rows[0].total),9);
  passed++; console.log('PASS anonymous definer creation preserves header, items and final-total write sequence');

  // Known production demo RPC refreshes dates of exactly four synthetic orders.
  // Its definer may refresh dates, but the same GUC cannot grant an API caller
  // permission to change even those rows, much less a paid customer order.
  const demoRestaurant='de000000-0000-4000-8000-000000000002';
  const demoOrder='de000000-0000-4000-8000-000000000601';
  await seed();
  await db.exec(`insert into restaurante_modulos values('${demoRestaurant}',true,'activo');
    insert into sala_mesas(id,restaurante_id,nombre,qr_session_id,qr_access_token)
      values('${ids.user}','${demoRestaurant}','Demo fixture','${ids.session}',repeat('02',24));
    insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total,estado,created_at)
      values('${demoOrder}','${demoRestaurant}','${ids.user}','${ids.session}',12,'cancelado',now()-interval '3 days');
    create function public.refresh_demo_dates() returns void language plpgsql security definer set search_path='' as $$ begin
      if current_setting('test.demo',true) <> 'yes' then raise exception 'DEMO_ONLY'; end if;
      perform set_config('app.allow_demo_write','1',true);
      update public.pedidos_qr set created_at=now()-interval '12 minutes',updated_at=now()
        where id='${demoOrder}'::uuid and restaurante_id='${demoRestaurant}'::uuid;
    end $$;
    grant execute on function public.refresh_demo_dates() to authenticated;
    select set_config('test.demo','yes',false);`);
  const demoBefore=(await db.query('select estado,total,created_at from pedidos_qr where id=$1',[demoOrder])).rows[0];
  await asRole('authenticated',()=>db.query('select public.refresh_demo_dates()'));
  const demoAfter=(await db.query('select estado,total,created_at from pedidos_qr where id=$1',[demoOrder])).rows[0];
  assert.equal(demoAfter.estado,demoBefore.estado); assert.equal(demoAfter.total,demoBefore.total);
  assert.notEqual(demoAfter.created_at.getTime(),demoBefore.created_at.getTime());
  passed++; console.log('PASS known demo definer may refresh only dates of fixed synthetic orders');
  before=await snapshot();
  await db.query("select set_config('app.allow_demo_write','1',false)");
  await assert.rejects(()=>asRole('authenticated',()=>db.query('update pedidos_qr set created_at=now() where id=$1',[demoOrder])),/DEMO_READ_ONLY/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query('update pedidos_qr set total=0 where id=$1',[demoOrder])),/DEMO_READ_ONLY/);
  await assert.rejects(()=>asRole('authenticated',()=>db.query("update pedidos_qr set estado='nuevo' where id=$1",[demoOrder])),/DEMO_READ_ONLY/);
  assert.deepEqual(await snapshot(),before);
  passed++; console.log('PASS spoofed demo GUC cannot grant API timestamp, amount or reopen writes');
  await db.query("select set_config('test.demo','no',false)");
  await asRole('authenticated',()=>call());
  before=await snapshot();
  await assert.rejects(()=>db.query('update pedidos_qr set created_at=now() where id=$1',[ids.first]),/PEDIDO_QR_FINALIZADO/);
  assert.deepEqual(await snapshot(),before);
  passed++; console.log('PASS demo GUC cannot bypass paid customer-order immutability even as SQL owner');

  // New functions made by the migration creator must not inherit PUBLIC EXECUTE.
  await db.exec(`create function app_private.fixture_future_definer() returns integer
    language sql security definer set search_path='' as $$ select 1 $$`);
  assert.equal((await db.query(`select has_function_privilege('authenticated',
    'app_private.fixture_future_definer()','execute') allowed`)).rows[0].allowed,false);
  passed++; console.log('PASS future definer has no implicit PUBLIC execute');

  // Independent database proves a drift failure rolls back ALL preceding DDL,
  // including new function definitions and grants. No production connection.
  const guardDb = new PGlite();
  try {
    await guardDb.exec(schema);
    await guardDb.exec(`create function app_private.fixture_unsafe_definer() returns integer
      language sql security definer set search_path='' as $$ select 1 $$`);
    const inspect = () => guardDb.query(`select
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('app_private','public')) function_count,
      (select nspacl::text from pg_namespace where nspname='app_private') schema_acl,
      (select count(*)::int from pg_default_acl) defaults_count,
      to_regprocedure('public.cerrar_mesa_qr_validada(uuid,uuid[],uuid,numeric,numeric,numeric,text,text)')::text wrapper`);
    const before=(await inspect()).rows[0];
    await assert.rejects(()=>guardDb.exec(draftSql),/APP_PRIVATE_PRIVILEGES_UNSAFE/);
    await guardDb.exec('rollback');
    assert.deepEqual((await inspect()).rows[0],before);
    passed++; console.log('PASS unrelated PUBLIC-executable definer aborts and rolls back all draft DDL');

    // Also reject execution inherited through another role, with no PUBLIC grant.
    await guardDb.exec(`revoke execute on function app_private.fixture_unsafe_definer() from public;
      create role fixture_parent;
      grant fixture_parent to authenticated;
      grant execute on function app_private.fixture_unsafe_definer() to fixture_parent;`);
    const inheritedBefore=(await inspect()).rows[0];
    await assert.rejects(()=>guardDb.exec(draftSql),/APP_PRIVATE_PRIVILEGES_UNSAFE/);
    await guardDb.exec('rollback');
    assert.deepEqual((await inspect()).rows[0],inheritedBefore);
    passed++; console.log('PASS inherited execute privilege also aborts and rolls back draft DDL');
  } finally { await guardDb.close(); }
  console.log(`${passed} SQL fixture checks passed. Real two-connection concurrency and production schema tests remain pending.`);
} finally { await db.close(); }
