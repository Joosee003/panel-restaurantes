import assert from 'node:assert/strict';
import { qualified } from './recovery-catalog.mjs';

export const ids = {
  user:'71000000-0000-4000-8000-000000000001',otherUser:'71000000-0000-4000-8000-000000000002',
  restaurant:'72000000-0000-4000-8000-000000000001',otherRestaurant:'72000000-0000-4000-8000-000000000002',
  table:'73000000-0000-4000-8000-000000000001',zone:'73000000-0000-4000-8000-000000000002',
  session:'74000000-0000-4000-8000-000000000001',customer:'75000000-0000-4000-8000-000000000001',
  reservation:'76000000-0000-4000-8000-000000000001',order:'77000000-0000-4000-8000-000000000001',
  item:'78000000-0000-4000-8000-000000000001',product:'79000000-0000-4000-8000-000000000001',
  card:'7a000000-0000-4000-8000-000000000001',recipe:'7b000000-0000-4000-8000-000000000001',
  ingredient:'7c000000-0000-4000-8000-000000000001',operation:'7d000000-0000-4000-8000-000000000001',
};
export async function actor(db,user=ids.user,role='authenticated',extra={}) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claim.role',$3,false)",
    [JSON.stringify({sub:user,role,...extra}),user||'',role]);
  await db.exec(`set role ${role}`);
}
export async function seedApplication(db) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims','{}',false),set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)");
  const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth') order by 1,2")).rows;
  await db.exec(`truncate ${tables.map(t=>qualified(t.schemaname,t.tablename)).join(',')} cascade`);
  // Auth-service onboarding is outside this database rehearsal. Only the two
  // synthetic identities are imported without running invitation onboarding.
  await db.exec(`alter table auth.users disable trigger user;
    insert into auth.users(id,email) values('${ids.user}','operator-a@example.invalid'),('${ids.otherUser}','operator-b@example.invalid');
    alter table auth.users enable trigger user;
    insert into restaurantes(id,nombre,owner_id,puntos_activo,puntos_por_euro) values
      ('${ids.restaurant}','Rehearsal A','${ids.user}',true,2),
      ('${ids.otherRestaurant}','Rehearsal B','${ids.otherUser}',true,2);
    insert into usuarios_restaurantes(user_id,restaurante_id) values
      ('${ids.user}','${ids.restaurant}'),('${ids.otherUser}','${ids.otherRestaurant}');
    insert into restaurante_modulos(restaurante_id,reservas,clientes,fidelizacion,camarero_digital,rentabilidad,estado)
      values('${ids.restaurant}',true,true,true,true,true,'activo'),('${ids.otherRestaurant}',true,true,true,true,true,'activo');
    update reservas_config set activo=true,capacidad_por_turno=20,duracion_minutos=90 where restaurante_id='${ids.restaurant}';
    insert into sala_zonas(id,restaurante_id,nombre) values('${ids.zone}','${ids.restaurant}','Rehearsal zone');
    insert into sala_mesas(id,restaurante_id,zona_id,nombre,capacidad,qr_session_id,qr_access_token,qr_expires_at)
      values('${ids.table}','${ids.restaurant}','${ids.zone}','Rehearsal table',4,'${ids.session}','synthetic-qr-token',now()+interval '12 hours');
    insert into cartas_digitales(id,restaurante_id,nombre,estado) values('${ids.card}','${ids.restaurant}','Rehearsal menu','activo');
    insert into carta_productos(id,carta_id,restaurante_id,nombre,precio)
      values('${ids.product}','${ids.card}','${ids.restaurant}','Rehearsal product',99);
    insert into clientes(id,restaurante_id,nombre,permite_whatsapp,permite_email)
      values('${ids.customer}','${ids.restaurant}','Rehearsal customer',false,false);
    insert into reservas(id,restaurante_id,mesa_id,cliente_id,estado,origen,personas,turno,inicio_at,fin_at,fecha_hora_reserva)
      values('${ids.reservation}','${ids.restaurant}','${ids.table}','${ids.customer}','confirmada','panel_nativo',2,'comida',
        now()-interval '30 minutes',now()+interval '60 minutes',(now()-interval '30 minutes') at time zone 'Europe/Madrid');
    insert into pedidos_qr(id,restaurante_id,carta_id,mesa_id,mesa_session_id,total,created_at)
      values('${ids.order}','${ids.restaurant}','${ids.card}','${ids.table}','${ids.session}',40.30,now()-interval '10 minutes');
    insert into pedido_qr_items(id,pedido_id,producto_id,nombre_producto,precio_unitario,cantidad)
      values('${ids.item}','${ids.order}','${ids.product}','Rehearsal product',20.15,2);
    insert into platos(id,restaurante_id,nombre,precio_venta,activo)
      values('${ids.recipe}','${ids.restaurant}','Rehearsal recipe',50,true);
    insert into ingredientes(id,restaurante_id,nombre,unidad,coste_compra,cantidad_compra,merma_pct,activo)
      values('${ids.ingredient}','${ids.restaurant}','Rehearsal ingredient','kg',8,2,20,true);
    insert into plato_ingredientes(plato_id,ingrediente_id,cantidad_usada)
      values('${ids.recipe}','${ids.ingredient}',0.4);`);
  await actor(db);
  await db.query('select public.vincular_producto_qr_plato($1,$2)',[ids.product,ids.recipe]);
  await db.query('select public.configurar_rentabilidad_qr($1,true)',[ids.restaurant]);
}
export async function closeAccount(db,overrides={}) {
  const args={operation:ids.operation,reservation:ids.reservation,tip:2,...overrides};
  return (await db.query(`select public.cerrar_mesa_qr_con_reserva($1,$2,$3::uuid[],$4,40.30,5,$5,'mixto','rehearsal',$6) result`,
    [args.operation,ids.table,[ids.order],ids.session,args.tip,args.reservation])).rows[0].result;
}
export async function consumeManually(db) {
  return (await db.query("select public.registrar_consumo_reserva($1,$2,35.30,'tarjeta','rehearsal') result",
    [ids.reservation,ids.restaurant])).rows[0].result;
}
export async function linkedSnapshot(db) {
  await db.exec('reset role');
  const result=(await db.query(`select
    (select count(*)::int from cierres_mesa_qr) closes,
    (select count(*)::int from app_private.qr_cierre_operaciones) operations,
    (select count(*)::int from clientes_historial where tipo='visita') visits,
    (select count(*)::int from puntos_movimientos) point_movements,
    (select coalesce(sum(puntos),0)::int from puntos_movimientos) ledger_points,
    (select coalesce(sum(puntos),0)::int from puntos_saldos) balance_points,
    (select puntos_totales from clientes where id='${ids.customer}') customer_points,
    (select visitas_totales from clientes where id='${ids.customer}') customer_visits,
    (select permite_email or permite_whatsapp from clientes where id='${ids.customer}') contact_consent,
    (select count(*)::int from ventas_qr) sales,
    (select sum(ingreso_total)::text from ventas_qr) sales_net,
    (select sum(coste_total)::text from ventas_qr) sales_cost,
    (select count(*)::int from cliente_notificaciones) notifications,
    (select estado from pedidos_qr where id='${ids.order}') order_state,
    (select qr_session_id::text from sala_mesas where id='${ids.table}') qr_session
  `)).rows[0];
  await actor(db);
  return result;
}
export async function checkApplicationFlows(db,report) {
  const pass=message=>report.checks.push(message);
  await seedApplication(db);
  const first=await closeAccount(db);
  assert.equal(first.ok,true);
  assert.equal(first.puntos_generados,70);
  assert.equal(Number(first.consumo_total),35.3);
  const saved=await linkedSnapshot(db);
  assert.deepEqual([saved.closes,saved.operations,saved.visits,saved.point_movements,saved.sales],[1,1,1,1,1]);
  assert.deepEqual([saved.ledger_points,saved.balance_points,saved.customer_points],[70,70,70]);
  assert.equal(saved.customer_visits,1);
  assert.equal(saved.contact_consent,false);
  assert.equal(Number(saved.sales_net),35.3);
  assert.equal(Number(saved.sales_cost),4);
  assert.equal(saved.order_state,'cobrado');
  pass('Real visit, loyalty-balance and customer-balance triggers produce one consistent QR sale/visit and 70 points.');
  const replay=await closeAccount(db);
  assert.equal(replay.replayed,true);
  assert.equal(replay.cierre_id,first.cierre_id);
  assert.deepEqual(await linkedSnapshot(db),saved);
  pass('A committed close can be replayed without duplicating any downstream record.');
  await assert.rejects(closeAccount(db,{tip:3}),/OPERACION_REUTILIZADA_CON_OTROS_DATOS/);
  assert.deepEqual(await linkedSnapshot(db),saved);
  pass('Changed retry payload is rejected without changing the committed account.');
  const manual=await consumeManually(db);
  assert.equal(manual.ok,false);
  assert.equal(manual.error,'CONSUMO_YA_REGISTRADO');
  assert.deepEqual(await linkedSnapshot(db),saved);
  pass('Manual consumption after a QR close cannot duplicate a visit or points.');
  await assert.rejects(db.query('update pedidos_qr set total=1 where id=$1',[ids.order]),/QR_|cerrad|cobrad|FINAL|READ_ONLY/i);
  assert.deepEqual(await linkedSnapshot(db),saved);
  pass('Authenticated direct writes cannot rewrite a paid order.');
  await actor(db,ids.otherUser,'authenticated',{user_metadata:{role:'admin',is_admin:true}});
  for(const table of ['clientes','reservas','pedidos_qr','ventas_qr']) {
    const rows=(await db.query(`select * from public.${table} where restaurante_id=$1`,[ids.restaurant])).rows;
    assert.equal(rows.length,0,`${table}: another restaurant must not read these records`);
  }
  await assert.rejects(closeAccount(db),/AUTORIZADA|DENIED|42501/);
  pass('Actual RLS and RPC guards reject another restaurant, including spoofed user metadata.');
  await actor(db,null,'anon');
  await assert.rejects(closeAccount(db),/permission denied|AUTH_REQUIRED/);
  pass('The anonymous role cannot close an account.');
  await seedApplication(db);
  const manualFirst=await consumeManually(db);
  assert.equal(manualFirst.ok,true);assert.equal(manualFirst.puntos_generados,70);
  const manualSaved=await linkedSnapshot(db);
  assert.equal(manualSaved.visits,1);assert.equal(manualSaved.closes,0);
  assert.equal(manualSaved.customer_points,70);assert.equal(manualSaved.balance_points,70);
  await assert.rejects(closeAccount(db),/CONSUMO_PREVIO_REQUIERE_REVISION/);
  assert.deepEqual(await linkedSnapshot(db),manualSaved);
  pass('Manual consumption first records the actual points and a subsequent QR close rolls back completely.');
  await seedApplication(db);
  await db.exec('reset role');
  await db.query('update restaurante_modulos set fidelizacion=false where restaurante_id=$1',[ids.restaurant]);
  await actor(db);
  assert.equal((await closeAccount(db)).puntos_generados,0);
  const noLoyalty=await linkedSnapshot(db);
  assert.equal(noLoyalty.visits,1);assert.equal(noLoyalty.sales,1);
  assert.deepEqual([noLoyalty.ledger_points,noLoyalty.balance_points,noLoyalty.customer_points],[0,0,0]);
  pass('Disabled loyalty preserves the visit and sale without issuing points.');
  await seedApplication(db);
  await db.exec('reset role');
  await db.query('update usuarios_restaurantes set demo_vista=true where user_id=$1',[ids.user]);
  await actor(db);
  await assert.rejects(closeAccount(db),/DEMO_READ_ONLY/);
  pass('The real demo-access guard rejects the close.');
}
