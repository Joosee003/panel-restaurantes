import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function compile(file,imports={}) {
 const result={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','module','exports',code)(name=>imports[name]||require(name),result,result.exports);
 return result.exports;
}
const flow=compile('../lib/reviews/review-flow.ts');
const {createWahaReviewSender,wahaReviewText}=compile('../lib/reviews/waha-review-delivery.ts',{
 '../whatsapp/waha-api':{},'../whatsapp/waha-store':{},'./review-flow':flow,
});
const id='72000000-0000-4000-8000-000000000001';
const event={event_id:`visit.review_request:${id}`,restaurante_id:id,lock_token:id};
const delivery={allowed:true,deliveryMode:'live',token:id,name:'Jose Perez',phone:'+447700900001',restaurantName:'Local A'};
const channel={id,restaurante_id:id,session_name:'gh_72000000000040008000000000000001',phone_e164:'+34600000001',enabled:true,reviews_enabled:true,status:'WORKING',generation:2};
const message={id,channel_id:id,status:'processing',reserved_outgoing_id:null};
const fullId='true_447700900001@c.us_FIXTURE12345';
function fixture(changes={}) {
 const calls=[];
 const services={
  getWahaChannelForRestaurant:async()=>channel,wahaConfigured:()=>true,
  claimWahaMessage:async(_db,input)=>{calls.push(['claim',input]);return {status:'acquired',message,lockToken:id};},
  getWahaNewMessageId:async()=>{calls.push(['new-id']);return 'FIXTURE12345';},
  reserveWahaOutgoingId:async()=>{calls.push(['reserve']);return true;},
  getWahaSession:async()=>{calls.push(['device']);return {name:channel.session_name,status:'WORKING',phone:'34600000001',restricted:false,engine:'GOWS'};},
  cacheWahaResponse:async(_db,_id,_lock,response)=>{calls.push(['cache',response]);return true;},
  beginWahaSend:async()=>{calls.push(['begin']);return true;},
  sendWahaText:async(input)=>{calls.push(['send',input]);return {status:'accepted',messageId:fullId,error:null};},
  finishWahaSend:async(_db,_id,_lock,result)=>{calls.push(['finish',result]);return true;},
  failWahaMessage:async(_db,_id,_lock,error)=>{calls.push(['fail',error]);return true;},
  ...changes,
 };
 const sender=createWahaReviewSender({},services);
 const rpc=async(name,args)=>{calls.push(['recheck',name,args]);return {data:delivery,error:null};};
 return {calls,run:(context=delivery,recheck=rpc)=>sender(event,context,recheck)};
}
test('only no channel row permits legacy routing; offline/disabled/restricted devices never fall back',async()=>{
 assert.equal(await fixture({getWahaChannelForRestaurant:async()=>null}).run(),null);
 for(const [patch,outcome] of [[{enabled:false},'blocked'],[{reviews_enabled:false},'blocked'],[{status:'NUMBER_MISMATCH'},'blocked'],[{status:'STOPPED'},'deferred']]) {
  const f=fixture({getWahaChannelForRestaurant:async()=>({...channel,...patch})});assert.equal((await f.run()).outcome,outcome);assert.equal(f.calls.length,0);
 }
 const restricted=fixture({getWahaSession:async()=>({status:'WORKING',restricted:true})});
 assert.equal((await restricted.run()).outcome,'deferred');assert.equal(restricted.calls.some(c=>c[0]==='send'),false);
});
test('test mode cannot allocate an outgoing ID or send a real WhatsApp message',async()=>{
 const f=fixture();assert.equal((await f.run({...delivery,deliveryMode:'test'})).outcome,'test');assert.equal(f.calls.length,0);
});
test('the event restaurant and verified device number bind every review send',async()=>{
 for(const changes of [
  {getWahaChannelForRestaurant:async()=>({...channel,restaurante_id:'other'})},
  {getWahaSession:async()=>({name:channel.session_name,status:'WORKING',phone:'34600000002',restricted:false})},
  {getWahaSession:async()=>({name:'other',status:'WORKING',phone:'34600000001',restricted:false})},
 ]) {
  const f=fixture(changes);assert.equal((await f.run()).outcome,'blocked');assert.equal(f.calls.some(c=>c[0]==='send'),false);
 }
});
test('a fresh consent/confirmation check runs after device lookup and prevents the send',async()=>{
 for(const reason of ['review_already_handled','review_consent_missing','visit_not_completed','review_delivery_expired']) {
  const f=fixture();const result=await f.run(delivery,async()=>({data:{allowed:false,reason},error:null}));
  assert.equal(result.outcome,'blocked');assert.equal(result.error,reason);assert.equal(f.calls.some(c=>c[0]==='send'),false);
 }
 const changed=fixture();assert.equal((await changed.run(delivery,async()=>({data:{...delivery,phone:'+447700900002'},error:null}))).outcome,'blocked');
});
test('accepted provider receipt remains acceptance and the stable ID is stored before a single POST',async()=>{
 const f=fixture();const result=await f.run();assert.deepEqual(result,{outcome:'sent',messageId:`waha:${fullId}`});
 assert.deepEqual(f.calls.map(c=>c[0]),['claim','new-id','reserve','device','recheck','cache','begin','send','finish']);
 const claim=f.calls[0][1];assert.equal(claim.messageId,event.event_id);assert.equal(claim.generation,2);assert.equal(claim.phoneE164,channel.phone_e164);assert.equal(claim.contactPhone,'+447700900001');
 const cached=f.calls.find(c=>c[0]==='cache')[1];assert.equal(cached.automationEventId,event.event_id);assert.equal(cached.reviewLockToken,event.lock_token);
 const sent=f.calls.find(c=>c[0]==='send')[1];assert.equal(sent.id,'FIXTURE12345');assert.equal(sent.chatId,'447700900001@c.us');assert.match(sent.text,/Hola Jose, gracias por tu visita a Local A/);
 assert.doesNotMatch(sent.text,/positiva|cinco estrellas/i);
});
test('an interrupted POST stays uncertain with no retry, while a failed GET can defer safely',async()=>{
 const f=fixture({sendWahaText:async()=>{throw Error('timeout after acceptance');}});
 assert.equal((await f.run()).outcome,'uncertain');assert.equal(f.calls.filter(c=>c[0]==='begin').length,1);assert.equal(f.calls.at(-1)[0],'fail');
 const g=fixture({getWahaSession:async()=>{throw Error('offline');}});assert.equal((await g.run()).outcome,'deferred');assert.equal(g.calls.some(c=>c[0]==='begin'),false);
});
test('a reserved ID survives a safe restart and a duplicate accepted event is not submitted again',async()=>{
 const reserved=fixture({claimWahaMessage:async()=>({status:'acquired',message:{...message,reserved_outgoing_id:'PERSISTED123'},lockToken:id})});
 await reserved.run();assert.equal(reserved.calls.some(c=>c[0]==='new-id'),false);assert.equal(reserved.calls.find(c=>c[0]==='send')[1].id,'PERSISTED123');
 const duplicate=fixture({claimWahaMessage:async()=>({status:'duplicate',message:{...message,status:'sent',outgoing_message_id:fullId},lockToken:id})});
 assert.equal((await duplicate.run()).messageId,`waha:${fullId}`);assert.equal(duplicate.calls.length,0);
 const unknown=fixture({claimWahaMessage:async()=>({status:'blocked',message:{...message,status:'uncertain'},lockToken:id})});assert.equal((await unknown.run()).outcome,'uncertain');
});
test('fresh personalization is used and an outbox binding change stops before WhatsApp',async()=>{
 const f=fixture();await f.run(delivery,async()=>({data:{...delivery,name:'Ana Nombre',restaurantName:'Local actualizado'},error:null}));
 assert.match(f.calls.find(c=>c[0]==='send')[1].text,/Hola Ana, gracias por tu visita a Local actualizado/);
 const changed=fixture({beginWahaSend:async()=>false});assert.equal((await changed.run()).outcome,'blocked');assert.equal(changed.calls.some(c=>c[0]==='send'),false);
 const text=wahaReviewText(delivery);
 assert.match(text,new RegExp(`aquí: https://panel.gastrohelp.es/r/${id}/google`));
 assert.match(text,new RegExp(`Para dejar de recibir estas peticiones: https://panel.gastrohelp.es/r/${id}$`));
});
