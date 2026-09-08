// Isolated PostgreSQL fixture tests. No connection to Supabase or client data.
// Usage: node scripts/test-qr-reservation-sql.mjs /path/to/pglite/dist/index.js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const modulePath=process.argv[2];
if(!modulePath) throw new Error('Pass the local PGlite 0.5.8 module path.');
const {PGlite}=await import(pathToFileURL(resolve(modulePath)).href);
const db=new PGlite();
const ids={user:'10000000-0000-4000-8000-000000000001',restaurant:'20000000-0000-4000-8000-000000000001',
  mesa:'30000000-0000-4000-8000-000000000001',session:'40000000-0000-4000-8000-000000000001',
  order:'50000000-0000-4000-8000-000000000001',reservation:'60000000-0000-4000-8000-000000000001',
  client:'70000000-0000-4000-8000-000000000001',operation:'80000000-0000-4000-8000-000000000001'};
const schema=`
create schema auth; create schema app_private; create schema extensions;
create role anon; create role authenticated;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.user',true),'')::uuid $$;
create function public.user_can_access_restaurant(p_id uuid) returns boolean language sql stable as $$
  select auth.uid()='${ids.user}'::uuid and p_id::text=current_setting('test.restaurant',true) $$;
create function app_private.assert_mutation_allowed() returns void language plpgsql as $$ begin
  if current_setting('test.demo',true)='yes' then raise exception 'DEMO_READ_ONLY'; end if; end $$;
-- Stand-in bytes only. Cryptographic quality is outside these SQL tests.
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$
  select decode(repeat('ab',n),'hex') $$;
create table restaurantes(id uuid primary key,puntos_activo boolean,puntos_por_euro numeric);
create table restaurante_modulos(restaurante_id uuid primary key,camarero_digital boolean,estado text,
  reservas boolean,clientes boolean,fidelizacion boolean);
create table reservas_config(restaurante_id uuid primary key,zona_horaria text,duracion_minutos int);
create table sala_mesas(id uuid primary key,restaurante_id uuid not null,nombre text not null,
  qr_session_id uuid not null,qr_access_token text not null,qr_expires_at timestamptz default now()+interval '12 hours',
  activa boolean default true,bloqueada boolean default false,updated_at timestamptz default now());
create table pedidos_qr(id uuid primary key,restaurante_id uuid not null,mesa_id uuid references sala_mesas,
  mesa_session_id uuid not null,estado text default 'nuevo',total numeric,
  created_at timestamptz default now(),updated_at timestamptz default now());
create table pedido_qr_items(id uuid primary key,pedido_id uuid references pedidos_qr,producto_id uuid,
  nombre_producto text,precio_unitario numeric,cantidad int,notas text,created_at timestamptz default now());
create table cierres_mesa_qr(id uuid primary key default gen_random_uuid(),restaurante_id uuid not null,
  mesa_id uuid,mesa_session_id uuid,mesa text,pedidos_ids uuid[],total_bruto numeric,descuento numeric,
  propina numeric,total_cobrado numeric,metodo_pago text,notas text);
create table clientes(id uuid primary key default gen_random_uuid(),restaurante_id uuid,nombre text,
  telefono text,email text,origen_principal text,canal_contacto text,puntos_totales int default 0,
  visitas_totales int default 0,permite_whatsapp boolean default false,permite_email boolean default false,
  primera_visita timestamptz,ultima_visita timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
create table reservas(id uuid primary key,restaurante_id uuid,mesa_id uuid,cliente_id uuid,
  nombre_cliente text,telefono text,email text,origen text,estado text,atendida boolean,
  personas int,turno text,inicio_at timestamptz,fin_at timestamptz,fecha_hora_reserva timestamp,
  consumo_total numeric,consumo_registrado_en timestamptz,puntos_generados int,consumo_metodo_pago text,
  consumo_notas text,notas text,updated_at timestamptz default now(),resena_solicitada boolean default false);
create table clientes_historial(id uuid primary key default gen_random_uuid(),restaurante_id uuid,
  cliente_id uuid,reserva_id uuid unique,tipo text,descripcion text,personas int,gasto_eur numeric,
  turno text,created_at timestamptz default now());
create table puntos_movimientos(id uuid primary key default gen_random_uuid(),restaurante_id uuid,
  cliente_id uuid,tipo text,puntos int,referencia text,nota text,
  unique(restaurante_id,referencia));
create view puntos_saldos as select restaurante_id,cliente_id,sum(puntos)::int puntos
  from puntos_movimientos group by restaurante_id,cliente_id;
create table fidelizacion_config(restaurante_id uuid primary key,puntos_por_euro numeric);
create table cliente_notificaciones(id uuid default gen_random_uuid(),restaurante_id uuid,
  cliente_id uuid,tipo text,titulo text,mensaje text,url text,leida boolean);
-- Live visit increment trigger logic, represented locally with explicit schema.
create function public.actualizar_visitas_cliente() returns trigger language plpgsql as $$ begin
  update public.clientes set visitas_totales=visitas_totales+1,ultima_visita=new.created_at,
  primera_visita=coalesce(primera_visita,new.created_at) where id=new.cliente_id; return new; end $$;
create trigger trg_actualizar_visitas_cliente after insert on clientes_historial
  for each row execute function public.actualizar_visitas_cliente();
`;
let passed=0;
async function seed(){
  await db.exec(`reset role; truncate app_private.qr_cierre_operaciones,cierres_mesa_qr,
    pedido_qr_items,pedidos_qr,sala_mesas,clientes_historial,reservas,clientes,puntos_movimientos,
    cliente_notificaciones,fidelizacion_config,reservas_config,restaurante_modulos,restaurantes cascade;
    select set_config('test.user','${ids.user}',false);
    select set_config('test.restaurant','${ids.restaurant}',false);
    select set_config('test.demo','no',false);
    insert into restaurantes values('${ids.restaurant}',true,2);
    insert into restaurante_modulos values('${ids.restaurant}',true,'activo',true,true,true);
    insert into reservas_config values('${ids.restaurant}','Europe/Madrid',90);
    insert into sala_mesas(id,restaurante_id,nombre,qr_session_id,qr_access_token)
      values('${ids.mesa}','${ids.restaurant}','Fixture table','${ids.session}','fixture-token');
    insert into pedidos_qr(id,restaurante_id,mesa_id,mesa_session_id,total,created_at)
      values('${ids.order}','${ids.restaurant}','${ids.mesa}','${ids.session}',40.30,now()-interval '10 minutes');
    insert into pedido_qr_items(id,pedido_id,nombre_producto,precio_unitario,cantidad)
      values(gen_random_uuid(),'${ids.order}','Fixture item',20.15,2);
    insert into clientes(id,restaurante_id,nombre) values('${ids.client}','${ids.restaurant}','Fixture client');
    insert into reservas(id,restaurante_id,mesa_id,cliente_id,estado,inicio_at,fin_at,personas,turno)
      values('${ids.reservation}','${ids.restaurant}','${ids.mesa}','${ids.client}','confirmada',
        now()-interval '30 minutes',now()+interval '60 minutes',2,'comida');`);
}
function call(options={}){
  const p={operation:ids.operation,mesa:ids.mesa,orders:[ids.order],session:ids.session,total:'40.30',
    discount:'5',tip:'2',method:'mixto',notes:'fixture',reservation:ids.reservation,...options};
  return db.query(`select public.cerrar_mesa_qr_con_reserva($1::uuid,$2::uuid,$3::uuid[],$4::uuid,
    $5::numeric,$6::numeric,$7::numeric,$8::text,$9::text,$10::uuid) result`,
  [p.operation,p.mesa,p.orders,p.session,p.total,p.discount,p.tip,p.method,p.notes,p.reservation]);
}
async function snapshot(){return (await db.query(`select
  (select count(*)::int from cierres_mesa_qr) closes,
  (select count(*)::int from app_private.qr_cierre_operaciones) operations,
  (select count(*)::int from clientes_historial) visits,
  (select count(*)::int from puntos_movimientos) movements,
  (select coalesce(sum(puntos),0)::int from puntos_movimientos) points,
  (select count(*)::int from cliente_notificaciones) notifications,
  (select jsonb_agg(to_jsonb(r) order by id) from reservas r) reservations,
  (select jsonb_agg(to_jsonb(c) order by id) from clientes c) clients,
  (select qr_session_id::text from sala_mesas where id='${ids.mesa}') session,
  (select estado from pedidos_qr where id='${ids.order}') status`).then(r=>r.rows[0]));}
