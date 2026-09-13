import assert from 'node:assert/strict';
import {test,after} from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite();
const a='72000000-0000-4000-8000-000000000001',b='72000000-0000-4000-8000-000000000002';
const visit='73000000-0000-4000-8000-000000000001',customer='74000000-0000-4000-8000-000000000001';
const token='75000000-0000-4000-8000-000000000001',lock='76000000-0000-4000-8000-000000000001';
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema review_private;
 create table restaurantes(id uuid primary key,nombre text,google_review_url text);
 create table restaurante_modulos(restaurante_id uuid primary key,resenas boolean,automatizaciones boolean);
 create table reservas(id uuid primary key,restaurante_id uuid,cliente_id uuid,atendida boolean,estado text,nombre_cliente text,telefono text);
 create table clientes(id uuid primary key,restaurante_id uuid,nombre text,telefono text,ya_dejo_resena boolean,consent boolean);
 create table reservation_webhook_deliveries(event_id text primary key,event_type text,restaurante_id uuid,reservation_id uuid,cliente_id uuid,status text,lock_token uuid,payload jsonb,delivery_mode text);
 create table visit_review_requests(id uuid primary key,reserva_id uuid,cliente_id uuid,restaurante_id uuid,active_delivery_token uuid,sent_at timestamptz,status text,scheduled_for timestamptz,public_token uuid);
 create table automatizaciones_config(restaurante_id uuid primary key,enabled boolean,review_enabled boolean,whatsapp_enabled boolean,delivery_mode text);
 create function review_private.has_consent(r uuid,c uuid) returns boolean language sql as $$select consent from public.clientes where id=c and restaurante_id=r$$;
 create function review_private.valid_google_url(url text) returns boolean language sql as $$select url='https://g.page/r/fixture/review'$$;
 insert into restaurantes values('${a}','Local A','https://g.page/r/fixture/review'),('${b}','Local B','https://g.page/r/fixture/review');
 insert into restaurante_modulos values('${a}',true,true);
 insert into reservas values('${visit}','${a}','${customer}',true,'confirmada','Reserva','+447700900001');
 insert into clientes values('${customer}','${a}','Cliente','+447700900001',false,true);
 insert into reservation_webhook_deliveries values('review-fixture','visit.review_request','${a}','${visit}','${customer}','processing','${lock}','{"reviewRequestId":"${token}"}','live');
 insert into visit_review_requests values('${token}','${visit}','${customer}','${a}','${lock}',null,'ready',now()-interval '1 hour','${token}');
 insert into automatizaciones_config values('${a}',true,true,true,'live');
 alter table automatizaciones_config add column max_attempts integer default 5;
 alter table reservas add column resena_solicitada boolean default false;
 alter table visit_review_requests add column last_error text,add column updated_at timestamptz,add column send_method text,add column provider_message_id text;
 alter table reservation_webhook_deliveries add column attempts integer default 1,add column next_attempt_at timestamptz,
   add column locked_at timestamptz,add column updated_at timestamptz,add column delivered_at timestamptz,add column http_status integer,add column last_error text;
 create table whatsapp_channels(id uuid primary key,restaurante_id uuid);
 create table whatsapp_channel_messages(id uuid primary key,channel_id uuid,provider_message_id text,direction text,purpose text,
   ack integer,status text,outgoing_message_id text,engine_response jsonb);
 insert into whatsapp_channels values('${a}','${a}');
 create function public.complete_visit_review_delivery(p_event_id text,p_lock_token uuid,p_outcome text,p_message_id text default null,p_error text default null)
 returns boolean language plpgsql as $$begin
   update public.visit_review_requests set status=p_outcome,active_delivery_token=null;
   update public.reservation_webhook_deliveries set status='skipped',last_error=p_error;
   return true;
 end;$$;
