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
  await db.exec(`truncate cierres_mesa_qr, pedidos_qr, sala_mesas cascade;
    select set_config('test.user','${ids.user}',false);
    select set_config('test.restaurant','${ids.restaurant}',false);
    select set_config('test.demo','no',false);
    insert into sala_mesas(id, restaurante_id, nombre, qr_session_id, qr_access_token)
      values('${ids.mesa}', '${ids.restaurant}', 'Fixture table', '${ids.session}', repeat('01',24));
    insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total,estado,created_at) values
      ('${ids.first}','${ids.restaurant}','${ids.mesa}','${ids.session}',10.10,'nuevo',now()-interval '2 minutes'),
      ('${ids.second}','${ids.restaurant}','${ids.mesa}','${ids.session}',30.20,'servido',now()-interval '2 minutes'),
      ('${ids.cancelled}','${ids.restaurant}','${ids.mesa}','${ids.session}',5,'cancelado',now()-interval '2 minutes');`);
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
    (select string_agg(id::text || ':' || estado, ',' order by id) from pedidos_qr) orders`)).rows[0];
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