async function rejects(name,params,error,setup=''){
  await seed(); if(setup)await db.exec(setup); const before=await snapshot();
  await assert.rejects(()=>call(params),error);
  assert.deepEqual(await snapshot(),before,`${name}: everything rolls back`);
  passed++;console.log(`PASS ${name}`);
}
function pass(name){passed++;console.log(`PASS ${name}`);}
try{
  await db.exec(schema);
  await db.exec(await readFile(new URL('../docs/sql/harden-qr-close.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260906143000_guard_loyalty_history_trigger.sql',import.meta.url),'utf8'));
  await db.exec(`create trigger trg_historial_gasto_a_puntos after insert on clientes_historial
    for each row execute function public.trg_clientes_historial_gasto_a_puntos();`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260906142000_guard_loyalty_points_when_module_disabled.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../docs/sql/connect-qr-reservation.sql',import.meta.url),'utf8'));
  await seed();
  await db.exec('set role authenticated');
  const first=(await call()).rows[0].result;
  await db.exec('reset role');
  assert.equal(first.ok,true);assert.equal(first.replayed,false);
  assert.equal(Number(first.total_cobrado),37.3);assert.equal(Number(first.consumo_total),35.3);
  assert.equal(first.puntos_generados,70);assert.equal(first.cliente_id,ids.client);
  const closed=await snapshot();
  assert.equal(closed.closes,1);assert.equal(closed.operations,1);assert.equal(closed.visits,1);
  assert.equal(closed.movements,1);assert.equal(closed.points,70);assert.equal(closed.status,'cobrado');
  assert.equal(closed.clients[0].visitas_totales,1);
  assert.equal(closed.clients[0].permite_email,false);assert.equal(closed.clients[0].permite_whatsapp,false);
  pass('authorized close atomically records net spend, one visit and one points movement, with no contact consent');
  const replay=(await call()).rows[0].result;
  assert.equal(replay.cierre_id,first.cierre_id);assert.equal(replay.replayed,true);
  assert.deepEqual(await snapshot(),closed);pass('lost response retry returns same close without repeating visit, points or token rotation');
  await assert.rejects(()=>call({tip:'3'}),/OPERACION_REUTILIZADA_CON_OTROS_DATOS/);
  assert.deepEqual(await snapshot(),closed);pass('same operation cannot use another payment payload');
  await assert.rejects(()=>call({operation:ids.user}),/CONSUMO_PREVIO_REQUIERE_REVISION/);
  assert.deepEqual(await snapshot(),closed);pass('new operation cannot duplicate a linked reservation');
  const manual=(await db.query(`select public.registrar_consumo_reserva_interno($1,$2,35.30,'tarjeta',null) r`,
    [ids.reservation,ids.restaurant])).rows[0].r;
  assert.equal(manual.ok,false);assert.equal(manual.error,'CONSUMO_YA_REGISTRADO');
  assert.deepEqual(await snapshot(),closed);pass('existing manual consumption API cannot add a second visit after QR close');
  await assert.rejects(()=>db.exec(`update reservas set consumo_total=1 where id='${ids.reservation}'`),/CONSUMO_QR_REQUIERE_AJUSTE/);
  await assert.rejects(()=>db.exec(`update reservas set cliente_id=null where id='${ids.reservation}'`),/CONSUMO_QR_REQUIERE_AJUSTE/);
  await assert.rejects(()=>db.exec(`delete from clientes_historial where reserva_id='${ids.reservation}'`),/CONSUMO_QR_REQUIERE_AJUSTE/);
  assert.deepEqual(await snapshot(),closed);pass('linked historical spend and customer assignment cannot be reset or deleted');
  await db.exec(`update reservas set notas='Permitted operational note' where id='${ids.reservation}'`);
  pass('operational notes remain editable after linked close');

  await rejects('anonymous caller',{},/AUTH_REQUIRED/,"select set_config('test.user','',false)");
  await rejects('demo caller',{},/DEMO_READ_ONLY/,"select set_config('test.demo','yes',false)");
  await rejects('wrong restaurant access',{},/MESA_NO_AUTORIZADA/,`select set_config('test.restaurant','${ids.user}',false)`);
  await rejects('missing operation key',{operation:null},/OPERACION_REQUERIDA/);
  await rejects('disabled QR module',{},/QR_MODULE_DISABLED/,`update restaurante_modulos set camarero_digital=false`);
  await rejects('inactive restaurant module row',{},/QR_MODULE_DISABLED/,`update restaurante_modulos set estado='inactivo'`);
  await rejects('disabled reservations',{},/RESERVAS_CLIENTES_NO_ACTIVOS/,`update restaurante_modulos set reservas=false`);
  await rejects('disabled clients',{},/RESERVAS_CLIENTES_NO_ACTIVOS/,`update restaurante_modulos set clientes=false`);
  await rejects('other reservation tenant',{},/RESERVA_NO_AUTORIZADA/,`update reservas set restaurante_id='${ids.user}'`);
  await rejects('other assigned table',{},/RESERVA_MESA_DISTINTA/,`update reservas set mesa_id='${ids.user}'`);
  for(const state of ['cancelada','no-show','no_show','no show','desconocido'])
    await rejects(`reservation state ${state}`,{},/RESERVA_ESTADO_NO_VALIDO/,`update reservas set estado='${state}'`);
  await rejects('existing manual spend',{},/CONSUMO_PREVIO_REQUIERE_REVISION/,`select registrar_consumo_reserva_interno('${ids.reservation}','${ids.restaurant}',10,'efectivo',null)`);
  await rejects('prior orphan visit',{},/CONSUMO_PREVIO_REQUIERE_REVISION/,`insert into clientes_historial(cliente_id,restaurante_id,reserva_id,tipo,gasto_eur)
    values('${ids.client}','${ids.restaurant}','${ids.reservation}','visita',10)`);
  await rejects('unassigned client',{},/RESERVA_SIN_CLIENTE_ASIGNADO/,`update reservas set cliente_id=null`);
  await rejects('client from another tenant',{},/CLIENTE_RESERVA_NO_VALIDO/,`update clientes set restaurante_id='${ids.user}'`);
  await rejects('future service',{},/RESERVA_FUERA_DE_SERVICIO/,`update reservas set inicio_at=now()+interval '1 hour',fin_at=now()+interval '2 hours'`);
  await rejects('past service',{},/RESERVA_FUERA_DE_SERVICIO/,`update reservas set fin_at=now()-interval '1 minute'`);
  await seed();await db.exec('begin; update reservas set fin_at=now()');
  await assert.rejects(()=>call(),/RESERVA_FUERA_DE_SERVICIO/);
  await db.exec('rollback');assert.equal((await snapshot()).closes,0);
  pass('exact end of service is excluded with one transaction timestamp');
  await rejects('old-session orders rolled back after close',{},/PEDIDOS_FUERA_DEL_SERVICIO/,`update pedidos_qr set created_at=now()-interval '2 hours'`);
  await rejects('null order creation time rolled back',{},/PEDIDOS_FUERA_DEL_SERVICIO/,`update pedidos_qr set created_at=null`);
  await rejects('orphan points ledger',{},/PUNTOS_PREVIOS_REQUIEREN_REVISION/,`insert into puntos_movimientos(restaurante_id,cliente_id,tipo,puntos,referencia)
    values('${ids.restaurant}','${ids.client}','ticket',10,'visita:${ids.reservation}')`);
  await rejects('linked gross too high',{total:'10006'},/CONSUMO_QR_FUERA_DE_LIMITE/,
    `update pedidos_qr set total=10006; update pedido_qr_items set precio_unitario=5003`);
  await rejects('stale quoted total', {total:'40.29'},/IMPORTE_CAMBIADO_ACTUALIZA/);
  await rejects('stale QR session',{session:ids.user},/SESION_MESA_CAMBIADA/);
  await rejects('mismatched item sum prevents linked close and consumption',{},/IMPORTE_PEDIDO_DESCUADRADO/,
    `update pedido_qr_items set precio_unitario=20`);
  await rejects('missing item lines prevent linked close and consumption',{},/IMPORTE_PEDIDO_DESCUADRADO/,
    `delete from pedido_qr_items`);

  await seed();await db.exec('update restaurante_modulos set fidelizacion=false');
  const noLoyalty=(await call()).rows[0].result;
  assert.equal(noLoyalty.puntos_generados,0);assert.equal((await snapshot()).visits,1);
  assert.equal((await snapshot()).points,0);pass('disabled loyalty still records visit with no points');
  await seed();await db.exec('update restaurantes set puntos_activo=false');
  assert.equal((await call()).rows[0].result.puntos_generados,0);pass('restaurant points switch is respected by actual history trigger');
  await seed();await db.exec(`insert into fidelizacion_config values('${ids.restaurant}',3)`);
  assert.equal((await call()).rows[0].result.puntos_generados,105);pass('configured loyalty rate overrides restaurant default exactly once');
  await seed();
  const free=(await call({discount:'40.30',tip:'0'})).rows[0].result;
  assert.equal(Number(free.consumo_total),0);assert.equal(free.puntos_generados,0);
  assert.equal((await snapshot()).visits,1);pass('full discount records a free visit with zero points');
  await seed();await db.exec(`update pedidos_qr set total=20000; update pedido_qr_items set precio_unitario=10000`);
  const unlinked=(await call({reservation:null,total:'20000'})).rows[0].result;
  assert.equal(unlinked.reserva_id,null);assert.equal(Number(unlinked.total_cobrado),19997);
  assert.equal((await snapshot()).visits,0);pass('unlinked high-value close preserves payment record without false customer spend');
  await seed();await db.exec('update restaurante_modulos set reservas=false,clientes=false');
  assert.equal((await call({reservation:null})).rows[0].result.ok,true);pass('QR-only restaurant can record an unlinked close');
  await seed();await db.exec('set role anon');
  await assert.rejects(()=>call(),/permission denied/);
  await db.exec('reset role');pass('actual anonymous database role cannot execute new RPC');
  await db.exec('set role authenticated');
  await assert.rejects(()=>db.query('select * from app_private.qr_cierre_operaciones'),/permission denied/);
  await db.exec('reset role');pass('authenticated callers cannot inspect or modify idempotency ledger');
  console.log(`${passed} linked QR SQL fixture checks passed. Full production schema and two-connection races need separate verification.`);
}catch(error){
  console.error('FAIL',error.message);
  if(error.where)console.error(error.where);
  process.exitCode=1;
}finally{await db.close();}
