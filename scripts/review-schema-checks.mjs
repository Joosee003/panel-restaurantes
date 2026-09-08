import assert from 'node:assert/strict';
export const reviewIds = {
  user:'71000000-0000-4000-8000-000000000001',otherUser:'71000000-0000-4000-8000-000000000002',
  restaurant:'72000000-0000-4000-8000-000000000001',otherRestaurant:'72000000-0000-4000-8000-000000000002',
  customer:'75000000-0000-4000-8000-000000000001',reservation:'76000000-0000-4000-8000-000000000001',
};
const I=reviewIds;
export async function reviewActor(db,user=I.user,role='authenticated') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.sub',$2,false),set_config('request.jwt.claim.role',$3,false)",
    [JSON.stringify({sub:user,role}),user||'',role]);
  await db.exec(`set role ${role}`);
}
export async function seedReviews(db) {
  await db.exec('reset role');
  const tables=(await db.query("select schemaname,tablename from pg_tables where schemaname in ('public','app_private','auth')")).rows;
  await db.exec(`truncate ${tables.map(t=>`"${t.schemaname}"."${t.tablename}"`).join(',')} cascade`);
  await db.exec(`alter table auth.users disable trigger user;
    insert into auth.users(id,email) values('${I.user}','reviews-a@example.invalid'),('${I.otherUser}','reviews-b@example.invalid');
    alter table auth.users enable trigger user;
    insert into restaurantes(id,nombre,slug,owner_id,google_review_url) values
      ('${I.restaurant}','Restaurante de prueba','review-fixture','${I.user}','https://g.page/r/test-review/review'),
      ('${I.otherRestaurant}','Otro restaurante','review-other','${I.otherUser}','https://g.page/r/other/review');
    insert into usuarios_restaurantes(user_id,restaurante_id) values('${I.user}','${I.restaurant}'),('${I.otherUser}','${I.otherRestaurant}');
    insert into restaurante_modulos(restaurante_id,reservas,clientes,resenas,automatizaciones,estado) values
      ('${I.restaurant}',true,true,true,true,'activo'),('${I.otherRestaurant}',true,true,true,true,'activo');
    update automatizaciones_config set enabled=true,delivery_mode='live',review_enabled=true,review_delay_hours=3,whatsapp_enabled=true,
      confirmation_enabled=false,reminder_enabled=false where restaurante_id='${I.restaurant}';
    insert into clientes(id,restaurante_id,nombre,telefono,permite_whatsapp) values('${I.customer}','${I.restaurant}','Cliente de prueba','+34600000001',true);
    insert into cliente_comunicaciones_consentimiento(restaurante_id,cliente_id,review_whatsapp,consent_source,consent_version)
      values('${I.restaurant}','${I.customer}',true,'test_fixture','v1');`);
  await reviewActor(db);
}
export async function addReviewVisit(db,{id=I.reservation,hours=4,attended=true,state='confirmada',customer=I.customer}={}) {
  await db.query(`insert into reservas(id,restaurante_id,cliente_id,nombre_cliente,telefono,estado,origen,personas,turno,inicio_at,fin_at,fecha_hora_reserva,atendida)
    values($1,$2,$3,'Cliente de prueba','+34600000001',$4,'panel_nativo',2,'comida',now()-make_interval(hours=>$5),
      now()-make_interval(hours=>$5)+interval '90 minutes',(now()-make_interval(hours=>$5)) at time zone 'Europe/Madrid',$6)`,[id,I.restaurant,customer,state,hours,attended]);
  return id;
}
export const reviewAction=(db,action,id=I.reservation)=>db.query('select public.visit_review_action($1,$2) result',[id,action]).then(r=>r.rows[0].result);
export const requestRow=(db,id=I.reservation)=>db.query('select * from visit_review_requests where reserva_id=$1',[id]).then(r=>r.rows[0]);
export async function claimReview(db) {
  await reviewActor(db,null,'service_role');
  const rows=(await db.query('select * from claim_reservation_automation_events(10)')).rows;
  return rows.find(r=>r.event_type==='visit.review_request');
}
export const checkDelivery=(db,event)=>db.query('select get_visit_review_delivery($1,$2) result',[event.event_id,event.lock_token]).then(r=>r.rows[0].result);
export const finishDelivery=(db,event,outcome,id=null,error=null)=>db.query('select complete_visit_review_delivery($1,$2,$3,$4,$5) result',[event.event_id,event.lock_token,outcome,id,error]).then(r=>r.rows[0].result);
export async function checkReviewSchema(db) {
  const passed=[];
  const pass=name=>passed.push(name);
  await db.exec('alter role service_role bypassrls');
  await seedReviews(db);
  await addReviewVisit(db,{hours:1,attended:false});
  assert.equal(await requestRow(db),undefined);
  await db.query('update reservas set atendida=true where id=$1',[I.reservation]);
  let q=await requestRow(db);
  assert.equal(q.status,'scheduled');
  const delta=(await db.query('select extract(epoch from (q.scheduled_for-r.inicio_at)) n from visit_review_requests q join reservas r on r.id=q.reserva_id')).rows[0].n;
  assert.equal(Number(delta),10800);
  await assert.rejects(reviewAction(db,'prepare'),/REVIEW_NOT_DUE/);
  pass('Timer is three hours from the reservation, requires attendance and blocks early manual sends.');
  await seedReviews(db);await addReviewVisit(db);
  const prepared=await reviewAction(db,'prepare');assert.equal(prepared.ok,true);
  q=await requestRow(db);assert.equal(q.status,'prepared');assert.equal(q.sent_at,null);
  assert.equal((await reviewAction(db,'prepare')).token,prepared.token);
  await reviewAction(db,'sent');
  assert.ok((await requestRow(db)).sent_at);
  await assert.rejects(reviewAction(db,'prepare'),/REVIEW_ALREADY_SENT/);
  assert.equal((await db.query('select count(*)::int n from visit_review_requests')).rows[0].n,1);
  pass('Opening/copying a draft is not a send; manual confirmation persists and the same visit cannot be requested twice.');
  await reviewActor(db,null,'service_role');
  const read=await db.query('select get_visit_review_link($1) context',[prepared.token]);
  assert.equal(read.rows[0].context.optedOut,false);assert.equal((await requestRow(db)).google_opened_at,null);
  await db.query('select open_visit_review_link($1)',[prepared.token]);
  assert.ok((await requestRow(db)).google_opened_at);
  assert.equal((await db.query('select ya_dejo_resena from clientes where id=$1',[I.customer])).rows[0].ya_dejo_resena,false);
  pass('Reading the public link never records a click; clicking Google is recorded without marking a review confirmed.');
  await reviewActor(db);
  const second='76000000-0000-4000-8000-000000000002';
  await addReviewVisit(db,{id:second,hours:3});
  const list=(await db.query('select list_visit_review_requests($1) result',[I.restaurant])).rows[0].result;
  assert.equal(list.requests.find(r=>r.reserva_id===second).previous_requests,1);
  assert.ok(await requestRow(db,second));await reviewAction(db,'confirm');
  assert.equal((await requestRow(db,second)).status,'cancelled');
  await addReviewVisit(db,{id:'76000000-0000-4000-8000-000000000003',hours:2});
  assert.equal((await db.query('select count(*)::int n from visit_review_requests')).rows[0].n,2);
  pass('A distinct second visit is eligible until the owner confirms the review; confirmation cancels waiting and future requests.');
  await reviewActor(db,null,'service_role');
  await db.query('select stop_visit_review_requests($1)',[prepared.token]);
  assert.equal((await db.query('select get_visit_review_link($1) result',[prepared.token])).rows[0].result.optedOut,true);
  await db.query('update restaurantes set google_review_url=null where id=$1',[I.restaurant]);
  assert.equal((await db.query('select stop_visit_review_requests($1) result',[prepared.token])).rows[0].result,true);
  pass('Opt-out persists and remains available when the restaurant removes its Google link.');
  await seedReviews(db);await db.query('update cliente_comunicaciones_consentimiento set review_whatsapp=false where cliente_id=$1',[I.customer]);await addReviewVisit(db);
  await assert.rejects(reviewAction(db,'prepare'),/REVIEW_CONSENT_MISSING/);
  assert.equal(await claimReview(db),undefined);
  pass('A stored phone alone grants no review permission and cannot lead to an automatic send.');
  await seedReviews(db);await addReviewVisit(db,{attended:false});
  await db.query('update clientes set ya_dejo_resena=true where id=$1',[I.customer]);
  await db.query('update reservas set atendida=true where id=$1',[I.reservation]);
  assert.equal(await requestRow(db),undefined);await reviewAction(db,'unconfirm');
  assert.equal((await db.query('select ya_dejo_resena from clientes where id=$1',[I.customer])).rows[0].ya_dejo_resena,false);
  pass('Legacy customer confirmations can be undone without creating or sending historical requests.');
  await seedReviews(db);await addReviewVisit(db);
  await reviewActor(db,I.otherUser);
  assert.equal((await db.query('select * from visit_review_requests')).rows.length,0);
  await assert.rejects(reviewAction(db,'confirm'),/REVIEW_ACCESS_DENIED/);
  await assert.rejects(db.query('select list_visit_review_requests($1)',[I.restaurant]),/REVIEW_ACCESS_DENIED/);
  await reviewActor(db,null,'anon');
  await assert.rejects(db.query('select * from visit_review_requests'),/permission denied/);
  await assert.rejects(db.query('select get_visit_review_link($1)',[prepared.token]),/permission denied/);
  await reviewActor(db);await assert.rejects(db.query("update visit_review_requests set status='sent'"),/permission denied/);
  await db.exec('reset role');await db.query('update usuarios_restaurantes set demo_vista=true where user_id=$1',[I.user]);
  await reviewActor(db);await assert.rejects(reviewAction(db,'confirm'),/REVIEW_ACCESS_DENIED/);
  pass('Actual RLS and function permissions isolate restaurants, block anonymous access and prevent demo/direct writes.');
  await seedReviews(db);await addReviewVisit(db);
  let event=await claimReview(db);assert.ok(event);assert.equal((await checkDelivery(db,event)).allowed,true);
  assert.equal((await checkDelivery(db,event)).reason,'review_delivery_in_progress');
  await assert.rejects(finishDelivery(db,event,'sent'),/REVIEW_DELIVERY_PROOF_MISSING/);
  assert.equal(await finishDelivery(db,event,'sent','wamid.synthetic-acceptance'),true);
  assert.equal((await requestRow(db)).provider_message_id,'wamid.synthetic-acceptance');
  assert.equal(await claimReview(db),undefined);
  pass('Automatic sends require a current lock and provider message ID; duplicate workers and repeat claims cannot resend.');
  await seedReviews(db);await addReviewVisit(db);event=await claimReview(db);await checkDelivery(db,event);
  await db.query("update reservation_webhook_deliveries set locked_at=now()-interval '11 minutes' where event_id=$1",[event.event_id]);
  const recovered=await claimReview(db);assert.ok(recovered);assert.notEqual(recovered.lock_token,event.lock_token);
  assert.equal((await checkDelivery(db,recovered)).reason,'review_delivery_uncertain');
  await finishDelivery(db,recovered,'uncertain',null,'review_delivery_uncertain');
  assert.equal((await requestRow(db)).status,'uncertain');
  assert.equal(await finishDelivery(db,event,'sent','wamid.late-acceptance'),true);
  pass('A lost completion is held for human checking, never resent; late provider acceptance can still be recorded.');
  await seedReviews(db);await addReviewVisit(db);event=await claimReview(db);await checkDelivery(db,event);
  await finishDelivery(db,event,'uncertain',null,'whatsapp_delivery_unknown');
  await reviewActor(db);await assert.rejects(reviewAction(db,'prepare'),/REVIEW_DELIVERY_UNCERTAIN/);
  await reviewAction(db,'not_sent');await reviewAction(db,'prepare');assert.equal((await requestRow(db)).sent_at,null);
  pass('Ambiguous transport failures require an explicit check before another manual draft is allowed.');
  await seedReviews(db);await db.query("update automatizaciones_config set delivery_mode='test' where restaurante_id=$1",[I.restaurant]);
  await addReviewVisit(db);event=await claimReview(db);assert.equal((await checkDelivery(db,event)).deliveryMode,'test');
  await finishDelivery(db,event,'test');assert.equal((await requestRow(db)).sent_at,null);
  pass('Test mode never marks a real WhatsApp message as sent.');
  await seedReviews(db);await addReviewVisit(db);event=await claimReview(db);
  await reviewActor(db);await db.query("update reservas set estado='cancelada' where id=$1",[I.reservation]);
  await reviewActor(db,null,'service_role');assert.equal((await checkDelivery(db,event)).allowed,false);
  pass('A cancelled visit invalidates even a claimed automatic request.');
  await seedReviews(db);await addReviewVisit(db,{state:'no_show'});assert.equal(await requestRow(db),undefined);
  await addReviewVisit(db,{id:second,hours:-3});assert.equal(await requestRow(db,second),undefined);
  pass('No-shows and future visits do not create review requests.');
  await seedReviews(db);await addReviewVisit(db,{hours:48});assert.ok(await requestRow(db));assert.equal(await claimReview(db),undefined);
  pass('Recording an old visit does not trigger a burst of historical automatic messages.');
  await seedReviews(db);await db.query('select save_visit_review_settings($1,$2,2,false)',[I.restaurant,'https://search.google.com/local/writereview?placeid=test']);
  await addReviewVisit(db,{hours:2});q=await requestRow(db);assert.ok(q);assert.equal(await claimReview(db),undefined);
  await reviewActor(db);assert.equal((await reviewAction(db,'prepare')).ok,true);
  await assert.rejects(db.query('select save_visit_review_settings($1,$2,3,true)',[I.restaurant,'https://evil.invalid/']),/INVALID_REVIEW_SETTINGS/);
  pass('Two-hour manual mode works independently; untrusted redirect destinations are rejected.');
  await seedReviews(db);await reviewActor(db,null,'service_role');
  await db.query("insert into restaurante_webs(restaurante_id,slug,publicada,nombre_publico) values($1,'review-fixture',true,'Restaurante de prueba') on conflict(restaurante_id) do update set slug='review-fixture',publicada=true",[I.restaurant]);
  await db.query('update reservas_config set activo=true where restaurante_id=$1',[I.restaurant]);
  await db.query("insert into reservas_excepciones(restaurante_id,fecha,tipo,turno,hora_inicio,hora_fin) values($1,((now() at time zone 'Europe/Madrid')::date+1),'horario_especial','comida','12:00','18:00')",[I.restaurant]);
  const slot=(await db.query("select * from obtener_disponibilidad_reservas('review-fixture',((now() at time zone 'Europe/Madrid')::date+1),2) limit 1")).rows[0];assert.ok(slot);
  const book=async(key,consent,phone='+34600000001')=> (await db.query("select crear_reserva_publica_con_resena('review-fixture',$1,2,'Cliente de prueba',$4,null,null,$2,true,true,'2026-08-03',$3) result",[slot.inicio_at,key,consent,phone])).rows[0].result;
  await db.query('update cliente_comunicaciones_consentimiento set review_whatsapp=false where cliente_id=$1',[I.customer]);
  const booking=await book('79000000-0000-4000-8000-000000000001',false);assert.equal(booking.ok,true);
  assert.equal((await book('79000000-0000-4000-8000-000000000001',true)).duplicate,true);
  assert.equal((await db.query('select review_whatsapp from cliente_comunicaciones_consentimiento where cliente_id=$1',[I.customer])).rows[0].review_whatsapp,false);
  await db.query('update cliente_comunicaciones_consentimiento set revoked_at=now(),loyalty_whatsapp=true,loyalty_email=true,review_email=true where cliente_id=$1',[I.customer]);
  const optIn=await book('79000000-0000-4000-8000-000000000002',true,'600 000 001');assert.equal(optIn.ok,true);
  const consent=(await db.query('select * from cliente_comunicaciones_consentimiento where cliente_id=$1',[I.customer])).rows[0];
  assert.equal(consent.review_whatsapp,true);assert.equal(consent.revoked_at,null);
  assert.deepEqual([consent.loyalty_whatsapp,consent.loyalty_email,consent.review_email],[false,false,false]);
  assert.equal((await db.query('select cliente_id from reservas where id=$1',[optIn.reserva_id])).rows[0].cliente_id,I.customer);
  pass('The actual public booking transaction records optional consent, matches phone formatting variants and cannot change consent on retry or revive revoked promotion permissions.');
  return passed;
}
