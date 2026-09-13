import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

const db=new PGlite(),checks=[];
const rows=async(sql,args=[])=>(await db.query(sql,args)).rows;
const scalar=async(sql,args=[])=>Object.values((await rows(sql,args))[0]||{})[0];
const ridA=randomUUID(),ridB=randomUUID(),idA=randomUUID(),idB=randomUUID();
const customer='+447700900199';
const row=async(id)=> (await rows('select * from whatsapp_channels where id=$1',[id]))[0];
const claim=async(c,key,extra={})=> {
  const args=[c.id,c.generation,c.phone_e164,key,extra.direction||'inbound',extra.purpose||'chatbot',extra.phone||customer,
    extra.chat||'447700900199@c.us',extra.at||new Date().toISOString(),extra.lock||randomUUID(),extra.text||'hola',extra.name||'Prueba'];
  return scalar('select claim_whatsapp_channel_message($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',args);
};
const cache=(m,response={reply:'Mensaje correcto'})=>scalar('select cache_whatsapp_channel_response($1,$2,$3)',[m.message.id,m.lockToken,JSON.stringify(response)]);
const reserve=(m,key)=>scalar('select reserve_whatsapp_channel_outgoing_id($1,$2,$3)',[m.message.id,m.lockToken,key]);
const begin=(m)=>scalar('select begin_whatsapp_channel_send($1,$2)',[m.message.id,m.lockToken]);
const finish=(m,outcome,id=null)=>scalar('select finish_whatsapp_channel_send($1,$2,$3,$4,$5)',[m.message.id,m.lockToken,outcome,id,null]);
const fail=(m)=>scalar('select fail_whatsapp_channel_message($1,$2,$3)',[m.message.id,m.lockToken,'fixture_error']);
try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create table public.restaurantes(id uuid primary key);
    create table public.chatbot_sessions(restaurante_id uuid,contact_phone text,state text,draft jsonb,
      selected_reservation_id uuid,handoff boolean,expires_at timestamptz,updated_at timestamptz,locked_until timestamptz,
      unique(restaurante_id,contact_phone));
    grant all on public.chatbot_sessions to service_role;
    grant usage on schema public to service_role,anon,authenticated;`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260913111203_per_restaurant_waha_channels.sql',import.meta.url),'utf8'));
  await db.query('insert into restaurantes(id) values($1),($2)',[ridA,ridB]);
  await db.exec('set role service_role');
  for(const [id,rid]of[[idA,ridA],[idB,ridB]]) await db.query('insert into whatsapp_channels(id,restaurante_id,session_name,enabled) values($1,$2,$3,true)',[id,rid,`gh_${id.replaceAll('-','')}`]);
  assert.equal((await row(idA)).enabled,false);
  await db.query("update whatsapp_channels set phone_e164=$1,status='WORKING',enabled=true,chatbot_enabled=true,reviews_enabled=true where id=$2",['+447700900191',idA]);
  assert.equal((await row(idA)).enabled,false,'Pairing never turns sending on');
  await db.query("update whatsapp_channels set phone_e164=$1,status='WORKING',chatbot_enabled=true,reviews_enabled=true where id=$2",['+447700900192',idB]);
  await db.query('update whatsapp_channels set enabled=true where id=any($1::uuid[])',[[idA,idB]]);
  let a=await row(idA),b=await row(idB);
  const revision=a.revision,generation=a.generation;
  await db.query("update whatsapp_channels set status='WORKING' where id=$1",[idA]);
  a=await row(idA);assert.equal(a.generation,generation);assert.equal(a.revision,revision+1);
  const cas=await rows("update whatsapp_channels set status='FAILED' where id=$1 and revision=$2 returning id",[idA,revision]);assert.equal(cas.length,0);
  await assert.rejects(db.query('update whatsapp_channels set session_name=$1 where id=$2',[`gh_${randomUUID().replaceAll('-','')}`,idA]),/CHANNEL_BINDING_IMMUTABLE/);
  await assert.rejects(db.query('update whatsapp_channels set phone_e164=$1 where id=$2',[b.phone_e164,idA]),/duplicate key/);
  checks.push('Pairing is disabled by default; immutable sessions, unique numbers, and status CAS preserve active-send generations.');
  assert.equal((await claim({...a,generation:a.generation-1},'old-generation')).status,'blocked');
  assert.equal((await claim({...a,phone_e164:b.phone_e164},'wrong-number')).status,'blocked');
  assert.equal((await claim(a,'old-history',{at:new Date(Date.now()-3600000).toISOString()})).status,'stale');
  const first=await claim(a,'same-provider-id'),second=await claim(b,'same-provider-id');
  assert.equal(first.status,'acquired');assert.equal(second.status,'acquired');assert.notEqual(first.message.id,second.message.id);
  assert.equal((await claim(a,'another-same-contact')).status,'busy');
  assert.equal((await claim(a,'same-provider-id',{phone:'+447700900198'})).status,'blocked');
  assert.equal(await cache(first),true);assert.equal(await reserve(first,'FIXTURE-OUTGOING-0001'),true);assert.equal(await begin(first),true);
  assert.equal(await finish(first,'sent','true_447700900199@c.us_FIXTURE-OUTGOING-0001'),true);
  assert.equal((await claim(a,'same-provider-id')).status,'duplicate');
  await cache(second,{reply:'',suppressDelivery:true});
  checks.push('Same customer/message ID remains isolated across restaurants; concurrent customer turns lock, replay deduplicates, old history is refused.');
  await db.query("update whatsapp_channels set status='FAILED' where id=$1",[idA]);
  const stage=(at=new Date().toISOString(),text='No se pierde')=>scalar('select stage_whatsapp_channel_inbound($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [idA,a.generation,a.phone_e164,'offline-incoming',customer,'447700900199@c.us',at,text,'Prueba']);
  const staged=await stage();assert.equal(staged.status,'failed');assert.equal(staged.lock_token,null);assert.equal(staged.attempts,0);
  assert.equal((await stage(new Date().toISOString(),'Texto cambiado')).text_content,'No se pierde');
  assert.equal(await stage(new Date(Date.now()-3600000).toISOString()),null);
  assert.equal((await claim(a,'offline-incoming')).status,'blocked');
  await db.query("update whatsapp_channels set status='WORKING' where id=$1",[idA]);
  const replayCandidates=await rows('select * from recover_whatsapp_channel_messages(20)');assert.ok(replayCandidates.some(x=>x.id===staged.id));
  const offlineRecovered=await claim(a,'offline-incoming');assert.equal(offlineRecovered.status,'acquired');assert.equal(offlineRecovered.message.text_content,'No se pierde');
  await cache(offlineRecovered,{suppressDelivery:true});
  checks.push('Signed input persists before provider reads while offline; staging is immutable, does not send, and is recovered once WORKING.');
  const retry=await claim(a,'processing-recovery');await cache(retry,{reply:'Cached confirmation',action:{reservationId:'fixture-only'}});await fail(retry);
  const recovered=await claim(a,'processing-recovery');assert.equal(recovered.status,'acquired');assert.equal(recovered.message.status,'ready');
  assert.equal(recovered.message.engine_response.reply,'Cached confirmation');
  assert.equal(await reserve(recovered,'FIXTURE-OUTGOING-0002'),true);assert.equal(await begin(recovered),true);
  await finish(recovered,'uncertain');
  assert.equal((await claim(a,'processing-recovery')).status,'blocked');
  const ack=await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idA,'true_447700900199@c.us_FIXTURE-OUTGOING-0002',2]);
  assert.equal(ack.status,'sent');assert.equal(ack.ack,2);
  const oldAck=await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idA,'true_447700900199@c.us_FIXTURE-OUTGOING-0002',1]);assert.equal(oldAck.ack,2);
  const lateFailure=await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idA,'true_447700900199@c.us_FIXTURE-OUTGOING-0002',-1]);assert.equal(lateFailure.ack,2);
  assert.equal(await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idB,'true_447700900199@c.us_FIXTURE-OUTGOING-0002',4]),null);
  checks.push('Engine response survives recovery; uncertain sends never repeat; signed ACKs reconcile only their channel and advance monotonically.');
  const race=await claim(a,'ack-before-http');await cache(race);await reserve(race,'FIXTURE-OUTGOING-0003');await begin(race);
  await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idA,'true_447700900199@c.us_FIXTURE-OUTGOING-0003',1]);
  assert.equal(await finish(race,'uncertain'),true);assert.equal(await scalar('select status from whatsapp_channel_messages where id=$1',[race.message.id]),'sent');
  const interrupted=await claim(a,'interrupted-send');await cache(interrupted);await reserve(interrupted,'FIXTURE-OUTGOING-0004');await begin(interrupted);
  await db.query("update whatsapp_channel_messages set locked_until=now()-interval '1 second' where id=$1",[interrupted.message.id]);
  await scalar('select count(*) from recover_whatsapp_channel_messages(20)');
  assert.equal(await scalar('select status from whatsapp_channel_messages where id=$1',[interrupted.message.id]),'uncertain');
  const failedAck=await scalar('select record_whatsapp_channel_ack($1,$2,$3)',[idA,'true_447700900199@c.us_FIXTURE-OUTGOING-0004',-1]);assert.equal(failedAck.ack,-1);assert.equal(failedAck.status,'uncertain');
  await db.query('update whatsapp_channel_contacts set locked_until=null,lock_token=null where channel_id=$1',[idA]);
  checks.push('ACK-before-HTTP cannot regress to uncertain; crashed in-flight sends are quarantined by recovery.');
  await scalar('select set_whatsapp_channel_contact_pause($1,$2,true,$3)',[idA,customer,'human_reply']);
  assert.equal((await claim(a,'paused-contact')).reason,'contact_paused');
  for(const rid of [ridA,ridB])await db.query("insert into chatbot_sessions(restaurante_id,contact_phone,state,draft,handoff,expires_at) values($1,$2,'handoff','{}',true,now()+interval '1 hour')",[rid,customer]);
  const bUnaffected=await claim(b,'other-restaurant-not-paused');assert.equal(bUnaffected.status,'acquired');await cache(bUnaffected,{suppressDelivery:true});
  await scalar('select set_whatsapp_channel_contact_pause($1,$2,false,null)',[idA,customer]);
  assert.equal(await scalar('select state from chatbot_sessions where restaurante_id=$1',[ridA]),'idle');
  assert.equal(await scalar('select state from chatbot_sessions where restaurante_id=$1',[ridB]),'handoff');
  const lastHuman=await scalar('select last_human_message_at from whatsapp_channel_contacts where channel_id=$1 and contact_phone=$2',[idA,customer]);
  assert.equal(await scalar('select set_whatsapp_channel_contact_pause($1,$2,true,$3,$4)',[idA,customer,'human_reply',lastHuman]),false);
  assert.equal(await scalar('select paused from whatsapp_channel_contacts where channel_id=$1 and contact_phone=$2',[idA,customer]),false);
  await db.query("update chatbot_sessions set state='booking_time',draft='{\"party\":5}',expires_at=now()-interval '1 second' where restaurante_id=$1",[ridA]);
  await scalar('select set_whatsapp_channel_contact_pause($1,$2,false,null)',[idA,customer]);
  assert.deepEqual(await scalar('select draft from chatbot_sessions where restaurante_id=$1',[ridA]),{});
  const pending=await claim(a,'pause-before-send');await cache(pending);
  await scalar('select set_whatsapp_channel_contact_pause($1,$2,true,$3)',[idA,customer,'human_reply']);
  assert.equal(await begin(pending),false);
  await scalar('select set_whatsapp_channel_contact_pause($1,$2,false,null)',[idA,customer]);
  assert.equal((await claim(a,'pause-before-send')).status,'duplicate');
  const resumedQueue=await rows('select * from recover_whatsapp_channel_messages(20)');assert.equal(resumedQueue.some(x=>x.id===pending.message.id),false);
  const linked=await claim(a,'phone-changed-before-send');await cache(linked);
  await db.query('update whatsapp_channels set phone_e164=$1 where id=$2',['+447700900193',idA]);
  a=await row(idA);assert.equal(a.enabled,false);assert.equal(a.activated_at,null);assert.equal(await begin(linked),false);
  checks.push('Manual takeover is restaurant-specific and blocks queued replies; number changes disable the channel and invalidate pending sends.');
  await db.exec('reset role');
  for(const table of ['whatsapp_channels','whatsapp_channel_contacts','whatsapp_channel_messages']) {
    assert.equal(await scalar('select relrowsecurity from pg_class where oid=$1::regclass',[table]),true);
    for(const role of ['anon','authenticated']) {
      assert.equal(await scalar('select has_table_privilege($1,$2,$3)',[role,table,'SELECT']),false);
      assert.equal(await scalar('select has_table_privilege($1,$2,$3)',[role,table,'INSERT']),false);
    }
  }
  const leaked=await rows("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%whatsapp_channel%' or p.proname='guard_whatsapp_channel') and (p.prosecdef or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))");
  assert.deepEqual(leaked,[]);
  await db.exec('set role authenticated');await assert.rejects(rows('select * from whatsapp_channels'),/permission denied/);
  await assert.rejects(rows('select recover_whatsapp_channel_messages(20)'),/permission denied/);
  checks.push('All tables enforce RLS without browser grants; all RPCs are SECURITY INVOKER and denied to anon/authenticated.');
  console.log(JSON.stringify({status:'passed',checks},null,2));
} catch(error) {console.error(JSON.stringify({status:'failed',message:error.message,code:error.code,where:error.where,stack:error.stack}));process.exitCode=1;}
finally {await db.close();}