`);
const migration=readdirSync(new URL('../supabase/migrations/',import.meta.url)).find(name=>name.endsWith('_waha_review_recheck.sql'));
assert.ok(migration);
const source=readFileSync(new URL(`../supabase/migrations/${migration}`,import.meta.url),'utf8');
await db.exec(source);
after(()=>db.close());
async function check(restaurantId=a,lockToken=lock) {
 return (await db.query('select recheck_visit_review_delivery($1,$2,$3) result',['review-fixture',lockToken,restaurantId])).rows[0].result;
}
async function rollbackCase(sql,reason){
 await db.exec('begin');
 try {await db.exec(sql);assert.equal((await check()).reason,reason);} finally {await db.exec('rollback');}
}
test('a held token rechecks fresh recipient data without reacquiring or changing the lock',async()=>{
 assert.equal((await check()).allowed,true);
 await db.exec('begin');
 try {
  await db.exec("update clientes set nombre='Nombre actualizado',telefono='+447700900002'");
  const result=await check();assert.equal(result.name,'Nombre actualizado');assert.equal(result.phone,'+447700900002');
  const row=(await db.query('select active_delivery_token from visit_review_requests')).rows[0];assert.equal(row.active_delivery_token,lock);
 } finally {await db.exec('rollback');}
});
test('review confirmation, consent withdrawal and cancelled visits block immediately before send',async()=>{
 for(const [sql,reason] of [
  ['update clientes set ya_dejo_resena=true','review_already_handled'],
  ['update clientes set consent=false','review_consent_missing'],
  ['update clientes set consent=null','review_consent_missing'],
  ["update reservas set estado='cancelada'",'visit_not_completed'],
  ["update reservas set estado='no-show'",'visit_not_completed'],
  ['update reservas set atendida=false','visit_not_completed'],
  ["update visit_review_requests set scheduled_for=now()+interval '1 hour'",'review_not_due'],
  ["update visit_review_requests set scheduled_for=now()-interval '25 hours'",'review_delivery_expired'],
  ['update automatizaciones_config set review_enabled=false','review_automatic_disabled'],
  ['update restaurante_modulos set automatizaciones=false','review_automatic_disabled'],
  ["update restaurantes set google_review_url='https://example.invalid'",'review_google_url_missing'],
 ]) await rollbackCase(sql,reason);
});
test('restaurant, customer, event and delivery lock bindings cannot cross tenants',async()=>{
 assert.equal((await check(b)).reason,'review_not_found');
 assert.equal((await check(a,token)).reason,'delivery_lock_lost');
 assert.equal((await check(a,null)).reason,'delivery_lock_lost');
 await rollbackCase(`update reservas set restaurante_id='${b}'`,'review_customer_changed');
 await rollbackCase('update reservation_webhook_deliveries set cliente_id=null','review_customer_changed');
 await rollbackCase('update visit_review_requests set active_delivery_token=null','delivery_lock_lost');
});
test('fresh review data is service-only, with no browser role execute privilege',async()=>{
 for(const role of ['anon','authenticated']) {
  for(const signature of ['public.recheck_visit_review_delivery(text,uuid,uuid)','public.reconcile_waha_review_ack(uuid)','public.defer_visit_review_delivery(text,uuid,uuid,text)']) {
   assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,signature])).rows[0].ok,false);
  }
 }
 assert.equal((await db.query("select has_function_privilege('service_role','public.recheck_visit_review_delivery(text,uuid,uuid)','execute') ok")).rows[0].ok,true);
});

const defer=async()=> (await db.query('select defer_visit_review_delivery($1,$2,$3,$4) result',['review-fixture',lock,a,'waha_offline'])).rows[0].result;
test('a known pre-send outage releases the token into a bounded five minute retry',async()=>{
 await db.exec('begin');
 try {
  assert.equal(await defer(),'deferred');
  const row=(await db.query("select status,lock_token,next_attempt_at between now()+interval '4 minutes' and now()+interval '6 minutes' delayed from reservation_webhook_deliveries")).rows[0];
  assert.equal(row.status,'retrying');assert.equal(row.lock_token,null);assert.equal(row.delayed,true);
  assert.equal((await db.query('select active_delivery_token from visit_review_requests')).rows[0].active_delivery_token,null);
 } finally {await db.exec('rollback');}
});
test('an attempted or uncertain send can never be put back in the retry queue',async()=>{
 for(const status of ['sending','sent','uncertain']) {
  await db.exec('begin');
  try {
   await db.query("insert into whatsapp_channel_messages values($1,$2,'review-fixture','outbound','review',0,$3,null,'{}')",[token,a,status]);
   assert.equal(await defer(),'refused');
  } finally {await db.exec('rollback');}
 }
});
test('deferral stops at the configured attempts or after twenty-four hours',async()=>{
 for(const sql of ['update reservation_webhook_deliveries set attempts=5',"update visit_review_requests set scheduled_for=now()-interval '25 hours'"]) {
  await db.exec('begin');
  try {await db.exec(sql);assert.equal(await defer(),'blocked');assert.equal((await db.query('select status from visit_review_requests')).rows[0].status,'blocked');}
  finally {await db.exec('rollback');}
 }
});
test('a correlated signed ACK settles an uncertain review exactly once without changing review confirmation',async()=>{
 await db.exec('begin');
 try {
  await db.exec("update visit_review_requests set status='uncertain';update clientes set ya_dejo_resena=true");
  await db.query("insert into whatsapp_channel_messages values($1,$2,'review-fixture','outbound','review',1,'sent','PROVIDER1234',$3)",[token,a,{automationEventId:'review-fixture',reviewLockToken:lock}]);
  const ack=async()=> (await db.query('select reconcile_waha_review_ack($1) result',[token])).rows[0].result;
  assert.equal(await ack(),true);assert.equal(await ack(),true);
  const q=(await db.query('select * from visit_review_requests')).rows[0];assert.equal(q.status,'sent');assert.equal(q.provider_message_id,'waha:PROVIDER1234');assert.equal(q.active_delivery_token,null);
  assert.equal((await db.query('select ya_dejo_resena from clientes')).rows[0].ya_dejo_resena,true);
 } finally {await db.exec('rollback');}
});
test('unrelated events, wrong restaurant, absent acceptance and wrong locks never confirm a delivery',async()=>{
 for(const sql of [
  'update whatsapp_channel_messages set ack=0',
  "update whatsapp_channel_messages set direction='inbound'",
  `update whatsapp_channels set restaurante_id='${b}'`,
  `update whatsapp_channel_messages set engine_response=jsonb_build_object('automationEventId','review-fixture','reviewLockToken','${token}')`,
 ]) {
  await db.exec('begin');
  try {
   await db.query("insert into whatsapp_channel_messages values($1,$2,'review-fixture','outbound','review',1,'sent','PROVIDER1234',$3)",[token,a,{automationEventId:'review-fixture',reviewLockToken:lock}]);
   await db.exec(sql);assert.equal((await db.query('select reconcile_waha_review_ack($1) result',[token])).rows[0].result,false);
   assert.equal((await db.query('select sent_at from visit_review_requests')).rows[0].sent_at,null);
  } finally {await db.exec('rollback');}
 }
});
